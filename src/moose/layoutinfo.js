/* ------------------------------------------------------------------------- *
 *  Proofscape Moose                                                         *
 *                                                                           *
 *  Copyright (c) 2011-2022 Proofscape contributors                          *
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

import { moose } from "./head.js";
import { Point } from "./polyline.js";

// --------------------------------------------------------
// LayoutInfo

/**
 * Pass the JSON returned by any of our backend layout methods.
 * This should be of the form:
 *     L = {
 *             'layoutMethod' : 'someMethodName',
 *             'data' : {
 *                 <all the layout data>
 *             }
 *     }
 * The layout data itself can be in any format, and it will be
 * understood based on the name of the layoutMethod.
 *
 * The LayoutInfo object serves as an abstraction layer, so
 * that a uniform API of methods for reading layout information
 * can be employed by the various classes of Moose, such as
 * Node, Ranger, and SubgraphBuilder. The LayoutInfo class is
 * responsible for knowing how to read all the various formats,
 * and extract the desired information.
 */
var LayoutInfo = function(forest, L) {
    this.forest = forest;
    this.layoutMethod = L.layoutMethod;
    this.rawData = L.data || {
        nodes: {},
        edges: {},
    };

    // In order to process the edge data, we need two things:
    // 1. A mapping from each node ID to the ID of that node's parent:
    this.nodeParents = {};
    // 2. The /absolute/ coords of each node:
    this.absCoords = {};

    // Flat dictionary mapping node IDs to their size
    // and /relative/ position:
    this.flatPosAndSize = this.computeFlatPosAndSize(this.rawData);

    // Compute flat edge data.
    this.flatEdgeData = this.computeFlatEdgeData(this.rawData);

    //console.log(this.flatPosAndSize);
    //console.log(this.absCoords);
    //console.log(this.flatEdgeData);

    /* This step was designed to make extra space at the top of deduc nodes,
     * where "headers" (incl. title & running defs) could be displayed.
     * But it is essentially flawed, since connector routes can, and often will,
     * run straight across this space. We keep the code around, but deactivate the step.
     */
    // Stretch for headers.
    //this.stretchForHeaders();

    // If did KLay layout and have a Forest, need to adjust positions for compound nodes.
    if (this.forest && (this.layoutMethod in moose.flowLayoutMethod_to_direc)) {
        this.adjustPositionsForCompoundNodes(this.rawData);
    }
}

LayoutInfo.prototype = {

    // --------------------------------------------------------------
    // The "API", i.e. the methods for use by other classes that
    // want to read/access the data.

    getPolylinePtsForEdgeDesc : function(desc) {
        return this.flatEdgeData[desc];
    },

    getPosForNodeUID : function(uid) {
        const d = this.flatPosAndSize[uid];
        if (!d) {
            return null;
        }
        return [d.x, d.y];
    },

    getSizeForNodeUID : function(uid) {
        var d = this.flatPosAndSize[uid];
        var size = [d.w, d.h];
        return size;
    },

    setSizeForNodeUID : function(uid, size) {
        const [w, h] = size;
        this.flatPosAndSize[uid].w = w;
        this.flatPosAndSize[uid].h = h;
    },

    getPosAndSizeForNodeUID : function(uid) {
        return this.flatPosAndSize[uid];
    },

    offsetPosForNodeUID : function(uid,v) {
        var d = this.flatPosAndSize[uid];
        d.x += v[0];
        d.y += v[1];
    },

    // "union-update" with another LayoutInfo
    update : function(other) {
        Object.assign(this.flatPosAndSize, other.flatPosAndSize);
        Object.assign(this.flatEdgeData, other.flatEdgeData);
    },

    // --------------------------------------------------------------
    // Methods for internal use, to prepare the raw data.

    computeFlatPosAndSize : function(raw) {
        // Is it KLay data?
        if (this.layoutMethod in moose.flowLayoutMethod_to_direc) {
            return this.flattenKLayGraph(raw);
        } else {
            // All other cases: assume the raw data already has
            // flat pos and size info under "nodes".
            return raw.nodes;
        }
    },

    /*
    * Take a KLay graph object, and return a dictionary having each
    * node uid as key, pointing to an object with fields x, y, w, h.
    */
    flattenKLayGraph : function(graph) {
        var d = {};
        var parentID = '';
        var P = new Point(0,0);
        this.flattenKLayGraphRecurse(graph,d,parentID,P);
        return d;
    },

    flattenKLayGraphRecurse : function(graph,d,parentID,P) {
        var uid = graph.id;
        this.nodeParents[uid] = parentID;
        if (graph.hasOwnProperty('x')&&graph.hasOwnProperty('y')) {
            var x = graph.x, y = graph.y;
            var p = {
                x: x,
                y: y,
                w: graph.width,
                h: graph.height
            };
            d[uid] = p;
            var D = new Point(x,y);
            P = P.plus(D);
        }
        this.absCoords[uid] = P;
        if (graph.hasOwnProperty('children')) {
            var children = graph.children;
            for (var i in children) {
                var ch = children[i];
                this.flattenKLayGraphRecurse(ch,d,uid,P);
            }
        }
    },

    adjustPositionsForCompoundNodes : function(raw) {
        // Is it KLay data?
        if (this.layoutMethod in moose.flowLayoutMethod_to_direc) {
            this.adjustPositionsForCompoundNodesKLay(raw);
        } else {
            // All other cases: assume the raw data is already
            // flat pos and size info.
            this.adjustPositionsForCompoundNodesFlat(raw);
        }
    },

    adjustPositionsForCompoundNodesKLay : function(graph) {
        var uid = graph.id;
        var node = this.forest.getNode(uid);
        if (node && (node.nodetype==='exis'||node.nodetype==='univ')) {
            node.adjustPositionsForExisNode(this);
        } else if (node && node.nodetype==='with') {
            node.adjustPositionsForWithNode(this);
        }
        // Recurse.
        if (graph.hasOwnProperty('children')) {
            var children = graph.children;
            for (var i in children) {
                var ch = children[i];
                this.adjustPositionsForCompoundNodesKLay(ch);
            }
        }
    },

    adjustPositionsForCompoundNodesFlat : function(flat) {
        for (var uid in flat.nodes) {
            var node = this.forest.getNode(uid);
            if (node && (node.nodetype==='exis'||node.nodetype==='univ')) {
                node.adjustPositionsForExisNode(this);
            } else if (node && node.nodetype==='with') {
                node.adjustPositionsForWithNode(this);
            }

        }
    },

    computeFlatEdgeData : function(raw) {
        // Is it KLay data?
        if (this.layoutMethod in moose.flowLayoutMethod_to_direc) {
            return this.flattenKLayEdgeData(raw);
        } else {
            // All other cases: assume the raw data already has flat
            // edge routes under "edges".
            // In other words, raw.edges is a dictionary in which edge
            // descriptions point to lists of "points", the latter being
            // lists of length two.
            return this.buildEdgeRoutesFromFlatData(raw);
        }
    },

    buildEdgeRoutesFromFlatData : function(raw) {
        var routes = {};
        for (var dsc in raw.edges) {
            var coords = raw.edges[dsc],
                pts = [];
            for (var i in coords) {
                var c = coords[i];
                var Q = new Point(c[0], c[1]);
                pts.push(Q);
            }
            routes[dsc] = pts;
        }
        return routes;
    },

    flattenKLayEdgeData : function(graph) {
        var d = {};
        this.flattenKLayEdgeDataRecurse(graph,d);
        return d;
    },

    flattenKLayEdgeDataRecurse : function(graph,d) {
        if (graph.hasOwnProperty('edges')) {
            var edges = graph.edges;
            for (var i in edges) {
                var e = edges[i];
                var desc = e.id;
                const pts = [];
                // In KLay, the rule for interpreting the returned edge routing data is that the
                // route points are in the coordinate system of the source node's parent.
                // In ELK, the edge has a `container` property to tell us which node's coord. sys. to use.
                const P = this.absCoords[this.forest.useElk ? e.container : this.nodeParents[e.source]];

                function addRoutePt(q) {
                    pts.push(P.plus(new Point(q.x, q.y)));
                }

                if (this.forest.useElk) {
                    // We only use simple edges, so there is always just one section:
                    const sec = e.sections[0];
                    addRoutePt(sec.startPoint);
                    if (sec.bendPoints) {
                        sec.bendPoints.forEach(addRoutePt);
                    }
                    addRoutePt(sec.endPoint);
                } else {
                    var q = e.sourcePoint;
                    var Q = new Point(q.x, q.y);
                    pts.push(P.plus(Q));
                    if (e.hasOwnProperty('bendPoints')) {
                        for (var i in e.bendPoints) {
                            q = e.bendPoints[i];
                            Q = new Point(q.x, q.y);
                            pts.push(P.plus(Q));
                        }
                    }
                    q = e.targetPoint;
                    Q = new Point(q.x, q.y);
                    pts.push(P.plus(Q));
                }

                d[desc] = pts;
            }
        }
        // Recurse.
        if (graph.hasOwnProperty('children')) {
            var children = graph.children;
            for (var i in children) {
                var ch = children[i];
                this.flattenKLayEdgeDataRecurse(ch,d);
            }
        }
    },

    // Compute the relative coordinates based on the absolute coordinates.
    // This is useful if we have adjusted the abs coords, and then want to pass the adjustment
    // into the rel coords as well.
    computeRelCoordsFromAbsCoords : function() {
        for (var uid in this.flatPosAndSize) {
            var relXYWH = this.flatPosAndSize[uid],
                R = this.absCoords[uid],
                parentID = this.nodeParents[uid];
            if (parentID) {
                // This node has a parent, so get its abs coords, and subtract.
                var P = this.absCoords[parentID],
                    R = R.minus(P);
            }
            relXYWH.x = R.x;
            relXYWH.y = R.y;
        }
    },

    // Use WebCoLa's VPSC solver to make extra vertical space at top of deduc nodes, for displaying header info.
    stretchForHeaders : function() {
        var nodes = {},
            conns = {},
            events = [],
            vs = [],
            cs = [];
        // Make StretchNodes, events, and variables
        for (var uid in this.flatPosAndSize) {
            var relXYWH = this.flatPosAndSize[uid],
                absXY = this.absCoords[uid],
                // FIXME: for initial testing purposes, we'll just ask for a header of fixed height for certain nodes.
                headerHeight = uid.endsWith('Thm') || uid.endsWith('Pf') ? 50 : 0,
                node = new StretchNode(uid, relXYWH, absXY, headerHeight, events, vs);
            nodes[uid] = node;
        }
        // Make StretchConns, events, and variables
        for (var uid in this.flatEdgeData) {
            var pts = this.flatEdgeData[uid],
                conn = new StretchConn(uid, pts, events, vs);
            conns[uid] = conn;
        }
        // Sort events: primarily by x-coord; secondarily, "close" events come before "open" events.
        events.sort(function(e, f){
            if (e.x !== f.x) {
                return e.x - f.x;
            } else {
                if (e.type === 'c' && f.type === 'o') {
                    return -1;
                }
                else if (f.type === 'c' && e.type === 'o') {
                    return 1;
                }
                else {
                    return 0;
                }
            }
        });
        // Scan, and set up VPSC constraints.
        // fixme: this step should actually be redone using a linked list of openEvents, ordered
        // by increasing y-coord. Then, constraints should be written only between neighbors in this list.
        // This should cut a quadratic number of constraints down to a linear number of them.
        var openEvents = {};
        for (var i in events) {
            var e = events[i];
            if (e.type === 'c') {
                // It is a "close" event. The corresp. "open" event should already be in the set.
                // All we need do is remove the "open" event from the set.
                delete openEvents[e.id];
            } else {
                // It is an "open" event.
                // Set up constraints against all currently open events.
                for (var id in openEvents) {
                    var f = openEvents[id];
                    // Determine which event is the "left" and which is the "right".
                    var L = null, R = null;
                    if (f.y < e.y) {
                        L = f;
                        R = e;
                    } else if (e.y < f.y) {
                        L = e;
                        R = f;
                    } else {
                        // This case should not arise.
                        continue;
                    }
                    // Compute the desired gap.
                    var g = R.y - L.y + L.extraGap;
                    // Set up the constraint.
                    var c = new cola.Constraint(L.v, R.v, g);
                    cs.push(c);
                }
                // And now add the new event to the set.
                openEvents[e.id] = e;
            }
        }
        // Solve the VPSC instance.
        var solver = new cola.Solver(vs, cs);
        solver.solve();
        // Update to new positions.
        // Nodes:
        for (var uid in this.flatPosAndSize) {
            var node = nodes[uid];
            node.update();
            this.flatPosAndSize[uid].h = node.h;
            this.absCoords[uid].y = node.absY;
        }
        // Connectors:
        for (var uid in this.flatEdgeData) {
            var conn = conns[uid];
            conn.update(this.absCoords, this.flatPosAndSize); // the connector had a ref to our own pts array (not a copy), so we are already updated by this
        }
        // Redo all relative coords based on the new absolute coords.
        this.computeRelCoordsFromAbsCoords();
    },

};

// -----------------
// Layout stretching

/* Event class for supporting a scanline procedure.
 * param id: an id number shared by pairs of open and close events
 * param x: the x-coord of the event
 * param y: the y-coord of the event
 * param type: the type of the event; should be 'o' (for "open") or 'c' (for "close")
 * param v: the cola Variable representing this event's y-coord
 * param extraGap: an amount that should be added to the minimal separation gap, when
 *                 this event represents the left-hand variable in a sep-co
 */
var StretchEvent = function(id, type, x, y, v, extraGap) {
    this.id = id;
    this.type = type;
    this.x = x;
    this.y = y;
    this.v = v;
    this.extraGap = extraGap;
};

/* Utility class for layout stretching operation. Represents nodes.
 * param uid: the UID of the node
 * param relXYWH: info object containing the width and height of the node, plus _relative_ x and y (ULC)
 * param absXY: info object containing the _absolute_ x and y of the node (ULC)
 * param headerHeight: the height in pixels of the space that should be made for a header
 *                     at the top of this node. Simply set to 0 if no header desired.
 * param events: an array to which the Event objects for this node should be pushed.
 * param vs: an array to which the cola Variables for this node should be pushed.
 */
var StretchNode = function(uid, relXYWH, absXY, headerHeight, events, vs) {
    // Store info
    this.uid = uid;
    this.w = relXYWH.w;
    this.h = relXYWH.h;
    this.relX = relXYWH.x;
    this.relY = relXYWH.y;
    this.absX = absXY.x;
    this.absY = absXY.y;
    this.headerHeight = headerHeight;
    // Make Variables and Events
    this.topVar = new cola.Variable(this.absY);
    this.botVar = new cola.Variable(this.absY + this.h);
    var baseId = events.length/2,
        topOpenEvt  = new StretchEvent(baseId, 'o', this.absX, this.absY, this.topVar, this.headerHeight),
        topCloseEvt = new StretchEvent(baseId, 'c', this.absX + this.w),
        botOpenEvt  = new StretchEvent(baseId + 1, 'o', this.absX, this.absY + this.h, this.botVar, 0),
        botCloseEvt = new StretchEvent(baseId + 1, 'c', this.absX + this.w);
    events.push(topOpenEvt);
    events.push(topCloseEvt);
    events.push(botOpenEvt);
    events.push(botCloseEvt);
    vs.push(this.topVar);
    vs.push(this.botVar);
};

StretchNode.prototype = {
    update: function() {
        var y = this.topVar.position(),
            Y = this.botVar.position();
        this.absY = y;
        this.h = Y - y;
    }
};

/* Utility class for layout stretching operation. Represents connectors.
 * param uid: the UID (or "description") of the connector
 * param pts: array of Points describing the connector route
 * param events: an array to which the Event objects for this node should be pushed.
 * param vs: an array to which the cola Variables for this node should be pushed.
 */
var StretchConn = function(uid, pts, events, vs) {
    // Store info
    this.uid = uid;
    this.pts = pts;
    // Determine indices of horizontal segments.
    // By "segment i" we mean the segment that runs from point i to point i+1.
    this.numPts = pts.length;
    this.numSegs = pts.length - 1;
    this.hsegIndices = [];
    for (var i = 0; i < this.numSegs; i++) {
        var a = this.pts[i],
            b = this.pts[i+1],
            isHoriz = Math.abs(a.y - b.y) < Math.abs(a.x - b.x);
        if (isHoriz) this.hsegIndices.push(i);
    }
    // Make Variables and Events
    this.vars = {};
    for (var j in this.hsegIndices) {
        var i = this.hsegIndices[j],
            v = new cola.Variable(this.pts[i].y),
            id = events.length/2,
            a = this.pts[i],
            b = this.pts[i+1],
            L = a.x < b.x ? a : b,
            R = a.x < b.x ? b : a,
            openEvt  = new StretchEvent(id, 'o', L.x, L.y, v, 0),
            closeEvt = new StretchEvent(id, 'c', R.x);
        this.vars[i] = v;
        events.push(openEvt);
        events.push(closeEvt);
        vs.push(v);
    }
};

StretchConn.prototype = {
    update: function(absCoords, sizes) {
        // Horizontal segments
        for (var j in this.hsegIndices) {
            var i = this.hsegIndices[j],
                y = this.vars[i].position();
            this.pts[i].y = y;
            this.pts[i+1].y = y;
        }
        // Endpoints
        var p = this.uid.split(' --> ');
        if (p.length === 2) {
            var sid = p[0].split(' : ')[2],
                tid = p[1],
                src_height = sizes[sid].h,
                S = absCoords[sid],
                src_bot_y = S.y + src_height,
                T = absCoords[tid],
                tgt_top_y = T.y;
            this.pts[0].y = src_bot_y;
            this.pts[this.numPts - 1].y = tgt_top_y;
        }
    }
};

export { LayoutInfo };
