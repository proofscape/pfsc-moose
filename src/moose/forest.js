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
import { ColorManager } from "./colormgr.js";
import { HistoryManager } from "./historymgr.js";
import { PreviewManager } from "./previewmgr.js";
import { SelectionManager } from "./selectionmgr.js";
import { TransitionManager } from "./transitionmgr.js";
import { Floor, Rectangle } from "./floor.js";
import { GhostBuster } from "./ghostbuster.js";
import { Layout } from "./layout.js";
import { LayoutInfo } from "./layoutinfo";
import { Mouse } from "./mouse.js";
import { NodeSizer } from "./sizer.js";
import { SHARVA } from "./sharva.js";
import { Popup } from "./popup";

// -------------------------------------------------------------------
// Forest

/*
* div: The div to which the Forest should add all its graphical content.
* params: optional parameters object
*
* Parameters:
*
* overview: controls whether (and where) an overview panel is displayed.
*
*       If defined, should be an object of the form,
*
*           {
*               position: corner descriptor,
*               hide: boolean
*           }
*
*       A corner descriptor is any of the strings 'bl', 'tl', 'tr', 'br',
*       referring to the bottom-left, top-left, etc. corners.
*
*       The `hide` boolean says whether you want the overview panel to be
*       initially visible.
*
* expansionMode: set the default expansion mode.
*
*       Must be one of the moose.expansionMode_ enum values:
*           - moose.expansionMode_Unified
*           - moose.expansionMode_Embedded
*
* layoutMethod: set the default layout method.
*
*       Must be one of the moose.layoutMethod_ enum values:
*           - moose.layoutMethod_FlowChartDown
*           - moose.layoutMethod_FlowChartUp
*           - moose.layoutMethod_OrderedList
*
* transitionMethod: set the default transition method.
*
*       Must be one of the moose.transitionMethod_ enum values:
*           - moose.transitionMethod_FadeSlideFade
*           - moose.transitionMethod_instantChange
*
* selectionStyle: set the default selection style.
*
*       Must be one of the moose.selectionStyle_ enum values:
*           - moose.selectionStyle_Node
*           - moose.selectionStyle_NodeEdges
*           - moose.selectionStyle_NodeEdgesNbrs
*
* viewMethod: set the default view method.
*
*       <DEPRECATED>
*
* gid: set a desired group ID for this Forest. This is used when Forests are
*   linked together into chains.
*
* showGhostPreviews: (boolean) set true if you want mouse hover on visible ghost
*   nodes to result in a popup showing a preview of the node or deduction
*   the ghost represents.
*
* suppressFlowEdges: (boolean) set true if you want flow edges to be suppressed
*   by default, upon initial display of new deductions.
*
* activateNavKeys: (boolean) set true if you want Alt-[ and Alt-] to navigate backward
*   resp. forward in the nav history. Default: true. It is useful to be able
*   to turn this off if running Moose within a surrounding application that wants
*   to control this on its own.
*
* showLibpathSubtitles: (boolean) set true if you want an overlay at the edge of
*   the display area, showing the libpath of the selected node, when the selection
*   is a singleton.
*
* studyManager: optional reference to a "study manager." If provided, this
*   object will be used to control the appearance and functioning of checkboxes
*   on nodes. The idea is that these are to be used to track one's progress
*   when studying a chart.
*
* contextMenuPlugin: optional reference to an instance of a class implmenting
*   the context menu plugin interface. If provided, this will be used to
*   construct context menus for nodes, the background, and the overview inset.
*
* nodeLabelPlugin: optional reference to an instance of a class implmenting
*   the node label plugin interface. If provided, this plugin will get a chance
*   to do any custom processing on node labels, whenever they are constructed.
*
* useKLay: (boolean) set true if you want to use the KLay layout library.
*   Otherwise we use its successor, ELK. Whichever library is used, it is
*   expected to be available in the browser window's global namespace. This
*   means you must separately ensure that either `elk.bundled.js` or `klay.js`
*   has been loaded in the page, so that, resp., the global variable `ELK` or
*   `$klay` is defined.
*
*/
var Forest = function(div, params) {

    // Determine which layout library we are using.
    if (params.useKLay) {
        this.useElk = false;
        this.klay = $klay;
    } else {
        this.useElk = true;
        const elkOpts = {
            defaultLayoutOptions: { 'elk.algorithm': 'org.eclipse.elk.layered' },
        };
        // If you want un-minified ELK for debugging, then you must load `elk-api.js` into
        // the page, instead of `elk.bundled.js`, and `elk-worker.js` must also be available
        // at the corresponding sibling URL. Here we check to see if you loaded `elk-api.js`,
        // since in that case we also need to set a `workerUrl` option:
        const nl = document.querySelectorAll('script');
        for (let elt of nl) {
            if (elt.src && elt.src.endsWith('elk-api.js')) {
                // Turn URL for elk-api.js into URL for elk-worker.js:
                elkOpts.workerUrl = elt.src.slice(0, -6) + 'worker.js';
                break;
            }
        }
        this.elk = new ELK(elkOpts);
    }

    // Record the div.
    this.div = div;

    // Ensure we have at least an empty params object.
    params = params || {};
    this.params = params;

    // Note optional parameters (possibly undefined).
    this.showGhostPreviews = params.showGhostPreviews;
    this.suppressFlowEdges = params.suppressFlowEdges;
    this.activateNavKeys = params.activateNavKeys;
    this.studyManager = params.studyManager;
    this.contextMenuPlugin = params.contextMenuPlugin;
    this.nodeLabelPlugin = params.nodeLabelPlugin;
    this.showLibpathSubtitles = params.showLibpathSubtitles;

    if (this.activateNavKeys === undefined) {
        this.activateNavKeys = true;
    }

    // Initialize plugins
    if (this.contextMenuPlugin) {
        this.contextMenuPlugin.setForest(this);
    }

    // Setting tabindex to -1 makes the element focusable, but only via script.
    div.setAttribute("tabindex", -1);
    var theForest = this;
    div.addEventListener("keydown", function(event) {
        theForest.keydown(event);
    });

    // Get an Id.
    this.id = moose.takeNextID();
    moose.forests[this.id] = this;
    // For some applications, it may be useful to have a uuid, and we also
    // use this to help identify forest chains via unique group ids.
    this.uuid = `${(new Date()).getTime()}${Math.random()}`;
    this.gid = params.gid || this.uuid;

    // Listeners
    // (Must declare before constructing objects e.g. Floor, which
    //  may register as listeners.)
    this.forestListeners = [];
    this.indexListeners = {};
    this.ghostListeners = {};
    this.nodeClickListeners = [];
    this.nodeMouseoverListeners = [];
    this.nodeMouseoutListeners = [];
    this.nodeDoubleClickListeners = {};
    this.bgDoubleClickListeners = {};

    // We maintain the current bounding box:
    this.currentVisibleBBoxXYWH = [0, 0, 0, 0];

    this.colormgr = new ColorManager(this);
    this.floor = new Floor(this, div, params);
    this.mouse = new Mouse(this, this.floor);
    this.ghostbuster = new GhostBuster(this);
    this.sizer = new NodeSizer(div);
    if (this.nodeLabelPlugin) {
        this.sizer.setNodeLabelPlugin(this.nodeLabelPlugin);
    }
    // Note: it is important that the SelectionManager be instantiated after the ColorManager (so
    // it can grab a reference to it) and also after the Floor. The latter is so that the Overview,
    // which is initialized during Floor init, can register itself as a Forest listener before
    // the SelectionManager registers as one. We need the Overview to respond to opening/closing
    // deducs first, so that it has a chance to draw/remove boxes before the SelectionManager
    // updates the selection (also in response to opening/closing deducs), since that may in turn
    // trigger color changes. We need the Overview to have any new boxes ready, before it is
    // asked to apply colors to them.
    this.selectionmgr = new SelectionManager(this);
    this.floor.setSelectionManager(this.selectionmgr);
    this.historymgr = new HistoryManager(this);

    this.previewmgr = this.showGhostPreviews ? new PreviewManager(this) : null;

    // We always keep a referemce to the promise returned by the most recent transition.
    // This allows us to chain transitions.
    this.lastTransitionPromise = Promise.resolve();

    // Default methods and other initial values
    this.expansionMode = params.expansionMode || moose.expansionMode_Unified;
    this.defaultLayoutMethod = params.layoutMethod || moose.layoutMethod_FlowChartDown;
    this.defaultTransitionMethod = params.transitionMethod || moose.transitionMethod_FadeSlideFade;
    this.defaultSelectionStyle = params.selectionStyle || moose.selectionStyle_NodeEdges;
    this.defaultViewMethod = params.viewMethod || 'default';
    this.initialSelection = null
    this.colorRequest = null;

    // Set layout method
    this.setLayoutMethod(this.defaultLayoutMethod);

    this.setSelectionStyle(this.defaultSelectionStyle);

    // Callbacks
    this.openDeducsCallback = null;

    // Persistent language setting:
    this.language = 'en';

    this.edgeRouting = moose.edgeRouting_Ortho;
    this.arrowHeadType = {
        fill : 'none', // 'solid' or 'none'
        shape : 'flat', // 'fledged' or 'flat'
    };
    this.nodesDraggable = false;

    this.shadeDeducBGs = true;
    this.bgColourRules = {};
    this.bgColourRuleList = [];

    this.glowColourRules = {};
    this.glowColourRuleList = [];

    this.transitionMethod = this.defaultTransitionMethod;
    // Draw labels in ULC for all deductions?
    this.drawDeducLabels = false;
    // If not, then draw labels just for all Thms?
    this.drawThmLabels = true;

    this.popups = [];

    // Flat dictionaries.
    this.nodes = {};
    this.edges = {};
    this.deducs = {};

    // For layout
    this.sharva = null;

    // We have a system for forming doubly-linked lists of Forests,
    // so that they can share state (e.g. coloring).
    this.nextLinkedForest = null;
    this.prevLinkedForest = null;
};

Forest.prototype = {

    /* Make a new Forest instance. Its parameters will be the same as the
     * initial ones passed to this Forest's own constructor, except as
     * overridden by given paramOverrides argument.
     */
    makeNewForestWithSameBaseConfig : function(div, paramOverrides) {
        paramOverrides = paramOverrides || {};
        const params = {};
        Object.assign(params, this.params);
        Object.assign(params, paramOverrides);
        return new Forest(div, params);
    },

    getDiv : function() {
        return this.div;
    },

    getContextMenuPlugin : function() {
        return this.contextMenuPlugin;
    },

    getColorManager : function() {
        return this.colormgr;
    },

    getSelectionManager : function() {
        return this.selectionmgr;
    },

    getHistoryManager : function() {
        return this.historymgr;
    },

    getStudyManager : function() {
        return this.studyManager;
    },

    getPreviewManager : function() {
        return this.previewmgr;
    },

    setSuppressFlowEdges : function(b) {
        this.suppressFlowEdges = b;
    },

    getSuppressFlowEdges : function() {
        return this.suppressFlowEdges;
    },

    setShowingLibpathSubtitles : function(b) {
        this.showLibpathSubtitles = b;
        this.selectionmgr.setSubtitles();
    },
    
    showingLibpathSubtitles : function() {
        return this.showLibpathSubtitles;
    },

    showWorkingGIF : function(/* bool */ b) {
        this.getFloor().showWorkingGIF(b);
    },

    focus : function() {
        this.div.focus();
    },

    // Key handling
    keydown : function(event) {
        //console.log(event);
        var k = event.key,
            c = event.code;
        // + key zooms in
        if (c === "Equal") { // or k == "+" or "="
            this.floor.zoom('in');
            event.preventDefault();
        // - key zooms out
        } else if (c === "Minus") { // or k == "-" or "_"
            this.floor.zoom('out');
            event.preventDefault();
        // Esc clears selection
        } else if (c === "Escape") {
            this.floor.clearSelection();
        // Enter double clicks the current singleton selection, if any
        } else if (c === "Enter") {
            this.programmaticDoubleClickOfSingletonSelection();
        // Alt-[ goes back in the navigation history
        } else if (this.activateNavKeys && c === "BracketLeft" && event.altKey) {
            this.historymgr.goBack();
        // Alt-] goes forward in the navigation history
        } else if (this.activateNavKeys && c === "BracketRight" && event.altKey) {
            this.historymgr.goForward();
        }
    },

    /*
    * Return an array listing the libpaths of just those open deducs
    * which are needed in order to prompt the opening of /all/ the
    * deducs that are currently on the board.
    */
    listEssentialOpenDeducs : function() {
        var essDeducs = [];
        var allDeducs = this.getAllDeducs();
        // First pass: assemble the set of all target deduc paths.
        var targetDeducs = {};
        for (const libpath in allDeducs) {
            var E = allDeducs[libpath];
            // Does deduc E have a target deduc D?
            var di = E.getDeducInfo();
            var targetDeducPath = di.getClarifiedDeduction();
            if (targetDeducPath !== null) {
                targetDeducs[targetDeducPath] = 1;
            }
        }
        // Second pass: build array of essential deducs; these are
        // the ones that are NOT targets of anything currently open.
        for (const libpath in allDeducs) {
            if (!targetDeducs.hasOwnProperty(libpath)) {
                essDeducs.push(libpath);
            }
        }
        return essDeducs;
    },

    // ----------------------------------------------------

    setLanguage : function(lang) {
        this.language = lang;
        this.reopenAll();
    },

    setExpansionMode : function(mode) {
        if (mode !== this.expansionMode) {
            this.expansionMode = mode;
            return this.requestState({
                reload: 'all',
                view: 'all',
            });
        } else {
            return Promise.resolve();
        }
    },

    getExpansionMode : function() {
        return this.expansionMode;
    },

    isInEmbeddedMode : function() {
        return this.expansionMode === moose.expansionMode_Embedded;
    },

    isInUnifiedMode : function() {
        return this.expansionMode === moose.expansionMode_Unified;
    },

    /* The given method name must be in moose.layoutMethods.
     */
    setLayoutMethod : function(method) {
        if (!(method in moose.layoutMethods)) {
            console.log('Unknown layout method: '+method);
            return;
        }
        this.defaultLayoutMethod = method;
        this.layoutMethod = method;

        for (let name of Object.keys(moose.layoutMethods)) {
            if (name !== method) {
                this.div.classList.remove(name);
            }
        }
        this.div.classList.add(method);

        this.setConnectorMode();
    },

    getLayoutMethod : function() {
        return this.layoutMethod;
    },

    setConnectorMode : function() {
        const desiredConnMode = moose.layoutMethod_to_ConnMode[this.layoutMethod];
        for (let connMode of Object.values(moose.layoutMethod_to_ConnMode)) {
            if (connMode !== desiredConnMode) {
                this.div.classList.remove(connMode);
            }
        }
        this.div.classList.add(desiredConnMode);
    },

    setSelectionStyle : function(style) {
        this.selectionStyle = style;
    },

    getSelectionStyle : function() {
        return this.selectionStyle;
    },

    /*
    * Transition method should be one of the following:
    *   fadeSlideFade
    *   instantChange
    */
    setTransitionMethod : function(method) {
        this.transitionMethod = method;
    },

    setViewMethod : function(method) {
        this.viewMethod = method;
    },

    setEdgeRouting : function(style) {
        this.edgeRouting = style;
    },

    // ----------------------------------------------------

    recordDeduc : function(deduc) {
        var uid = deduc.getUID();
        this.deducs[uid] = deduc;
    },

    recordNode : function(node) {
        var uid = node.getUID();
        this.nodes[uid] = node;
    },

    removeDeduc : function(deduc) {
        var uid = deduc.getUID();
        delete this.deducs[uid];
    },

    removeNode : function(node) {
        var uid = node.getUID();
        //console.log('Deleting node: '+uid);
        delete this.nodes[uid];
        // A node might also be a deduc.
        // (If not, the delete command simply does nothing.)
        delete this.deducs[uid];
    },

    removeNodeRecursive : function(node) {
        for (var uid in node.children) {
            var child = node.children[uid];
            this.removeNodeRecursive(child);
        }
        this.removeNode(node);
    },

    getDeduc : function(uid) {
        return this.deducs[uid];
    },

    getDeducVersionLookup : function() {
        const L = {};
        for (let uid of Object.keys(this.deducs)) {
            const deduc = this.deducs[uid];
            L[uid] = deduc.getVersion();
        }
        return L;
    },

    /* Find the deduc that contains a given node, _or equals it_ in the case that
     * the node itself _is_ a deduction.
     *
     * param uid: the uid of the node in question
     * return: the deduc that contains (or equals) the node, if both are present; otherwise null.
     */
    getDeducContainingNode : function(uid) {
        var di = this.getDeducInfo(uid);
        if (di === null) return null;
        var deducpath = di.getLibpath();
        if (this.deducIsPresent(deducpath)) {
            return this.getDeduc(deducpath);
        } else {
            return null;
        }
    },

    // param uid: unique Id of a node.
    // return: the Node (if present).
    getNode : function(uid) {
        return this.nodes[uid];
    },

    // param uids: Array of unique Ids of nodes.
    // return: object in which uids point to Nodes themselves (if present in the Forest)
    getNodes : function(uids) {
        var obj = {};
        for (var i in uids) {
            var uid = uids[i];
            obj[uid] = this.nodes[uid];
        }
        return obj;
    },

    deducIsPresent : function(uid) {
        return this.deducs.hasOwnProperty(uid);
    },

    nodeIsPresent : function(uid) {
        return this.nodes.hasOwnProperty(uid);
    },

    /*
    * Return the DeducInfo object for an open libpath, or
    * else null for a closed one.
    */
    getDeducInfo : function(libpath) {
        var di = null;
        if (this.nodeIsPresent(libpath)) {
            var node = this.getNode(libpath);
            di = node.getDeducInfo();
        }
        return di;
    },

    /// "record" means simply noting these objects in a dictionary,
    /// as opposed to "adding" which will be reserved by adding to
    /// the floor
    recordNodes : function(nodes) {
        for (var uid in nodes) {
            var N = nodes[uid];
            this.recordNode(N);
        }
    },

    recordEdge : function(edge) {
        var dsc = edge.getDesc();
        this.edges[dsc] = edge;
    },

    recordEdges : function(edges) {
        for (var dsc in edges) {
            var e = edges[dsc];
            this.recordEdge(e);
        }
    },

    removeEdges : function(edges) {
        for (var dsc in edges) {
            //console.log('Deleting edge: '+dsc);
            delete this.edges[dsc];
        }
    },

    reset : function() {
        this.nodes = {};
        this.deducs = {};
        this.edges = {};
    },

    /*
    * Get a dictionary of all nodes which have been added
    * to the Forest as roots.
    */
    getAllRoots : function() {
        return this.floor.getAllRoots();
    },

    getAllDeducs : function() {
        return moose.objectUnion(this.deducs,{});
    },

    listAllDeducUIDs : function() {
        return Object.keys(this.deducs);
    },

    /* Return a single docInfo object, merging the info from all open deducs.
     */
    getMergedDocInfos : function() {
        const mergedInfo = {
            docs: new Map(),
            refs: new Map(),
        };
        for (let deducId of Object.keys(this.deducs)) {
            const deduc = this.deducs[deducId];
            const deducInfo = deduc.getDeducInfo();
            const newInfo = deducInfo.docInfo || {docs: {}, refs: {}};
            const newDocs = newInfo.docs;
            const newRefs = newInfo.refs;
            // Adopt those doc infos that we don't have yet:
            for (let docId of Object.keys(newDocs)) {
                if (!mergedInfo.docs.has(docId)) {
                    mergedInfo.docs.set(docId, newDocs[docId]);
                }
            }
            // Merge lists of doc refs:
            for (let docId of Object.keys(newRefs)) {
                if (!mergedInfo.refs.has(docId)) {
                    mergedInfo.refs.set(docId, []);
                }
                mergedInfo.refs.get(docId).push(...newRefs[docId]);
            }
        }
        return mergedInfo;
    },

    /* Return a Map in which deduc libpaths point to arrays of docIds
     * referenced by that deduc. Array is empty for any deduc that makes
     * no doc refs.
     */
    getReferencedDocIdsByDeduc : function() {
        const m = new Map();
        for (let deducId of Object.keys(this.deducs)) {
            const deduc = this.deducs[deducId];
            const deducInfo = deduc.getDeducInfo();
            const docInfo = deducInfo.docInfo || {docs: {}, refs: {}};
            const docIds = Array.from(Object.keys(docInfo.docs));
            m.set(deducId, docIds);
        }
        return m;
    },

    getAllVisibleNodes : function(options) {
        var v = {};
        for (var uid in this.nodes) {
            var n = this.nodes[uid];
            if (n.isVisible(options)) {
                v[uid] = n;
            }
        }
        return v;
    },

    getAllUids : function() {
        let a = this.getAllDeducs();
        a = moose.objectUnion(this.nodes, a);
        return Object.keys(a);
    },

    /* Given the uid of a node or deduc, return the index at which
     * this uid occurs, when all node and deduc uid are sorted.
     * Return -1 if it does not occur.
     */
    uidToSortOrder : function(uid) {
        if (!this.nodeIsPresent(uid) && !this.deducIsPresent(uid)) {
            return -1;
        }
        const a = this.getAllUids();
        a.sort();
        return a.indexOf(uid);
    },

    /* Get the nth uid of all nodes and deducs sorted.
     * Return undefined if n out of range.
     */
    sortOrderToUid : function(n) {
        const a = this.getAllUids();
        a.sort();
        return a[n];
    },

    // ----------------------------------------------------

    getID : function() {
        return this.id;
    },

    getFloor : function() {
        return this.floor;
    },

    getMouse : function() {
        return this.mouse;
    },

    getGhostbuster : function() {
        return this.ghostbuster;
    },

    getSizer : function() {
        return this.sizer;
    },

    displayError : function(s) {
        this.floor.displayError(s);
    },

    clearError : function() {
        this.floor.clearError();
    },

    setClientOffset : function(oX,oY) {
        this.floor.setClientOffset(oX,oY);
    },

    /// Return the bounding box in form [x,y,w,h] for a set of nodes,
    /// in global coordinates.
    nodesBBoxXYWH : function(nodes) {
        var B = [0,0,0,0];
        var first = true;
        for (var uid in nodes) {
            var node = nodes[uid];
            if (first) {
                B = node.getBBoxXYWH();
                first = false;
            } else {
                var B1 = node.getBBoxXYWH();
                B = moose.bBoxXYWHUnion(B,B1);
            }
        }
        return B;
    },

    nodesBBoxRect : function(nodes) {
        var B = this.nodesBBoxXYWH(nodes);
        return new Rectangle(B);
    },

    /// Recompute and return the bounding box in form [x,y,w,h] for all visible
    /// nodes, in global coordinates. 
    computeVisibleBBoxXYWH : function() {
        var v = this.getAllVisibleNodes();
        return this.nodesBBoxXYWH(v);
    },

    // This is for updating the Forest's internal record of the current
    // bounding box of visible nodes. It is called after deductions are
    // opened or closed.
    updateCurrentVBB : function() {
        this.currentVisibleBBoxXYWH = this.computeVisibleBBoxXYWH();
        return this.currentVisibleBBoxXYWH;
    },

    getCurrentVisibleBBoxXYWH : function() {
        return this.currentVisibleBBoxXYWH;
    },

    // ----------------------------------------------------
    // Listeners

    // Register ----------

    addForestListener : function(L) {
        this.forestListeners.push(L);
    },

    addIndexListener : function(L) {
        var id = L.getID();
        this.indexListeners[id] = L;
    },

    addGhostListener : function(L) {
        this.ghostbuster.addGhostListener(L);
    },

    addNodeClickListener : function(callback) {
        this.nodeClickListeners.push(callback);
    },

    addNodeMouseoverListener : function(callback) {
        this.nodeMouseoverListeners.push(callback);
    },

    addNodeMouseoutListener : function(callback) {
        this.nodeMouseoutListeners.push(callback);
    },

    addNodeDoubleClickListener : function(L) {
        var id = L.getID();
        this.nodeDoubleClickListeners[id] = L;
    },

    addBGDoubleClickListener : function(L) {
        var id = L.getID();
        this.bgDoubleClickListeners[id] = L;
    },

    // Notify ----------

    notifyBGDoubleClickListeners : function() {
        for (var id in this.bgDoubleClickListeners) {
            var L = this.bgDoubleClickListeners[id];
            L.noteBGDoubleClick();
        }
    },

    // FIXME:
    // Now that we are passing a reference to the forest as first arg
    // in notifyNodeClickListeners, it kind of seems like that should be
    // a uniform thing, i.e. do this with all listeners. However, see also next...
    // ...FIXME:
    // But if we're going to overhaul the listener system, shouldn't we
    // take this opportunity to
    // make it more idiomatic JS and, instead of the listener being
    // forced to have a method of a certain name, just let the listener
    // register whatever callback function it wishes?
    // FIXME:
    // In fact...I am starting the above switchover with the new node click listeners.
    // I want to add sth from PrIME, and those don't have "ID"s a la Moose.

    notifyNodeClickListeners : function(uid, e) {
        for (var i in this.nodeClickListeners) {
            var cb = this.nodeClickListeners[i];
            cb(this, uid, e);
        }
    },

    notifyNodeMouseoverListeners : function(uid, e) {
        for (const cb of this.nodeMouseoverListeners) {
            cb(this, uid, e);
        }
    },

    notifyNodeMouseoutListeners : function(uid, e) {
        for (const cb of this.nodeMouseoutListeners) {
            cb(this, uid, e);
        }
    },

    notifyNodeDoubleClickListeners : function(uid, e) {
        for (var id in this.nodeDoubleClickListeners) {
            var L = this.nodeDoubleClickListeners[id];
            L.noteNodeDoubleClick(uid, e);
        }
    }, 

    // Forest Listeners -----

    notifyForestListenersOfTransition : function(info) {
        for (let L of this.forestListeners) {
            L.noteForestTransition(info);
        }
    },

    /*
     * param info: {
     *      closed: array of deducpaths closed,
     *      opened: Map from deducpath opened to root Node of deduc
     * }
     * We add
     *      forest: this
     * before forwarding to all forest listeners.
     */
    notifyForestListenersOfClosedAndOpenedDeductions : function(info) {
        info.forest = this;
        for (let L of this.forestListeners) {
            L.noteForestClosedAndOpenedDeductions(info);
        }
    },

    // -----

    notifyIndexListeners : function(ix) {
        // For now, we paternalistically shelter the listeners
        // from cases where there were no index listings.
        if (ix.hasOwnProperty('ERROR')) {
            return;
        }
        for (var id in this.indexListeners) {
            var L = this.indexListeners[id];
            L.noteIndexListings(ix);
        }
    },

    // -------------------------------------------------------------

    /* Make a popup showing clones of nodes.
     *
     * param libpaths: array of libpaths of the nodes to be cloned
     * param options: {
     *   opaque {bool}: true to give the popup an opaque background (default false)
     *   dir {string}: indicating how you want the clones to be arranged, when there are
     *     more than one. May be equal to any valid value for the `flex-direction`
     *     CSS attribute, such as `row` or `column`. Defaults to `column` if undefined.
     *   zoom {float}: desired zoom scale for the popup. If undefined, we match the
     *     current zoom scale in the Forest.
     * }
     */
    makeNodeClonePopup : function(libpaths, options) {
        const {
            dir = 'column',
            opaque = false,
            zoom = null,
        } = options || {};
        const clones = [];
        const forest = this;
        libpaths.forEach(lp => {
            // Grab the node.
            let node = forest.getNode(lp);
            if (node) {
                // Clone the node's div:
                let nodeDiv = node.getDiv(),
                    doCloneChildren = true,
                    clone = nodeDiv.cloneNode(doCloneChildren);
                clone.classList.add('mooseNodeHtmlClone');
                // It's not enough to make `left` and `top` settings for the
                // `mooseNodeHtmlClone` CSS class; we have to override direct settings
                // that have already been made on the element we cloned.
                clone.style.left = '0';
                clone.style.top = '0';
                clones.push(clone);
            }
        });
        const popup = new Popup({
            items: clones,
            direction: dir,
            opaque: opaque,
        })
        // Zoom to the same scale as the current view.
        var zs = zoom || this.floor.getZoomScale();
        popup.setZoomScale(zs);
        // We keep an array of popups (not just a single one) because weird things
        // can happen e.g. if you alt-tab away from the browser and then come back.
        // I've seen the old popup fail to get removed, and then it sits there forever.
        // So we keep track of all popups created, only forgetting about them once
        // they've all been removed.
        this.popups.push(popup);
        return popup;
    },

    clearAllPopups : function() {
        this.popups.forEach(p => p.remove());
        this.popups = [];
    },

    /* Respond to hover event for a nodelink.
     *
     * param event: the event object
     * param b: boolean, true for mouseover, false for mouseout
     * param uid: the libpath of the node in whose label this nodelink resides
     * param libpaths: array of the libpaths of the nodes that are referenced by this nodelink
     *
     * Note: Because on mouseover we only work with nodes that are _already_ present,
     * and because the Forest does not allow any libpath to be simultaneously present
     * at different versions, this method does not require that versions be passed; i.e.
     * libpaths are enough.
     */
    nodelinkHover : function(event, b, uid, libpaths) {
        //console.log('hover ', libpath);
        if (b) {
            // Mouseover.
            // Among the named nodes, compute two (nested) subsets: those that are present,
            // and those that are present but not fully visible.
            // However, do not allow the node itself (in whose label this nodelink resides)
            // to wind up in the latter set.
            var present = [],
                pbnfv = [];
            var forest = this;
            libpaths.forEach(function(lp){
                if (forest.nodeIsPresent(lp)) {
                    present.push(lp);
                    if (lp !== uid && !forest.floor.nodeIsOnScreen(lp)) pbnfv.push(lp);
                }
            });
            // Are any of the nodes present?
            if (present.length > 0) {
                // Are any of them not fully visible?
                if (pbnfv.length > 0) {
                    // We show a popup clone of these nodes.
                    var p = this.makeNodeClonePopup(pbnfv, {dir: 'column'});
                    p.placeInBoxNearMouse(this.div, event);
                    p.show();
                }
                // Whether or not we're showing a popup, we highlight the nodes.
                // This is useful whether the nodes are completely off screen
                // (since they may be visible in an overview panel), or just
                // partially on screen.
                // We do this _after_ making the popup clone, so that the latter
                // is not also highlighted.
                this.colormgr.setColor({
                    ":update": true,
                    ":save:tmp:bgY": present
                });
            } else {
                // The nodes that we want to show are NOT currently present in the forest.
                // We don't do anything in this case. You can click the nodelink if you
                // want to add these nodes the chart.
                //console.log('Nodes are not currently on the board!');
            }
        } else {
            // Mouseout. Undo any highlight, and remove any popup.
            this.colormgr.setColor({
                ":update": true,
                ":wrest": libpaths
            });
            this.clearAllPopups();
        }
    },

    /* Respond to click event for a nodelink.
     *
     * param event: the event object
     * param libpaths: array of the libpaths of the nodes that are referenced by this nodelink
     * param versions: implicit version mapping for the given libpaths
     */
    nodelinkClick : function(event, libpaths, versions) {
        //console.log('click ', libpaths);
        this.requestState({
            view: libpaths,
            versions: versions,
        });
        event.preventDefault();
        event.stopPropagation();
    },

    /**
     * param libpaths: Array of libpaths of deductions and/or nodes.
     * param versions: Corresponding Array of versions at which these deducs/nodes
     *   are to be taken.
     * return: If you passed libpaths [p1, p2, ..., pn] and versions [v1, v2, ..., vn],
     * and if for each i, qi is the nearest ancestor of pi@vi that is a deduction, then
     * we compute the set {q1, q2, ..., qn}, and return its elements in an Array.
     * Thus, you get the smallest set of deductions that contain all the things
     * named by the given libpaths and versions.
     *
     * If you pass any libpaths that belong to anything other than a deduction
     * or a node, you'll get an error.
     */
    getDeductionClosure : function(libpaths, versions) {
        return moose.xhrFor('getDeductionClosure', {
            query: {
                libpaths: libpaths.join(','),
                versions: versions.join(','),
            },
            handleAs: 'json',
        }).then(resp => {
            if (resp.err_lvl > 0) {
                throw new Error(resp.err_msg);
            }
            return resp.closure;
        });
    },

    programmaticDoubleClickOfSingletonSelection : function() {
        var node = this.selectionmgr.getSingletonNode();
        if (node) this.programmaticDoubleClickOfNode(node.getLibpath());
    },

    programmaticDoubleClickOfNode : function(libpath) {
        this.notifyNodeDoubleClickListeners(libpath);
    },

    deducIsOpen : function(libpath) {
        return this.nodeIsPresent(libpath);
    },

    /* Refresh a currently open deduction by closing and re-opening it,
     * with instant-change transition method.
     *
     * param libpath: the libpath of the deduc you want to refresh
     * param dashgraph: optional: provide the full dashgraph with which to refresh, if available
     */
    refreshDeduc : function(libpath, dashgraph) {
        // If the deduc is not even present, do nothing.
        if (!this.deducIsOpen(libpath)) return;
        // Otherwise request the state.
        var kd = {};
        if (dashgraph) {
            kd[libpath] = dashgraph;
        }
        this.requestState({
            reload: libpath,
            transition: false,
            known_dashgraphs: kd
        });
    },

    closeAllInstantaneously : function() {
        this.getFloor().reset();
        this.getGhostbuster().reset();
        this.reset();
    },

    reopenAll : function() {
        var deducs = this.listEssentialOpenDeducs();
        this.closeAllInstantaneously();
        this.requestState({
            onBoard: deducs,
            coords: 'fixed',
            select: true,
            transition: false
        });
    },

    /*
     * Write an object describing the current state of the forest.
     * This includes:
     *   - a minimal set of deductions (opening which will cause any others to be opened too)
     *   - the current coordinates (x, y, and zoom)
     *   - the current selection
     *   - the current layout method
     *
     * param includeSpecial: set truthy to include deducs in `onBoard` whose UIDs begin with `special.`.
     *  Otherwise all such deducs are excluded from `onBoard`.
     */
    describeState : function(includeSpecial) {
        var deducs = this.listEssentialOpenDeducs();

        var coords = this.floor.getTruncatedCoords();
        const overview = this.floor.describeOverviewPanelState();

        var selection = [];
        var lps = this.selectionmgr.getSelection();
        for (var lp in lps) selection.push(lp);

        const ordSel = selection.length === 1 ?
                       this.uidToSortOrder(selection[0]) : -1;

        var onBoard = includeSpecial ?
                       deducs.slice() :
                       deducs.filter(uid => uid.slice(0, 8) !== 'special.');

        return {
            onBoard: onBoard,
            coords: coords,
            select: selection,
            ordSel: ordSel,
            layout: this.layoutMethod,
            versions: this.getDeducVersionLookup(),
            gid: this.gid,
            overview: overview,
            showLibpathSubtitles: this.showLibpathSubtitles,
            expansionMode: this.expansionMode,
        };
    },

    /*
     * This method provides a general way of requesting a certain "state". The state includes:
     *
     *      - which deducs are on the board
     *      - the view coordinates
     *      - the selected node(s)
     *      - colors/highlighting
     *      - the layout method
     *      - "freshness" of data on the board
     *        (i.e. user can request a refresh/reload of any deduc)
     *
     * Besides requesting a certain state, you can also say how to transition
     * to that state. (Animate, instant change, etc.)
     *
     * For documentation of the parameters that may be passed, please see the doctext
     * for the TransitionManager class.
     *
     * This method returns a Promise that resolves when the transition is completed.
     */
    requestState : function(params) {
        const tm = new TransitionManager(this, params);
        this.lastTransitionPromise = this.lastTransitionPromise.then(tm.run.bind(tm));
        return this.lastTransitionPromise;
    },

    decay : function(libpath, sharva) {
        var decayingNode = this.getNode(libpath);
        if (!decayingNode) return;
        var decaySite = decayingNode.parentNode || this.getFloor();

        // Clear records of expansion ghosts.
        var targets = decayingNode.getDeducInfo().listClarifiedNodes();
        if (targets !== null) {
            for (var i in targets) {
                var targetUID = targets[i];
                var target = this.getNode(targetUID);
                target.expansionGhost = null;
            }
        }

        // Steal any vines, so they are owned edges.
        decayingNode.stealVinesRec();
        var EOwn = decayingNode.getAllOwnedEdgesRec();
        var NAll = decayingNode.getAllNodesRec();
        var eth = {};
        for (const dsc in EOwn) {
            const e = EOwn[dsc];
            if (e.isVisible()) eth[dsc] = e;
        }
        var nth = {};
        nth[decayingNode.getUID()] = decayingNode;
        sharva.noteEdgesToHide(eth);
        sharva.noteNodesToHide(nth);

        // Compute what is to be shown.
        // First get any obscured "reasons" i.e. incoming edges to clarified nodes.
        var EOb = decayingNode.getAllObscuredEdgesRec();
        var ets = moose.objectDifference(EOb, EOwn);
        sharva.noteEdgesToShow(ets);
        // GhostBuster will note all nodes and edges to be shown due
        // to ghosts being revealed.
        this.getGhostbuster().computeShowAfterDecay(NAll, EOwn, sharva);

        // EDIT: Maybe we don't do any view planning at all in this method.
        // Plan the view.
        //if (decaySite.isNode()) sharva.noteNodeToView(decaySite);
        // Come up with a good plan for managing the view
        // when decaySite is /not/ a node, i.e. when it is the Floor?

        // Remove logical, but not graphical, representations of nodes and edges.
        decaySite.removeNodeLogicalRep(decayingNode);
        this.removeNodeRecursive(decayingNode);
        this.removeEdges(EOwn);
        // In unified mode, edges need to be removed logically from the Floor.
        // In embedded mode, (a) they don't _need_ to be removed logically from anywhere,
        // and (b) it _does no harm_ to try removing them from the Floor. So the following
        // single line suffices in both cases.
        this.getFloor().removeEdgesLogicalRep(EOwn);
        // All edges in EOwn must be dissociated from their endpts.
        for (const dsc in EOwn) {
            EOwn[dsc].dissociate();
        }
        // Note edges for erasure after transition.
        sharva.noteEdgesToRemove(EOwn);
        sharva.noteNodesToRemove(nth);
    },

    sweepUp: function(sharva) {
        /* Note the asymmetry btw removal of graphical elements, and their addition.
         * When they are added, of course that has to happen before any animated transition,
         * so the `grow` method can do all the adding before the SHARVA is asked to do anything.
         * On the other hand, graphical elements cannot be _removed_ until _after_ any animated
         * transition in which they might be involved; so the `decay` operation has to be split
         * into two parts, one coming before the SHARVA does its thing, and this one, coming afterward.
         */
        var ntr = sharva.getNodesToRemove(),
            floor = this.getFloor();
        for (var uid in ntr) {
            var decayingNode = ntr[uid],
                decaySite = decayingNode.parentNode || floor;
            decaySite.removeNodeGraphicalRep(decayingNode);
        }
        var etr = sharva.getEdgesToRemove();
        this.removeEdgesGraphicalRep(etr);
    },

    removeEdgesGraphicalRep: function(edges) {
        for (let dsc in edges) {
            const e = edges[dsc];
            e.removeGraphicalRep();
        }
    },
    
    grow : function(sgb, sharva) {
        // We augment the given sharva with whatever comes from
        // the passed SubgraphBuilder sgb.
        //console.log('Forest::grow on sgb for: '+sgb.libpath);

        var newNodes = sgb.getNodes();
        var newRootNode = sgb.getRootNode();
        var deducInfo = sgb.getDeducInfo();

        // Record new deduc.
        this.recordDeduc(newRootNode);
        // Record new nodes now, since we asked
        // the SubgraphBuilders NOT to do it.
        this.recordNodes(newNodes);

        // All nodes and edges start off hidden.
        // Do nodes now, edges later.
        for (const uid in newNodes) {
            newNodes[uid].hide();
        }

        // If there are clarified nodes, then
        // (a) they are to be viewed, and
        // (b) their incoming edges should be hidden.
        // (c) We must tell them who their "expansion ghost" is.
        var targets = deducInfo.listClarifiedNodes();
        if (targets != null) {
            // Compute map from libpaths to ghosts.
            // It's important however that we NOT set these as
            // expansion ghosts right now, since we don't know here
            // whether the ghosted node is a target of the new deduc
            // or not.
            var expansionGhosts = {};
            for (const uid in newNodes) {
                var node = newNodes[uid];
                if (node.nodetype === 'ghost') {
                    var ghostedLibpath = node.ghostOf();
                    expansionGhosts[ghostedLibpath] = node;
                }
            }
            // Proceed.
            for (var i in targets) {
                var targetUID = targets[i];
                var target = this.getNode(targetUID);
                // Now that we know we are looking at a target node
                // of the new deduc, it is okay to mark the ghost as
                // expansion ghost.
                target.expansionGhost = expansionGhosts[targetUID];
                var junction = this.isInEmbeddedMode() ?
                    this.getNode(targetUID) :
                    this.getGhostbuster().getRealestVersByUID(targetUID);
                // Add to the view.
                sharva.noteNodeToView(junction);
                // Hide incoming edges.
                var reasons = junction.getAllReasons();
                for (const j in reasons) {
                    const e = reasons[j];
                    if (e.isVisible() || sharva.edgeIsToBeShown(e)) {
                        sharva.noteEdgeToHide(e);
                        newRootNode.addObscuredEdge(e);
                    }
                }
            }
        }

        // The whole new deduction is to be viewed.
        sharva.noteNodeToView(newRootNode);

        // Add root node where appropriate.
        // The node addition methods called here add the node
        // both logically and graphically.
        // (But the node is still invisible for the moment.)
        // We assume that at this point the node that should own
        // the newRootNode already exists.
        var predLibpath = deducInfo.getTargetSubdeduc();
        // ("pred" is for "predecessor", i.e. in the sequence of target deducs)
        if (predLibpath) {
            const pred = this.getNode(predLibpath);
            pred.addChild(newRootNode);
        } else {
            this.floor.addNode(newRootNode);
        }

        // Run through the ghostbuster.
        this.getGhostbuster().augmentSHARVA(sgb, sharva);

        // Suppress flow edges initially?
        if (sgb.getSuppressFlowEdges()) {
            let ets = sharva.getEdgesToShow();
            let eth = {};
            let flowEdges = newRootNode.getOwnedFlowEdges(true);
            for (let dsc in ets) {
                if (dsc in flowEdges) {
                    let e = ets[dsc];
                    e.flowSuppressed = true;
                    eth[dsc] = e;
                }
            }
            sharva.noteEdgesToHide(eth);
        }

        // Now can record and hide edges, and add them graphically,
        // since now have all new reification / representative edges.
        var eta = sharva.getEdgesToAdd();
        this.recordEdges(eta);
        for (const dsc in eta) {
            const e = eta[dsc];
            e.hide();
            if (this.isInUnifiedMode()) {
                this.floor.addEdge(e);
            } else {
                const Dh = this.getDeduc(e.getHead().getParentNode().getDeducInfo().getLibpath());
                const Dt = this.getDeduc(e.getTail().getParentNode().getDeducInfo().getLibpath());
                if (Dh.uid !== Dt.uid) {
                    console.error(`Edge ${dsc} has endpts in different deductions in embedded mode.`);
                } else {
                    Dh.addEdgeGraphicalRep(e);
                }
            }
        }
    },

    changeLayoutStyle : function(style) {
        this.setLayoutMethod(style);
        // Current transition method may be 'Instantaneous'.
        // For a layout change we want to use 'FadeSlideFade'.
        this.setTransitionMethod(moose.transitionMethod_FadeSlideFade);
        if (style === moose.layoutMethod_OrderedList) {
            this.setViewMethod(moose.viewMethod_OrderedListView);
        }
        this.simpleLayout();
    },

    changeSelectionStyle : function(style) {
        this.setSelectionStyle(style);
        // Redo coloring.
        this.selectionmgr.setColors();
    },

    redoLyoutWithTransition : function(sharva) {
        this.setTransitionMethod(moose.transitionMethod_FadeSlideFade);
        this.simpleLayout(sharva);
    },

    // ----------------------------------------------------
    // Simple layout

    simpleLayout : function(sharva) {
        if (sharva === undefined) sharva = new SHARVA(this);
        this.sharva = sharva
        this.sharva.setViewMethod(this.viewMethod);
        var theForest = this;
        return this.computeLayout(sharva)
            .then(function(layoutInfo) {
                return sharva[theForest.transitionMethod](layoutInfo);
            })
            .then(function(sharva) {
                theForest.updateCurrentVBB();
                theForest.notifyForestListenersOfTransition();
                // If we just did an OrderedList layout, then we need to set controlled coords.
                if (theForest.layoutMethod === moose.layoutMethod_OrderedList) {
                    theForest.getFloor().roam();
                }
            })
            .catch(console.error);
    },

    // ----------------------------------------------------

    /* Compute a layout.
     *
     * param graphWriter: any object that can write a graph for layout. This means
     *   that it publishes a `writeImminentlyVisibleGraph` method.
     * param layoutMethod: the desired layout method. If not defined, we will use the
     *   Forest's current layout method.
     *
     * return: the Promise returned by Layout.computeLayout()
     */
    computeLayout : function(graphWriter, layoutMethod) {
        layoutMethod = layoutMethod || this.layoutMethod;
        if (this.isInUnifiedMode()) {
            return this.computeUnifiedLayout(graphWriter, layoutMethod);
        } else {
            const deducTree = this.floor.buildDeducTree();
            const layoutInfo = new LayoutInfo(this, {layoutMethod: layoutMethod});
            const deducSizes = {};
            return this.computeEmbeddedLayout(deducSizes, layoutInfo, deducTree, graphWriter, layoutMethod);
        }
    },

    computeUnifiedLayout : function(graphWriter, layoutMethod) {
        const graph = graphWriter.writeImminentlyVisibleGraph(layoutMethod);
        const layout = new Layout(this, layoutMethod, graph);
        return layout.computeLayout();
    },

    computeEmbeddedLayout : function(deducSizes, layoutInfo, deducTreeNode, graphWriter, layoutMethod) {
        const jobs = [];
        const embedding = !!deducTreeNode.deduc;
        for (let child of deducTreeNode.children) {
            jobs.push(this.computeEmbeddedLayout(deducSizes, layoutInfo, child, graphWriter, layoutMethod));
        }
        return Promise.all(jobs).then(() => {
            let roots = null;
            if (embedding) {
                for (let child of deducTreeNode.children) {
                    child.deduc.setScale(moose.embeddedModeScaleFactor);
                    const uid = child.deduc.getUID();
                    const [w, h] = layoutInfo.getSizeForNodeUID(uid);
                    child.deduc.resize(w, h, true);
                    deducSizes[uid] = [w, h];
                }

                const deduc = deducTreeNode.deduc;
                roots = {
                    [deduc.getUID()]: deduc,
                };
            }
            const graph = graphWriter.writeImminentlyVisibleGraph(layoutMethod, roots);
            const layout = new Layout(this, layoutMethod, graph);
            return layout.computeLayout().then(newLayoutInfo => {
                layoutInfo.update(newLayoutInfo);
                if (!embedding) {
                    for (let uid in deducSizes) {
                        const size = deducSizes[uid];
                        layoutInfo.setSizeForNodeUID(uid, size);
                    }
                }
                return layoutInfo;
            });
        });
    },

    // ----------------------------------------------------

    /* Add another Forest to the chain in which this one participates.
     *
     * param otherForest: the new Forest to be added to the chain
     */
    addForestToChain : function(otherForest) {
        // We connect the Forests so as to form a doubly-linked list.
        // Let F be this Forest, G the new one, and H the one that
        // currently comes after F:
        //
        //                     G
        //
        //          ... --> F --> H --> ...
        //
        var F = this,
            G = otherForest,
            H = this.nextLinkedForest;
        // We want to splice G in between F and H:
        //
        //          ... --> F --> G --> H --> ...
        //
        // Forward linking:
        F.nextLinkedForest = G;
        G.nextLinkedForest = H;
        // Backward linking:
        if (H) H.prevLinkedForest = G;
        G.prevLinkedForest = F;
        // Make other forest join the group:
        G.gid = F.gid;
    },

    /* Remove this Forest from the chain it currently participates in,
     * linking its neighbors to one another.
     */
    exitForestChain : function() {
        // Let F be the previous Forest, and H the next one (either of which may be null).
        var F = this.prevLinkedForest,
            H = this.nextLinkedForest;
        if (F) F.nextLinkedForest = H;
        if (H) H.prevLinkedForest = F;
        // Go back to own group:
        this.gid = this.uuid;
    },

    getNextForest : function() {
        return this.nextLinkedForest;
    },

    getPrevForest : function() {
        return this.prevLinkedForest;
    },

};

export { Forest };
