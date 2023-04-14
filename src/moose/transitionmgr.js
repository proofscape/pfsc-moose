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
import { SHARVA } from "./sharva.js";
import { SubgraphBuilder } from "./subgraphbuilder.js";

// -------------------------------------------------------------------
// TransitionManager
/*
 * When Forest.requestState is called, it is an instance of this class
 * that manages the transition to the requested state.
 *
 * The constructor accepts a reference to the Forest object, as well as
 * a parameters object, whose fields are defined below.
 *
 * Parameters:
 *
 * Pass a single parameters object looking roughly as follows. Any of these fields
 * may be undefined. Their meaning is described below.
 *
 *  {
 *      view: (see below),
 *      coords: 'fixed' or [x, y, zf],
 *      on_board: boxlisting,
 *      off_board: 'all' or boxlisting,
 *      reload: 'all' or boxlisting,
 *      versions: (see below),
 *      select: null or true or boxlisting,
 *      color: (see below),
 *      layout: a layout method,
 *      transition: true/false,
 *      known_dashgraphs: (see below),
 *      local: boolean,
 *      flow: boolean
 *  }
 *
 * view: Name boxes (nodes and deducs) that should be "viewed," and optionally control
 *      how the viewbox is updated. Also affects the node selection unless `select` param
 *      is also defined (see below).
 *
 *      The system will automatically ensure first that any boxes to be viewed are actually
 *      present, opening deducs as necessary to achieve this, and then will update the
 *      viewbox to show these boxes. The `view` parameter therefore often makes use of
 *      the `on_board` parameter unnecessary (see below).
 *
 *      You may pass a boxlisting, or keyword 'all' indicating that you want to view
 *      everything currently on the board (an "overview").
 *
 *      Alternatively, you may pass an object looking roughly as follows:
 *
 *      {
 *          objects: 'all' or boxlisting,
 *          incl_nbhd: true if you want to automatically add the full deductive nbhd of each named node
 *          zoom_range: [0.5, 2.0],
 *          core: nodes that we must see; others may be off-screen if need be to save the zoom_range
 *          pan_policy: choose from among the moose.autopanPolicy_ values
 *          center: 'all' or 'core' or boxlisting (i.e. what to center on, if centering)
 *          viewbox_padding_px: 20
 *          viewbox_padding_percent: 5
 *          inset_aware: true/false
 *      }
 *
 *      In this case, the `objects` field takes over the role of indicating the boxes
 *      that are to be viewed, as before.
 *
 *      NB: `view` affects selection! If you pass a boxlisting, or pass a full set of parameters
 *      with a boxlisting in the `objects` field, then the first box named in this listing will
 *      become the selected box _unless_ the `select` parameter (see below) is defined.
 *
 *      As for the remaning parameters, please see the doctext for `Floor.computeViewCoords()`
 *      for their exact meaning.
 *
 *      Default: undefined
 *
 * coords: Specify the view coordinates directly.
 *
 *      Legal values are:
 *          - 'fixed': the view should stay exactly as it is
 *          - [x, y, zf]: pan to (x, y) and set the zoom factor to zf
 *
 *      If defined, `coords` overrides `view`.
 *
 *      Default: undefined
 *
 * on_board: Name boxes that should be on board.
 *
 *      Pass any boxlisting. The system will ensure that every deduc in the deduc closure thereof
 *      is on board, opening it if necessary, or leaving it if it is already there.
 *
 *      Default: undefined
 *
 * off_board: Name boxes that should not be on board.
 *
 *      Pass any boxlisting, or keyword 'all' indicating that you want everything presently on
 *      board to be removed.
 *
 *      If off_board contradicts on_board or view, it is overruled by them. In other words, putting
 *      things on the board is favored over removing them.
 *
 *      Default: undefined
 *
 * reload: Name boxes that should be reloaded.
 *
 *      Pass any boxlisting, or keyword 'all' indicating that everything presently on board should be
 *      reloaded. This is useful in case a deduc has been rebuilt, and you want to load the latest
 *      version from disk.
 *
 *      Note that, while reloading involves closing and reopening deducs, the user need not be aware of
 *      this fact. In other words, supposing D <-- E are on board, and the user asks for D to be reloaded,
 *      the user need not worry that E will vanish (since closing D also removes E from the board).
 *
 *      In such a case, the system will close D and reopen it, and it will also automatically reopen E.
 *      Let us say that in this case the system "rescues" deduc E. Then the order of overriding is as
 *      follows:
 *
 *              on_board, view, reload  >  off_board  >  rescue
 *
 *      In other words, if the user explicitly asks that something be present, this overrides a request
 *      that it be absent. However, an explicit request that something be absent overrides a rescue.
 *
 *      Default: undefined
 *
 * versions: State the desired versions for anything that is to be loaded.
 *
 *      Pass an object mapping libpaths to full version strings (i.e. either "WIP" for work-in-progress,
 *      or a numbered version of the form `vM.m.p`).
 *
 *      The mapping may speak for any libpath listed in any of the three arguments `view`, `on_board`,
 *      and `reload`. It is allowed to be implicit, meaning that not every libpath has to be a key,
 *      but some proper segment-wise prefix of it must be.
 *
 *      For any libpath in `view`, `on_board`, or `reload` that is not given a version by this argument,
 *      we will fall back on versions implied by anything already on board. If that is silent as well,
 *      it is an error.
 *
 * select: Name boxes that should be selected.
 *
 *      Legal values are:
 *          - true: keep the selection as it is ("stay true")
 *          - null: clear the selection (i.e. no nodes should be selected)
 *          - a boxlisting: select all the boxes in the listing
 *
 *      Default: true; however, if the `view` parameter is defined, that can override this. See above.
 *
 * ordSel: "Ordered selection": Non-negative integer indicating a single box to be selected.
 *
 *      If select is undefined, and a non-negative integer n is given here, then we set the selection to
 *      be that node or deduc that comes at index n, when all node and deduc uids in the forest are sorted.
 *
 * color: Specify the highlighting colors for any and all boxes on board.
 *
 *      Pass an object as specified in the doctext to the ColorManager class.
 *
 *      Default: undefined
 *
 * layout: Specify the desired layout method.
 *
 *      Pass any of the `moose.layoutMethod_` enum values.
 *      At time of this writing the legal values are:
 *          - moose.layoutMethod_FlowChartDown
 *          - moose.layoutMethod_FlowChartUp
 *          - moose.layoutMethod_OrderedList
 *
 *      If the set of deducs on board is changing (i.e. anything is being opened or closed), then
 *      this is the layout method that will be used during the concommitant relayout.
 *      If not, then a new layout is computed simply to put the desired method into effect.
 *
 *      Default: defaults to the default layout method of the associated Forest, if any;
 *      else defaults to moose.layoutMethod_FlowChartDown.
 *
 * transition: Specify the desired type of transition.
 *
 *      Pass a boolean. If true, we use a smooth, animated transition; if false, we jump
 *      instantaneously to the new state.
 *
 *      Default: true
 *
 * known_dashgraphs: Provide an optional lookup of dashgraphs that are already known, and
 *      should not be loaded from disk.
 *
 *      The lookup should be in the format { deducpath: dashgraph }.
 *
 *      Default: undefined
 *
 * local: Force the system to skip its call to the forestUpdateHelper URL, and work
 *      locally instead.
 *
 *      Ordinarily the system will automatically skip the backend call if all of the
 *      following conditions are met:
 *          * view/view.objects is 'all' or everything it names is already present;
 *          * view.incl_nbhd is false (or undefined);
 *          * everything in on_board is already present; AND
 *          * reload is empty or undefined.
 *
 *      But there may be other cases in which you know that the backend call is
 *      superfluous. For example, maybe you already have the dashgraph for a deduc D, you
 *      just want to open D, and you know that anything else that needs to be present
 *      for D to be opened (like a deduc on which it expands) already is present.
 *      In such cases you may pass a truthy value for `local`.
 *
 *      When you do pass a truthy value for `local`, you can still open and close
 *      deducs, but you must understand that the responsbility to make a request that will
 *      work rests on you. In particular:
 *
 *          * You may name both nodes and deducs in `off_board`.
 *          * You must not name any nodes (only deducs) in `reload`.
 *          * Anything named in `on_board` or `view/view.objects` that is not
 *            already present in the forest must be a deduc, not a node (since we will
 *            attempt to open it).
 *          * Any deducs that will be opened will be processed in the order
 *            given, first in `reload`, then in `on_board`, and finally in
 *            `view/view.objects`. It is up to you to ensure that this ordering
 *            is topological (i.e. targets come before expansions).
 *
 * flow: If true, show flow edges in deducs being opened; if false, suppress them; if
 *      undefined, default to current setting in the Forest.
 */
var TransitionManager = function(forest, params) {
    this.forest = forest;

    this.givenParams = params;
    this.enrichedParams = null;
    this.viewParams = null;
    this.known_dashgraphs = null;
    this.helperRequestParams = null;

    this.layoutMethod = null;
    this.transitionMethod = null;
    this.setOfDeducsIsChanging = false;
    this.sharva = null;
    this.sgbs = [];
    this.numSgbsComplete = 0;

    this.workingGIFTimeout = null;

    this.deducsClosed = [];
    this.deducsOpened = new Map();

    // Place to store the callback/errback for the `updateState` promise:
    this.resolve = null;
    this.reject = null;
};

TransitionManager.prototype = {

    /* Start the transition process.
     *
     * Returns a Promise, which returns the TransitionManager itself upon resolution.
     */
    run: function() {
        // Some actions are quick enough that there's no call for a spinner GIF.
        // So we wait a 1/2 sec delay before showing it.
        // If we finish everything we needed to do before the delay runs out,
        // we'll cancel showing the GIF altogether.
        var forest = this.forest;
        this.workingGIFTimeout = setTimeout(function(){
            forest.showWorkingGIF(true);
        }, 500);
        // Important: we only now (after this TransitionManager's turn has come up,
        // i.e. its `run` method has been called) set up the parameters. E.g. this
        // ensures that the list of deducs currently on board is up to date.
        this.setUpParameters();
        var theTM = this;
        var skipData = this.computeSkipData();
        var prepare = new Promise((resolve, reject) => {
            if (skipData) {
                // There's one side-effect of `receiveHelp` for which we must make a
                // counterpart here; namely, the setting of `this.viewParams.objects`.
                // Since in this case we are not computing any "view closure," the
                // objects to be viewed are simply those that were named.
                this.viewParams.objects = this.viewParams.named;
                // Now we can just return the precomputed parameters for `updateState`.
                resolve(skipData);
            } else {
                const requestHelp = moose.xhrFor('forestUpdateHelper', {
                    method: "POST",
                    form: {
                        info: JSON.stringify(theTM.helperRequestParams)
                    },
                    handleAs: 'json',
                });
                var data = requestHelp.then(theTM.receiveHelp.bind(theTM));
                resolve(data);
            }
        });
        return prepare.then(function(d) {
            return theTM.updateState(d.toClose, d.toOpen, d.dashgraphs);
        }).catch(console.error);
    },

    /* Stop the working GIF if it is already running; cancel plans
     * to start it if it hasn't started yet.
     */
    clearWorkingGIF: function() {
        clearTimeout(this.workingGIFTimeout);
        this.forest.showWorkingGIF(false);
    },

    /* Based on the given parameters, set up the "enriched," "view," and "helper request" parameters.
     */
    setUpParameters: function() {
        var params = Object.assign({}, this.givenParams);

        // Set layout method.
        // If one has been specified in the passed parameters, set that.
        // If not, then either keep the Forest's current value if it has one, or
        // set a default one if not.
        this.layoutMethod = params.layout || this.forest.layoutMethod || moose.layoutMethod_FlowChartDown;
        params.layout = this.layoutMethod;

        // Set transition method.
        // Note that (for now at least), params.transition is a boolean, where
        // `true` means you want a smooth transition, which translates to use
        // of our "FadeSlideFade" transition method; `false` means you want an
        // instantaneous change.
        if (typeof params.transition === 'undefined') {
            this.transitionMethod = this.forest.transitionMethod || moose.transitionMethod_FadeSlideFade;
        } else {
            this.transitionMethod = params.transition ?
                moose.transitionMethod_FadeSlideFade :
                moose.transitionMethod_instantChange;
        }

        // Flow edges?
        if (typeof params.flow === 'undefined') {
            params.flow = !this.forest.getSuppressFlowEdges();
        }

        // Set up data for request to back-end.
        var current_forest = this.forest.getFloor().writeVersionedForestRepn(),
            on_board = params.on_board || null,
            off_board = params.off_board || null,
            reload = params.reload || null,
            versions = params.versions || {},
            to_view = null,
            incl_nbhd_in_view = false;

        // View parameters:
        // Under `view`, the user may pass a mere boxlisting of deducs and nodes to be viewed, or may
        // pass a whole object, in which such a listing occurs under the `objects` field, alongside
        // several other optional fields, which are detailed in the doctext for Floor.computeViewCoords().
        //
        // Thus, the boxlisting of deducs and nodes to be viewed -- i.e. the value to be passed to the
        // back-end as the `to_view` parameter -- may be under `params.view` or `params.view.object`, or
        // it may not be defined at all.
        //
        // Our job now is to normalize all this. We begin by determining the value of `to_view` for the back-end.
        // Then, we ensure that under `this.viewParams` we are storing all the parameters for Floor.computeViewCoords().
        //
        if (params.view !== undefined) {
            // User may pass just the value of the `objects` parameter, or may define a whole object
            // containing that and other parameters.
            if (typeof(params.view) === "string" || Array.isArray(params.view)) {
                // params.view appears to be a boxlisting
                to_view = params.view;
                incl_nbhd_in_view = false;
                this.viewParams = {};
            } else {
                // params.view appears to be a full object
                to_view = params.view.objects;
                if (params.view.incl_nbhd !== undefined) {
                    incl_nbhd_in_view = params.view.incl_nbhd;
                }
                this.viewParams = params.view;
            }
        } else {
            this.viewParams = {};
        }
        // The set of deducs that were named for viewing in the given params will be saved
        // under the `named` field in our `viewParams`. Later, after the back-end has computed
        // the full "view closure", that value will replace this.viewParams.objects.
        // Thus, `named` is a record of what was called for _before_ the closure was computed.
        this.viewParams.named = moose.normalizeBoxlist(to_view);

        // Make a lookup of known dashgraphs (whether or not supplied in the params).
        this.known_dashgraphs = params.known_dashgraphs || {};
        // And prepare the lookup required by the server.
        const kd = {};
        for (let deducpath of Object.keys(this.known_dashgraphs)) {
            const di = this.known_dashgraphs[deducpath].deducInfo;
            const td = di.target_deduc;
            kd[deducpath] = td ? `${td}@${di.target_version}` : null;
        }

        // Record the new, enriched parameters.
        this.enrichedParams = params;

        // Define the parameters for the request to the back-end "helper".
        this.helperRequestParams = {
            current_forest: current_forest,
            desired_versions: versions,
            on_board: on_board,
            off_board: off_board,
            reload: reload,
            to_view: to_view,
            incl_nbhd_in_view: incl_nbhd_in_view,
            known_dashgraphs: kd,
        };
    },

    /* This method is employed by the `computeSkipData` method to determine
     * whether an "auto skip" is possible. See doctext for that method.
     *
     * return: boolean, saying whether auto skip is possible.
     *
     * Note: Must not call this method until after `setUpParameters()` has already been called.
     */
    canDoAutoSkip: function() {
        // (1) view.incl_nbhd was false (or undefined).
        if (this.helperRequestParams.incl_nbhd_in_view) return false;
        // (2) reload is empty or undefined.
        if (this.helperRequestParams.reload) return false;
        // (3) view/view.objects is 'all' or everything it names is already present
        // (4) everything in on_board is already present.
        var to_view = this.viewParams.named;
        var on_board = moose.normalizeBoxlist(this.helperRequestParams.on_board);
        // After `setUpParameters()` has been called, we can trust that `this.viewParams.named`
        // either is keyword 'all', or is null, or else is the array (possibly empty) of libpaths
        // to be viewed. Likewise, `on_board` is either null, or a (possibly empty) array of libpaths.
        var to_scan = [];
        if (to_view !== 'all' && to_view !== null) to_scan = to_view.slice();
        if (on_board !== null) to_scan = to_scan.concat(on_board);
        for (var i in to_scan) {
            var lp = to_scan[i];
            // Forest records both nodes and deducs as "nodes", so this one check suffices:
            if (!this.forest.nodeIsPresent(lp)) return false;
        }
        // Passed all tests.
        return true;
    },

    /* Determine whether or not we're going to skip the call to the forestUpdateHelper URL.
     * If we're skipping it, compute the data we need to proceed without it.
     *
     * return: If we're to skip the back-end call, return an object of the form
     *      {
     *        toClose: ...,
     *        toOpen: ...,
     *        dashgraphs: ...
     *      }
     *   that can be passed to `updateState`. Otherwise, return null.
     *
     * Note: Must not call this method until after `setUpParameters()` has already been called.
     */
    computeSkipData: function() {
        // There are two ways to skip, which we call "forced," and "auto."
        // A forced skip is one in which the user has supplied the `local` parameter.
        // An auto skip is one in which the user has not supplied the `local` parameter,
        // but we can determine that the back-end call is unneeded anyway.

        var skipData = null;

        if (this.givenParams.local || this.canDoAutoSkip()) {
            // We first want normalized versions of several data points.
            // These normalized versions will be either keyword strings ('all')
            // or arrays (possibly empty).
            var norm_off = moose.normalizeBoxlist(this.helperRequestParams.off_board) || [],
                norm_reload = moose.normalizeBoxlist(this.helperRequestParams.reload) || [],
                norm_on = moose.normalizeBoxlist(this.helperRequestParams.on_board) || [],
                norm_view = this.viewParams.named || [];

            var forest = this.forest;

            // Compute the array of deducs to close.
            var toClose = [];
            if (norm_off === 'all' || norm_reload === 'all') {
                toClose = forest.listAllDeducUIDs();
            } else {
                let seen = {};
                norm_off.concat(norm_reload).forEach(lp => {
                    // Get deducpath.
                    var deduc = forest.getDeducContainingNode(lp);
                    var deducpath = deduc ? deduc.getLibpath() : null;
                    // If found a deducpath which we haven't seen yet,
                    // then note it as to-be-closed, and mark it as seen.
                    if (deducpath && !seen[deducpath]) {
                        toClose.push(deducpath);
                        seen[deducpath] = true;
                    }
                });
            }

            // Compute the array of deducs to open.
            // Note that when it's an auto skip, this array will wind up empty, as it should.
            // Anything to be reloaded is to be opened even if already present.
            var toOpen = norm_reload === 'all' ? forest.listAllDeducUIDs() : norm_reload.slice();
            // For on_board, and view, we only want to open a deduc if it is _not_ yet present.
            var toScan = norm_on.slice();
            if (norm_view !== 'all') {
                toScan = toScan.concat(norm_view);
            }
            let seen = {};
            toScan.forEach(lp => {
                if (!forest.nodeIsPresent(lp) && !seen[lp]) {
                    toOpen.push(lp);
                    seen[lp] = true;
                }
            });

            skipData = {
                toClose: toClose,
                toOpen: toOpen,
                dashgraphs: this.known_dashgraphs
            };

        }

        return skipData;
    },

    /* Helper funciton to manage computation of the desired view coords in a state request.
     *
     * NB: This cannot be done until open/close operations have finished changing the set of
     * nodes on the board.
     */
    computeDesiredCoords : function() {
        var desiredViewCoords = null;
        var params = this.enrichedParams;
        if (params.coords === undefined && params.view === undefined) {
            // If user didn't define coords or view, then we won't update the view.
            desiredViewCoords = null;
        } else if (params.coords === 'fixed') {
            // The user can also explicity indicate that the view is not to be updated, by defining coords = 'fixed'.
            desiredViewCoords = null;
        } else if (params.coords !== undefined) {
            // If we gave coordinates directly, then just use those.
            console.assert(Array.isArray(params.coords) && params.coords.length === 3, "Coords must be array of length 3");
            // Constrain zoom.
            let zf = params.coords[2];
            if (zf < moose.minZoomFactor) params.coords[2] = moose.minZoomFactor;
            else if (zf > moose.maxZoomFactor) params.coords[2] = moose.maxZoomFactor;
            desiredViewCoords = params.coords;
        } else {
            // Otherwise we use the view parameters.
            desiredViewCoords = this.forest.floor.computeViewCoords(this.viewParams);
        }
        return desiredViewCoords;
    },

    /* Receive the return value from the server's forest update helper.
     * Should look like this:
     *  {
     *    to_close: list of deducs currently on board that should be closed.
     *        No deduc in the list is a descendant of any other deduc in the list.
     *    to_open: list of deducs that should be opened, after the close operation.
     *        The list is in topological order, and includes any necessary ancestors
     *        not already on board after the close operation.
     *    dashgraphs: a lookup, in which the libpaths in the to_open list point
     *        to the latest dashgraphs for these deducs, loaded freshly from disk.
     *    view_closure: either keyword `all` or a boxlisting of boxes to be viewed.
     *        If we requested nbhd closure then that has been performed.
     *  }
     */
    receiveHelp: function(r) {
        // Any error?
        if (r.err_lvl > 0) {
            // Throw an exception and give up.
            throw new Error(r.err_msg);
        }
        // Read the info obtained from the back-end helper function.
        var toClose = r.to_close,
            toOpen  = r.to_open,
            dashgraphs = r.dashgraphs,
            viewClosure = r.view_closure;
        // We now have a chance to perform a check on the view closure, before
        // recording it under this.viewParams.objects.
        var checkedViewClosure = null;
        if (Array.isArray(viewClosure) && this.forest.isInUnifiedMode()) {
            // The viewClosure may contain ghost nodes. We want to view their real versions.
            var gb = this.forest.getGhostbuster();
            var checkedViewClosure = [];
            for (var i in viewClosure) {
                var uid = viewClosure[i];
                var r = gb.getRealestVersByUID(uid);
                if (r) {
                    uid = r.getUID();
                }
                checkedViewClosure.push(uid);
            }
        } else {
            // No check in this case.
            checkedViewClosure = viewClosure;
        }
        this.viewParams.objects = checkedViewClosure;
        return {
            toClose: toClose,
            toOpen: toOpen,
            dashgraphs: dashgraphs
        };
    },

    /* Initiate the asynchronous process of updating the state, given the lists of
     * deducs to be closed and to be opened, and a lookup of dashgraphs for the
     * latter.
     *
     * Returns a Promise which returns the TM itself on resolution.
     */
    updateState: function(toClose, toOpen, dashgraphs) {
        var theTM = this;
        return new Promise(function(resolve, reject) {
            theTM.resolve = resolve;
            theTM.reject = reject;
            theTM.updateState1(toClose, toOpen, dashgraphs);
        });
    },

    updateState1: function(toClose, toOpen, dashgraphs) {
        // Record a boolean saying whether we are changing the deduc set at all.
        this.setOfDeducsIsChanging = (toClose.length + toOpen.length > 0);
        // Mix in any dashgraphs we already knew.
        Object.assign(dashgraphs, this.known_dashgraphs);
        // Decay and Grow
        this.sharva = new SHARVA(this.forest);
        this.sharva.setViewCoordsFunction(this.computeDesiredCoords.bind(this));
        for (let deducpath of toClose) {
            this.forest.decay(deducpath, this.sharva);
            this.deducsClosed.push(deducpath);
        }
        // Before we can grow, we need SubgraphBuilders.
        for (let deducpath of toOpen) {
            if (this.forest.deducIsPresent(deducpath)) {
                // It's an error to try to open a deduc that's already present.
                // In particular, we anticipate this catching errors where we attempt to
                // open a single deduc simultaneously at different versions.
                throw new Error(`Cannot open deduc '${deducpath}', since it is already open.`);
            }
            const dashgraph = dashgraphs[deducpath];
            const sgb = new SubgraphBuilder({
                libpath: deducpath,
                dashgraph: dashgraph
            });
            sgb.setForest(this.forest);
            sgb.doRecordNodesInForest(false);
            sgb.setSuppressFlowEdges(!this.enrichedParams.flow);
            this.sgbs.push(sgb);
        }
        if (this.sgbs.length > 0) {
            this.sgbs[0].go().then(this.noteSgbComplete.bind(this));
        } else {
            this.updateState2();
        }
    },

    noteSgbComplete: function(sgb) {
        var n = ++this.numSgbsComplete;
        if (n === this.sgbs.length) {
            this.updateState2();
        } else {
            this.sgbs[n].go().then(this.noteSgbComplete.bind(this));
        }
    },

    updateState2: function() {
        // Now that all SGBs are finished, we can process them in order, and finish growing.
        for (var i in this.sgbs) {
            var sgb = this.sgbs[i];
            this.forest.grow(sgb, this.sharva);
            this.deducsOpened.set(sgb.getLibpath(), sgb.getRootNode());
        }

        // Grab params.
        var params = this.enrichedParams;

        // Are we requesting a new layout method?
        // We are if `layout` is defined and distinct from the current method.
        var currentLayoutMethod = this.forest.getLayoutMethod();
        var wantNewLayoutMethod = (typeof(params.layout) !== 'undefined') && (params.layout !== currentLayoutMethod);

        // We need a new layout if the deduc set changed, or if we just want a new method.
        if (this.setOfDeducsIsChanging || wantNewLayoutMethod) {
            this.forest.setLayoutMethod(this.layoutMethod);
            var tm = this;
            this.forest.computeLayout(this.sharva)
                .then(function(layoutInfo) {
                    tm.clearWorkingGIF();
                    // Need to notify listeners of transition _before_ the transition is initiated.
                    tm.forest.notifyForestListenersOfTransition();
                    return tm.sharva[tm.transitionMethod](layoutInfo);
                })
                .then(function(sharva) {
                    tm.forest.sweepUp(tm.sharva);
                    tm.forest.notifyForestListenersOfClosedAndOpenedDeductions({
                        closed: tm.deducsClosed,
                        opened: tm.deducsOpened
                    });
                    // If we just did an OrderedList layout, then we need to set controlled coords.
                    if (tm.layoutMethod === moose.layoutMethod_OrderedList) {
                        tm.forest.getFloor().roam();
                    }
                    // Move on to part 3.
                    tm.updateState3();
                });
            // In this case it will be via callbacks that we will pass on to part 3.
        } else {
            // If we don't want a new layout, we still might want a view transition.
            // Compute the desired view coordinates (if any).
            var coords = this.computeDesiredCoords();
            if (coords) {
                this.clearWorkingGIF();
                if (this.transitionMethod === moose.transitionMethod_FadeSlideFade) {
                    var dur = -1; // use speed-based duration (1 px/ms)
                    this.forest.floor.transitionToCoords(coords, dur);
                } else {
                    this.forest.floor.gotoCoords(coords);
                }
            }
            // Move on to part 3.
            this.updateState3();
        }
    },

    updateState3: function() {
        this.clearWorkingGIF();
        this.forest.updateCurrentVBB();

        var params = this.enrichedParams;

        // Selection & Color

        // Determine the selection.
        /* The user may or may not define a `select` parameter.
         *
         * If defined, it should be one of the following:
         *    true: this means do not change the current selection;
         *    null: this means clear the selection;
         *    a libpath: this node should be selected;
         *    an Array of libpaths: these nodes should be selected.
         *
         * If undefined, we will turn to this.viewParams.named.
         */
        var selection = true;
        if (params.select !== undefined) {
            selection = params.select;
        } else if (params.ordSel !== undefined && params.ordSel >= 0) {
            let u = this.forest.sortOrderToUid(params.ordSel);
            if (u) {
                selection = [u];
            }
        } else {
            var named = this.viewParams.named;
            // Accept if it names a single libpath or an array thereof.
            if (typeof(named) === "string" && named !== 'all') {
                selection = named;
            } else if (Array.isArray(named)) {
                selection = named;
            }
        }

        // Was there any color request?
        var colorReq = params.color;

        this.forest.selectionmgr.requestSelectionState(selection);
        if (colorReq) this.forest.colormgr.setColor(colorReq);

        // Resolve the `updateState` Promise.
        this.resolve(this);
    },

};

export { TransitionManager };
