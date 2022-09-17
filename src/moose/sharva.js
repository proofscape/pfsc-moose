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

// -------------------------------------------------------------------
// SHARVA = Show, Hide, Add, Remove, View, Animate
// A class for storing all the data needed for a transition,
// preparing a layout object based on those data, and for
// carrying out a transition.

var SHARVA = function(forest) {
    moose.registerNextID(this); // sets this.id
    this.forest = forest;
    this.nodesToShow = {};
    this.nodesToHide = {};
    this.nodesToAdd = {};
    this.nodesToRemove = {};
    this.nodesToView = {};
    this.nodesToAnimate = {};
    this.edgesToShow = {};
    this.edgesToHide = {};
    this.edgesToAdd = {};
    this.edgesToRemove = {};
    this.edgesToAnimate = {};
    this.delay = moose.transitionDuration;
    this.viewMethod = 'default';
    this.viewCoordsFunction = () => null;
    this.resolve = null;
    this.reject = null;
};

SHARVA.prototype = {

    getID : function() {
        return this.id;
    },

    setViewMethod : function(method) {
        this.viewMethod = method;
    },

    // Set the function to be used to compute the desired view coordinates.
    setViewCoordsFunction : function(c) {
        this.viewCoordsFunction = c;
    },

    getNodesToShow : function() { return this.nodesToShow; },
    getNodesToHide : function() { return this.nodesToHide; },
    getNodesToAdd : function() { return this.nodesToAdd; },
    getNodesToRemove : function() { return this.nodesToRemove; },
    getNodesToView : function() { return this.nodesToView; },
    getNodesToAnimate : function() { return this.nodesToAnimate; },
    getEdgesToShow : function() { return this.edgesToShow; },
    getEdgesToHide : function() { return this.edgesToHide; },
    getEdgesToAdd : function() { return this.edgesToAdd; },
    getEdgesToRemove : function() { return this.edgesToRemove; },
    getEdgesToAnimate : function() { return this.edgesToAnimate; },

    noteNodesToAdd : function(nta) {
        for (var uid in nta) this.nodesToAdd[uid] = nta[uid];
    },

    noteEdgesToAdd : function(eta) {
        for (var dsc in eta) this.edgesToAdd[dsc] = eta[dsc];
    },

    noteNodesToRemove: function(ntr) {
        for (var uid in ntr) this.nodesToRemove[uid] = ntr[uid];
    },

    noteEdgesToRemove : function(etr) {
        for (var dsc in etr) this.edgesToRemove[dsc] = etr[dsc];
    },

    noteNodesToShow : function(nts) {
        for (var uid in nts) {
            this.nodesToShow[uid] = nts[uid];
            var nth = this.nodesToHide;
            if (nth.hasOwnProperty(uid)) delete nth[uid];
        }
    },

    noteEdgesToShow : function(ets) {
        for (var dsc in ets) {
            this.edgesToShow[dsc] = ets[dsc];
            var eth = this.edgesToHide;
            if (eth.hasOwnProperty(dsc)) delete eth[dsc];
        }
    },

    noteNodesToHide : function(nth) {
        for (var uid in nth) {
            this.nodesToHide[uid] = nth[uid];
            var nts = this.nodesToShow;
            if (nts.hasOwnProperty(uid)) delete nts[uid];
        }
    },

    noteEdgesToHide : function(eth) {
        for (var dsc in eth) {
            this.edgesToHide[dsc] = eth[dsc];
            var ets = this.edgesToShow;
            if (ets.hasOwnProperty(dsc)) delete ets[dsc];
        }
    },

    // Convenience methods -----------------
    noteEdgeToHide : function(e) {
        var dsc = e.getDesc();
        var eth = {};
        eth[dsc] = e;
        this.noteEdgesToHide(eth);
    },

    noteNodeToView : function(node) {
        var uid = node.getUID();
        this.nodesToView[uid] = node;
    },

    // Query methods -----------------------

    edgeIsToBeShown : function(e) {
        var dsc = e.getDesc();
        return this.edgesToShow.hasOwnProperty(dsc);
    },

    // -------------------------------------

    // --------------------------------------------------------------
    // Preparing data for layout, and computing nodes
    // and edges to be animated.

    /* Return a representation of the graph that is about to be visible, after
     * any impending show/hide operations have been performed.
     *
     * param layoutMethod: the desired layout method. This is necessary since
     *   different layout methods may require the graph to be described in a different format.
     * param roots: optional lookup (format {nodeUID: Node}) of Nodes on which to recurse, in
     *   building the graph. If not provided, we use all TLDs in the forest.
     *
     * return: an object representing the graph, in suitable format for the desired layout method.
     */
    writeImminentlyVisibleGraph: function(layoutMethod, roots) {
        const usingKLay = (layoutMethod in moose.flowLayoutMethod_to_direc);
        roots = roots || this.forest.getAllRoots();
        return usingKLay ? this.writeImminentlyVisibleKLayGraph(layoutMethod, roots) : this.writeImminentlyVisibleLayoutObj(roots);
    },

    /*
    * Return an object representing the layout data of all and only the
    * nodes and edges in or under the given `roots` which either
    *   1) are now visible, and are not about to be hidden, or
    *   2) are about to be shown.
    * Also compute the nodes and edges which are to be animated.
    */
    writeImminentlyVisibleLayoutObj : function(roots) {

        var nTS = this.nodesToShow, nTH = this.nodesToHide;
        var eTS = this.edgesToShow, eTH = this.edgesToHide;

        var nTA = this.nodesToAnimate, eTA = this.edgesToAnimate;

        var obj = {};
        obj.edges = {};
        obj.children = {};
        obj.bdryVisible = false;
        for (var name in roots) {
            var r = roots[name];
            var vis  = r.isVisible();
            var hide = nTH.hasOwnProperty(name);
            var show = nTS.hasOwnProperty(name);
            if ( (vis && !hide) || show ) {
                var o = r.writeImminentlyVisibleLayoutObj(
                    nTS,nTH,nTA,eTS,eTH,eTA);
                obj.children[name] = o;
                if (!show) nTA[name] = r;
            }
        }
        return obj;
    },

    /*
    * Like the basic writeImminentlyVisibleLayoutObj function, only
    * we write an object to be passed to KLay.
    */
    writeImminentlyVisibleKLayGraph : function(layoutMethod, roots) {
        var nTS = this.nodesToShow, nTH = this.nodesToHide;
        var eTS = this.edgesToShow, eTH = this.edgesToHide;

        var nTA = this.nodesToAnimate, eTA = this.edgesToAnimate;

        // Create the graph object.
        var graph = {};
        // Give it an id that no actual node will have.
        graph.id = "floor";
        // Set the properties.
        if (!this.forest.useElk) {
            var props = {};
            props[moose.KOpt['spacing']] = moose.KLaySpacing;
            props[moose.KOpt["layoutHierarchy"]] = true;
            props[moose.KOpt["edgeRouting"]] = this.forest.edgeRouting;
            graph.properties = props;
        }
        // It won't have any edges at this level.
        graph.edges = [];
        // Prepare empty list of children.
        graph.children = [];
        // Ask each imminently visible root to write its
        // own KLay graph, and then add that to the list of children.
        for (var name in roots) {
            var r = roots[name];
            var vis  = r.isVisible();
            var hide = nTH.hasOwnProperty(name);
            var show = nTS.hasOwnProperty(name);
            if ( (vis && !hide) || show ) {
                var o = r.writeImminentlyVisibleKLayGraph(layoutMethod,
                    nTS,nTH,nTA,eTS,eTH,eTA);
                graph.children.push(o);
                if (!show) nTA[name] = r;
            }
        }
        return graph;
    },

    // --------------------------------------------------------------
    // Transition methods
    //
    // There are currently two transition methods:
    //  - instantChange
    //  - fadeSlideFade
    // Each returns a Promise, which returns the sharva itself on resolution.
    
    instantChange : function(layoutInfo) {
        var theSharva = this;
        return new Promise(function(resolve, reject) {
            var L = layoutInfo;
            theSharva.showAndHide();

            var nTS = theSharva.nodesToShow;
            for (var uid in nTS) {
                nTS[uid].instantChange(L.getPosAndSizeForNodeUID(uid));
            }
            var nTA = theSharva.nodesToAnimate;
            for (var uid in nTA) {
                nTA[uid].instantChange(L.getPosAndSizeForNodeUID(uid));
            }
            var eTS = theSharva.edgesToShow;
            for (var dsc in eTS) {
                eTS[dsc].redraw(L.getPolylinePtsForEdgeDesc(dsc));
            }
            var eTA = theSharva.edgesToAnimate;
            for (var dsc in eTA) {
                eTA[dsc].redraw(L.getPolylinePtsForEdgeDesc(dsc));
            }

            // Check for coords.
            // NB: It is important that we wait until now to compute these coords,
            // i.e. after the above changes have been made. Otherwise (in cases where
            // these coords are not fixed but actually need to be computed) we will
            // get the wrong values.
            var coords = theSharva.viewCoordsFunction();
            if (coords !== null) {
                theSharva.forest.getFloor().gotoCoords(coords);
            }

            /*
            if (this.viewMethod === moose.viewMethod_Overview) {
                var zoomLimit = 1.0;
                this.forest.getFloor().viewVisibleNodes(zoomLimit);
            } else if (this.viewMethod === moose.viewMethod_Static) {
                // (Do nothing.)
            } else if (this.viewMethod.substring(0, 8) === moose.viewMethod_Showcase) {
                /*
                * 'showcase' view method:
                *
                * The method string in this case should be of the form:
                *
                *   showcase:scalar:libpath1,libpath2,libpath3
                *
                * where scalar is a float between 0 and 1 controlling the
                * zoom level, and where the libpathi are the libpaths of
                * the nodes to be shown.
                *-/
                var parts = this.viewMethod.split(":");
                var scalar = parseFloat(parts[1]);
                var want = parts[2].split(',');
                //var want = this.viewMethod.substring(8).split(',');
                var nTV = {};
                for (var i in want) {
                    var uid = want[i];
                    if (this.nodesToShow.hasOwnProperty(uid)) {
                        nTV[uid] = this.nodesToShow[uid];
                    }
                }
                this.forest.getFloor().showcaseNodes(nTV, scalar);
            }
            */

            resolve(theSharva);
        });
    },

    showAndHide : function() {
        for (var uid in this.nodesToHide) {
            this.nodesToHide[uid].hide();
        }
        for (var uid in this.nodesToShow) {
            this.nodesToShow[uid].show();
        }
        for (var dsc in this.edgesToHide) {
            this.edgesToHide[dsc].hide();
        }
        for (var dsc in this.edgesToShow) {
            this.edgesToShow[dsc].show();
        }
    },

    fadeSlideFade : function(layoutInfo) {
        var theSharva = this;
        return new Promise(function(resolve, reject) {
            theSharva.layoutInfo = layoutInfo;
            theSharva.resolve = resolve;
            theSharva.reject = reject;
            theSharva.fadeSlideFade1();
        });
    },

    fadeSlideFade1 : function() {
        // Fade all objects in nTH and eTH.
        // Also fade all arrowheads for edges in eTA. (In future
        // might animate these instead.)
        var numToHide = 0;
        var nTH = this.nodesToHide;
        for (var uid in nTH) {
            nTH[uid].hideTransition();
            numToHide++;
        }
        var eTH = this.edgesToHide;
        for (var dsc in eTH) {
            eTH[dsc].hideTransition();
            numToHide++;
        }
        var eTA = this.edgesToAnimate;
        for (var dsc in eTA) {
            eTA[dsc].hideArrowHeadTransition();
            numToHide++;
        }
        var nTA = this.nodesToAnimate;
        for (var uid in nTA) {
            nTA[uid].preMoveTransition();
        }
        // Delay if necessary, and then move on to next phase.
        var delay = numToHide > 0 ? this.delay : 0;
        setTimeout(this.fadeSlideFade2.bind(this), delay);
    },

    fadeSlideFade2 : function() {
        // First clean up after Phase 1.
        var nTH = this.nodesToHide;
        for (var uid in nTH) {
            nTH[uid].postHideTransition();
        }
        var eTH = this.edgesToHide;
        for (var dsc in eTH) {
            eTH[dsc].postHideTransition();
        }
        // Now go about Phase 2.
        // Move nodes in nTA to their new size and location;
        // Move edges in eTA;
        // Move floor to pos and zoom suitable for nTV.
        // Must do nodes first, for edges to work.
        // In fact, /all/ nodes that will be visible need to have
        // their new locations before we can be sure that all
        // endpoints of edges in eTA have been updated.
        // While we're at it, we also redraw the edges in eTS.
        var L = this.layoutInfo;
        // Give all nodes their new positions before updating any
        // edges.
        var nTS = this.nodesToShow;
        for (var uid in nTS) {
            nTS[uid].instantChange(L.getPosAndSizeForNodeUID(uid));
        }
        var nTA = this.nodesToAnimate;
        //console.log("Nodes to animate:");
        var animating = false;
        for (var uid in nTA) {
            //console.log(uid);
            nTA[uid].moveTransition(L.getPosAndSizeForNodeUID(uid));
            animating = true;
        }

        // Now update edges.
        var eTA = this.edgesToAnimate;
        for (var dsc in eTA) {
            eTA[dsc].moveTransition(L.getPolylinePtsForEdgeDesc(dsc));
            animating = true;
        }
        var eTS = this.edgesToShow;
        for (var dsc in eTS) {
            eTS[dsc].redraw(L.getPolylinePtsForEdgeDesc(dsc));
        }

        /*
        var nTV = this.nodesToView;
        var floor = this.forest.getFloor();
        if (this.viewMethod===moose.viewMethod_Overview) {
            animating |= floor.viewAllVisibleNodesTransition();
        } else if (this.viewMethod===moose.viewMethod_OrderedListView) {
            animating |= floor.listViewTransition();
        } else if (this.viewMethod === moose.viewMethod_Static) {
            // (Do nothing.)
        } else if (moose.objectSize(nTV)>0) {
            animating |= floor.viewNodesTransition(nTV);
        }
        */

        // Prepare show transitions.
        for (var uid in nTS) {
            nTS[uid].preShowTransition();
        }
        for (var dsc in eTS) {
            eTS[dsc].preShowTransition();
        }

        // Move view?
        var coords = this.viewCoordsFunction();
        if (coords !== null) {
            var info = this.forest.getFloor().transitionToCoords(coords, this.delay);
            animating |= info.changing;
        }

        // Delay if necessary, and then move on to next phase.
        var delay = animating ? this.delay : 0;
        setTimeout(this.fadeSlideFade3.bind(this), delay);
    },

    fadeSlideFade3 : function() {
        // Clean up after Phase 2.
        var nTA = this.nodesToAnimate;
        for (var uid in nTA) {
            nTA[uid].postMoveTransition();
        }
        var eTA = this.edgesToAnimate;
        for (var dsc in eTA) {
            eTA[dsc].postMoveTransition();
        }
        // Now go about Phase 3.
        // Fade in the nodes in nTS and edges in eTS.
        // The clean-up method for edges in eTA should have
        // brought their arrowheads to where they should be,
        // so now can fade those back in too.
        var numToShow = 0;
        var nTS = this.nodesToShow;
        for (var uid in nTS) {
            nTS[uid].showTransition();
            numToShow++;
        }
        var eTS = this.edgesToShow;
        for (var dsc in eTS) {
            eTS[dsc].showTransition();
            numToShow++;
        }
        for (var dsc in eTA) {
            eTA[dsc].showArrowHeadTransition();
            numToShow++;
        }
        // Delay if necessary, and then move on to Phase 4.
        var delay = numToShow > 0 ? this.delay : 0;
        setTimeout(this.fadeSlideFade4.bind(this), delay);
    },

    fadeSlideFade4 : function() {
        // Clean up after Phase 3.
        var nTS = this.nodesToShow;
        for (var uid in nTS) {
            nTS[uid].postShowTransition();
        }
        var eTS = this.edgesToShow;
        for (var dsc in eTS) {
            eTS[dsc].postShowTransition();
        }
        var eTA = this.edgesToAnimate;
        for (var dsc in eTA) {
            eTA[dsc].postArrowHeadTransition();
        }
        // That's it. Done.
        this.resolve(this);
    },

};

export { SHARVA };
