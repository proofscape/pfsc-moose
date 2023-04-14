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
import { Node } from "./node.js";
import { NodeSizer } from "./sizer.js";

// -------------------------------------------------------------------
// SubgraphBuilder

/*
* Pass the library path to a subgraph.
* This object takes care of the retrieval of the subgraph data,
* the sizing of the nodes, and the layout of the graph.
*
* UPDATE (16 Jan 2020): This class was originally designed several years ago.
* These days it tends not to compute a layout (since we usually want
* to gather all the nodes from several subgraphs before doing that),
* nor to retrieve data (since the new Forest.requestState tends to
* take care of all of that). That leaves managing the sizing of a
* set of nodes.
*
* The constructor does not initiate the request. For that you
* call the 'go' method. This is to allow you a chance to make
* other settings to this SubgraphBuilder before asking it to
* go. The `go` method returns a promise, which returns the SGB
* itself upon resolution.
*
*/
var SubgraphBuilder = function(params) {
    moose.registerNextID(this); // sets this.id

    this.requestLayout = false;
    this.suppressFlowEdges = false;
    this.layoutMethod = undefined;
    this.libpath = params.libpath;

    this.readParams(params);

    this.forest = null;
    this.recordNodesInForest = true;
    this.useOwnSizer = false;
    this.sizer = null;

    this.nodes = {};
    this.edges = {};
    this.rawEdgeList = [];
    this.realNodes = {};
    this.ghostNodes = {};
    this.rootNode = null;
    this.indexListings = {};
    this.resultCode = 2;
    this.errorMessage = '';

    this.checkboxes = {};
    // Useful for development:
    this.logDashgraph = false;

    // callback/errback for the `go` promise:
    this.resolve = null;
    this.reject = null;
};

SubgraphBuilder.prototype = {

    readParams : function(params) {
        this.lang = 'en';
        this.preloadedDashgraph = null;
        this.version = 'WIP';
        if (params.hasOwnProperty('lang')) {
            this.lang = params.lang;
        }
        if (params.hasOwnProperty('dashgraph')) {
            this.preloadedDashgraph = params.dashgraph;
        }
        if (params.hasOwnProperty('version')) {
            this.version = params.version;
        }
    },

    // --------------------------------------------------------------
    // Methods with which to adjust settings
    // before calling 'go'.

    doRequestLayout : function(b) {
        this.requestLayout = b;
    },

    setLayoutMethod : function(method) {
        this.layoutMethod = method;
    },

    setSuppressFlowEdges : function(b) {
        this.suppressFlowEdges = b;
    },

    getSuppressFlowEdges : function() {
        return this.suppressFlowEdges;
    },

    /*
    * If there is a forest that will own all the nodes, that
    * can be set now.
    */
    setForest : function(forest) {
        this.forest = forest;
    },

    doRecordNodesInForest : function(b) {
        this.recordNodesInForest = b;
    },

    doUseOwnSizer : function(b) {
        this.useOwnSizer = b;
    },

    // --------------------------------------------------------------
    // Methods for retrieving the information obtained
    // by this SubgraphBuilder, after it is finished with its work.

    getResultCode : function() {
        return this.resultCode;
    },

    getErrorMessage : function() {
        return this.errorMessage;
    },

    getLibpath : function() {
        return this.libpath;
    },

    getNodes : function() {
        return this.nodes;
    },

    getNode: function(libpath) {
        return this.nodes[libpath];
    },

    getRealNodes : function() {
        return this.realNodes
    },

    getGhostNodes : function() {
        return this.ghostNodes
    },

    getEdges : function() {
        return this.edges;
    },

    getRootNode : function() {
        return this.rootNode;
    },

    getDeducInfo : function() {
        return this.getRootNode().getDeducInfo();
    },

    getIndexListings : function() {
        return this.indexListings;
    },

    // --------------------------------------------------------------

    /// Call the 'go' method when all settings are made, and you
    /// are ready to build the subgraph.
    go : function() {
        var sgb = this;
        return new Promise(function(resolve, reject) {
            sgb.resolve = resolve;
            sgb.reject = reject;
            if (sgb.preloadedDashgraph) {
                if (sgb.logDashgraph) console.log(sgb.preloadedDashgraph);
                sgb.processDashgraph(sgb.preloadedDashgraph);
            } else {
                // Request the subgraph data.
                moose.xhrFor('loadDashgraph', {
                    query: {
                        libpath: sgb.libpath,
                        vers: sgb.version,
                        lang: sgb.lang,
                    },
                    handleAs: 'json',
                }).then(
                    function(resp) {
                        if (resp.err_lvl > 0) {
                            throw new Error(resp.err_msg);
                        }
                        var dg = resp.dashgraph;
                        if (sgb.logDashgraph) console.log(dg);
                        sgb.processDashgraph(dg);
                    }
                ).catch(
                    function(error){
                        var mes = 'Sorry, the subgraph ' + sgb.libpath;
                        mes += ' does not appear to be available.';
                        sgb.errorMessage = mes;
                        sgb.resultCode = 1;
                        sgb.reject(mes);
                    }
                );
            }
        });
    }, 

    getID : function() {
        return this.id;
    },

    addEdge : function(E) {
        this.rawEdgeList.push(E);
    },

    /*
    * If you already have the dashgraph d, you can pass it to this
    * function directly instead of calling the 'go' method to get
    * a dashgraph by an XHReq.
    */
    processDashgraph : function(d) {
        // If there was an error, set error result code and quit.
        if (d.hasOwnProperty('ERROR')) {
            this.errorMessage = d.ERROR;
            this.resultCode = 1;
            this.reject(this.errorMessage);
        } else {
            // Else proceed to build the subgraph.
            this.nodesToBeBuilt = {};
            var N = new Node();
            this.rootNode = N;
            var usedOwnSizer = false;
            if (this.useOwnSizer || this.forest === null) {
                var preventMouseHandling = true;
                N.setForest(this.forest, preventMouseHandling);
                this.sizer = new NodeSizer(
                    document.getElementsByTagName("body")[0]
                );
                usedOwnSizer = true;
            } else {
                N.setForest(this.forest);
                this.sizer = this.forest.getSizer();
            }
            N.initWithDict(d, this, this.realNodes, this.ghostNodes);
            var sgb = this;
            this.sizer.computeAllNodeSizes(this.nodes).then(function() {
                if (usedOwnSizer) sgb.sizer.remove();
                sgb.nodesHaveBeenSized();
            });
        }
    },

    /*
    * Nodes in the subgraph managed by this object register
    * themselves here during their initWithDict method.
    */
    noteNode : function(node) {
        var uid = node.getUID();
        this.nodes[uid] = node;
    },

    nodesHaveBeenSized : function() {
        // Connect Node and Edge objects to one another,
        // now that they are all built.
        //
        // After this, edges can give their full description, so
        // store them by that instead of by the ID number
        // they grabbed upon creation.
        for (var i in this.rawEdgeList) {
            var e = this.rawEdgeList[i];
            e.setOwner(this.rootNode);
            var h = this.nodes[e.headName];
            var t = this.nodes[e.tailName];
            h.setAsHeadOf(e);
            t.setAsTailOf(e);
            this.rootNode.addOwnedEdge(e);
            var dsc = e.getDesc();
            this.edges[dsc] = e;
        }
        if (this.requestLayout) {
            // In this case we are supposed to have a Forest.
            console.assert(this.forest !== null, "SubgraphBuilder should have a Forest if computing layout.");
            this.getLayout();
        } else {
            this.wrapUp();
        }
    },

    getLayout : function() {
        this.forest.computeLayout(this, this.layoutMethod).then(this.wrapUp.bind(this));
    },

    /* Return a representation of the graph that is about to be visible, after
     * any impending show/hide operations have been performed.
     *
     * param layoutMethod: the desired layout method. This is necessary since
     *   different layout methods may require the graph to be described in a different format.
     *
     * return: an object representing the graph, in suitable format for the desired layout method.
     */
    writeImminentlyVisibleGraph: function(layoutMethod) {
        var usingKLay = (layoutMethod in moose.flowLayoutMethod_to_direc);
        var graph = usingKLay ? this.writeImminentlyVisibleKLayGraph(layoutMethod) : this.writeImminentlyVisibleLayoutObj();
        return graph;
    },

    writeImminentlyVisibleLayoutObj : function() {
        var ivl = {};
        ivl.children = {};
        ivl.edges = {};
        ivl.bdryVisible = false;
        var o = this.rootNode.writeImminentlyVisibleLayoutObj(
            {},{},{},{},{},{});
        var uid = this.rootNode.getUID();
        ivl.children[uid] = o;
        return ivl;
    },

    writeImminentlyVisibleKLayGraph : function(layoutMethod) {
        var graph = {};
        graph.id = "floor";
        // Set the properties.
        if (this.forest && !this.forest.useElk) {
            var props = {};
            props[moose.KOpt['spacing']] = moose.KLaySpacing;
            graph.properties = props;
        }
        // It won't have any edges at this level.
        graph.edges = [];
        // Prepare empty list of children.
        graph.children = [];
        // Add child for root node.
        var o = this.rootNode.writeImminentlyVisibleKLayGraph(layoutMethod,
            {},{},{},{},{},{});
        graph.children.push(o);
        return graph;
    },

    wrapUp : function(layoutInfo) {
        if (this.forest && this.recordNodesInForest) {
            this.forest.recordNodes(this.getNodes());
        }
        this.rootNode.completeConstruction(layoutInfo);

        for (var id in this.edges) {
            var e = this.edges[id];
            e.buildSVG();
        }

        this.resultCode = 0;
        this.resolve(this);
    },

};

export { SubgraphBuilder };
