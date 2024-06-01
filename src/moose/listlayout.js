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

import * as cola from "webcola";

// -------------------------------------------------------------------
// ListLayout

var ListLayout = function(graph) {
    this.graph = graph;
    // Dimensions and relative coords:
    this.layout = {};
    // Absolute coords:
    this.abs = {};
    // Routing data:
    this.llcs = {}; // (ListLayoutConnectors)
    this.upperBundles = {};
    this.lowerBundles = {};
    this.vs = [];
    this.cs = [];
    // Object to hold edge info:
    this.routes = {};
    // Settings:
    this.interListPad = 50;
    this.interNodePad = 10;
    this.indent = 20;
    this.interEdgeGap = 3;
    // FIXME: this should be defined in the Forest object:
    this.edgeThickness = 1.5; // should match the stroke width in the display SVG
    //
    this.nextLLCSeqNum = 0;
};

ListLayout.prototype = {

    /*
    * The top-level children of the passed graph object are the roots, or TLDs.
    * For each root, we lay out all its nodes in a vertical "list".
    * The lists for the roots are set side by side.
    */
    computeLayout : function() {
        // roots: the list of roots, or TLDs
        // x, y: starting coordinate for first node in list
        var roots = this.graph.children,
            x = 0,
            y = 0,
            root = null;
        for (var name in roots) {
            root = roots[name];
            this.computeLayoutRec(root, x, y);
            x += this.layout[name].w + this.interListPad;
            y = 0;
        }
        // Compute absolute coordinates.
        this.computeAbsCoords(this.graph, 0, 0);


        // EXPERIMENTAL:
        // From here on we're going to assume that there's precisely one root node.
        // That's because we're not yet ready to think about routing edges between
        // different stacks. (Or maybe we will never do that, preferring instead to
        // open only one per window.)
        var W = 0;
        for (var name in roots) {
            W = this.layout[name].w;
            break;
        }
        // Initialize bundles. We want each node uid to point to an upper bundle and
        // a lower bundle, even if this node doesn't have one or the other.
        for (var uid in this.layout) {
            this.upperBundles[uid] = [];
            this.lowerBundles[uid] = [];
        }
        this.buildRoutingDataRec(this.graph, W + 40);
        this.routeConnectors();

        return {
            nodes: this.layout,
            edges: this.routes
        };
    },

    computeLayoutRec : function(node, x, y) {
        // Initialize layout info for node:
        this.layout[node.name] = {x: x, y: y, w: null, h: null};
        // Now process the node, depending on whether it has children or not.
        if (node.childOrder.length > 0) {
            // Node has children.
            var w = 0;
            // We iterate over the childOrder field so that we position the child nodes
            // in the right order.
            y = this.interNodePad;
            for (var i in node.childOrder) {
                var childName = node.childOrder[i];
                // However, we must first determine whether we actually have a visible
                // child by that name.
                if (!node.children.hasOwnProperty(childName)) continue;
                // If we do have one, then recurse on it.
                var child = node.children[childName];
                this.computeLayoutRec(child, this.indent, y);
                // Update cursor, as well as width and height.
                var child_data = this.layout[child.name];
                y += child_data.h + this.interNodePad;
                w = Math.max(w, child_data.w);
            }
            this.layout[node.name].w = w + 2*this.indent;
            this.layout[node.name].h = y;
        } else {
            // Node has no children.
            // Set width and height.
            this.layout[node.name].w = node.w
            this.layout[node.name].h = node.h
        }
    },

    computeAbsCoords : function(node, x, y) {
        for (var uid in node.children) {
            var child = node.children[uid],
                data = this.layout[uid],
                x0 = x + data.x,
                y0 = y + data.y;
            this.abs[uid] = {
                x: x0,
                y: y0
            }
            this.computeAbsCoords(child, x0, y0);
        }
    },

    takeNextLLCSeqNum : function() {
        var n = this.nextLLCSeqNum;
        this.nextLLCSeqNum = n + 1;
        return n;
    },

    buildRoutingDataRec : function(node, x0) {
        // Iterate over edges, creating a ListLayoutConnector
        // (LLC) object for each one, then stash these in the bundles where appropriate.
        // In the process, we also create the VPSC Variables that we'll need, setting
        // each one's desired position to the given x0, which represents the ideal "gutter"
        // coordinate through which the vertical segments of the connectors should run.
        for (var dsc in node.edges) {
            // Build an LLC object to represent this edge.
            var e = node.edges[dsc],
                llc = new ListLayoutConnector(
                    this.takeNextLLCSeqNum(),
                    e,
                    this.abs,
                    this.layout
                );
            this.llcs[dsc] = llc;
            this.vs.push(new cola.Variable(x0));
            // Now, for each endpt of the edge (i.e. the tail and head nodes),
            // we want to ask whether the /other/ end lies above or below this one,
            // in terms of y-coordinate; accordingly, we want to store this LLC
            // in the upper resp. lower bundle for each endpt.
            // We begin by preparing some data, so that we can use the same code
            // for both tail and head:
            var data = [
                [e.tailName, llc.tail_y, llc.head_y],
                [e.headName, llc.head_y, llc.tail_y]
            ];
            // Now iterate over the data just defined.
            for (var i in data) {
                var d = data[i],
                    name = d[0],
                    own_y = d[1],
                    other_y = d[2];
                // We want to add the LLC to the appropriate bundle.
                // But we actually need to store a bit more information; we need to
                // know the "other_y" that is associated with the LLC. (We cannot
                // just store that value in the LLC itself, because which of its two
                // y-coords is the "other" one depends on which end of the edge we
                // are looking at!)
                var llc_with_y_coord = [llc, other_y];
                if (own_y < other_y) {
                    this.lowerBundles[name].push(llc_with_y_coord);
                } else {
                    this.upperBundles[name].push(llc_with_y_coord);
                }
            }
        }
        // This is the recursive part of the function, where we recurse on this node's
        // children, if any.
        for (var uid in node.children) {
            var child = node.children[uid];
            this.buildRoutingDataRec(child, x0);
        }
    },

    routeConnectors : function() {
        // We have three things to do:
        // (1) Decide the mid_x coords for all the connectors using VPSC from WebCola.
        // (2) Update the y-coords to spread out the connectors incident to any given node.
        // (3) Record the final edge routes in the required format.

        // (1) mid_x coords
        // (1A) Generate the separation constraints
        // For the upper bundle of a node U, the "closer" neighbours V are those having
        // /larger/ y-coord. The closer the neighbour, the farther left should the vertical
        // segment of the connector be.
        // For the lower bundle of a node U, the "closer" neighbours V are those having
        // /smaller/ y-coord. Again, however, the closer the neighbour, the farther left
        // should the vertical segment of the connector be.
        // Prepare data so we can handle both cases with the same code.
        var data = [
            [this.upperBundles, function(P, Q) {return Q[1] - P[1];}],
            [this.lowerBundles, function(P, Q) {return P[1] - Q[1];}]
        ];
        var g0 = this.interEdgeGap + this.edgeThickness;
        for (var j in data) {
            var d = data[j],
                bundles = d[0],
                cmp_func = d[1];
            for (var uid in bundles) {
                var b = bundles[uid];
                // Sort the bundle so that edges connecting to closer neighbours come first.
                b.sort(cmp_func);
                // Now generate the constraints using a sliding window of width 2.
                for (var i = 0; i + 1 < b.length; ++i) {
                    // Remember, elements of b are pairs [LLC, y-coord]!
                    var L = b[i][0],
                        R = b[i+1][0],
                        vL = this.vs[L.index],
                        vR = this.vs[R.index],
                        c = new cola.Constraint(vL, vR, g0);
                    this.cs.push(c);
                }
            }
        }
        // (1B) Solve, and record mid_x coords.
        var solver = new cola.Solver(this.vs, this.cs);
        solver.solve();
        for (var dsc in this.llcs) {
            var llc = this.llcs[dsc],
                v = this.vs[llc.index];
            llc.mid_x = v.position();
        }

        // (2) y-coords
        for (uid in this.layout) {
            // For each connector incident to this node, we want to assign a good
            // y-coord to the horizontal segment that connects to this node.
            // By this time all bundles have already been sorted,
            // so we can just concatenate the upper with the reverse of the lower to
            // get the full sequence of connectors incident to this node, in order of
            // increasing desired y-coord for the connection point.
            var p = this.upperBundles[uid].concat(this.lowerBundles[uid].reverse()),
                // Note: Array.reverse() also reverses in-place, but we don't care.
                n = p.length;
            if (n===0) continue;
            var h = this.layout[uid].h,
                ideal_spread = (n - 1) * g0;
            // The "ideal spread" is the amount of space we'd like the n connector
            // segments to occupy, if available.
            // (It counts the n - 1 gaps between them, plus the thicknesses of the n
            // segments themselves, except that for the two outermost segments we
            // count only half the thickness. In the case where n = 1 we're satisfied
            // for this to come out as zero, since we consider that a lone connector
            // segment doesn't need /any/ space.)
            // What we actually do, however, depends on how the ideal spread
            // compares to the height of the node. In other words, is the
            // node actually big enough for us to spread out the segments as much as
            // we'd like?
            if (ideal_spread <= h) {
                // Here we handle the case in which yes, we have enough room.
                var g = g0,
                    slack = h - ideal_spread,
                    y = this.abs[uid].y + slack/2;
            } else {
                // Here we handle the case in which no, we don't have enough room.
                var g = h/(n-1),
                    y = this.abs[uid].y;
            }
            // Now with the initial value for y and with the gap g prepared, we iterate
            // over the LLCs and assign y-coords.
            for (var i in p) {
                var llc = p[i][0]; // remember, p is a list of pairs [llc, y-coord]
                llc.setYCoord(uid, y);
                y += g;
            }
        }

        // (3) Finally, store the routes globally in the required format.
        for (var dsc in this.llcs) {
            this.routes[dsc] = this.llcs[dsc].writeRoutePoints();
        }
    }

};

// -------------------------------------------------------------------
// ListLayoutConnector

var ListLayoutConnector = function(seqNum, e, abs, layout) {
    this.index = seqNum;
    this.edge = e;
    var tailAbs = abs[e.tailName],
        headAbs = abs[e.headName],
        tailDims = layout[e.tailName],
        headDims = layout[e.headName];
    this.tail_x = tailAbs.x + tailDims.w;
    this.tail_y = tailAbs.y + tailDims.h/2;
    this.mid_x = null;
    this.head_x = headAbs.x + headDims.w;
    this.head_y = headAbs.y + headDims.h/2;
};

ListLayoutConnector.prototype = {

    writeRoutePoints : function() {
        return [
            [this.tail_x, this.tail_y],
            [this.mid_x, this.tail_y],
            [this.mid_x, this.head_y],
            [this.head_x, this.head_y]
        ];
    },

    /*
    * uid: the uid of one of this connector's endpoints
    * y: a desired y-coordinate
    *
    * We set the y-coordinate for the named endpt to the desired value.
    */
    setYCoord : function(uid, y) {
        if (uid===this.edge.tailName) {
            this.tail_y = y;
        } else {
            this.head_y = y;
        }
    }

};

export { ListLayout };
