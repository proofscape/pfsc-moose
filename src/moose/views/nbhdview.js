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

import { moose } from "../head";
import { Layout } from "../layout";
import { CorrespondingView, CorrespViewNodeBox } from "./corresp";

const NBHDVIEW_ROOT_NODE_NAME = "nbhdview";

export class Nbhdview extends CorrespondingView {

    constructor(displayDiv, forest, floor) {
        super(displayDiv, forest, floor);
        // Start with dummy object so initial attempt to redraw fails gracefully:
        this.selectionmgr = {
            getSingletonNode: () => null,
        };
    }

    noteSelectionUpdate(event) {
        this.redraw();
    }

    /// ViewportListener  ----------------
    noteViewportChange() {
        this.checkVisibilities();
    }

    noteViewportTransition(coords, duration) {
        this.checkVisibilities();
    }
    /// ----------------------------------

    async redraw() {
        this.centralNode = this.selectionmgr.getSingletonNode();

        this.nodeBoxes.clear();
        this.glowNodes = [];

        const gp = document.createElementNS(moose.svgns,"g");
        gp.setAttribute("x","0");
        gp.setAttribute("y","0");

        await this.drawBoxes(gp);

        this.setColors();

        if (this.gp) this.svg.removeChild(this.gp);
        this.svg.appendChild(gp);
        this.gp = gp;

        this.showEverything();
    }

    async drawBoxes(gp) {
        if (!this.centralNode) return;
        const graph = this.writeGraph();
        // We want to use same layout method as Forest, unless it is OrderedList,
        // in which case we just use downward flowchart. We always want a flow
        // chart layout for the neighborhood view.
        let layoutMethod = this.forest.layoutMethod;
        if (layoutMethod === moose.layoutMethod_OrderedList) {
            layoutMethod = moose.layoutMethod_FlowChartDown;
        }
        const layout = new Layout(this.forest, layoutMethod, graph);
        await layout.computeLayout();
        const layoutInfo = layout.getLayoutInfo();
        const infos = layoutInfo.flatPosAndSize;
        for (let uid of Object.keys(infos)) {
            if (uid === NBHDVIEW_ROOT_NODE_NAME) continue;
            const info = infos[uid];
            info.uid = uid;
            const bg = this.drawBox(info);
            const node = this.forest.getNode(uid);
            if (node) {
                this.nodeBoxes.set(uid, new CorrespViewNodeBox(uid, bg, node.nodetype));
            }
            gp.appendChild(bg);
        }
        this.checkVisibilities();
    }

    checkVisibilities() {
        for (let box of this.nodeBoxes.values()) {
            const fully_visible = this.floor.nodeIsOnScreen(box.uid);
            if (fully_visible) {
                box.svgElt.classList.remove('faded');
            } else {
                box.svgElt.classList.add('faded');
            }
        }
    }

    writeGraph() {
        const cn = this.centralNode;
        const children = [];
        const edges = [];
        function addNode(node) {
            const info = { id: node.uid };
            Object.assign(info, node.getDimensionsForLayout());
            children.push(info);
        }
        function addEdge(src, tgt) {
            edges.push({
                id: `${src.uid} -> ${tgt.uid}`,
                source: src.uid,
                target: tgt.uid,
            });
        }
        addNode(cn);
        for (let direc of [-1, 1]) {
            const exp = cn.exploreVisibleTwoLayers(direc);
            for (let uid of exp.layer1) {
                let u = exp.nodes.get(uid);
                addNode(u);
                let e = direc < 0 ? [u, cn] : [cn, u];
                addEdge(...e);
            }
            for (let [vid, mid] of exp.layer2origins) {
                let v = exp.nodes.get(vid);
                let m = exp.nodes.get(mid);
                addNode(v);
                let e = direc < 0 ? [v, m] : [m, v];
                addEdge(...e);
            }
        }
        return {
            id: NBHDVIEW_ROOT_NODE_NAME,
            edges: edges,
            children: children,
        };
    }

    showEverything() {
        this.showBox(this.gp.getBBox());
    }

    makePopupForHover(uid) {
        const node = this.forest.getNode(uid);
        return this.forest.makeNodeClonePopup([uid], {opaque: true, zoom: 1.5});
    }

}
