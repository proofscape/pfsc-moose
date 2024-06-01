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

// -------------------------------------------------------------------
// SelectionManager

var SelectionManager = function(forest) {
    moose.registerNextID(this); // sets this.id
    this.forest = forest;
    this.forest.addForestListener(this);
    this.colormgr = this.forest.getColorManager();
    this.listeners = {};
    // We record the set of selected nodes in an object where libpaths point to 1.
    this.selection = {};
    // We also maintain a record of the size of the selection.
    this.size = 0;
};

SelectionManager.prototype = {

    getID: function() {
        return this.id;
    },

    getSelection: function() {
        return moose.objectShallowCopy(this.selection);
    },

    isSelected: function(libpath) {
        return this.selection.hasOwnProperty(libpath);
    },

    /* Get the multipath for the current selection, if possible.
     * If the current selection is a singleton, then this method just returns the
     * selected node's libpath.
     * If the current selection contains two or more nodes, all of which are siblings,
     * then this method returns those siblings' multipath.
     * In all other cases this method returns null.
     */
    getSelectionMultipath: function() {
        if (this.size === 1) {
            for (var lp in this.selection) return lp;
        }
        if (this.size > 1) {
            var common_parent = null,
                prefix = '',
                prefix_len = 0,
                child_names = [];
            for (var lp in this.selection) {
                var node = this.forest.getNode(lp);
                // If any of the nodes is nonexistent, we give up.
                if (!node) return null;
                if (common_parent === null) {
                    // The common parent isn't defined yet, so set it now.
                    common_parent = node.getParentNode();
                    // If this is null, give up. We need all nodes in the selection
                    // to have a common, non-null parent.
                    if (common_parent === null) return null;
                    // Otherwise, we can set the prefix.
                    prefix = common_parent.getLibpath() + '.';
                    prefix_len = prefix.length;
                } else {
                    // The common parent is already set. This node must match, or else give up.
                    var next_parent = node.getParentNode();
                    if (next_parent !== common_parent) return null;
                }
                // Record the node's name.
                child_names.push(node.getLibpath().slice(prefix_len));
            }
            // If we made it this far without returning null, assemble and return multipath.
            var multipath = prefix + "{" + child_names.join(',') + "}";
            return multipath;
        }
        return null;
    },

    /* Clear the selection.
     *
     * param clearColors: set false if you do not want colors to be cleared too.
     *                    Defaults to true.
     */
    clear: function(clearColors) {
        if (clearColors===undefined) clearColors = true;
        this.selection = {};
        this.size = 0;
        if (clearColors) this.updateDisplay();
        this.announceUpdate();
    },

    /* This method allows clients to set a singleton selection, without
     * having to first call `clear` and then `addNode`. More than just a
     * convenience, this ensures that `updateDisplay` is called just once, not twice.
     */
    setSingleton: function(libpath) {
        this.clear(false);
        this.addNode(libpath);
    },

    /* Set the selection.
     *
     * param lps: set of libpaths of selected nodes (i.e. object in which libpaths point to unity).
     * param size: optional. If defined, should be equal to the size of the selection.
     */
    setSelection: function(lps, size) {
        this.selection = lps;
        if (size!==undefined) this.size = size;
        else this.size = moose.objectSize(lps);
        this.updateDisplay();
        this.announceUpdate();
    },

    /* Way of requesting an update to the selection, using a coded request:
     *
     * If req is `true`, do nothing.
     * If req is `false`, just clear the selection.
     * If req is a libpath, select just that node, if present; if not present, fail silently.
     * If req is an array of libpaths, select all those nodes (if present).
     */
    requestSelectionState: function(req) {
        if (req === true) {
            return;
        }
        if (req === false) {
            this.clear();
        } else if (typeof(req) === "string") {
            this.setSingleton(req);
        } else if (Array.isArray(req)) {
            const lps = {};
            for (const lp of req) {
                lps[lp] = 1;
            }
            this.setSelection(lps);
        }
    },

    addNode: function(libpath) {
        if (!this.selection.hasOwnProperty(libpath)) {
            // Reject dummy nodes, and non-existent nodes.
            var node = this.forest.getNode(libpath);
            if (!node || node.nodetype === 'dummy') return;
            // Record the selection.
            this.selection[libpath] = 1;
            this.size++;
            this.updateDisplay();
            this.announceUpdate();
        }
    },

    removeNode: function(libpath) {
        if (this.selection.hasOwnProperty(libpath)) {
            delete this.selection[libpath];
            this.size--;
            this.updateDisplay();
            this.announceUpdate();
        }
    },

    toggleNode: function(libpath) {
        if (this.selection.hasOwnProperty(libpath)) {
            this.removeNode(libpath);
        } else {
            this.addNode(libpath);
        }
    },

    /* Return an array of the libpaths of all selected nodes.
     */
    selToArray: function() {
        var a = [];
        for (var lp in this.selection) a.push(lp);
        return a;
    },

    /* When it is a singleton selection, retrieve from the Forest the selected node itself.
     * Possibly undefined if that node is not in fact currently in the Forest.
     *
     * If it is not a singleton selection, return null.
     */
    getSingletonNode: function() {
        if (this.size !== 1) return null;
        for (var lp in this.selection) return this.forest.getNode(lp);
    },

    /* Update visual display in response to changed selection.
     */
    updateDisplay: function() {
        this.setSubtitles();
        this.setColors();
    },

    setSubtitles: function() {
        const floor = this.forest.getFloor();
        if (this.forest.showingLibpathSubtitles()) {
            if (this.size === 1) {
                const node = this.getSingletonNode();
                const focus_lp = node.getLibpath();
                floor.displaySubtitle(focus_lp);
            } else {
                floor.clearSubtitle();
            }
        } else {
            floor.clearSubtitle();
        }
    },

    /* Request a color state based on the current selection.
     * This method should only be invoked internally (it is a "private" method),
     * and then only after the size of the selection has just _changed_.
     */
    setColors: function() {
        var req = {};
        // Set up the color request based on size of selection.
        switch (this.size) {
        case 0:
            // No nodes are selected. Leave request empty.
            break;
        case 1:
            // Singleton selection.
            var node = this.getSingletonNode(),
                focus_lp = node.getLibpath();
            if (node) {
                const style = this.forest.getSelectionStyle();
                let focus_colors = ':olB';
                if ([moose.selectionStyle_NodeEdges, moose.selectionStyle_NodeEdgesNbrs].includes(style)) {
                    focus_colors += ':eiVB:eoBG';
                }
                req = {
                    [focus_colors]: focus_lp,
                };
                if (style === moose.selectionStyle_NodeEdgesNbrs) {
                    const ant = node.exploreVisibleTwoLayers(-1);
                    const con = node.exploreVisibleTwoLayers(1);
                    const ant_lps = Array.from(ant.nodes.keys());
                    const con_lps = Array.from(con.nodes.keys());
                    Object.assign(req, {
                        ":olV": ant_lps,
                        ":olG": con_lps,
                        ":eiVV": ant.mthd1,
                        ":eoGG": con.mthd1,
                    });
                }
            }
            break;
        default:
            // Two or more nodes are selected.
            var a = this.selToArray();
            req = {
                ":olB": a
            };
        }
        // Make the request.
        this.colormgr.setColor(req);
    },

    // ForestListener interface -----------------

    noteForestTransition : function(info) {},

    noteForestClosedAndOpenedDeductions : function(info) {
        this.redoSelection();
    },

    // ------------------------------------------

    redoSelection : function() {
        // From the current selection, compute the subset of nodes
        // that still exist and are visible.
        var newsel = {},
            size = 0;
        for (var lp in this.selection) {
            var node = this.forest.getNode(lp);
            if (node && node.isVisible()) {
                newsel[lp] = 1;
                size++;
            }
        }
        // Set this subset as the new selection.
        this.setSelection(newsel, size);
    },

    announceUpdate : function() {
        this.dispatch({
            type: 'selectionUpdate',
            manager: this,
        });
    },

};

Object.assign(SelectionManager.prototype, moose.eventsMixin);

export { SelectionManager };
