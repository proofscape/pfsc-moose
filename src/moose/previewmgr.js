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
import { SubgraphBuilder } from "./subgraphbuilder.js";
import { Popup } from "./popup";

// -------------------------------------------------------------------
// PreviewManager

var PreviewManager = function(forest) {
    moose.registerNextID(this);
    this.forest = forest;
    this.arena = this.forest.getDiv();
    this.ghostbuster = this.forest.getGhostbuster();
    this.ghostbuster.addGhostListener(this);

    // A place to store computed popups, by libpath.
    // Format: libpath:Popup instance
    this.popups = new Map();
};

PreviewManager.prototype = {

    getID: function() {
        return this.id;
    },

    // -----------------------------------------------------------------------
    // Ghost listener interface

    /* param visibleGhosts: lookup with libpaths pointing to (newly visible)
     *  ghost nodes.
     */
    noteVisibleGhosts: function(visibleGhosts) {
        for (let ghostpath in visibleGhosts) {
            const ghostNode = visibleGhosts[ghostpath];
            const realpath = ghostNode.ghostOf();
            const realvers = ghostNode.realVersion();
            if (!this.popups.has(realpath)) {
                // We don't currently have a popup for the real node, and we
                // are not even in the process of computing one either.
                this.makePopup(realpath, realvers);
                // Store `false` in the lookup.
                // This indicates that we are working on the popup.
                // When it is done, the popup itself will replace this in the lookup.
                this.popups.set(realpath, false);
            }
        }
    },

    /* param unghosted: array of libpaths of nodes for which there are no
     *   longer any ghosts present (visible or obscured).
     */
    noteUnghosted: function(unghosted) {
        const mgr = this;
        unghosted.forEach(libpath => {
            // Since there are no longer any ghosts present for the node that has
            // been "unghosted," it is time to delete any popup we may have for
            // that node, and free memory.
            const popup = mgr.popups.get(libpath);
            if (popup) {
                popup.remove();
            }
            mgr.popups.delete(libpath);
        });
    },

    // -----------------------------------------------------------------------

    /* Make a preview for the given libpath, and store it in our popups map.
     *
     * param libpath: the libpath of the object (node or deduc) of which we want a preview
     * param version: the version of the object of which we want a preview
     * return: a promise that resolves with a completed popup
     */
    makePopup: function(libpath, version) {
        const mgr = this;
        return this.forest.getDeductionClosure([libpath], [version]).then(closure => {
            if (closure.length !== 1) {
                throw new Error(`Bad deduc closure for ${libpath}@${version}`);
            }
            const deducpath = closure[0];
            //const isDeduc = (libpath === deducpath);
            const holder = document.createElement('div');
            holder.classList.add('previewHolder');
            holder.style.visibility = 'hidden';
            document.body.appendChild(holder);
            const forest = this.forest.makeNewForestWithSameBaseConfig(holder, {
                expansionMode: moose.expansionMode_Unified,
                transitionMethod: moose.transitionMethod_instantChange,
                layoutMethod: moose.layoutMethod_FlowChartDown,
                overview: null,
                gid: null,
                contextMenuPlugin: null,
                showGhostPreviews: false,
                suppressFlowEdges: false,
                activateNavKeys: false,
            });
            return forest.requestState({
                on_board: deducpath,
                versions: {[deducpath]: version},
            }).then(() => {
                // Deducs are stored in the Forest both as deducs, _and_ as nodes,
                // so we can use `forest.getNode()` in either case.
                const node = forest.getNode(libpath);
                const [x, y, w, h] = node.getBBoxXYWH();
                forest.floor.gotoCoords(-x, -y, 1);
                holder.style.width = w+'px';
                holder.style.height = h+'px';
                holder.remove();
                holder.style.visibility = 'unset';
                const popup = new Popup({
                    items: [holder]
                });
                mgr.popups.set(libpath, popup);
                return popup;
                /*
                // Make artificial delay, so we can test the progress cursor...
                setTimeout(() => {
                    mgr.popups.set(libpath, popup);
                    return popup;
                }, 5000);
                */
            });
        });
    },

    // -----------------------------------------------------------------------

    /* Request the preview popup for a given libpath be shown.
     * May result in the desired preview, or may result in a "working GIF" popup.
     *
     * param previewpath: the libpath of the node/deduc of which a preview is requested
     * param event: the mouse event that triggered the request
     */
    requestShowPreview: function(previewpath, event) {
        const nodeElt = event.currentTarget;
        const popup = this.popups.get(previewpath);
        if (popup) {
            nodeElt.classList.remove('progress');
            popup.placeInBoxNearMouse(this.arena, event);
            popup.show();
        } else {
            nodeElt.classList.add('progress');
        }
    },

    requestHidePreviews: function() {
        for (let popup of this.popups.values()) {
            if (popup) {
                popup.hide();
            }
        }
    },

};

export { PreviewManager };
