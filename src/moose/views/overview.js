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

import { d3 } from "../d3";

import { moose } from "../head";
import { CorrespondingView, CorrespViewNodeBox } from "./corresp";


export class Overview extends CorrespondingView {

    constructor(displayDiv, forest, floor) {
        super(displayDiv, forest, floor);
        this.vb = null;
    }

    // Make the thing wake up.
    jog() {
        //this.redraw();
        this.noteViewportChange();
    }

    /// ViewportListener  ----------------
    noteViewportChange() {
        this.recomputeViewportBox();
        if (this.gp && this.autoView) {
            this.showEverything();
        }
    }

    noteViewportTransition(coords, duration) {
        this.recomputeViewportBox(coords, duration);
        if (this.gp && this.autoView) {
            this.showEverything(coords, duration);
        }
    }
    /// ----------------------------------

    redraw() {
        this.nodeBoxes.clear();
        this.glowNodes = [];

        const gp = document.createElementNS(moose.svgns,"g");
        gp.setAttribute("x","0");
        gp.setAttribute("y","0");

        const roots = this.floor.getAllRoots();
        for (let uid in roots) {
            const r = roots[uid];
            this.drawBoxesRecur(r, gp);
        }

        // The box representing the viewport
        const r = document.createElementNS(moose.svgns,"rect");
        r.setAttribute("stroke","#0ff");
        r.setAttribute("stroke-width","5");
        r.setAttribute("fill","none");
        gp.appendChild(r);
        this.vb = r;

        // Clickable glass
        const gl=document.createElementNS(moose.svgns,"rect");
        gl.classList.add('overviewGlass');
        gl.setAttribute("fill","#cff");
        gl.setAttribute("opacity","0.2");
        gl.addEventListener('mousedown', e => this.glmousedown(e));
        gl.style.cursor = 'move';

        gp.appendChild(gl);
        this.glass = gl;
        this.recomputeViewportBox();
        this.setColors();

        if (this.gp) this.svg.removeChild(this.gp);
        this.svg.appendChild(gp);
        this.gp = gp;

        this.showEverything();
    }

    drawBoxesRecur(node, gp) {
        const g = document.createElementNS(moose.svgns,"g");
        let transform = `translate(${node.x}, ${node.y})`;
        const s = node.getScale();
        if (s !== 1) {
            transform += ` scale(${s})`;
        }
        g.setAttribute('transform', transform);
        const bg = this.drawBox({ x: 0, y: 0, w: node.width, h: node.height, uid: node.uid });
        this.nodeBoxes.set(node.uid, new CorrespViewNodeBox(node.uid, bg, node.nodetype));
        g.appendChild(bg);
        gp.appendChild(g);
        // Recurse, but not on invisible or dummy nodes.
        for (let ch of Object.values(node.children)) {
            if (!ch.isVisible() || ch.nodetype==='dummy') continue;
            this.drawBoxesRecur(ch, g);
        }
    }

    /*
     * Set the group transformation to show everything: (a) all node boxes,
     * and (b) the glass pane.
     *
     * param coords: Optional. If given, we assume these are the floor coords. Else we use
     *               the actual current value of the floor coords.
     * param duration: Optional. If given, we do a smooth transition with this duration. Else, immediate update.
     */
    showEverything(coords, duration) {
        const viewBox = this.floor.getViewportXYWH(coords);
        let box;
        if (this.forest.isInUnifiedMode()) {
            const nodeBox = this.forest.getCurrentVisibleBBoxXYWH();
            box = moose.bBoxXYWHUnion(nodeBox, viewBox);
        } else {
            // In embedded mode we don't actually try to show everything; instead we just show
            // the viewbox plus some context.
            // Specifically, we show `c` times the size of the viewBox:
            const c = 5;
            const [x0, y0, w0, h0] = viewBox;
            box = [x0 - w0*(c-1)/2, y0 - h0*(c-1)/2, w0*c, h0*c];
        }
        this.showBox({
            x: box[0], y: box[1], width: box[2], height: box[3]
        });
    }

    makePopupForHover(uid) {
        const node = this.forest.getNode(uid);
        if (node.nodetype==='ded' || node.nodetype==='subded') return null;
        // In case we are hovering over a subnode of a compound node, we actually
        // want to show the whole compound node.
        let lpna = node.getLargestProperNodeAncestor();
        return this.forest.makeNodeClonePopup([lpna.uid], {zoom: 1.5});
    }

    /* Update the visual representation of the viewport.
     *
     * param coords: Optional. If given, we assume these are the floor coords. Else we use
     *               the actual current value of the floor coords.
     * param duration: Optional. If given, we do a smooth transition with this duration. Else, immediate update.
     */
    recomputeViewportBox(coords, duration) {
        if (this.vb === null) return;
        const b = this.floor.getViewportXYWH(coords);
        const xb=b[0], yb=b[1], wb=b[2], hb=b[3];
        const xp = xb+'px', yp = yb+'px', wp = wb+'px', hp = hb+'px';
        if (duration) {
            d3.select(this.vb).transition()
                .duration(duration)
                .attr('x', xp).attr('y', yp)
                .attr('width', wp).attr('height', hp);
            d3.select(this.glass).transition()
                .duration(duration)
                .attr('x', xp).attr('y', yp)
                .attr('width', wp).attr('height', hp);
        } else {
            // viewbox
            this.vb.setAttribute("x", xp);
            this.vb.setAttribute("y", yp);
            this.vb.setAttribute("width", wp);
            this.vb.setAttribute("height", hp);
            // glass
            this.glass.setAttribute("x", xp);
            this.glass.setAttribute("y", yp);
            this.glass.setAttribute("width", wp);
            this.glass.setAttribute("height", hp);
        }
    }

    glmousedown(event) {
        if (moose.isRightClick(event)) return;
        this.anchorX = event.clientX;
        this.anchorY = event.clientY;
        moose.setGlobalHandler('mousemove', (e) => {this.glmousemove(e)});
        moose.setGlobalHandler('mouseup', (e) => {this.glmouseup(e)});
        event.preventDefault();
        event.stopPropagation();
        return false;
    }

    glmousemove(event) {
        const ex = event.clientX, ey = event.clientY;
        const ax = this.anchorX, ay = this.anchorY;
        let dx = ex-ax, dy = ey-ay;
        dx /= this.zs; dy /= this.zs;
        this.floor.roamBy(-dx,-dy);
        event.preventDefault();
        event.stopPropagation();
        return false;
    }

    glmouseup(event) {
        moose.clearGlobalHandler('mousemove');
        moose.clearGlobalHandler('mouseup');
        this.floor.move();
    }

}
