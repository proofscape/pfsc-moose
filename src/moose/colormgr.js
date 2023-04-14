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
// ColorManager

/*

Color Request Encoding:

You pass an object defining key-value pairs.
In each key-value pair, one side defines color codes, the other side defines libpaths.
Either one can be the key, as long as it is given by a string.
When libpaths are given on the value side, they can be given by an array.
When libpaths are given by a string, multipaths are allowed.
Colors are always given by a string.
Within a color string, each individual color code begins with a colon, even the first.
If you pass conflicting information, the behavior is undefined.

Ordinarily, all existing coloring is cleared before making the settings you have requested.
However, there is a special key, `:update`. If you pass `:update:true`, then your requests
are simply added to the existing color state (possibly overwriting existing settings).

Colors:
    R, Y, G, B, V
Actions:
    0: clear all
    push/pop: control color stack
    cpush: ("conditional push") push only if last pop succeeded
    wpop: ("weak pop") pop, but apply only if current state is marked as temporary
    tmp: mark this set of codes as temporary

Node codes:
    May apply any action (0, push, pop, cpush) to the whole node.
    Otherwise, start with one of:
        ol: outline
        bg: background
    and follow either with 0 or with one color.

Edge codes:
    Action is always relative to a node.
    Must begin with one type and one direction:
      type: e/d/f: all edges / just deduction edges / just flow edges
      dir:  i/o/b: just incoming / just outgoing / both directions
    and follow this by any of: 0, push, pop, one color (solid) or two colors (gradient src -> tgt).

Example:
    {
      ":update": true,
      ":push:0:bgR:olY:fi0:diGB": "libpath.to.node1",
      "libpath.to.node2": ":eoR",
    }
means:
    - do _not_ begin by clearing all color codes
    - push current ol & bg colors for node1 onto node1's color stack,
    - clear node1's ol & bg colors,
    - set node1's bg red and ol yellow,
    - clear any existing colors on incoming flow edges for node1,
    - give incoming deduction edges for node1 a gradient from green to blue,
    - make all outgoing edges from node2 solid red,
*/

var ColorManager = function(forest) {
    moose.registerNextID(this); // sets this.id
    this.forest = forest;
    this.listeners = {};
    this.edgeCodeRegex = new RegExp('[edf][iob]');
    // We maintain a set of libpaths of nodes that we think may have any coloring.
    // We do not keep references to the nodes themselves. This is because nodes
    // sometimes vanish (when deductions are closed), and so we are going to
    // have to check with the Forest anyway. So we just get our node refs from there.
    this.coloredLibpaths = {};
};

ColorManager.prototype = {

    getID : function() {
        return this.id;
    },

    /* Convenience function for retrieving set of nodes that have any coloring.
     * return: Object in which libpaths point to nodes themselves.
     */
    getColoredNodes: function() {
        var nodes = {};
        for (var lp in this.coloredLibpaths) {
            var node = this.forest.getNode(lp);
            if (node) nodes[lp] = node;
        }
        return nodes;
    },

    /* This is the main method for use by clients, when they want
     * to request a certain color state.
     *
     * param req: object specifying the entire requested color state
     */
    setColor: function(req) {
        // Propagate left, first doing this forest's own coloring.
        this.propagateLeft(req, true);
        // Propagate right, without repeating this forest's own coloring.
        this.propagateRight(req, false);
        this.dispatch({
            type: 'setColor',
            req: req,
            forestId: this.forest.id,
        });
    },

    /* For internal use only. Propagates the coloring to other forests
     * to the left in the chain. Optionally does the coloring in this
     * forest first.
     *
     * param req: object specifying the entire requested color state
     * param doColoring: boolean. Set true if you want to do the coloring
     *                   for this forest before propagating.
     */
    propagateLeft: function(req, doColoring) {
        if (doColoring) this.doColoring(req);
        var f = this.forest.getPrevForest();
        if (f) f.getColorManager().propagateLeft(req, true);
    },

    /* For internal use only. Propagates the coloring to other forests
     * to the right in the chain. Optionally does the coloring in this
     * forest first.
     *
     * param req: object specifying the entire requested color state
     * param doColoring: boolean. Set true if you want to do the coloring
     *                   for this forest before propagating.
     */
    propagateRight: function(req, doColoring) {
        if (doColoring) this.doColoring(req);
        var f = this.forest.getNextForest();
        if (f) f.getColorManager().propagateRight(req, true);
    },

    /* Erase all existing colors.
     */
    clear: function() {
        for (var libpath in this.coloredLibpaths) {
            var node = this.forest.getNode(libpath);
            if (node) {
                node.applyColorCodes(["0"]);
                node.applyEdgeColorCode("eb0");
            }
        }
        this.coloredLibpaths = {};
    },

    /* Actually make the requested coloring happen.
     *
     * param req: object specifying the entire requested color state
     */
    doColoring: function(req) {
        // Implement the requested coloring.

        const cleared = {};
        // Clear existing colors, unless specifically asked to instead work in "update" mode.
        if (!req[":update"]) {
            Object.assign(cleared, this.coloredLibpaths);
            this.clear();
        }

        // Process each key-value pair.
        const jobs = [];
        for (var cc in req) {
            // Skip ":update", if present.
            if (cc === ":update") continue;
            // Otherwise, retrieve value.
            var bl = req[cc];
            // In each pair, one side should be a color code, and the other a box-listing.
            // If we have the wrong order, swap them.
            if (cc[0]!==":") cc = [bl, bl = cc][0];
            const codes = cc.slice(1).split(":");

            // Divy up by type.
            const node_codes = [];
            const edge_codes = [];
            for (let code of codes) {
                if (this.edgeCodeRegex.test(code)) {
                    edge_codes.push(code);
                } else {
                    node_codes.push(code);
                }
            }

            // Since the box-listing can be a plain libpath, a multipath, or an array (of libpaths or multipaths),
            // we uniformize by converting into a set of libpaths, in all cases.
            if (typeof(bl) === "string") bl = [bl];
            var lps = {};
            bl.forEach(function(mp){
                var s = moose.multipathToSet(mp);
                for (var lp in s) lps[lp] = 1;
            });

            // Now we can attempt to apply the codes to the node named by each libpath.
            for (var lp in lps) {
                var node = this.forest.getNode(lp);
                if (node) {
                    if (lp in cleared) {
                        // Introduce a brief delay before setting colors on any nodes that
                        // had colors before. This is to make the interface feel more responsive
                        // in cases of repeated coloring, by introducing a perceptible flicker.
                        jobs.push(this.scheduleCodeApplication(lp, node, node_codes, edge_codes, 80));
                    } else {
                        this.applyNodeAndEdgeCodes(lp, node, node_codes, edge_codes);
                    }
                }
            }
        }

        Promise.all(jobs).then(() => {
            this.dispatch({
                type: 'doColoring',
                req: req,
            });
        })
    },

    applyNodeAndEdgeCodes: function(lp, node, node_codes, edge_codes) {
        node.applyColorCodes(node_codes);
        for (let code of edge_codes) node.applyEdgeColorCode(code);
        this.coloredLibpaths[lp] = 1;
    },

    scheduleCodeApplication: function(lp, node, node_codes, edge_codes, delay) {
        return new Promise(resolve => {
            setTimeout(() => {
                this.applyNodeAndEdgeCodes(lp, node, node_codes, edge_codes);
                resolve();
            }, delay);
        });
    },

};

Object.assign(ColorManager.prototype, moose.eventsMixin);

export { ColorManager };
