/* ------------------------------------------------------------------------- *
 *  Proofscape Moose                                                         *
 *                                                                           *
 *  Copyright (c) 2011-2023 Proofscape Contributors                          *
 *                                                                           *
 *  Licensed under the Apache License, Version 2.0 (the "License");          *
 *  you may not use this file except in compliance with the License.         *
 *  You may obtain a copy of the License at                                  *
 *                                                                           *
 *      http://www.apache.org/licenses/LICENSE-2.0                           *
 *                                                                           *
 *  Unless required by applicable law or agreed to in writing, software      *
 *  distributed under the License is distributed on an "AS IS" BASIS,        *
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. *
 *  See the License for the specific language governing permissions and      *
 *  limitations under the License.                                           *
 * ------------------------------------------------------------------------- */

import { moose } from "./head.js";

// -------------------------------------------------------------------
// Mouse

var Mouse = function(forest, floor) {
    this.forest = forest;
    this.floor = floor;
};

Mouse.prototype = {

    dropAnchor : function(event) {
        // We work in viewbox coords.
        var v = this.getEventVC(event);
        var x = v[0], y = v[1];
        this.anchorX = x;
        this.anchorY = y;
    },

    /*
    * VC stands for "viewbox coordinates".
    * This function returns the viewbox coordinates of a mouse event.
    */
    getEventVC : function(event) {
        var cx = event.clientX, cy = event.clientY; // client coords
        var base = this.floor.getBaseOffset();
        var bx = base[0], by = base[1]; // base offset
        var vx = cx-bx, vy = cy-by; // viewbox coords
        return [vx,vy];
    },

    // scroll -----------------------------------------

    /*
    * With Shift _or_ Ctrl, scroll zooms, else it pans.
    * We used Shift for years; then found out Ctrl + scroll is what you get
    * if user uses pinch gesture. So we support that too.
    */
    mousescroll : function(event) {
        //console.log(event);
        this.forest.focus();
        var ss = moose.scrollSpeed,
            z = this.floor.getZoomScale(),
            dx = -ss*event.deltaX/z,
            dy = -ss*event.deltaY/z;
        if (event.shiftKey || event.ctrlKey) {
            // Zoom
            // positive = scroll up   = zoom out
            // negative = scroll down = zoom in
            // Note: scroll + ctrlKey captures pinch gesture:
            var d = (dy < 0 ? 'out' : 'in');
            this.floor.zoom(d, event);
        } else {
            // Pan
            if (this.floor.doScrollPanning) {
                this.floor.scrollPan(dx, dy);
            }
        }
        event.preventDefault();
        event.stopPropagation();
        return false;
    },

    // node methods -----------------------------------

    nodeClick : function(uid, event) {

        // Do nothing on right-click. (The context menu will take care of itself.)
        if (moose.isRightClick(event)) return;

        // We want clicking anywhere in the chart to give this forest the focus.
        this.forest.focus();

        // Check for double-click.
        var wasDoubleClick = false;
        if (this.lastNodeClicked==uid) {
            var dt = event.timeStamp - this.lastNodeClickTime;
            if (dt < moose.doubleClickTime) {
                wasDoubleClick = true;
            }
        }
        this.lastNodeClicked = uid;
        this.lastNodeClickTime = event.timeStamp;

        // Manage selection
        var selmgr = this.forest.getSelectionManager();
        if (event.shiftKey) {
            selmgr.toggleNode(uid);
        } else {
            selmgr.setSingleton(uid);
        }

        // Notify click listeners.
        // We do this _after_ managing the selection, in case these listeners
        // care about how the click may have affected that.
        if (wasDoubleClick) {
            this.forest.notifyNodeDoubleClickListeners(uid, event);
        } else {
            // ...or should this _always_ trigger? (Is a double-click a click?)
            this.forest.notifyNodeClickListeners(uid, event);
        }

        // Prevent event propagation.
        event.preventDefault();
        event.stopPropagation();
        return false;
    },

    nodeMouseDown : function(uid, event) {

        // Do nothing on right-click. (The context menu will take care of itself.)
        if (moose.isRightClick(event)) return;

        // Drop anchor in case user wants to drag.
        this.dropAnchor(event);

        // Set appropriate mousemove and mouseup handlers, in order to respond
        // to what the user does next.
        var theMouse = this;
        if (this.forest.nodesDraggable) {
            moose.setGlobalHandler('mousemove', function(e){theMouse.nodeMouseMove(e)});
            moose.setGlobalHandler('mouseup', function(e){theMouse.nodeMouseUp(e)});
        } else {
            moose.setGlobalHandler('mousemove', function(e){theMouse.bgMouseMove(e)});
            moose.setGlobalHandler('mouseup', function(e){theMouse.bgMouseUpKeepSel(e)});
        }

        // Prevent event propagation.
        event.preventDefault();
        event.stopPropagation();
        return false;
    },

    nodeMouseMove : function(event) {
        var e = this.getEventVC(event);
        var ex = e[0], ey = e[1];
        var ax = this.anchorX; var ay = this.anchorY;
        var dx = ex-ax; var dy = ey-ay;
        var zs = this.floor.getZoomScale();
        dx /= zs; dy /= zs;

        var sel = this.forest.getSelectionManager().getSelection();
        var edges = {};
        for (var uid in sel) {
            var node = sel[uid];
            node.roamByInSelWithEdgeSet(dx,dy,edges);
        }
        for (var id in edges) {
            var e = edges[id];
            e.redraw();
        }

        // Prevent event propagation.
        event.preventDefault();
        event.stopPropagation();
        return false;
    },

    nodeMouseUp : function(event) {
        moose.clearGlobalHandler('mousemove');
        moose.clearGlobalHandler('mouseup');
        var sel = this.forest.getSelectionManager().getSelection();
        for (var uid in sel) {
            var node = sel[uid];
            node.move();
        }
    },

    // bg/marquee methods -----------------------------------

    bgClick : function(event) {

        // Do nothing on right-click. (The context menu will take care of itself.)
        if (moose.isRightClick(event)) return;

        // We want clicking anywhere in the chart to give this forest the focus.
        this.forest.focus();

        // Check for double-click.
        if (this.lastBGClickTime) {
            var dt = event.timeStamp - this.lastBGClickTime;
            if (dt < moose.doubleClickTime) {
                this.forest.notifyBGDoubleClickListeners();
            }
        }
        this.lastBGClickTime = event.timeStamp;

        // Prevent event propagation.
        event.preventDefault();
        event.stopPropagation();
        return false;
    },

    bgMouseDown : function(event) {

        // Do nothing on right-click. (The context menu will take care of itself.)
        if (moose.isRightClick(event)) return;

        // Drop anchor in case user wants to drag.
        this.dropAnchor(event);

        // Set appropriate mousemove and mouseup handlers, in order to respond
        // to what the user does next.
        var moveHandler, upHandler;
        var id = this.forest.getID();
        if (this.forest.nodesDraggable && event.shiftKey) {
            var theMouse = this;
            moose.setGlobalHandler('mousemove', function(e){theMouse.marqueeMouseMove(e)});
            moose.setGlobalHandler('mouseup', function(e){theMouse.marqueeMouseUp(e)});
            var v = this.getEventVC(event);
            this.floor.showMarqueeAtVC(v);
        } else {
            var theMouse = this;
            moose.setGlobalHandler('mousemove', function(e){theMouse.bgMouseMove(e)});
            moose.setGlobalHandler('mouseup', function(e){theMouse.bgMouseUp(e)});

        }

        // Prevent event propagation.
        event.preventDefault();
        event.stopPropagation();
        return false;
    },

    bgMouseMove : function(event) {
        var e = this.getEventVC(event);
        var ex = e[0], ey = e[1];
        var ax = this.anchorX; var ay = this.anchorY;
        var dx = ex-ax; var dy = ey-ay;
        var zs = this.floor.getZoomScale();
        dx /= zs; dy /= zs;
        this.floor.roamBy(dx,dy);
        // Prevent event propagation.
        event.preventDefault();
        event.stopPropagation();
        return false;
    },

    bgMouseUp : function(event) {
        if (!event.shiftKey) {
            this.forest.getSelectionManager().clear();
        }
        moose.clearGlobalHandler('mousemove');
        moose.clearGlobalHandler('mouseup');
        this.floor.move();
    },

    bgMouseUpKeepSel : function(event) {
        moose.clearGlobalHandler('mousemove');
        moose.clearGlobalHandler('mouseup');
        this.floor.move();
    },

    marqueeMouseMove : function(event) {
        var e = this.getEventVC(event);
        var ex = e[0], ey = e[1];
        var ax = this.anchorX; var ay = this.anchorY;
        var u = Math.min(ex,ax), v = Math.min(ey,ay);
        var w = Math.abs(ex-ax), h = Math.abs(ey-ay);
        this.floor.setMarqueeVCRect(u,v,w,h);
        // Prevent event propagation.
        event.preventDefault();
        event.stopPropagation();
        return false;
    },

    marqueeMouseUp : function(event) {
        this.floor.computeMarqueeSelection(event.shiftKey);
        this.floor.hideMarquee();
        moose.clearGlobalHandler('mousemove');
        moose.clearGlobalHandler('mouseup');
    }
};

export { Mouse };
