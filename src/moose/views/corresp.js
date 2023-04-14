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

import { moose } from "../head.js";
import { ClassManager } from "../classmgr";


export class CorrespViewNodeBox {

    constructor(uid, svgElt, nodetype) {
        this.uid = uid;
        this.svgElt = svgElt;
        this.nodetype = nodetype;
        this.colorClassMgr = new ClassManager(this.svgElt);
        // We want these classes to stay even as colors change, so we set them
        // independently (i.e. not through the ClassManager).
        this.svgElt.classList.add('mooseOverviewNodeBox');
        if (nodetype==='ded' || nodetype==='subded') {
            this.svgElt.classList.add('mooseOverviewNodeBox-ded');
        }
    }

    eraseColors() {
        this.colorClassMgr.clearClasses();
    }

    /* Set colors for this box.
     *
     * @param ccs: set of color classes, as returned by Node.getColorClasses.
     */
    addColors(ccs) {
        this.colorClassMgr.addClasses(ccs);
    }

}

/* This is meant as an abstract base class for any "view class"
 * that provides a "corresponding view," i.e. an alternative
 * representation of what is going on in a Forest, which tends
 * to track along with changes in the Forest, including layout,
 * viewport, selection, and color changes.
 */
export class CorrespondingView {

    /*
     * displayDiv: a div to which the view can add its graphical contents.
     *             Must have a parent div that will be responsible for setting
     *             the size of the display area.
     * forest: the Forest to which this view is to be associated.
     * floor: the Floor that is constructing this view.
     */
    constructor(displayDiv, forest, floor) {
        moose.registerNextID(this);
        this.div = displayDiv;
        this.forest = forest;
        this.floor = floor;

        this.parentDiv = this.div.parentNode;

        this.floor.addViewportListener(this);
        this.colormgr = this.forest.getColorManager();
        this.colormgr.on('doColoring', this.handleDoColoring.bind(this));
        this.forest.addForestListener(this);
        
        this.selectionmgr = null;

        this.nodeBoxes = new Map();
        this.glowNodes = []; // [uid]

        this.hoverTimers = new Map();
        this.popupBoxes = [];

        this.padding = 10;

        this.zs = 1.0;
        this.zoomFactor = 1.05;
        this.x = 0; this.y = 0;
        this.homeX = 0; this.homeY = 0;

        this.div.style.width = '99%';
        this.div.style.height = '99%';
        this.svg = document.createElementNS(moose.svgns,'svg');
        this.svg.style.width = '100%';
        this.svg.style.height = '100%';
        this.svg.addEventListener('mousedown', e => this.bgmousedown(e));
        this.div.appendChild(this.svg);

        this.gp = null;
        
        this.autoView = true;

        this.div.addEventListener('wheel', e => this.scroll(e));
    }

    getID() {
        return this.id;
    }

    getPos() {
        return this.floor.getOverviewPos();
    }

    setAutoView(/* bool */ b) {
        this.autoView = b;
        if (this.autoView) {
            this.showEverything();
        }
    }

    setSelectionManager(selmgr) {
        this.selectionmgr = selmgr;
        this.selectionmgr.on('selectionUpdate', this.noteSelectionUpdate.bind(this));
    }

    /// ---------------------------------------------------
    // Listener interface methods

    handleDoColoring(event) {
        this.setColors(event);
    }
    
    noteSelectionUpdate(event) {
    }

    /// ViewportListener  ----------------

    noteViewportChange() {
    }

    noteViewportTransition(coords, duration) {
    }

    // ForestListener -----------------

    noteForestTransition(info) {
        this.redraw();
    }

    noteForestClosedAndOpenedDeductions(info) {
        this.redraw();
    }
    /// ---------------------------------------------------

    setColors(event) {
        // Reset the nodes that were previously glowing.
        for (let lp of this.glowNodes) {
            const box = this.nodeBoxes.get(lp);
            if (box) box.eraseColors();
        }
        this.glowNodes = [];
        // Add glow for the new set of nodes.
        const nodes = this.colormgr.getColoredNodes();
        for (let lp in nodes) {
            let node = nodes[lp],
                ccs = node.getColorClasses(),
                box = this.nodeBoxes.get(lp);
            if (box) {
                box.addColors(ccs);
                this.glowNodes.push(lp);
            }
        }
    }
    
    redraw() {
    }

    drawBox({ x, y, w, h, uid }) {
        const bg = document.createElementNS(moose.svgns,"rect");
        bg.setAttribute("x",x+'px');
        bg.setAttribute("y",y+'px');
        bg.setAttribute("width",w+'px');
        bg.setAttribute("height",h+'px');
        bg.setAttribute("stroke","gray");
        bg.addEventListener('mouseover', e => this.moveOnto(uid, e));
        bg.addEventListener('mouseout', e => this.moveAway(uid));
        return bg;
    }

    showEverything(coords, duration) {
        // Subclasses should override.
    }

    showBox({x, y, width, height}) {
        if (width*height === 0) return;
        let W0 = this.div.offsetWidth;
        let H0 = this.div.offsetHeight;
        const p = this.padding;
        W0 -= 2*p; H0 -= 2*p;
        let zs1 = width/height >= W0/H0 ? W0/width : H0/height;
        this.zs = zs1;
        let W2 = W0/zs1, H2 = H0/zs1, p2 = p/zs1;
        let wc = W2-width, hc = H2-height;
        let x1 = p2 - x + wc/2;
        let y1 = p2 - y + hc/2;
        this.x = x1;
        this.y = y1;
        this.roam();
        this.move();
    }

    // %%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%

    makePopupForHover(uid) {
        // Subclasses should override.
        return null;
    }

    moveOnto(uid, event) {
        this.hoverTimers.set(uid, setTimeout(() => {
            this.hoverTimers.delete(uid);
            this.hover(uid, event);
        }, moose.hoverPopupDelay));
    }

    moveAway(uid) {
        if (this.hoverTimers.has(uid)) {
            clearTimeout(this.hoverTimers.get(uid));
            this.hoverTimers.delete(uid);
        }
        this.forest.clearAllPopups();
        this.floor.quietTabGroup(false);
    }

    hover(uid, event) {
        const popup = this.makePopupForHover(uid);
        if (!popup) return;
        // Position relative to the cursor, based on the current position of the overview panel.
        // We always want to position to popup away from the corner where the panel sits.
        // E.g. if in southwest corner, want to put popup northeast of cursor.
        let w = popup.w,
            h = popup.h,
            pos = this.getPos(),
            cursorSize = 16;
        // Unfortunately, there doesn't seem to be any way to check the cursor size:
        // but 16px seems to work okay so far.
        let x = event.clientX,
            y = event.clientY;
        switch(pos) {
            case 'tl':
                x += cursorSize;
                y += cursorSize;
                break;
            case 'tr':
                x -= w;
                y += cursorSize;
                break;
            case 'br':
                x -= w;
                y -= h;
                break;
            case 'bl':
                x += cursorSize;
                y -= h;
                break;
        }
        popup.setPos(x, y);
        popup.show();
        this.floor.quietTabGroup(true);
    }

    // %%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%

    bgdoubleclick() {
        this.showEverything();
    }

    bgmousedown(event) {
        // If in AutoView mode, make nothing happen. Don't even let the event pass through.
        if (this.autoView) {
            event.preventDefault();
            event.stopPropagation();
            return false;
        }
        if (moose.isRightClick(event)) return;
        if (this.lastBGClickTime) {
            var dt = event.timeStamp - this.lastBGClickTime;
            if (dt < moose.doubleClickTime) {
                this.bgdoubleclick();
            }
        }
        this.lastBGClickTime = event.timeStamp;
        this.anchorX = event.clientX;
        this.anchorY = event.clientY;
        moose.setGlobalHandler('mousemove', (e) => {this.bgmousemove(e)});
        moose.setGlobalHandler('mouseup', (e) => {this.bgmouseup(e)});
        event.preventDefault();
        event.stopPropagation();
        return false;
    }

    bgmousemove(event) {
        const ex = event.clientX, ey = event.clientY;
        const ax = this.anchorX, ay = this.anchorY;
        let dx = ex-ax, dy = ey-ay;
        dx /= this.zs; dy /= this.zs;
        this.roamBy(dx, dy);
        event.preventDefault();
        event.stopPropagation();
        return false;
    }

    bgmouseup(event) {
        moose.clearGlobalHandler('mousemove');
        moose.clearGlobalHandler('mouseup');
        this.move();
        // In case any popups came up before we began the move, let's get rid of them now.
        this.forest.clearAllPopups();
    }

    roam() {
        let s = `scale(${this.zs})`;
        const eps = 0.001;
        const x = Math.abs(this.x) < eps ? 0 : this.x;
        const y = Math.abs(this.y) < eps ? 0 : this.y;
        s += `,translate(${x}, ${y})`;
        this.gp.setAttribute('transform', s);
    }

    roamBy(dx, dy) {
        this.x = this.homeX + dx; this.y = this.homeY + dy;
        this.roam();
    }

    move() {
        this.homeX = this.x; this.homeY = this.y;
    }

    moveBy(dx, dy) {
        this.roamBy(dx, dy);
        this.move();
    }

    zoom(dir, event) {
        let k = 1;
        if (dir === 'out') {
            k = 1/this.zoomFactor;
        } else if (dir === 'in') {
            k = this.zoomFactor;
        }
        if (k !== 1) {
            // Decide the point (x0, y0) around which we zoom
            let x0 = 0, y0 = 0;
            if (event === undefined) {
                // If we didn't get an event, then we don't know where the
                // pointer is, so we zoom around the center of the viewbox.
                const W = this.div.clientWidth, H = this.div.clientHeight;
                x0 = W/2;
                y0 = H/2;
            } else {
                // If we did get an event, then we zoom around the place where
                // the pointer lies.
                // Note: we can't use the event's offsetX, offsetY, since these
                // are relative to whatever div the pointer happens to lie over;
                // in particular, when the pointer lies over some node, then we
                // will get the wrong values.
                // So we use client coords instead.
                const rect = this.div.getBoundingClientRect();
                x0 = event.clientX - rect.left;
                y0 = event.clientY - rect.top;
            }
            const a = (1-k)/(k*this.zs);
            this.x += a*x0; this.y += a*y0;
            this.move();
            this.zs *= k;
            this.roam();
        }
    }

    scroll(event) {
        // If in AutoView mode, make nothing happen. Don't even let the event pass through.
        if (this.autoView) {
            event.preventDefault();
            event.stopPropagation();
            return false;
        }
        let ss = moose.scrollSpeed,
            z = this.zs,
            dx = -ss*event.deltaX/z,
            dy = -ss*event.deltaY/z;
        if (event.shiftKey || event.ctrlKey) {
            // Zoom
            // positive = scroll up   = zoom out
            // negative = scroll down = zoom in
            let d = (dy < 0 ? 'out' : 'in');
            this.zoom(d, event);
        } else {
            // Pan
            this.moveBy(dx, dy);
        }
        event.preventDefault();
        event.stopPropagation();
        return false;
    }

}
