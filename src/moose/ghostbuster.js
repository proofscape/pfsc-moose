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
import { Edge } from "./edge.js";

// -----------------------------------------------------------------
// GhostBuster

var GhostBuster = function(forest) {
    this.forest = forest;

    // uid : (a set of the form, uid:Node)
    // UID of node maps to set of nodes obscured by that one.
    this.obscuredSets = {};

    // A simple uid:Node set of all nodes present on the board.
    this.nodesPresent = {};

    this.ghostListeners = {};
};

GhostBuster.prototype = {

    reset : function() {
        this.obscuredSets = {};
        this.nodesPresent = {};
    },

    addGhostListener : function(L) {
        var id = L.getID();
        this.ghostListeners[id] = L;
    },

    publishVisibleGhosts : function(visibleGhosts) {
        for (var id in this.ghostListeners) {
            var L = this.ghostListeners[id];
            L.noteVisibleGhosts(visibleGhosts);
        }
    },

    publishUnghosted : function(unghosted) {
        for (var id in this.ghostListeners) {
            var L = this.ghostListeners[id];
            L.noteUnghosted(unghosted);
        }
    },

    /*
    * Do same as computeAddShowHide function, but augment an existing
    * SHARVA object with the results.
    */
    augmentSHARVA : function(sgb, sharva) {
        var nta={}, eta={}, nts={}, ets={}, nth={}, eth={};
        this.computeAddShowHide(sgb,nta,eta,nts,ets,nth,eth);
        sharva.noteNodesToAdd(nta);
        sharva.noteEdgesToAdd(eta);
        sharva.noteNodesToShow(nts);
        sharva.noteEdgesToShow(ets);
        sharva.noteNodesToHide(nth);
        sharva.noteEdgesToHide(eth);
    },

    /*
    * Pass a subgraphBuilder that has just finished building a
    * new subgraph, and six empty objects to hold the information
    * about which nodes and edges are to be added, shown, or hidden.
    */
    computeAddShowHide : function(sgb,
                                  nodesToAdd, edgesToAdd,
                                  nodesToShow, edgesToShow,
                                  nodesToHide, edgesToHide) {
        // Mark all edges as to be added and shown.
        var edges = sgb.getEdges();
        for (let desc in edges) {
            const e = edges[desc];
            edgesToAdd[desc] = e;
            edgesToShow[desc] = e;
        }
        // Note root node.
        const rootNode = sgb.getRootNode();
        const rUID = rootNode.getUID();
        nodesToAdd[rUID] = rootNode;
        // Note new nodes, and thereby determine which
        // ghosts in particular and nodes in general will be visible
        // or obscured.
        const newNodes = sgb.getNodes();
        const boardGhostsObscured = {};
        const newGhostsObscured = {};
        if (this.forest.isInUnifiedMode()) {
            this.addNodes(newNodes, boardGhostsObscured, newGhostsObscured);
        }
        const allGhostsObscured = moose.objectUnion(boardGhostsObscured,
                                            newGhostsObscured);
        const newNodesVisible  = moose.objectDifference(newNodes,
                                                 newGhostsObscured);
        // Determine the edges that are to be hidden.
        moose.allEdgesInNodeSet(boardGhostsObscured, edgesToHide);
        // Edges to reify:
        const edgesToReify = {};
        moose.allEdgesInNodeSet(allGhostsObscured, edgesToReify);
        // Subtract edges to be reified from those marked to be shown.
        // We /do/ however keep these edges in edgesToAdd,
        // in case they should be revealed later if some
        // ghosts are revealed.
        for (let desc in edgesToReify) {
            if (edgesToShow.hasOwnProperty(desc)) {
                delete(edgesToShow[desc]);
            }
        }
        // Now create the reification edges, and
        // put these under both edgesToAdd, and edgesToShow.
        for (let desc in edgesToReify) {
            const e = edgesToReify[desc];
            //const f = this.reifyEdge(e, rootNode);
            const F = this.reifyEdgeComplete(e, rootNode);
            for (let i in F) {
                const f = F[i];
                rootNode.addOwnedEdge(f);
                f.registerAsVineIfNecessary();
                // Add the edge...
                let d = f.getDesc();
                edgesToAdd[d] = f;
                // ...but show only the realest edge,
                // which by design is the first in the list F.
                if (i==0) edgesToShow[d] = f;
            }
        }
        // Nodes to hide
        for (let uid in boardGhostsObscured) {
            nodesToHide[uid] = boardGhostsObscured[uid];
        }
        // Nodes to show
        for (let uid in newNodesVisible) {
            nodesToShow[uid] = newNodesVisible[uid];
        }
        // New visible ghosts.
        const newGhostsVisible = {};
        for (let uid in newNodesVisible) {
            const node = newNodesVisible[uid];
            if (node.nodetype==='ghost') {
                newGhostsVisible[uid] = node;
            }
        }

        if (this.forest.isInEmbeddedMode()) {
            const repEdges = this.makeRepresentativeEdges(rootNode, sgb, newGhostsVisible);
            for (let f of repEdges) {
                let d = f.getDesc();
                edgesToAdd[d] = f;
                edgesToShow[d] = f;
            }
        }

        this.publishVisibleGhosts(newGhostsVisible);
    },

    makeRepresentativeEdges: function(rootNode, sgb, newGhostsVisible) {
        const repEdges = [];
        const deducInfo = sgb.getDeducInfo();
        const predLibpath = deducInfo.getTargetSubdeduc();
        if (predLibpath) {
            const pred = this.forest.getNode(predLibpath);
            for (let uid in newGhostsVisible) {
                const ghost = newGhostsVisible[uid];
                const realLibpath = ghost.ghostOf();
                const realNode = this.forest.getNode(realLibpath);
                if (realNode && pred.isAncestorOf(realNode)) {
                    const d_out = ghost.getOutDegree();
                    const d_in = ghost.getInDegree();
                    let tail = null, head = null;
                    if (d_in > 0) {
                        tail = rootNode;
                        head = realNode;
                    } else if (d_out > 0) {
                        tail = realNode;
                        head = rootNode;
                    }
                    if (tail && head) {
                        const f = this.makeEdge(tail, head, pred);
                        pred.addOwnedEdge(f);
                        rootNode.noteVine(f);
                        repEdges.push(f);
                    }
                }
            }
        }
        return repEdges;
    },

    /*
    * Like reifyEdge except return list of new edges.
    * Namely if the passed edge is (S1, T1) and these endpoints
    * have reification sequences
    *      S1, S2, ..., Sm
    *      T1, T2, ..., Tn
    * where Sm and Tn are the realest versions present of S1 and T1,
    * then we create all m*n edges (Si,Tj) except (S1,T1) and return
    * the list of these.
    * The realest of all these edges (Sm, Tn) will be
    * the /first/ entry in the list.
    * It's important that we know this because while we will want
    * to add all the edges we will want to show only that one.
    */
    reifyEdgeComplete : function(edge, owner) {
        var S = this.getReificationSequence(edge.tail);
        var T = this.getReificationSequence(edge.head);
        var F = [];
        for (var i in S) {
            var Si = S[i]
            for (var j in T) {
                if (i==0 && j==0) continue; //skip (S1,T1)
                var Tj = T[j];
                var f = new Edge();
                f.tailName = Si.getUID();
                f.headName = Tj.getUID();
                f.tail = Si;
                f.head = Tj;
                f.setOwner(owner);
                f.style = edge.style;
                f.bridge = edge.bridge; // is this always correct though?
                Si.setAsTailOf(f);
                Tj.setAsHeadOf(f);
                f.buildSVG();
                f.hide();
                F.unshift(f);
            }
        }
        return F;
    },

    reifyEdge : function(edge, owner) {
        // Make new edge with realer replacement for one or
        // both endpoints of the given edge.
        // Connect it to its endpoints, set its owner,
        // create and hide its svg, and return it.
        var tail = this.getRealestVersion(edge.tail);
        var head = this.getRealestVersion(edge.head);
        const f = this.makeEdge(tail, head, owner, edge.style, edge.bridge);
        var DEBUG = false;
        if (DEBUG) this.reifyDiagnostic(edge,f);
        return f;
    },

    makeEdge : function(tail, head, owner, style, bridge) {
        const f = new Edge();
        f.tailName = tail.getUID();
        f.headName = head.getUID();
        f.head = head;
        f.tail = tail;
        f.setOwner(owner);
        f.style = style || 'ded';
        f.bridge = bridge;
        head.setAsHeadOf(f);
        tail.setAsTailOf(f);
        f.buildSVG();
        f.hide();
        return f;
    },

    reifyDiagnostic : function(edge,f) {
        var s = 'edge reified: '+edge.toString()+'\n';
        s += '  new edge: '+f.toString()+'\n';
        s += '  tail of new edge: '+f.tail.uid+'\n';
        s += "  tail's edges: \n";
        var iE = f.tail.inEdges;
        for (var i in iE) {
            var e = iE[i];
            s += '    '+e.toString()+'\n';
        }
        var oE = f.tail.outEdges;
        for (var i in oE) {
            var e = oE[i];
            s += '    '+e.toString()+'\n';
        }
        s += "  head's edges: \n";
        var iE = f.head.inEdges;
        for (var i in iE) {
            var e = iE[i];
            s += '    '+e.toString()+'\n';
        }
        var oE = f.head.outEdges;
        for (var i in oE) {
            var e = oE[i];
            s += '    '+e.toString()+'\n';
        }
        console.log(s);
    },

    /*
    * We perform a BFS through the obscuredSets, returning a
    * list of all the nodes that were obscured by the given one,
    * recursively.
    * This means that, in the case of an assertoric node (as opposed
    * to an internal citation node, representing a whole result),
    * for which the tree of obscurations should actually be linear,
    * the final node in the list is the "most ghostly" version of
    * the given node.
    */
    getAllGhosts : function(node) {
        var ghosts = [];
        var queue = [node];
        while (queue.length > 0) {
            var u = queue.shift();
            var gh = this.obscuredSets[u.uid];
            for (var uid in gh) {
                ghosts.push(gh[uid]);
                queue.push(gh[uid]);
            }
        }
        return ghosts;
    },

    isPresent : function(uid) {
        return this.nodesPresent.hasOwnProperty(uid);
    },

    /*
    * Get ghostliest version present of the given node.
    * See getAllGhosts method.
    */
    getGhostliestVersion : function(node) {
        var ghosts = this.getAllGhosts(node);
        var L = ghosts.length;
        var v = node;
        if (L > 0) {
            v = ghosts[L-1];
        }
        return v;
    },

    /*
    * Pass a node itself (not its name).
    * We return the realest version of that node that is present.
    * I.e. if it is a ghost of something and that something is
    * present, then we return that, unless that too is a ghost of
    * a present node, in which case we return that one, etc. etc.
    */
    getRealestVersion : function(node) {
        while (
            node.nodetype === 'ghost' &&
            this.isPresent( node.ghostOf() )
        ) {
            node = this.nodesPresent[ node.ghostOf() ];
        }
        return node;
    },

    /*
    * Like getRealestVersion only you pass the uid. If we have
    * no node present by that uid, we return null.
    */
    getRealestVersByUID : function(uid) {
        var node = null;
        if (this.isPresent(uid)) {
            node = this.nodesPresent[uid];
            node = this.getRealestVersion(node);
        }
        return node;
    },

    /*
    * If node = A1, return list [A1, A2, ..., Am] where
    * Ai is ghost of Ai+1 for i=1,...,m-1, and there is no
    * realer node present for Am.
    */
    getReificationSequence : function(node) {
        var S = [];
        S.push(node);
        while (
            node.nodetype === 'ghost' &&
            this.isPresent( node.ghostOf() )
        ) {
            node = this.nodesPresent[ node.ghostOf() ];
            S.push(node);
        }
        return S;
    },

    /*
    * nodeDict: a set of nodes being removed from the graph.
    * We update our internal data structures accordingly, and
    * also return the set of all ghosts revealed by this operation.
    * Namely, for each real node being removed, we consider the set
    * of ghosts which were obscured by that real, as recorded in
    * our data structures. Any of those which are not also being
    * removed are ghosts revealed.
    */
    removeNodes : function(nodeDict) {
        var revealedGhosts = {};
        var unghosted = [];
        for (var uid in nodeDict) {
            delete this.nodesPresent[uid];
            var N = nodeDict[uid];
            // Was N obscuring anything?
            // If so those nodes are now revealed.
            var obscuredGhosts = this.obscuredSets[uid];
            revealedGhosts = moose.objectUnion(
                revealedGhosts, obscuredGhosts
            );
            // If N was itself a ghost node then remove any
            // record of it as an obscured node.
            if (N.nodetype==='ghost') {
                var realName = N.ghostOf();
                if (realName in this.obscuredSets) {
                    var company = this.obscuredSets[realName];
                    delete company[uid];
                    // Is the company now empty?
                    if (Object.keys(company).length === 0) {
                        unghosted.push(realName);
                        delete this.obscuredSets[realName];
                    }
                }
            }
        }
        if (unghosted.length > 0) {
            this.publishUnghosted(unghosted);
        }
        revealedGhosts = moose.objectDifference(
            revealedGhosts, nodeDict
        );
        return revealedGhosts;
    },

    /*
    * ntr and etr are the sets of nodes and edges to be removed.
    * We determine nodes and edges to be shown as a result of this,
    * and record them in the given SHARVA accordingly.
    */
    computeShowAfterDecay : function(ntr, etr, sharva) {
        // Nodes:
        var revealedGhosts = this.removeNodes(ntr);
        sharva.noteNodesToShow(revealedGhosts);
        // Edges:
        // Iterate over the ghosts G revealed. For each G,
        // iterate over its edges e. Let O be the opposite
        // end of e from G. If O is not about to be removed,
        // and either is already visible or else is to be shown,
        // and e is not about to be removed, then e is to be shown.
        var ets = {};
        var nts = sharva.getNodesToShow();
        for (var uid in revealedGhosts) {
            var ghost = revealedGhosts[uid];
            var edges = ghost.getAllEdges();
            for (var dsc in edges) {
                if (etr.hasOwnProperty(dsc)) continue;
                var edge = edges[dsc];
                var opp = edge.getOppositeEnd(ghost);
                if (opp) {
                    var uid = opp.getUID();
                    var notToBeRemoved = !ntr.hasOwnProperty(uid);
                    var visible = opp.isVisible();
                    // Shouldn't we be checking for _any_ nodes to be shown,
                    // not just those among the revealedGhosts set?
                    // We'll try it, starting early January 2020.
                    // $$$ before
                    //var toBeShown = revealedGhosts.hasOwnProperty(uid);
                    // $$$ after
                    var toBeShown = nts.hasOwnProperty(uid);
                    // $$ end
                    if ( notToBeRemoved && (visible || toBeShown) ) {
                        ets[dsc] = edge;
                    }
                }
            }
        }
        sharva.noteEdgesToShow(ets);
    },

    /*
    * Pass a set of new Nodes to be added, and a couple of empty
    * sets in which to note obscured ghosts: both those already on
    * the board, and those among the new nodes.
    */
    addNodes : function(newNodes, boardGhostsObscured,
                                  newGhostsObscured) {
        const newGhosts = new Map();
        for (let uid in newNodes) {
            const newNode = newNodes[uid];
            this.nodesPresent[uid] = newNode;
            // If ghosts of this node are present, record them
            // under boardGhostsObscured.
            if (this.obscuredSets.hasOwnProperty(uid)) {
                let ghosts = this.obscuredSets[uid];
                Object.assign(boardGhostsObscured, ghosts);
            } else {
                // Else initialize a set for ghosts of this node.
                this.obscuredSets[uid] = {};
            }
            if (newNode.nodetype==='ghost') {
                newGhosts.set(uid, newNode);
            }
        }
        // Need to handle new ghosts in a second pass. What they are a ghost of may
        // be among the new nodes, so we need to be sure those are all marked as present first.
        for (let [uid, newNode] of newGhosts) {
            const ghostOf = newNode.ghostOf();
            if (this.isPresent(ghostOf)) {
                newGhostsObscured[uid] = newNode;
            }
            // We use `this.obscuredSets` to record not just actual, but even _potential_ obscurations.
            // In other words it records the relationship between a node and ghosts of it, without
            // implying that both are in fact present on the board. So we need to record the relationship
            // even if `ghostOf` may not be present.
            if (!this.obscuredSets.hasOwnProperty(ghostOf)) {
                this.obscuredSets[ghostOf] = {};
            }
            this.obscuredSets[ghostOf][uid] = newNode;
        }
    }

};

export { GhostBuster };
