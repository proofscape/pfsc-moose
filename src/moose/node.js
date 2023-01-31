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

import { moose } from "./head.js";
import { DeducInfo } from "./deducinfo.js";
import { Edge } from "./edge.js";
import { SHARVA } from "./sharva.js";
import { ClassManager } from "./classmgr";

// -------------------------------------------------------------------
// Node

var Node = function() {
    this.uid = '';
    this.origin = '';

    this.forest = null;
    this.builder = null;

    // CSS padding and border width, to be placed around
    // the label of the node.
    this.padding = 5;
    this.borderWidth = 1;

    this.contextMenuPlugin = null;
    this.menu = null;

    this.scaleFactor = 1;
    this.x = 0; this.y = 0;
    this.homeX = 0; this.homeY = 0;

    this.freeRoaming = false;

    this.permaglow = false;
    this.glowThickness = 7;

    this.width = 0; this.height = 0;
    this.labelWidth = 0; this.labelHeight = 0;

    this.actualSizesAreKnown = false;
    this.layoutPosIsKnown = false;
    this.presetWidth = 0;
    this.labelType = null;
    this.labelHTML = '';
    this.parentNode = null;

    this.ghostInfo = {};

    this.docRef = null;
    this.docFingerprint = null;

    this.rdefHTML = '';
    this.numRdefs = 0;

    this.div = null;
    this.imminentlyVisible = false;
    this.visible = true;
    this.bounded = true;

    this.nodeLayer = null;
    this.edgeLayer = null;

    this.showFlowEdges = true;

    this.showingLineref = false;

    this.children = {};

    this.obscuredEdges = {};

    // In all edge dictionaries, keys are equal to edge.getDesc().
    // We keep in-edges and out-edges separately, for convenience.
    // We also keep the set of all edges "owned by" this node. These
    // are edges that were created when this node was added to the
    // forest as the root of a new subgraph. (Therefore many nodes
    // will never own any edges.)
    this.inEdges = {};
    this.outEdges = {};
    this.ownedEdges = {};

    // A "vine" is an edge whose endpts fail to have the same (existing) parent.
    // A basic example would be an edge coming from a cited result.
    // See the `isVine` method in the Edge class for more info.
    //
    // However, in a sense a vine only _looks_ like a vine to one of its
    // two endpoints, tail or head. The question is where the owner of the edge
    // stands, in relation to tail and head. It can be the ancestor of only one
    // of these. To that one, the edge looks normal; to the other end, it looks like
    // a vine, and is to be recorded here.
    //
    // The purpose of all this is to ensure that, when the node at either end of
    // an edge is removed from the board, that edge is also removed, even if it
    // was not owned by any ancestor of the removed node.
    this.vines = {};

    // A place to keep a reference to a GhostNode of this node,
    // belonging to an expansion that targets this node (a so-called
    // "expansion ghost").
    this.expansionGhost = null;

    // Place to store a reference to this Node's checkbox, if any.
    this.checkbox = null;

    this.revision = '';

    this.userNotes = null;
};

Node.prototype = {

    /*
    * Follow expansion ghosts as far as possible, and return
    * the libpath of the farthest one. This node's own libpath
    * is returned if it has no expansion ghosts.
    */
    getHighestExpansionLibpath : function() {
        var lp = this.getLibpath();
        var eG = this.expansionGhost;
        while (eG !== null) {
            lp = eG.getLibpath();
            eG = eG.expansionGhost;
        }
        return lp;
    },

    /*
    * Like getHighestExpansionLibpath, only we return the
    * next-to-highest one instead of the highest one.
    * If this node has no expansionGhost, we return null.
    */
    getPenultimateExpansionLibpath : function() {
        var lp = null;
        var lastNode = this;
        var eG = this.expansionGhost;
        while (eG !== null) {
            lp = lastNode.getLibpath();
            lastNode = eG;
            eG = eG.expansionGhost;
        }
        return lp;
    },

    // Floor also has this method, and returns false.
    // Useful for determining whether the owner of a decaying node
    // is a node or the floor.
    isNode : function() {
        return true;
    },

    isAssertoric : function() {
        return this.assertoric;
    },

    isDeduc : function(strict = false) {
        if (strict) {
            return this.nodetype==='ded';
        }
        return this.nodetype==='ded' || this.nodetype==='subded';
    },

    isSubdeduc : function() {
        return this.nodetype==='subded';
    },

    isTLD: function() {
        return this.isDeduc() && this.getDeducInfo().isTLD();
    },

    isTheorymap : function() {
        return this.getUID().slice(0, 18) === 'special.theorymap.' && this.getUID().slice(-5) === '._map';
    },

    getForest : function() {
        return this.forest;
    },

    /*
    * A "reason" is an in-edge of type "ded".
    * Return set of all those which are currently visible.
    */
    getVisibleReasons : function() {
        var v = {};
        for (let k in this.inEdges) {
            var e = this.inEdges[k];
            if (e.isVisible() && e.isDeduction()) {
                v[k] = e;
            }
        }
        return v;
    },

    /*
    * Given an edge lookup, all of which should be incident edges at this node,
    * make and return a node lookup for the nodes at the opposite ends of those edges,
    * relative to this node.
    */
    getOppositeNodes : function(edgeDict) {
        var opps = {};
        for (let k in edgeDict) {
            var e = edgeDict[k],
                opp = e.getOppositeEnd(this);
            opps[opp.uid] = opp;
        }
        return opps;
    },

    /*
    * An "antecedent" is a Node connected to this one by a "reason", i.e. by an
    * in-edge of type "ded".
    * Return set of all those which are currently connected by _visible_ reasons.
    */
    getVisibleAntecedents : function() {
        var vr = this.getVisibleReasons();
        return this.getOppositeNodes(vr);
    },

    /*
    * A "consequent" is a Node connected to this one by an "implication", i.e. by an
    * out-edge of type "ded".
    * Return set of all those which are currently connected by _visible_ implications.
    */
    getVisibleConsequents : function() {
        var vi = this.getVisibleImplications();
        return this.getOppositeNodes(vi);
    },

    /* Explore visible neighbors of this node, two layers deep, i.e. passing
     * onward through any _method_ nodes that may occur in the first layer.
     *
     * @param direc: integer +1 or -1 indicating the desired exploration direction,
     *   where -1 means antecedents, and +1 means consequents.
     * @return: object of the form {
     *   nodes: map from node uids to nodes, incl all nodes found in both layers,
     *   layer1: array of uids of nodes found in the first layer, incl. method nodes,
     *   mthd1: array of uids of just the method nodes in the first layer,
     *   layer2origins: map from uids of nodes found in the second layer, to uid of method node
     *     from which they were found.
     * }
     */
    exploreVisibleTwoLayers : function(direc) {
        const explore = direc === 1 ? this.getVisibleConsequents : this.getVisibleAntecedents;
        const layer1Nodes = explore.call(this);
        const nodes = new Map();
        const layer1 = Array.from(Object.keys(layer1Nodes));
        const mthd1 = [];
        const layer2origins = new Map();
        for (let uid of layer1) {
            const u = layer1Nodes[uid];
            nodes.set(uid, u);
            if (u.nodetype === 'mthd') {
                mthd1.push(uid);
                const moreNodes = explore.call(u);
                for (let vid of Object.keys(moreNodes)) {
                    const v = moreNodes[vid];
                    nodes.set(vid, v);
                    layer2origins.set(vid, uid);
                }
            }
        }
        return {nodes, layer1, mthd1, layer2origins};
    },

    /*
    * An "implication" is an out-edge of type "ded".
    * Return set of all those which are currently visible.
    */
    getVisibleImplications : function() {
        var v = {};
        for (let k in this.outEdges) {
            var e = this.outEdges[k];
            if (e.isVisible() && e.isDeduction()) {
                v[k] = e;
            }
        }
        return v;
    },

    getAllReasons : function() {
        var v = {};
        for (let k in this.inEdges) {
            var e = this.inEdges[k];
            if (e.isDeduction()) {
                v[k] = e;
            }
        }
        return v;
    },

    getVisibleInEdges : function() {
        var v = {};
        for (let k in this.inEdges) {
            var e = this.inEdges[k];
            if (e.isVisible()) {
                v[k] = e;
            }
        }
        return v;
    },

    getInDegree : function() {
        let n = 0;
        for (let k in this.inEdges) n++;
        return n;
    },

    getOutDegree : function() {
        let n = 0;
        for (let k in this.outEdges) n++;
        return n;
    },

    getDegree : function() {
        return this.getInDegree() + this.getOutDegree();
    },

    isSelected : function() {
        if (this.forest) return this.forest.getSelectionManager().isSelected(this.libpath);
        return false;
    },

    getColorClasses : function() {
        return this.colorClassMgr.getClasses();
    },

    applyColorCodes : function(codes) {
        let lastPop = null;
        for (let code of codes) {
            if (code === "0") {
                this.colorClassMgr.clearClasses();
            } else if (code === "push") {
                this.colorClassMgr.push();
            } else if (code === "cpush" && lastPop) {
                this.colorClassMgr.push();
            } else if (code === "pop") {
                lastPop = this.colorClassMgr.pop();
            } else if (code === "wpop") {
                lastPop = this.colorClassMgr.pop({weak: true});
            } else if (code === "save") {
                this.colorClassMgr.save();
            } else if (code === "wrest") {
                this.colorClassMgr.restore({weak: true});
            } else if (code === "tmp") {
                this.colorClassMgr.addClasses([ClassManager.temporary_set]);
            } else {
                // Code should begin with `ol` or `bg`.
                if (code[2] === "0") {
                    this.colorClassMgr.clearClasses(new RegExp(code.slice(0, 2)));
                } else {
                    this.colorClassMgr.addClasses([code]);
                }
            }
        }
    },

    /* Apply a color code to the edges incident to this node.
     *
     * The first two letters of the code specify the set of edges to
     * which the color is to be applied, as follows:
     *   first letter: the _type_ of edge
     *     e: all edges
     *     d: just deduction edges
     *     f: just flow edges
     *   second letter: the _direction_ of the edge
     *     b: both directions
     *     i: just incoming edges
     *     o: just outgoing edges
     *
     * The remainder of the code is to be passed on to the edges.
     */
    applyEdgeColorCode : function(code) {
        const type = code[0];
        const direc = code[1];
        const remainder = code.slice(2);
        const lookups = [];
        if (['i', 'b'].includes(direc)) {
            lookups.push(this.inEdges);
        }
        if (['o', 'b'].includes(direc)) {
            lookups.push(this.outEdges);
        }
        for (let L of lookups) {
            for (let e of Object.values(L)) {
                if (
                    type === 'e' ||
                    (type === 'd' && e.isDeduction()) ||
                    (type === 'f' && e.isFlow())
                ) {
                    e.applyColorCode(remainder);
                }
            }
        }
    },

    /* Report [x, y, s], where [x, y] is the ULC of this node in global coordinates,
     * and where s is the global scaling factor applied to this node.
     */
    getGlobalUlcAndScale : function() {
        const x = this.x,
            y = this.y,
            s = this.scaleFactor;
        if (this.parentNode) {
            const [px, py, ps] = this.parentNode.getGlobalUlcAndScale();
            return [px + ps*x, py + ps*y, ps*s];
        } else {
            return [x, y, s];
        }
    },

    // Get [x,y] for upper-left corner of this node WITHIN its
    // parent node, if it has one.
    getLocalULC : function() {
        var x = this.x; var y = this.y;
        return [x, y];
    },

    // Return centre point in global coords.
    getCentre : function() {
        const [x, y, s] = this.getGlobalUlcAndScale();
        const w = s*this.width, h = s*this.height;
        return [ x + w/2, y + h/2 ];
    },

    // Return centre point in local coords.
    getLocalCentre : function() {
        var p = this.getLocalULC();
        var w = this.width, h = this.height;
        return [ p[0] + w/2, p[1] + h/2 ];
    },

    getOuterDims : function() {
        return [this.width, this.height];
    },

    getGlobalIntervals : function() {
        const [x, y, s] = this.getGlobalUlcAndScale();
        const w = s*this.width, h = s*this.height;
        return [ [x, x+w], [y, y+h] ];
    },

    hasALabel : function() {
        return this.labelHTML.length > 0;
    },

    /// Return bounding box in form [x,X,y,Y] for this node,
    /// in global coordinates.
    getBBoxxXyY : function() {
        var I = this.getGlobalIntervals();
        var IX = I[0], IY = I[1];
        var x = IX[0], X = IX[1];
        var y = IY[0], Y = IY[1];
        return [x,X,y,Y];
    },

    /// Return bounding box in form [x,y,w,h] for this node,
    /// in global coordinates.
    getBBoxXYWH : function() {
        var b = this.getBBoxxXyY();
        var x=b[0], X=b[1], y=b[2], Y=b[3];
        var w=X-x, h=Y-y;
        return [x,y,w,h];
    },

    /*
    * R = [x,y,w,h] gives a rectangle in global coords.
    * We say whether or not the bounding box of this node
    * overlaps R.
    */
    overlapsGCRect : function(R) {
        var I = this.getGlobalIntervals();
        var IX = I[0], IY = I[1];
        var x = IX[0], X = IX[1];
        var y = IY[0], Y = IY[1];
        var u = R[0], U = u + R[2];
        var v = R[1], V = v + R[3];
        return  x<U && u<X && y<V && v<Y;
    },

    /*
    * Add to the passed set all edges connected to this node
    * or any of its children.
    */
    getAllNestedEdges : function(edgeSet) {
        for (let id in this.inEdges) {
            edgeSet[id] = this.inEdges[id];
        }
        for (let id in this.outEdges) {
            edgeSet[id] = this.outEdges[id];
        }
        for (let uid in this.children) {
            var ch = this.children[uid];
            ch.getAllNestedEdges(edgeSet);
        }
    },

    /*
    * Calls roamByInSelection, and iff that returns true
    * adds to edgeSet all the edges connected to this node
    * or any of its children.
    */
    roamByInSelWithEdgeSet : function(dx,dy,edgeSet) {
        var roamed = this.roamByInSelection(dx,dy);
        if (roamed) {
            this.getAllNestedEdges(edgeSet);
        }
    },

    /*
    * Call this instead of roamBy when moving all the nodes in
    * the current selection. This simply cancels motion if there is
    * an ancestor which is also selected; the presumption is that
    * the ancestor's roamByInSelection will also be called by the
    * calling process.
    *
    * Return true iff this node roams.
    */
    roamByInSelection : function(dx,dy) {
        if (this.hasSelectedAncestor()) {
            return false;
        } else {
            return this.roamBy(dx,dy);
        }
    },

    hasSelectedAncestor : function() {
        if (this.parentNode) {
            if (this.parentNode.isSelected()) {
                return true;
            } else {
                return this.parentNode.hasSelectedAncestor();
            }
        }
        return false;
    },

    nearestBoundedAncestor : function() {
        if (this.parentNode) {
            if (this.parentNode.isBounded()) {
                return this.parentNode;
            } else {
                return this.parentNode.nearestBoundedAncestor();
            }
        } else {
            return null;
        }
    },

    getParentNode : function() {
        return this.parentNode;
    },

    // Trace back through parent nodes until finding one that
    // has no parent, and return that. May be this node itself.
    getRootNode : function() {
        var root = this;
        if (this.parentNode) {
            root = this.parentNode.getRootNode();
        }
        return root;
    },

    // Say whether this node is an ancestor of (possibly equal to) another.
    isAncestorOf : function(node) {
        if (this === node) {
            return true;
        } else if (node.parentNode) {
            return this.isAncestorOf(node.parentNode);
        } else {
            return false;
        }
    },

    roam : function() {
        //console.log(this.uid+' roam '+this.x+' '+this.y);
        this.div.style.left = this.x+'px';
        this.div.style.top  = this.y+'px';
    },

    roamTo : function(x,y) {
        // We check whether the move is okay (would not take
        // us outside of a bounded parent node), and roam only if
        // it is. Return true iff we roam.
        var nba = this.nearestBoundedAncestor();
        if (!this.freeRoaming && nba) {
            // Get what bounding box would be if we moved.
            var lastX = this.x, lastY = this.y;
            this.x = x; this.y = y;
            var B = this.getBBoxxXyY();
            this.x = lastX; this.y = lastY;
            var s=B[0], S=B[1], t=B[2], T=B[3];
            // Get NBA's bbox.
            var A = nba.getBBoxxXyY();
            var u=A[0], U=A[1], v=A[2], V=A[3];
            // Check

            if (s<u || S>U || t<v || T>V) {
                return false;
            }

            /*
            // The code below allows the node to move as
            // far as it can before hitting the boundary,
            // and this results in much smoother, nicer
            // response.
            // But there is some problem with it.
            // E.g. when opening ZB8.Pf, starting from ZB9.Thm,
            // nodes get wrong positions.
            if (s<u) x += u-s;
            if (S>U) x -= S-U;
            if (t<v) y += v-t;
            if (T>V) y -= T-V;
            if (x == this.x && y == this.y) {
                return false;
            }
            */

        } else if ((this.nodetype==='ded' || this.nodetype==='subded') && this.forest.shadeDeducBGs) {
            // In this case, we correct for the border, so that edges
            // appear in the right place.
            x--; y--;
        }
        this.x = x; this.y = y;
        this.roam();
        return true;
    },

    roamBy : function(dx,dy) {
        var x = this.homeX + dx, y = this.homeY + dy;
        return this.roamTo(x,y);
    },

    move : function() {
        this.homeX = this.x; this.homeY = this.y;
    },

    moveTo : function(x,y) {
        this.roamTo(x,y);
        this.move();
    },

    moveBy : function(dx,dy) {
        this.roamBy(dx,dy);
        this.move();
    },

    setLayoutCentrePos : function(pos) {
        var x = pos[0]; var y = pos[1];
        this.x = x; this.y = y;
        this.homeX = x; this.homeY = y;
        this.layoutPosIsKnown = true;
    },

    setLayoutSize : function(size) {
        var w = size[0], h = size[1];
        if (this.shape==='stadium' || this.shape==='hexagon') {
            w -= h;
        }
        // Experimental:
        // Maybe we should accept the layout size only if this
        // is a node that has child nodes. After all, why else
        // do we need a size from the layout?
        if (this.numChildren() > 0) {
            this.width = w; this.height = h;
        }
    },

    isVisible : function(options) {
        const {
            patient = false,
        } = options || {};
        return this.visible || (patient && this.imminentlyVisible);
    }, 

    getInnerDims : function() {
        var w = this.innerWidth(), h = this.innerHeight();
        return [w,h];
    },

    setAsTailOf : function(e) {
        e.tail = this;
        this.outEdges[e.getDesc()] = e;
    },  
        
    setAsHeadOf : function(e) {
        e.head = this;
        this.inEdges[e.getDesc()] = e;
    },

    initWithDict : function(d, builder, allReals, allGhosts) {

        this.builder = builder;

        // Revision
        if (d.hasOwnProperty('revision')) {
            this.revision = d.revision;
        }

        // Deduction Info
        // Get it from the passed dictionary if it is present.
        if (d.hasOwnProperty('deducInfo')) {
            this.deducInfo = new DeducInfo(d['deducInfo'], this);
            this.deducInfo.revision = this.revision;
        }
        // In any case, retrieve it now, either from self or from
        // deduction higher up.
        var deducInfo = this.getDeducInfo();

        // Node ordering
        if (d.hasOwnProperty('nodeOrder')) {
            this.nodeOrder = d['nodeOrder'];
            // Compute reverse look-up too
            this.nodeOrderLookup = {};
            for (let i in this.nodeOrder) {
                var name = this.nodeOrder[i];
                this.nodeOrderLookup[name] = +i;
            }
        } else {
            this.nodeOrder = null;
            this.nodeOrderLookup = null;
        }

        // Read properties from dictionary.
        this.uid = d.libpath;
        this.origin = d.origin;
        this.nodetype = d.nodetype;
        this.assertoric = d.isAssertoric;
        this.intraDeducPath = d.intraDeducPath;
        this.textRange = d.textRange;
        this.enrichment = d.enrichment;
        this.cfOut = d.cf_out || [];
        this.userNotes = d.user_notes;

        this.docRef = d.docRef;
        this.docId = d.docId

        // Running defs
        if (this.isDeduc()) {
            let rdefs = deducInfo.getRunningDefs(),
                h = '';
            this.numRdefs = rdefs.length;
            if (this.numRdefs > 0) {
                h = '<table class="mooseRdefs">\n';
                for (let i in rdefs) {
                    let rdef = rdefs[i],
                        lhs = rdef[0],
                        rhs = rdef[1];
                    h += `<tr><td class="dfdm">${lhs}</td><td class="dfns">${rhs}</td></tr>\n`;
                }
                h += '</table>\n';
            }
            this.rdefHTML = h;
        }

        // Home deduction
        this.home = deducInfo.getLibpath();

        // Get special fields for compound node types.
        if (this.nodetype==='exis' || this.nodetype==='univ') {
            this.typenodeUIDs = d.typenodeUIDs;
            this.propnodeUIDs = d.propnodeUIDs;
        } else if (this.nodetype==='rels') {
            this.chainUIDs = d.chainUIDs;
        } else if (this.nodetype==='with') {
            this.defnodeUIDs = d.defnodeUIDs;
            this.claimnodeUIDs = d.claimnodeUIDs;
        }

        // Get special fields for ghost nodes.
        if (this.nodetype==='ghost') {
            this.ghostInfo = {
                ghostOf: d.ghostOf,
                realObj: d.realObj,
                realVersion: d.realVersion,
                realOrigin: d.realOrigin,
                realDeduc: d.realDeduc,
                xpanSeq: d.xpanSeq
            }
        }

        // Add to sets of reals / ghosts.
        if (this.nodetype==='ghost') {
            allGhosts[this.uid] = this;
        } else {
            allReals[this.uid] = this;
        }

        // Style
        // Use the NodeStyler for boundary weight and style,
        // and the colour and shape of the node.
        var style = moose.getStyleForNodeType(
            this.nodetype
        );
        this.bdweight = style.bdweight;
        this.shape    = style.shape;

        // If it is a 'supp' nodetype and belongs to a TLD
        // then make its bdweight bold.
        if (this.nodetype==='supp' && deducInfo.isTLD()) {
            this.bdweight = 'bold';
        }
        // Translate bdweight into an actual border width in pixels.
        if (this.bdweight === 'bold') {
            this.borderWidth = 3;
        } else {
            this.borderWidth = 1;
        }
        // Set fontsize if it was specified.
        if (style.hasOwnProperty('fontsize')) {
            this.fontSize = d.fontSize;
        }

        // Linerefs
        this.linerefs = d.linerefs;

        // Label
        var h = d.labelHTML;
        if (this.isDeduc()) {
            h = this.rdefHTML;
        }
        // HTML labels are stored in encoded form to protect
        // special characters; so must now decode.
        h = decodeURIComponent(h);
        this.labelHTML = h;

        // Preset width?
        if (d.hasOwnProperty('presetWidth')) {
            this.presetWidth = d.presetWidth;
        }

        // Flow edges?
        this.showFlowEdges = !builder.getSuppressFlowEdges();

        // Register this node with the builder.
        // Must do this AFTER we have our UID!
        builder.noteNode(this);

        // Edges
        var edges = d.edges;
        for (let i in edges) {
            var e = edges[i];
            var E = new Edge();
            E.initWithDict(e);
            builder.addEdge(E);
        }

        // Children
        if (d.hasOwnProperty('children')) {
            var ch = d.children;
            for (let k in ch) {
                var c = ch[k];
                var N = new Node();
                if (this.forest!=null) {
                    N.setForest(this.forest);
                }
                // First make sure the child knows its parent
                // (so it can access deducInfo).
                N.parentNode = this;
                // Other settings
                N.revision = this.revision;
                // Now can initialise.
                N.initWithDict(c, builder, allReals, allGhosts);
                var uid = N.getUID();
                this.children[uid] = N;
                // Do not need to register N with the builder,
                // since N already will have registered itself.
            }
        }
    },

    /*
     * If you have a subnode of a compound node, and you want to get the compound
     * node to which it belongs, you can use this method.
     *
     * By "proper node" we mean a node that is neither a deduction nor a subdeduction.
     *
     * return: The node itself if its parent is a deduc or subdeduc;
     *         null if the node is a deduc or subdeduc;
     *         otherwise, as described above.
     */
    getLargestProperNodeAncestor : function() {
        if (this.nodetype === 'ded' || this.nodetype === 'subded') return null;
        var  pn = this.parentNode;
        if (!pn) return null;
        if (pn.nodetype === 'ded' || pn.nodetype === 'subded') return this;
        return pn.getLargestProperNodeAncestor();
    },

    getDeducInfo : function() {
        if (this.hasOwnProperty('deducInfo')) {
            return this.deducInfo;
        } else if (this.parentNode) {
            return this.parentNode.getDeducInfo();
        } else {
            return null;
        }
    },

    getClarsAvailable : function() {
        var ca = {};
        var di = this.getDeducInfo();
        if (di) {
            ca = di.getClarsAvailableFor(this.uid);
        }
        return ca;
    },

    getVersion : function() {
        const di = this.getDeducInfo();
        return di.getVersion();
    },

    // Return friendly_name if one was provided, else null.
    getFriendlyName : function() {
        var fn = null;
        var di = this.getDeducInfo();
        fn = di.getFriendlyName();
        return fn;
    },

    // For querying the real home of a ghost node.
    // Returns null if no realHome field defined.
    getRealHome : function() {
        var rh = null;
        if (this.hasOwnProperty('realHome')) {
            rh = this.realHome;
        }
        return rh;
    },

    getCheckbox : function() {
        return this.checkbox;
    },

    /*
    * If this is a ghost node, then return the UID of the
    * node of which this is a ghost. Else return null.
    */
    ghostOf : function() {
        return this.ghostInfo.ghostOf;
    },

    /*
     * If this is a ghost node, then return the version of the
     * node of which this is a ghost. Else return null.
     */
    realVersion : function() {
        return this.ghostInfo.realVersion;
    },

    /* If this is a ghost node, and it has a forest, request
     * that the ghosted node be viewed.
     *
     * param doTransition: boolean; set true if you want to transition smoothly.
     */
    viewGhostedNode : function(doTransition) {
        const realpath = this.ghostOf();
        const realvers = this.realVersion();
        if (realpath && this.forest) {
            this.forest.requestState({
                view: {
                    objects: realpath
                },
                versions: {
                    [realpath]: realvers,
                },
                transition: doTransition
            });
        }
    },

    addOwnedEdge : function(edge) {
        var d = edge.toString();
        this.ownedEdges[d] = edge;
    },

    removeOwnedEdge : function(edge) {
        var d = edge.toString();
        if (this.ownedEdges.hasOwnProperty(d)) {
            delete this.ownedEdges[d];
        }
    },

    getOwnedFlowEdges : function(/* boolean */ excludeBridges) {
        var ofe = {};
        for (let d in this.ownedEdges) {
            var e = this.ownedEdges[d];
            if (!e.isFlow()) continue;
            if (excludeBridges && e.isBridge()) continue;
            ofe[d] = e;
        }
        return ofe;
    },

    getAllOwnedEdges : function() {
        return moose.objectUnion({},this.ownedEdges);
    },

    getAllOwnedEdgesRec : function() {
        var edges = {};
        edges = moose.objectUnion(edges, this.ownedEdges);
        for (let uid in this.children) {
            var child = this.children[uid];
            var childEdges = child.getAllOwnedEdgesRec();
            edges = moose.objectUnion(edges, childEdges);
        }
        return edges;
    },

    getVisibleOwnedEdges : function() {
        var voe = {};
        for (let d in this.ownedEdges) {
            var e = this.ownedEdges[d];
            if (e.isVisible()) voe[d] = e;
        }
        return voe;
    },

    getVisibleOwnedEdgesRec : function() {
        var edges = {};
        edges = moose.objectUnion(edges, this.getVisibleOwnedEdges());
        for (let uid in this.children) {
            var child = this.children[uid];
            var childEdges = child.getVisibleOwnedEdgesRec();
            edges = moose.objectUnion(edges, childEdges);
        }
        return edges;
    },

    addObscuredEdge : function(edge) {
        var dsc = edge.getDesc();
        this.obscuredEdges[dsc] = edge;
    },

    getAllObscuredEdgesRec : function() {
        var edges = {};
        if (this.obscuredEdges) {
            edges = moose.objectUnion(edges, this.obscuredEdges);
        }
        for (let uid in this.children) {
            var ch = this.children[uid];
            var chEdges = ch.getAllObscuredEdgesRec();
            edges = moose.objectUnion(edges, chEdges);
        }
        return edges;
    },

    getAllNodesRec : function() {
        var nodes = {};
        nodes[this.getUID()] = this;
        for (let uid in this.children) {
            var ch = this.children[uid];
            var chNodes = ch.getAllNodesRec();
            nodes = moose.objectUnion(nodes, chNodes);
        }
        return nodes;
    },

    /*
    * Add to the passed object a reference to each edge in this
    * node and in all of its children, recursively.
    */
    getAllEdgesRec : function(edges) {
        for (let dsc in this.inEdges) {
            edges[dsc] = this.inEdges[dsc];
        }
        for (let dsc in this.outEdges) {
            edges[dsc] = this.outEdges[dsc];
        }
        for (let uid in this.children) {
            var ch = this.children[uid];
            ch.getAllEdgesRec(edges);
        }
    },

    getAllEdges : function() {
        var edges = {};
        for (let dsc in this.inEdges) {
            edges[dsc] = this.inEdges[dsc];
        }
        for (let dsc in this.outEdges) {
            edges[dsc] = this.outEdges[dsc];
        }
        return edges;
    },

    getUID : function() {
        return this.uid;
    },

    // synonym:
    getLibpath : function() {
        return this.uid;
    },

    getTextRange : function() {
        return this.textRange;
    },

    buildLabelSizingDiv : function() {

        var div = document.createElement('div');
        div.classList.add("mooseNode");

        // Label
        if (this.labelHTML.length > 0) {
            var labelDiv = document.createElementNS(moose.xhtmlns,'div');
            labelDiv.innerHTML = this.labelHTML;
            this.labelDiv = labelDiv;
            div.appendChild(labelDiv);
        }

        // Preset width?
        if (this.presetWidth > 0) {
            div.setAttributeNS(null,'width',this.presetWidth+'px');
        }

        return div;
    },

    // Only for use with Deduc nodes.
    buildRdefsDiv : function(scale) {
        const div = document.createElement('div');
        div.appendChild(this.labelDiv);
        div.style.fontSize = `${scale}em`;
        return div;
    },

    buildPrelayoutDiv : function() {
        var div = document.createElement('div');
        div.classList.add("mooseNode");

        div.style.padding = this.padding+'px';

        // Set border width.
        div.style['border-width'] = this.borderWidth+'px';

        // Label
        if (this.labelHTML.length > 0) {
            var labelDiv = document.createElementNS(moose.xhtmlns,'div');
            labelDiv.innerHTML = this.labelHTML;
            this.labelDiv = labelDiv;
            div.appendChild(labelDiv);
        }

        // Preset width?
        if (this.presetWidth > 0) {
            div.setAttributeNS(null,'width',this.presetWidth+'px');
        }

        // Stadium or hexagon?
        if (this.actualSizesAreKnown &&
            (this.shape==='stadium' || this.shape==='hexagon')
        ) {
            var h = parseInt(this.height);
            div.style.borderRadius = (h/2)+'px';
            div.style.paddingLeft  = (h/2)+'px';
            div.style.paddingRight = (h/2)+'px';
        }

        return div;
    },

    buildDiv : function() {
        var div = document.createElementNS(moose.xhtmlns,'div');
        div.classList.add('mooseNode');
        // Is it a theorymap?
        if (this.isTheorymap()) {
            div.classList.add('mooseTheorymap');
        } else if (this.labelHTML.length === 0 && this.numNonGhostChildren() === 0) {
            // If it's not a theorymap, but there is no label AND no non-ghost children, then the div
            // should be inivisible. This can happen in the case of an expansion that declares no
            // new nodes (and only draws new links). If we didn't make the div invisible, it would
            // just appear as a little square with no label and no contents at all.
            div.classList.add('mooseInvisNode');
        }
        // Add the node type.
        div.classList.add('mooseNode-' + this.nodetype);

        div.style.padding = this.padding+'px';

        // Set border width.
        div.style['border-width'] = this.borderWidth+'px';

        // Make clickable
        div.style.pointerEvents = 'auto';

        // Background
        let bg = document.createElement('div');
        bg.classList.add("mooseNodeBg");

        div.appendChild(bg);
        this.background = bg;

        // Hexagon?
        if (this.actualSizesAreKnown && this.shape==='hexagon') {
            var hex = this.makeHexagonSVG();
            div.appendChild(hex);
            div.style.border = 'none';
        }

        // Glow
        var glow = document.createElement('div');
        glow.classList.add("mooseNodeGlow");
        var T = this.glowThickness;
        glow.style.left = '-'+((T+1)/2)+'px';
        glow.style.top = '-'+((T+1)/2)+'px';
        glow.style["border-width"] = T+"px";
        this.permaglow = false;
        div.appendChild(glow);
        this.glow = glow;

        // Label
        var isDed = this.isDeduc();
        if (this.labelHTML.length > 0 && !isDed) {
            if (this.nodetype === 'ucon' || this.nodetype === 'dummy') {
                bg.style.opacity = '0';
            } else if (this.numChildren() > 0) {
                bg.style.opacity = '0.5';
            } else {
                bg.style.opacity = '1';
            }
            var labelDiv = this.labelDiv;
            if (this.nodetype==='exis') {
                labelDiv.classList.add('exisLabel');
            }
            labelDiv.style.position = 'absolute';
            labelDiv.style.width = this.labelWidth+'px';
            labelDiv.style.height = this.labelHeight+'px';
            div.appendChild(labelDiv);
        } else if (isDed) {
            let di = this.getDeducInfo();
            var thm = !di.getClarifiedDeduction();
            var fn = this.getFriendlyName();
            var shouldDraw = (
                this.forest.drawDeducLabels ||
                (thm && this.forest.drawThmLabels)
            )
            if (fn && shouldDraw) {
                if (this.revision !== '') {
                    fn += ', rev ' + this.revision.substring(0, 6) + '...';
                }
                var fnDiv = document.createElementNS(moose.xhtmlns,'div');
                fnDiv.setAttributeNS(null,'class','deducNameLabel');
                fnDiv.innerHTML = fn;
                div.appendChild(fnDiv);
            }
        }

        /*
        if (this.labelHTML.length > 0) {
            if (this.numChildren() > 0 &&
                this.hasOwnProperty('labelWidth') &&
                this.hasOwnProperty('labelHeight')
            ) {
                this.background.style.opacity = '0.5';
                var labelDiv = document.createElementNS(moose.xhtmlns,'div');
                labelDiv.style.position = 'absolute';
                labelDiv.style.width = this.labelWidth+'px';
                labelDiv.style.height = this.labelHeight+'px';
                labelDiv.innerHTML = this.labelHTML;
                this.labelDiv = labelDiv;
                div.appendChild(labelDiv);
            } else {
                this.background.style.opacity = '1';
                var labelDiv = document.createElementNS(moose.xhtmlns,'div');
                labelDiv.style.position = 'absolute';
                labelDiv.innerHTML = this.labelHTML;
                this.labelDiv = labelDiv;
                div.appendChild(labelDiv);
            }
        }
        */

        // Preset width?
        if (this.presetWidth > 0) {
            div.setAttributeNS(null,'width',this.presetWidth+'px');
        } 

        // Have layout position?
        if (this.layoutPosIsKnown) {
            div.style.left = this.homeX+'px';
            div.style.top  = this.homeY+'px';
        }

        // Know size?
        if (this.actualSizesAreKnown) {
            this.makeDimensionSettings(div, bg, glow);
        }

        // Stadium or hexagon?
        if (this.actualSizesAreKnown &&
            (this.shape==='stadium' || this.shape==='hexagon')
        ) {
            //var H = parseInt(this.offsetHeight);
            var H = parseInt(this.height);
            var w = this.innerWidth();

            div.style.borderRadius = (H/2)+'px';
            div.style.paddingLeft  = (H/2)+'px';
            div.style.paddingRight = (H/2)+'px';

            // Background and glow also need border radius, and
            // adjustment to their width.

            // Background
            this.background.style.borderRadius = (H/2)+'px';
            this.background.style.width=(w+H)+'px';

            // Glow
            this.glow.style.borderRadius = (H/2)+'px';
            this.glow.style.width=(w+H-T+1)+'px';
        }

        // Icon to indicate clarifications available:
        var mgimg = document.createElementNS(moose.xhtmlns,'div');
        div.appendChild(mgimg);
        mgimg.setAttributeNS(null,'class','clarAvail');

        // Goalbox
        // Need a Forest; also, certain node types never take checkboxes.
        if (this.forest !== null && !['dummy', 'ucon', 'qstn'].includes(this.nodetype)) {
            const mgr = this.forest.getStudyManager();
            if ( mgr !== undefined ) {

                let goalId = null;
                let deducpath = null;
                let nodepath = null;
                if (this.nodetype === 'ghost') {
                    goalId = this.ghostInfo.realOrigin;
                    deducpath = this.ghostInfo.realDeduc;
                    nodepath = this.ghostInfo.realObj;
                } else {
                    let di = this.getDeducInfo();
                    goalId = this.origin;
                    deducpath = di.libpath;
                    nodepath = this.uid;
                }

                if (goalId) {

                    let bg = document.createElement('div');
                    bg.classList.add('mooseNodeCheckbox');
                    var s = document.createElement('div');
                    s.classList.add('mooseNodeCheckboxSocket');
                    bg.appendChild(s);

                    if (this.userNotes) {
                        mgr.recordGoalInfoFromServer(goalId, this.userNotes);
                    }
                    this.checkbox = mgr.addGoalboxForNode(s, goalId, deducpath, nodepath);
                    if (this.checkbox) {
                        div.appendChild(bg);
                    }

                }

            }
        }

        // Child node layer
        const nodeLayer = document.createElement('div');
        div.appendChild(nodeLayer);
        this.nodeLayer = nodeLayer;

        // Edge layer?
        if (this.isDeduc(true)) {
            const edgeLayer = document.createElementNS(moose.svgns, 'svg');
            edgeLayer.classList.add('edgeLayer');
            /*
            edgeLayer.style.position = 'absolute';
            edgeLayer.style.overflow = 'visible';
            edgeLayer.style.width = '100%';
            edgeLayer.style.height = '100%';
            //edgeLayer.style.top = '-13px';
            //edgeLayer.style.left = '-13px';
             */
            this.edgeLayer = edgeLayer;
            div.appendChild(edgeLayer);
        }

        return div;
    },

    addEdgeGraphicalRep : function(edge) {
        if (this.edgeLayer) {
            const svg = edge.getSVG();
            this.edgeLayer.appendChild(svg);
        }
    },

    updateEnrichment : function(enrichmentLookup) {
        this.enrichment = enrichmentLookup[this.uid] || {};
        this.buildContextMenu();
        for (let uid in this.children) {
            var child = this.children[uid];
            child.updateEnrichment(enrichmentLookup);
        }
    },

    setClarifiable : function(b) {
        var cls = 'mooseNode';
        if (b) {
            cls += ' clarifiable';
        }
        this.div.setAttributeNS(null,'class',cls);
    },

    makeHexagonSVG : function() {
        var H = parseInt(this.height);
        var w = this.innerWidth();
        var W = w+H;
        var h = Math.floor(H/2.0);
        var div = document.createElementNS(moose.xhtmlns,'div');
        div.style.position = 'absolute';
        div.style.left = '0px';
        div.style.top = '0px';
        div.style.width = W+'px';
        div.style.height = H+'px';
        var svg = document.createElementNS(moose.svgns,'svg');
        svg.style.width = W+'px';
        svg.style.height = H+'px';

        var hex = document.createElementNS(moose.svgns,'path');
        hex.setAttribute('class', 'mooseNodeHexagonPath');

        var p = 1;
        var d = 'M '+h+' '+p+' h '+w+' l '+(h-p)+' '+(h-p)+' ';
        d += 'l -'+(h-p)+' '+(h-p)+' h -'+w+' l -'+(h-p)+' -'+(h-p)+' ';
        d += 'l '+(h-p)+' -'+(h-p)+' Z';
        hex.setAttributeNS(null,'d',d);

        svg.appendChild(hex);
        div.appendChild(svg);
        return div;
    },

    setDiv : function(div) {
        this.div = div;
        this.colorClassMgr = new ClassManager(this.div);
        this.setMouseHandling();
    },

    getDiv : function() {
        return this.div;
    },

    setScale : function(scaleFactor) {
        this.div.style.transform = `scale(${scaleFactor})`;
        this.div.style.transformOrigin = '0 0';
        this.scaleFactor = scaleFactor;
    },

    getScale : function() {
        return this.scaleFactor;
    },

    setMouseHandling : function() {
        if (this.forest !== null && this.div !== null) {
            const theForest = this.forest,
                theNode = this,
                uid = this.uid;
            this.div.addEventListener("mousedown", function(e){theForest.getMouse().nodeMouseDown(uid, e)});
            this.div.addEventListener("click", function(e){theForest.getMouse().nodeClick(uid, e)});
            // Special handling for ghost nodes:
            if (this.isGhost()) {
                // Double-click opens the ghosted node.
                this.div.addEventListener("dblclick", function(e){theNode.viewGhostedNode(true);})
                // Show preview popup on hover?
                if (theForest.showGhostPreviews) {
                    const realpath = this.ghostOf();
                    this.div.addEventListener('mouseover', function(e) {
                        theForest.getPreviewManager().requestShowPreview(realpath, e);
                    });
                    this.div.addEventListener('mouseout', function(e) {
                        theForest.getPreviewManager().requestHidePreviews();
                    });
                    // Mouseover on the node's checkbox should _not_ trigger the preview popup.
                    if (this.checkbox) {
                        this.checkbox.addEventListener('mouseover', function(e) {
                            e.stopPropagation();
                        });
                    }
                }
            }
        }
    },

    setForest : function(forest, preventMouseHandling) {
        this.forest = forest;
        if (!preventMouseHandling) this.setMouseHandling();
        this.contextMenuPlugin = forest.getContextMenuPlugin();
    },

    buildFinalDiv : function() {
        var div = this.buildDiv();
        this.buildContextMenu(div);
        this.activateNodeLinks(div);
        this.setDiv(div);
    },

    buildContextMenu : function(div) {
        if (this.contextMenuPlugin) {
            this.menu = this.contextMenuPlugin.makeNodeContextMenu(div, this.menu, this);
        }
    },

    toggleFlowEdges : function() {
        //console.log('toggle flow arrows for deduc ', theUID);
        var show = !this.showFlowEdges;
        this.showFlowEdges = show;
        var sharva = new SHARVA(this.forest);
        var edges = this.getOwnedFlowEdges(true);
        if (show) {
            // We want only those flow edges that are marked as "flow suppressed".
            var eTS = {};
            for (let d in edges) {
                let e = edges[d];
                if (e.flowSuppressed) {
                    eTS[d] = e;
                    // And mark this edge as no longer "flow suppressed".
                    e.flowSuppressed = false;
                }
            }
            sharva.noteEdgesToShow(eTS);
        } else {
            // We want only those flow edges that are currently visible.
            var eTH = {};
            for (let d in edges) {
                let e = edges[d];
                if (e.visible) {
                    eTH[d] = e;
                    // And mark this edge as now "flow suppressed".
                    // This is so we can later recognize which flow edges are to be shown, when we
                    // want to see them again. Otherwise we would try to show _all_ hidden flow edges,
                    // and in so doing likely attempt to show a flow edge that was hidden for a different
                    // reason, such as by the GhostBuster's reification process.
                    e.flowSuppressed = true;
                }
            }
            sharva.noteEdgesToHide(eTH);
        }
        this.forest.redoLyoutWithTransition(sharva);
    },

    refreshLinks : function() {
        var theNode = this;
        moose.xhrFor('getEnrichment', {
            query: {
                libpath: this.uid,
                vers: this.getVersion(),
            },
            handleAs: 'json',
        }).then(
            function(resp) {
                if (resp.err_lvl > 0) {
                    throw new Error(resp.err_msg);
                }
                theNode.updateEnrichment(resp.enrichment);
            }
        ).catch(
            function(err) {
                alert(err.err_msg);
            }
        );
    },

    activateNodeLinks : function(div) {
        const nls = div.querySelectorAll('.nodelink');
        //console.log(nls);
        const theForest = this.forest,
              uid = this.uid;
        nls.forEach(function(nl){
            const infoNode = nl.querySelector('.nodelinkInfo');
            const infoText = infoNode.innerText;
            const info = JSON.parse(infoText);
            nl.onmouseover = function(e){
                theForest.nodelinkHover(e, true, uid, info.libpaths);
            };
            nl.onmouseout = function(e){
                theForest.nodelinkHover(e, false, uid, info.libpaths);
            };
            nl.onclick = function(e){
                theForest.nodelinkClick(e, info.libpaths, info.versions);
            };
        });
    },

    makeDimensionSettings : function(div, bg, glow) {
        var T = this.glowThickness;
        var w = this.innerWidth(), h = this.innerHeight();

        div.style.width = w+'px';
        div.style.height = h+'px';
        
        var W = w+2*this.padding;
        var H = h+2*this.padding;

        bg.style.width = W+'px';
        bg.style.height = H+'px';

        glow.style.width = (W-T+1)+'px';
        glow.style.height = (H-T+1)+'px';
    },

    resize : function(w, h, skipGraphicsUpdate) {
        this.width = w; this.height = h;
        if (!skipGraphicsUpdate) {
            this.makeDimensionSettings(this.div, this.background, this.glow);
        }
    },

    /*
    * This is the callback function the node should use when
    * requesting its size from NodeSizer.
    */
    receiveSize : function(dims) {
        var w = dims[0], h = dims[1];
        if (this.nodetype==='ucon') {
            // Size appropriate for our current "under construction" icon:
            w = 72;
            h = 72;
        } else {
            // experimental:
            w += 3; h += 3;
        }
        this.labelWidth = w; this.labelHeight = h;
        var p = this.padding; var b = this.borderWidth;
        var e = 2*(p+b);
        this.width = w+e; this.height = h+e;
        this.actualSizesAreKnown = true;
    },

    innerWidth : function() {
        var p = this.padding; var b = this.borderWidth;
        var e = 2*(p+b);
        return this.width-e;
    },

    innerHeight : function() {
        var p = this.padding; var b = this.borderWidth;
        var e = 2*(p+b);
        return this.height-e;
    },

    numChildren : function() {
        var n = 0;
        for (let k in this.children) n++;
        return n;
    },

    numNonGhostChildren : function() {
        var n = 0;
        for (let k in this.children) {
            var child = this.children[k];
            if (!child.isGhost()) {
                n++;
            }
        }
        return n;
    },

    isGhost : function() {
        return (this.nodetype === 'ghost');
    },

    /*
    * Add child node both logically and graphically.
    */
    addChild : function(child) {
        // Add child logically.
        var uid = child.getUID();
        this.children[uid] = child;
        child.parentNode = this;
        // Add child graphically.
        this.nodeLayer.appendChild(child.getDiv());
    },

    writeVersionedTreeRepn : function() {
        const repn = {};
        const strict = false;
        for (let uid of Object.keys(this.children)) {
            const child = this.children[uid];
            if (child.isDeduc(strict)) {
                const childRepn = child.writeVersionedTreeRepn();
                if (child.isSubdeduc()) {
                    Object.assign(repn, childRepn);
                } else {
                    const vlp = `${uid}@${child.getVersion()}`;
                    repn[vlp] = childRepn;
                }
            }
        }
        return repn;
    },

    buildDeducTree : function() {
        const tree = {
            deduc: this,
            children: [],
        };
        const strict = true;
        for (let child of Object.values(this.children)) {
            if (child.isDeduc(strict)) {
                tree.children.push(child.buildDeducTree());
            }
        }
        return tree;
    },
    
    /// Remove the logical -- not the graphical -- representation
    /// of the passed node.
    removeNodeLogicalRep : function(node) {
        var uid = node.getUID();
        delete this.children[uid];
    },

    /// Remove just the graphical representation of the node.
    removeNodeGraphicalRep : function(node) {
        var x = node.getDiv();
        this.nodeLayer.removeChild(x);
    },

    removeOutEdge : function(edge) {
        var dsc = edge.getDesc();
        delete this.outEdges[dsc];
        if (this.vines.hasOwnProperty(dsc)) delete this.vines[dsc];
    },

    removeInEdge : function(edge) {
        var dsc = edge.getDesc();
        delete this.inEdges[dsc];
        if (this.vines.hasOwnProperty(dsc)) delete this.vines[dsc];
    },

    noteVine : function(edge) {
        var dsc = edge.getDesc();
        this.vines[dsc] = edge;
    },

    /*
    * This method is called "steal" vines because stealing implies
    * a change in possesstion but not in _proper_ ownership. The
    * vine will be deleted from its proper owner's ownedEdges set,
    * and added to this node's set, but the Edge's this.owner field
    * will remain unchanged. That field must not change, because to
    * do so would cause the Edge::getDesc method to return a new name,
    * and the edge could not be located in any sets to which it
    * already belongs.
    *
    * The reason we can get away with this felonious action of
    * stealing vines is that it only takes place right before those
    * vines are about to be destroyed anyway. It is just a way to make
    * that destruction process slick.
    */
    stealVines : function() {
        for (let dsc in this.vines) {
            var v = this.vines[dsc];
            v.getOwner().removeOwnedEdge(v);
            this.addOwnedEdge(v);
        }
        this.vines = {};
    },

    stealVinesRec : function() {
        for (let uid in this.children) {
            var child = this.children[uid];
            child.stealVinesRec();
        }
        this.stealVines();
    },

    isBounded : function() {
        return this.bounded;
    },

    setBounded : function(b) {
        if (b) {
            this.div.style.pointerEvents = 'auto';
            this.div.style.border = '1px solid black';
            // TODO: set border style according to node type!
        } else {
            this.div.style.pointerEvents = 'none';
            this.div.style.border = 'none';
        }
        this.bounded = b;
    },

    // If have targets, list them.
    getTargets : function() {
        var targets = [];
        if (this.hasOwnProperty('deducInfo')) {
            targets = this.deducInfo.targets;
        }
        return targets;
    },

    getArea : function() {
        return this.width * this.height;
    },

    avgAtomicNodeArea : function() {
        const atomicNodes = {};
        this.getAllAtomicNodes(atomicNodes);
        let A = 0;
        let n = 0;
        for (let uid in atomicNodes) {
            const node = atomicNodes[uid];
            A += node.getArea();
            n++;
        }
        if (n > 0) {
            return A/n;
        } else {
            return 0;
        }
    },

    /* Find all atomic (non-compound) nodes at or under this one, and
     * store them under their UID in a passed lookup.
     *
     * param atomicNodes: lookup in which the nodes will be stored
     */
    getAllAtomicNodes : function(atomicNodes) {
        if (this.isCompound()) {
            for (let uid in this.children) {
                const child = this.children[uid];
                child.getAllAtomicNodes(atomicNodes);
            }
        } else {
            atomicNodes[this.uid] = this;
        }
    },

    /* Say whether this is a compound node.
     */
    isCompound : function() {
        return ['exis', 'univ', 'rels', 'with', 'ded', 'subded'].includes(this.nodetype);
    },

    /*
    * For our linear, List Layout methods, we need to know the order
    * in which the children of this node should appear.
    */
    writeChildOrderForLayout : function(nTS, nTA) {
        // Initialize the return value.
        var childOrder = [];
        // If this is a compound node, then there is a special ordering:
        if (this.nodetype==='exis'|| this.nodetype==='univ') {
            childOrder.push(this.uid+'._pre');
            childOrder = childOrder.concat(this.typenodeUIDs);
            childOrder.push(this.uid+'._post');
            childOrder = childOrder.concat(this.propnodeUIDs);
        } else if (this.nodetype==='rels') {
            childOrder = childOrder.concat(this.chainUIDs);
        } else if (this.nodetype==='with') {
            childOrder.push(this.uid+'._pre');
            childOrder = childOrder.concat(this.claimnodeUIDs);
            childOrder.push(this.uid+'._post');
            childOrder = childOrder.concat(this.defnodeUIDs);
        } else if (this.nodetype==='ded' || this.nodetype==='subded') {
            // Otherwise if it is a deduction or subdeduction then we base the
            // ordering off the given nodeOrder plus any targeting by nested deductions.
            // We begin by computing the index in the current nodeOrder listing at which
            // any child deduction wants to be inserted.
            // We will build a dictionary in which insertion indices point to lists of
            // uids of children that want to go at that point.
            var childDeducInsertPts = {};
            // Iterate over children.
            for (let uid in this.children) {
                // Grab the child and its targets, and initialize insertion point
                // to end of the list.
                var child = this.children[uid],
                    targets = child.getTargets(),
                    insertionPt = this.nodeOrder.length;
                // If child has no targets, skip to next child.
                if (targets.length===0) continue;
                // Otherwise iterate over the targets.
                for (let j in targets) {
                    var target = targets[j];
                    // Is the target among the nodes in our nodeOrder list?
                    if (this.nodeOrderLookup.hasOwnProperty(target)) {
                        // If so, then get the index of that target in our nodeOrder list.
                        var i = this.nodeOrderLookup[target];
                        // And update the insertion point for the child to be this index
                        // if smaller than current insertion point.
                        insertionPt = Math.min(i, insertionPt);
                    }
                }
                // Now that we have settled on the insertion point for this child,
                // we want to record it.
                // But the insertion index is supposed to point to a list of children
                // that want to be inserted there. So check if we already have a list going:
                if (childDeducInsertPts.hasOwnProperty(insertionPt)) {
                    // If so, then just add this child's uid to the list.
                    childDeducInsertPts[insertionPt].push(uid);
                } else {
                    // Else start a new list containing just this child's uid.
                    childDeducInsertPts[insertionPt] = [uid];
                }
            }
            // Now we can build the final childOrder listing.
            // We iterate over the already-known nodeOrder.
            for (let i in this.nodeOrder) {
                // First check the name at this point in the nodeOrder.
                var name = this.nodeOrder[i];
                // Are there any child deducs that want to be inserted at this point?
                // If so, they go first.
                if (childDeducInsertPts.hasOwnProperty(+i)) {
                    var deducs = childDeducInsertPts[+i];
                    for (let j in deducs) {
                        childOrder.push(deducs[j]);
                    }
                }
                // And now we can add the named node.
                childOrder.push(name);
            }
        }
        // Check that all nodes were accounted for.
        if (childOrder.length > 0) {
            // Build the set of all children in the ordering.
            var childrenOrdered = {};
            for (let i in childOrder) {
                childrenOrdered[childOrder[i]] = 1;
            }
            // Now check whether any in nTS or nTA were missed.
            // (For example this can happen if a proof has a supposition that it
            // does not mention in its Meson script -- which in turn can happen if
            // the supposition is only used in a subproof.)
            var missed = [];
            for (let uid in nTS) {
                if (!childrenOrdered.hasOwnProperty(uid)) missed.push(uid);
            }
            for (let uid in nTA) {
                if (!childrenOrdered.hasOwnProperty(uid)) missed.push(uid);
            }
            // Any that were missed get stashed at the beginning of the order,
            // which is a safe place for them. (Any subdeductions are only placed
            // before nodes to which they point; if they need to have arrows coming
            // /from/ any of these nodes, then they won't also have arrows going /to/
            // them.
            childOrder = missed.concat(childOrder);
        }
        return childOrder;
    },

    /* Report the appropriate dimensions to be used for computing a layout involving this node.
     */
    getDimensionsForLayout: function() {
        const w = this.width,
            h = this.height,
            s = this.scaleFactor;
        const dims = {
            width: w,
            height: h,
        };
        if (this.shape==='stadium' || this.shape==='hexagon') {
            // Because of the rounded ends of the stadium shape,
            // the width is elongated by precisely the height.
            dims.width += h;
        }
        // Only when an embedded expansion needs to play the role of a regular-sized node in
        // the expanded deduc's layout is it appropriate to apply our scaling factor:
        if (this.isDeduc(true)) {
            dims.width *= s;
            dims.height *= s;
        }
        return dims;
    },

    writeImminentlyVisibleLayoutObj:function(nTS,nTH,nTA,eTS,eTH,eTA,depth){
        depth = depth || 0;
        const dims = this.getDimensionsForLayout();
        const obj = {
            name: this.uid,
            x: this.x,
            y: this.y,
            w: dims.width,
            h: dims.height,
            bdryVisible: this.isBounded(),
            children: {},
            childOrder: [],
            edges: {},
        };

        if (this.forest.isInEmbeddedMode() && depth > 0) return obj;

        // Edges
        for (let desc in this.ownedEdges) {
            let e = this.ownedEdges[desc];
            let vis  = e.isVisible();
            let hide = eTH.hasOwnProperty(desc);
            let show = eTS.hasOwnProperty(desc);
            if ( (vis && !hide) || show ) {
                obj.edges[desc] = e.writeLayoutObj();
                // If vis and neither hide nor show, then animate.
                if (!show) eTA[desc] = e;
            }
        }

        // Nodes
        let n = 0; // we'll count how many there are
        for (let uid in this.children) {
            let ch = this.children[uid];
            let vis  = ch.isVisible();
            let hide = nTH.hasOwnProperty(uid);
            let show = nTS.hasOwnProperty(uid);
            if ( (vis && !hide) || show ) {
                // recurse
                obj.children[uid] = ch.writeImminentlyVisibleLayoutObj(
                    nTS,nTH,nTA,eTS,eTH,eTA,depth + ch.isDeduc(true) ? 1 : 0);
                n++;
                // If vis and neither hide nor show, then animate.
                if (!show) nTA[uid] = ch;
            }
        }

        // If there are children, then write label data.
        if (n>0 && this.labelType && this.labelType === 'HTML') {
            let L = {};
            L.place = 'ULC'; // default upper-left corner for labels
            L.w = this.labelWidth;
            L.h = this.labelHeight;
            obj.label = L;
        }

        // Ordering for child nodes (empty list if no children).
        let childOrder = this.writeChildOrderForLayout(nTS, nTA);
        // Filter out any that aren't included among the children of this layout object.
        // Remember: the children of this layout object are all nodes that are to be displayed
        // inside this one -- which in general may be quite a different set from the set of
        // children of this node! That is why we have to do this filtering here, and not in
        // the called method, writeChildOrderForLayout.
        for (let i in childOrder) {
            let name = childOrder[i];
            if (obj.children.hasOwnProperty(name)) obj.childOrder.push(name);
        }
        
        return obj;
    },

    writeImminentlyVisibleKLayGraph:function(layoutMethod,nTS,nTH,nTA,eTS,eTH,eTA,depth){
        if (this.nodetype==='exis'||this.nodetype==='univ') {
            return this.writeExisKLayGraph(layoutMethod,nTS,nTH,nTA,eTS,eTH,eTA);
        } else if (this.nodetype==='rels') {
            return this.writeRelsKLayGraph(layoutMethod,nTS,nTH,nTA,eTS,eTH,eTA);
        } else if (this.nodetype==='with') {
           return this.writeWithKLayGraph(layoutMethod,nTS,nTH,nTA,eTS,eTH,eTA);
        }
        depth = depth || 0;
        var graph = {};
        graph.id = this.uid;
        var di = this.getDeducInfo();
        var thm = !di.getClarifiedDeduction();

        if (this.forest.useElk) {
            graph.layoutOptions = {
            };
            const useBigBorder = this.forest.drawDeducLabels || (thm && this.forest.drawThmLabels);
            if (useBigBorder) {
                graph.layoutOptions[moose.ELKOpt.padding] = moose.ELKPadding(moose.KLayBorderSpacingForDeducLabels);
            }
        } else {
            var p = {};
            p[moose.KOpt["layoutHierarchy"]] = true;
            p[moose.KOpt["edgeRouting"]] = this.forest.edgeRouting;

            var bigBorder = (
                this.forest.drawDeducLabels ||
                (thm && this.forest.drawThmLabels)
            );
            if (bigBorder) {
                p[moose.KOpt.borderSpacing] =
                    moose.KLayBorderSpacingForDeducLabels;
            }
            graph.properties = p;
        }

        Object.assign(graph, this.getDimensionsForLayout());

        if (this.forest.isInEmbeddedMode() && depth > 0) return graph;

        // Edges
        var m = 0;
        var edges = [];
        for (let desc in this.ownedEdges) {
            let e = this.ownedEdges[desc];
            let vis  = e.isVisible();
            let hide = eTH.hasOwnProperty(desc);
            let show = eTS.hasOwnProperty(desc);
            if ( (vis && !hide) || show ) {
                let o = e.writeKLayObj();
                edges.push(o);
                m++;
                // If vis and neither hide nor show, then animate.
                if (!show) eTA[desc] = e;
            }
        }
        if (m>0) graph.edges = edges;
        // Nodes
        let n = 0; // we'll count how many children there are
        let children = [];
        for (let uid in this.children) {
            let ch = this.children[uid];
            let vis  = ch.isVisible();
            let hide = nTH.hasOwnProperty(uid);
            let show = nTS.hasOwnProperty(uid);
            if ( (vis && !hide) || show ) {
                // recurse
                let o = ch.writeImminentlyVisibleKLayGraph(layoutMethod,
                    nTS,nTH,nTA,eTS,eTH,eTA,depth + ch.isDeduc(true) ? 1 : 0);
                children.push(o);
                n++;
                // If vis and neither hide nor show, then animate.
                if (!show) nTA[uid] = ch;
            }
        }
        // Add children to graph object only if there are any.
        if (n>0 || m>0) graph.children = children;
        // If there are children, then write label data.
        if (n>0 && this.labelType && this.labelType === 'HTML') {
            let L = {};
            L.place = 'ULC'; // default upper-left corner for labels
            L.w = this.labelWidth;
            L.h = this.labelHeight;
            graph.proofscapeLabel = L; // hopefully KLay will ignore!
        }
        return graph;
    },

    writeRelsKLayGraph : function(layoutMethod,nTS,nTH,nTA,eTS,eTH,eTA) {
        var doEdges = true;
        var graph =
            this.writeKLayRow(layoutMethod,this.chainUIDs,doEdges,nTS,nTH,nTA,eTS,eTH,eTA);
        graph.id = this.uid;
        if (this.forest.useElk) {
            graph.layoutOptions = {
                [moose.ELKOpt.spacingBtwLayer]: moose.KLaySpacing,
                [moose.ELKOpt.padding]: moose.ELKPadding(10),
            };
            // Note: UpDC layout does not work in ELK (cannot change directions, while in INCLUDE_CHILDREN
            // hierarchy handling mode), so we do not handle that case here.
        } else {
            var p = {};
            if (layoutMethod === moose.layoutMethod_FlowChartUpDC) {
                p[moose.KOpt["direction"]] = moose.flowLayoutMethod_to_direc[moose.layoutMethod_FlowChartDown];
            }
            p[moose.KOpt["spacing"]] = moose.KLaySpacing;
            p[moose.KOpt["borderSpacing"]] = 10;
            p[moose.KOpt["layoutHierarchy"]] = true;
            p[moose.KOpt["edgeRouting"]] = this.forest.edgeRouting;
            graph.properties = p;
        }
        return graph;
    },

    writeExisKLayGraph : function(layoutMethod,nTS,nTH,nTA,eTS,eTH,eTA) {
        return this.writeTwoRowNodeKLayGraph(
            this.typenodeUIDs, '_typerow', this.propnodeUIDs, '_proprow',
            layoutMethod, nTS, nTH, nTA, eTS, eTH, eTA
        );
    },

    writeWithKLayGraph : function(layoutMethod,nTS,nTH,nTA,eTS,eTH,eTA) {
        return this.writeTwoRowNodeKLayGraph(
            this.claimnodeUIDs, '_claimrow', this.defnodeUIDs, '_defrow',
            layoutMethod, nTS, nTH, nTA, eTS, eTH, eTA
        );
    },

    /*  Write the KLay graph for a node that is made up of two rows.
     */
    writeTwoRowNodeKLayGraph : function(row1UIDs, row1Suffix, row2UIDs, row2Suffix,
                                        layoutMethod,nTS,nTH,nTA,eTS,eTH,eTA) {
        var graph = {};
        graph.id = this.uid;

        if (this.forest.useElk) {
            graph.layoutOptions = {
                [moose.ELKOpt.spacingBtwLayer]: 10,
                [moose.ELKOpt.padding]: moose.ELKPadding(10),
            };
            // Note: we cannot support UpDC layout with ELK. See note under `writeRelsKLayGraph()`.
        } else {
            var p = {};
            if (layoutMethod === moose.layoutMethod_FlowChartUpDC) {
                p[moose.KOpt["direction"]] = moose.flowLayoutMethod_to_direc[moose.layoutMethod_FlowChartDown];
            }
            p[moose.KOpt["spacing"]] = 10;
            p[moose.KOpt["borderSpacing"]] = 10;
            p[moose.KOpt["layoutHierarchy"]] = true;
            p[moose.KOpt["edgeRouting"]] = this.forest.edgeRouting;
            graph.properties = p;
        }

        // Create a child node for each of the two rows.
        // (Later we may offer alternative layouts, where the
        //  types are stacked one per row, etc.)
        // General row properties:
        var rp = {};

        if (this.forest.useElk) {
            rp = {
                [moose.ELKOpt.spacingBtwLayer]: 10,
                // Row bdry is invisible; don't waste space on padding:
                [moose.ELKOpt.padding]: moose.ELKPadding(0),
            };
            // Note: we cannot support UpDC layout with ELK. See note under `writeRelsKLayGraph()`.
        } else {
            // Originally we tried to layout the row in a direction orthogonal
            // to the overall flow. (E.g. RIGHT if it was an overall DOWN layout.)
            // But this seemed to result it strange errors in the connector routing.
            //rp[moose.KOpt["direction"]] = "RIGHT";
            if (layoutMethod === moose.layoutMethod_FlowChartUpDC) {
                rp[moose.KOpt["direction"]] = moose.flowLayoutMethod_to_direc[moose.layoutMethod_FlowChartDown];
            }
            rp[moose.KOpt["spacing"]] = 10;
            rp[moose.KOpt["borderSpacing"]] = 0;
            rp[moose.KOpt["layoutHierarchy"]] = true;
            rp[moose.KOpt["edgeRouting"]] = this.forest.edgeRouting;
        }

        // First row:
        // TODO?:
        //  Maybe should first do a row R with just the
        //  intended nodes themselves, and NO edges; then a row with
        //  exactly three nodes, being __pre, R, __post, and this
        //  time DO use edges. Will need to also modify code in
        //  the Node::adjustPositionsForExisNode method?
        var uids = [];
        uids.push(this.uid+'._pre');
        uids = uids.concat(row1UIDs);
        uids.push(this.uid+'._post');
        var doEdges = true;
        var row1 =
            this.writeKLayRow(layoutMethod,uids,doEdges,nTS,nTH,nTA,eTS,eTH,eTA);
        row1.id = this.uid+row1Suffix;

        if (this.forest.useElk) {
            row1.layoutOptions = rp;
        } else {
            row1.properties = rp;
        }

        // Second row:
        uids = row2UIDs;
        doEdges = false;
        var row2 =
            this.writeKLayRow(layoutMethod,uids,doEdges,nTS,nTH,nTA,eTS,eTH,eTA);
        row2.id = this.uid+row2Suffix;

        if (this.forest.useElk) {
            row2.layoutOptions = rp;
        } else {
            row2.properties = rp;
        }

        // Set the children and edge of the graph.
        graph.children = [row1, row2];
        graph.edges = [{
            id : this.uid+'_rowEdge',
            source : row1.id,
            target : row2.id
        }];
        return graph;
    },

    // Note: The name of this function is now somewhat misleading.
    // It was originally intended just for building horizontal rows,
    // within an overall vertical (downward) layout.
    // But actually it doesn't set KLay properties at all, and only
    // links nodes together in the order given, with dummy edges.
    // It is up to you to set the properties of this (sub)graph.
    // (25 Apr 2014)
    //
    // uids: the uids of the nodes to be placed in the row
    // doEdges: boolean. True if you want the nodes to be stacked vertically; false if
    //                   you want them to be in a horizontal row.
    // nTS, etc.: nodes to show, ..., edges to animate (as usual).
    writeKLayRow : function(layoutMethod,uids,doEdges,nTS,nTH,nTA,eTS,eTH,eTA) {
        var row = {};
        var chil = [];
        var edges = [];
        if (uids.length > 0) {
            // Add the first child to the row.
            let uid0 = uids[0];
            let ch0 = this.children[uid0];
            let o = ch0.writeImminentlyVisibleKLayGraph(layoutMethod,
                nTS,nTH,nTA,eTS,eTH,eTA);
            chil.push(o);
            // Animate this child node?
            // Note: usually we animate if vis && !hide && !show --
            // see e.g. writeImminentlyVisibleKLayGraph method.
            // But (at present!) a KLayRow is used only by a compound
            // node, which must have already passed the v && !h && !s
            // test if this method is being called. So checking !s on
            // the child node should be enough here.
            if (!nTS.hasOwnProperty(uid0)) nTA[uid0] = ch0;
            // Now use a sliding window of width 2 to add the remaining
            // children to the row, and an edge between each pair.
            for (let i = 0; i + 1 < uids.length; i++) {
                let uid0 = uids[i];
                let uid1 = uids[i+1];
                let ch = this.children[uid1];
                let o = ch.writeImminentlyVisibleKLayGraph(layoutMethod,
                    nTS,nTH,nTA,eTS,eTH,eTA);
                chil.push(o);
                // Animate this child node?
                if (!nTS.hasOwnProperty(uid1)) nTA[uid1] = ch;
                edges.push({
                    id : uid0+'_'+uid1+'_seqEdge',
                    source : uid0,
                    target : uid1
                });
            }
        }
        row.children = chil;
        if (doEdges) row.edges = edges;
        return row;
    },

    /* param layoutInfo: may or may not be defined. If provided,
     *  we read size and position information out of it, for each
     *  node. If not, we just skip that part, but still build final
     *  divs for all nodes, and nest these.
     */
    completeConstruction : function(layoutInfo) {
        if (layoutInfo) {
            var pos = layoutInfo.getPosForNodeUID(this.uid);
            this.setLayoutCentrePos(pos);
            var size = layoutInfo.getSizeForNodeUID(this.uid);
            this.setLayoutSize(size);
        }
        // Build final div.
        this.buildFinalDiv();
        // Recurse.
        for (let uid in this.children) {
            var ch = this.children[uid];
            ch.completeConstruction(layoutInfo);
            // Nest divs.
            this.nodeLayer.appendChild(ch.div);
        }
    },

    adjustPositionsForExisNode : function(li) {
        // Type and Property nodes need the offset of
        // their row to be added to their own offsets.
        // Type nodes:
        const tpPos = li.getPosForNodeUID(this.uid+'_typerow');
        // Sometimes -- e.g. when the nbhdview computes a layout -- the graph
        // was deliberately shallow, meaning our child nodes were not even included
        // in the layout. In such a case, `tpPos` will be `null` and we just do nothing.
        if (tpPos !== null) {
            for (let i in this.typenodeUIDs) {
                let uid = this.typenodeUIDs[i];
                li.offsetPosForNodeUID(uid, tpPos);
            }
            // Dummy nodes:
            li.offsetPosForNodeUID(this.uid + '._pre', tpPos);
            li.offsetPosForNodeUID(this.uid + '._post', tpPos);
        }
        // Property nodes:
        const prPos = li.getPosForNodeUID(this.uid+'_proprow');
        if (prPos !== null) {
            for (let i in this.propnodeUIDs) {
                let uid = this.propnodeUIDs[i];
                li.offsetPosForNodeUID(uid, prPos);
            }
        }
    },

    adjustPositionsForWithNode : function(li) {
        // Claim nodes:
        const cPos = li.getPosForNodeUID(this.uid+'_claimrow');
        if (cPos !== null) {
            for (let i in this.claimnodeUIDs) {
                let uid = this.claimnodeUIDs[i];
                li.offsetPosForNodeUID(uid, cPos);
            }
            // Dummy nodes:
            li.offsetPosForNodeUID(this.uid + '._pre', cPos);
            li.offsetPosForNodeUID(this.uid + '._post', cPos);
        }
        // Def nodes:
        const dPos = li.getPosForNodeUID(this.uid+'_defrow');
        if (dPos !== null) {
            for (let i in this.defnodeUIDs) {
                let uid = this.defnodeUIDs[i];
                li.offsetPosForNodeUID(uid, dPos);
            }
        }
    },

    updateEdges : function() {
        for (let i in this.inEdges) {
            let e = this.inEdges[i];
            e.redraw();
        }
        for (let i in this.outEdges) {
            let e = this.outEdges[i];
            e.redraw();
        }
    },

    /*
    getCrossing : function(a) {
        var C = this.getCentre();
        var cx = C[0]; var cy = C[1];
        var I = this.getIntervals(); var X = I[0]; var Y = I[1];
        var x1 = X[0]; var x2 = X[1];
        var y1 = Y[0]; var y2 = Y[1];
        return moose.lineCrossing(x1,x2,y1,y2,cx,cy,a[0],a[1]);
    },
    */

    /*
    * Given a point p in global coords, move this node so that
    * its own 'first' node (if it has one) is centred at p.
    */
    putLeadNodeAt : function(p) {
        var ln = null;
        if (this.first) {
            if (this.forest) {
                ln = this.forest.getNode(this.first);
            } else {
                // In this case, give up.
                return;
            }
        } else {
            // No node is called first.
            // Just try to choose any child node.
            for (let uid in this.children) {
                ln = this.children[uid];
                break;
            }
        }
        // Give up if there is no lead node.
        if (!ln) { return; }
        // Else continue.
        var c = ln.getCentre();
        var dx = p[0] - c[0], dy = p[1] - c[1];
        this.moveBy(dx,dy);
    },
    
    /*
    * uid names a child node of this node.
    * We move this node so that that child is centred at p
    * (in global coords).
    */
    centreNodeAt : function(uid, p) {
        var n = this.children[uid];
        var c = n.getCentre();
        var dx = p[0]-c[0], dy = p[1]-c[1];
        this.moveBy(dx,dy);
    },

    /*
    * Centre this node at p (global coords).
    */
    centreAt : function(p) {
        var c = this.getCentre();
        var dx = p[0]-c[0], dy = p[1]-c[1];
        this.moveBy(dx,dy);
    },

    // ----------------------------------------------------
    // Transition methods

    instantChange : function(I) {
        // Move
        var fr = this.freeRoaming;
        this.freeRoaming = true;
        this.moveTo(I.x, I.y);
        //this.centreAt([I.x,I.y]);
        this.freeRoaming = fr;
        // Resize
        if (this.numChildren() > 0) {
            this.resize(I.w, I.h);
        }
    },

    hide : function() {
        this.div.classList.add('hidden');
        this.visible = false;
        this.imminentlyVisible = false;
    }, 

    hideTransition : function() {
        this.div.style.transition = 'opacity 1s';
        this.div.style.opacity = '0';
    },

    postHideTransition : function() {
        this.hide();
        this.div.style.transition = '';
    },

    preMoveTransition : function() {
        this.freeRoaming = true;

        var d = moose.transitionDuration,
            ds = d + 'ms',
            ds2 = ds + ', ' + ds,
            ds4 = ds2 + ', ' + ds2;

        this.div.style.transitionProperty = 'top, left, width, height';
        this.div.style.transitionDuration = ds4;
        //this.div.style.transitionTimingFunction = 'linear';
        this.background.style.transitionProperty = 'width, height';
        this.background.style.transitionDuration = ds2;
        this.glow.style.transitionProperty = 'width, height';
        this.glow.style.transitionDuration = ds2;
    },

    moveTransition : function(I) {
        this.moveTo(I.x, I.y);
        //this.centreAt([I.x,I.y]);
        if (this.numChildren() > 0) {
            this.resize(I.w, I.h);
        }
    },

    postMoveTransition : function() {
        this.freeRoaming = false;
        this.div.style.transitionProperty = '';
        this.div.style.transitionDuration = '';
        this.background.style.transitionProperty = '';
        this.background.style.transitionDuration = '';
        this.glow.style.transitionProperty = '';
        this.glow.style.transitionDuration = '';
    },

    show : function() {
        this.div.style.opacity = '1';
        this.div.classList.remove('hidden');
        this.visible = true;
        this.imminentlyVisible = false;
    },

    preShowTransition : function() {
        this.div.style.opacity = '0';
        this.div.classList.remove('hidden');
        this.imminentlyVisible = true;
    },

    /// Fade from invisible to visible.
    showTransition : function() {
        this.div.style.transition = 'opacity 1s';
        this.div.style.opacity = '1';
    },

    /*
    * Call this after showTransition is finished, to complete
    * the show action.
    */
    postShowTransition : function() {
        this.visible = true;
        this.imminentlyVisible = false;
        this.div.style.transition = '';
    },

};

export { Node };
