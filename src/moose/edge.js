/* ------------------------------------------------------------------------- *
 *  Proofscape Moose                                                         *
 *                                                                           *
 *  Copyright (c) 2011-2024 Proofscape Contributors                          *
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
import { Point, Polyline } from "./polyline.js";
import {ClassManager} from "./classmgr";

// -------------------------------------------------------------------
// Edge

var Edge = function() {
    this.id = moose.takeNextID();
    this.headName = '';
    this.tailName = '';
    this.head = null;
    this.tail = null;
    this.owner = null;
    this.style = '';
    this.label = null;
    this.visible = true;
    this.bridge = false;
};

Edge.prototype = {

    getID : function() {
        return this.id;
    },

    isVisible : function() {
        return this.visible;
    },

    isDeduction : function() {
        return this.style === 'ded';
    },

    isFlow : function() {
        return this.style === 'flow';
    },

    isBridge : function() {
        return this.bridge;
    },

    setOwner : function(node) {
        this.owner = node;
    },

    getOwner : function() {
        return this.owner;
    },

    getHead : function() {
        return this.head;
    },

    getTail : function() {
        return this.tail;
    },

    getOppositeEnd : function(node) {
        var opp = null;
        if (node==this.head) { opp = this.tail; }
        else if (node==this.tail) { opp = this.head; }
        return opp;
    },

    writeKLayObj : function() {
        var obj = {};
        obj.id = this.getDesc();
        obj.source = this.tail.uid;
        obj.target = this.head.uid;
        return obj;
    },

    writeLayoutObj : function() {
        var obj = {};
        obj.tailName = this.tail.uid;
        obj.headName = this.head.uid;
        return obj;
    },

    initWithDict : function(e) {
        this.headName = e.head;
        this.tailName = e.tail;
        this.style = e.style;
        this.label = e.label;
        this.bridge = e.bridge;
    },

    toString : function() {
        var d = this.owner.uid;
        var s = this.style;
        var h = this.head ? this.head.getUID() : this.headName;
        var t = this.tail ? this.tail.getUID() : this.tailName;
        return d+' : '+s+' : '+t+' --> '+h;
    },

    getDesc : function() {
        return this.toString();
    },

    dissociate : function() {
        this.tail.removeOutEdge(this);
        this.head.removeInEdge(this);
    },

    isVine : function() {
        // A vine is an edge whose endpts fail to have the same (existing) parent.
        // In other words, an edge is a vine if either of its endpts' parents fails
        // to exist, or if both exist but are distinct from one another.
        var headParent = this.head.getParentNode();
        var tailParent = this.tail.getParentNode();
        return headParent===null || tailParent===null || headParent!==tailParent;
    },

    registerAsVineIfNecessary : function() {
        if (this.isVine()) {
            var foreignEnd = this.owner.isAncestorOf(this.tail) ? this.head : this.tail;
            foreignEnd.noteVine(this);
        }
    },

    buildSVG : function() {
        var a = this.tail.getCentre();
        var z = this.head.getCentre();
        var T = new Point(a[0],a[1]);
        var H = new Point(z[0],z[1]);
        this.polyline = new Polyline(this,[T,H]);
        this.polyline.buildSVG();
        this.svgGlow = this.polyline.svgGlow;
        this.svgPath = this.polyline.svgPath;
        this.svgArrowHead = this.polyline.svgArrowHead;
        this.svg = this.polyline.svg;
        this.colorClassMgr = new ClassManager(this.svg);
    },

    getSVG : function() {
        return this.svg;
    },

    removeGraphicalRep : function() {
        this.svg.remove();
    },

    /* Apply a color code to this Edge.
     *
     * @param code: a string specifying the desired coloring:
     *   - "0": clear all coloring
     *   - "push": push current coloring onto color stack
     *   - "pop": pop coloring off color stack
     *   - a single color code: use this solid color
     *   - two color codes: make a gradient btw these colors, from src to tgt
     */
    applyColorCode : function(code) {
        // If this edge is not currently visible, and we're doing anything
        // other than clear its coloring, then just return without doing anything.
        // This is important when we're in OrderedList layout, where connectors
        // are not shown at all unless one of their endpoints is selected.
        if (code !== '0' && !this.isVisible()) return;
        if (code === "0") {
            this.colorClassMgr.clearClasses();
        } else if (code === "push") {
            this.colorClassMgr.push();
        } else if (code === "pop") {
            this.colorClassMgr.pop();
        } else {
            if (code.length === 1) code = code + code;
            this.colorClassMgr.addClasses(['highlighted', `src${code[0]}`, `tgt${code[1]}`]);
        }
    },

    redraw : function(pts) {
        this.polyline.redraw(pts);
    },

    moveTransition : function(pts) {
        this.polyline.moveTransition(pts);
    },

    /*
    * You should call this method after the moveTransition is done,
    * in order to clean up.
    */
    postMoveTransition : function() {
        this.polyline.postMoveTransition();
    },

    /// Simple hide function.
    hide : function() {
        this.svg.classList.add('hidden');
        this.visible = false;
    },

    /*
    * Fade gradually from visible to invisible.
    */
    hideTransition : function() {
        this.svg.style.transition = 'opacity 1s';
        this.svg.style.opacity = '0';
    },

    hideArrowHeadTransition : function() {
        this.svgArrowHead.style.transition = 'opacity 1s';
        this.svgArrowHead.style.opacity = '0';
    },

    showArrowHeadTransition : function() {
        this.svgArrowHead.style.transition = 'opacity 1s';
        this.svgArrowHead.style.opacity = '1';
    },

    postArrowHeadTransition : function() {
        this.svgArrowHead.style.transition = '';
        this.svgArrowHead.style.opacity = '';
    },

    /*
    * You need to call this function after the hideTransition
    * function is finished. This puts the edge object properly
    * into a hidden state, and cleans up transition settings.
    */
    postHideTransition : function() {
        this.hide();
        this.svg.style.transition = '';
        this.svg.style.opacity = '';
    },

    /// Simple show function.
    show : function() {
        this.svg.classList.remove('hidden');
        this.visible = true;
    },

    /*
    * You need to call this before calling the show transition,
    * in order to be in a ready state. Putting these commands at
    * the beginning of the showTransition function doesn't seem
    * to work, as if control moves forward before they have taken
    * effect. Seems odd, but true.
    */
    preShowTransition : function() {
        this.svg.style.opacity = '0';
        this.svg.classList.remove('hidden');
    },

    /// Fade from invisible to visible.
    showTransition : function() {
        this.svg.style.transition = 'opacity 1s';
        this.svg.style.opacity = '1';
    },

    /*
    * Call this after showTransition is finished, to complete
    * the show action.
    */
    postShowTransition : function() {
        this.visible = true;
        this.svg.style.transition = '';
        this.svg.style.opacity = '';
    }

};

export { Edge };
