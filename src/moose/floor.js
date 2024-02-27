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
import { Overview } from "./views/overview";
import { Nbhdview } from "./views/nbhdview";

// -------------------------------------------------------------------
// Floor

var Floor = function(forest, div, params) {
    moose.registerNextID(this); // sets this.id
    this.forest = forest;
    this.div = div;
    this.x = 0; this.y = 0;
    this.homeX = 0; this.homeY = 0;
    this.forest.addBGDoubleClickListener(this);

    this.contextMenuPlugin = this.forest.getContextMenuPlugin();

    this.coordsOutput = null;
    this.zoomOutput = null;

    this.doScrollPanning = true;

    //this.panMode = moose.panMode_Free;
    this.panMode = moose.panMode_Controlled;

    this.roots = {};
    this.edges = {};

    this.overview = null;
    this.nbhdview = null;

    // Listeners
    this.viewportListeners = {};
    this.moveListeners = {};

    this.paddingForViewAdjustment = 10;

    this.zs = 1; // zoom scale
    this.zoomFactor = 1.02;
    
    this.baseX = 0; this.baseY = 0;

    this.buildMarquee();

    // Make a container element to hold both the nodes and the connectors.
    this.container = document.createElementNS(moose.xhtmlns,'div');
    this.container.style.position = 'absolute';
    this.container.style.width = '100%';
    this.container.style.height = '100%';
    // SVG layer for connectors
    var svgLayer = document.createElementNS(moose.svgns,'svg');
    svgLayer.style.position = 'absolute';
    svgLayer.style.overflow = 'visible';
    svgLayer.style.width = '100%';
    svgLayer.style.height = '100%';
    this.svgLayer = svgLayer;
    // div layer for nodes
    var divLayer = document.createElementNS(moose.xhtmlns,'div');
    divLayer.style.position = 'absolute';
    divLayer.style.width = '100%';
    divLayer.style.height = '100%';
    this.divLayer = divLayer;

    // Stack the layers.
    this.container.appendChild(divLayer);
    this.container.appendChild(svgLayer);
    this.div.appendChild(this.container);

    // background in svg layer
    var bg=document.createElementNS(moose.svgns,"rect");
    bg.setAttributeNS(null,"id","background");
    bg.setAttributeNS(null,"x","0");
    bg.setAttributeNS(null,"y","0");
    bg.setAttributeNS(null,"width","100%");
    bg.setAttributeNS(null,"height","100%"); 
    //bg.setAttributeNS(null,"fill","#FFF");
    
    bg.setAttributeNS(null,"opacity","0");
    //this.div.style.background = 'white';
    this.svgLayer.style.pointerEvents = 'none';

    this.div.style.pointerEvents = 'auto';

    this.svgLayer.appendChild(bg);
    this.bgRect = bg;

    // Set up the mouse
    // Note: div layer must also be clickable, for times when it actually overlays the svg layer.
    var objects = [this.div, bg, this.divLayer];
    for (var i in objects) {
        var obj = objects[i];
        obj.addEventListener("mousedown", function(e){forest.getMouse().bgMouseDown(e)});
        obj.addEventListener("click", function(e){forest.getMouse().bgClick(e)});
    }

    // context menu
    if (this.contextMenuPlugin) {
        this.contextMenuPlugin.makeBackgroundContextMenu(this.div);
    }

    // set up for zooming around ULC
    this.container.style.transformOrigin = '0 0';

    // edge group
    var eg = document.createElementNS(moose.svgns,"g");
    eg.setAttribute('class', moose.connMode_ShowSelected);
    //eg.setAttribute('class', moose.connMode_ShowAll);
    eg.setAttribute("x", "0");
    eg.setAttribute("y", "0");
    eg.setAttribute("width", "100%");
    eg.setAttribute("height", "100%");
    this.svgLayer.appendChild(eg);
    this.edgeGroup = eg;

    // error box
    var errorBox = document.createElement('div');
    errorBox.setAttribute('class', 'mooseErrorBox');
    errorBox.style.display = 'none';
    this.div.appendChild(errorBox);
    this.errorBox = errorBox;

    var workingBox = document.createElement('div');
    workingBox.setAttribute('class', 'workingGIF');
    workingBox.style.display = 'none';
    this.div.appendChild(workingBox);
    this.workingBox = workingBox;

    const subtitleBox = document.createElement('div');
    subtitleBox.classList.add('mooseSubtitleBox');
    subtitleBox.style.display = 'none';
    // Trap mouse events so user can select and copy text from the subtitle box without
    // unintentionally interacting with the background (panning, selecting nodes, etc.)
    subtitleBox.addEventListener('mousedown', e => e.stopPropagation());
    subtitleBox.addEventListener('click', e => e.stopPropagation());
    subtitleBox.addEventListener('dblclick', e => e.stopPropagation());
    const stBoxContainer = document.createElement('div');
    stBoxContainer.classList.add('mooseSubtitleBoxContainer');
    stBoxContainer.appendChild(subtitleBox);
    this.div.appendChild(stBoxContainer);
    this.subtitleBox = subtitleBox;

    // Scrolling
    this.div.addEventListener('wheel', function(e){return forest.getMouse().mousescroll(e)});

    // Remnants of an experiment with touch inputs (conclusions? don't remember...):
    /*
    this.div.onpinch = function(event){console.log('pinch');};
    this.div.addEventListener('gestureend', function(e) {
        if (e.scale < 1.0) {
            // User moved fingers closer together
            console.log('closer');
        } else if (e.scale > 1.0) {
            // User moved fingers further apart
            console.log('farther');
        }
    }, false);
    */

    // Overview Panel
    // If overview parameters were given, use those; otherwise,
    // build in bottom-left corner, but hide initially.
    var opParams = params.overview || {position: 'bl', hide: true};
    this.buildOverviewPanel(opParams);

};

Floor.prototype = {

    showWorkingGIF : function(/* bool */ b) {
        if (b) {
            var w = this.getWidth(), h = this.getHeight(),
                L = (w/2 - 100), T = (h/2 - 100);
            this.workingBox.style.left = L + 'px';
            this.workingBox.style.top = T + 'px';
            this.workingBox.style.display = 'block';
        } else {
            this.workingBox.style.display = 'none';
        }
    },

    buildOverviewPanel : function(params) {
        //console.log(params);

        // Check position.
        var pos = params.position,
            pos_names = {
                tl: "Top-Left",
                tr: "Top-Right",
                bl: "Bottom-Left",
                br: "Bottom-Right"
            };
        console.assert(pos in pos_names, "Invalid overview position: ", pos);
        this.overviewPos = pos;

        var pos_class = 'mooseOverviewInset-' + pos;
        var panel = document.createElement('div');
        panel.classList.add('mooseOverviewInset');
        panel.classList.add(pos_class);
        // Don't want (dbl)clicks to pass through to the main viewing area.
        panel.addEventListener('dblclick', e => e.stopPropagation());
        panel.addEventListener('click', e => e.stopPropagation());
        this.overviewPanel = panel;

        const ovPanelTabGroup = document.createElement('div');
        ovPanelTabGroup.classList.add('mooseInsetTabGroup');
        ovPanelTabGroup.innerHTML = `
            <span class="mooseInsetTab mooseInsetTab-selected" data-moose-inset-tab="nbhd">Neighborhood</span>
            <span class="mooseInsetTab" data-moose-inset-tab="ovvw">Overview</span>
        `;
        this.ovPanelTabGroup = ovPanelTabGroup;
        panel.appendChild(ovPanelTabGroup);

        const nvSocket = document.createElement('div');
        const ovSocket = document.createElement('div');
        nvSocket.classList.add('mooseInsetContentPane', 'mooseNbhdview', 'mooseInsetContentPane-selected');
        ovSocket.classList.add('mooseInsetContentPane');
        nvSocket.setAttribute('data-moose-inset-content', 'nbhd');
        ovSocket.setAttribute('data-moose-inset-content', 'ovvw');
        panel.appendChild(nvSocket);
        panel.appendChild(ovSocket);

        this.nbhdview = new Nbhdview(nvSocket, this.forest, this);
        this.overview = new Overview(ovSocket, this.forest, this);

        // Context menu
        if (this.contextMenuPlugin) {
            this.contextMenuPlugin.makeOverviewInsetContextMenu(panel, pos_names, this.overviewPos);
        }

        // Attach to main div.
        this.div.appendChild(panel);

        // Activate tabs.
        const tabs = ovPanelTabGroup.querySelectorAll('.mooseInsetTab');
        for (let tab of tabs) {
            tab.addEventListener('mousedown', e => e.stopPropagation());
            tab.addEventListener('click', e => {
                const name = e.target.getAttribute('data-moose-inset-tab');
                this.selectInsetTab(name);
                //e.preventDefault();
                e.stopPropagation();
                //return false;
            });
        }

        this.selectInsetTab(params.tab || 'nbhd');

        // Set visibility.
        if (params.hide) {
            this.showOverviewPanel(false);
        } else {
            this.showOverviewPanel(true);
        }
    },

    quietTabGroup : function(b) {
        if (b) {
            this.ovPanelTabGroup.classList.add('tabGroupQuiet');
        } else {
            this.ovPanelTabGroup.classList.remove('tabGroupQuiet');
        }
    },

    selectInsetTab : function(name0) {
        const panel = this.overviewPanel;
        const tabs = panel.querySelectorAll('.mooseInsetTab');
        const panes = panel.querySelectorAll('.mooseInsetContentPane');
        for (let tab of tabs) {
            const name = tab.getAttribute('data-moose-inset-tab');
            if (name === name0) {
                tab.classList.add('mooseInsetTab-selected');
            } else {
                tab.classList.remove('mooseInsetTab-selected');
            }
        }
        for (let pane of panes) {
            const name = pane.getAttribute('data-moose-inset-content');
            if (name === name0) {
                pane.classList.add('mooseInsetContentPane-selected');
            } else {
                pane.classList.remove('mooseInsetContentPane-selected');
            }
        }
        switch (name0) {
            case 'nbhd':
                this.nbhdview.redraw();
                break;
            case 'ovvw':
                this.overview.jog();
                break;
        }
    },

    setOverviewPos : function(desiredPos) {
        //console.log('move overview to ', desiredPos);
        var panel = this.overviewPanel,
            currentPos = this.overviewPos,
            currentClass = 'mooseOverviewInset-' + currentPos,
            desiredClass = 'mooseOverviewInset-' + desiredPos;
        panel.classList.remove(currentClass);
        panel.classList.add(desiredClass);
        this.overviewPos = desiredPos;
        // Enable/disable movement items
        if (this.contextMenuPlugin) {
            this.contextMenuPlugin.setOverviewPos(desiredPos);
        }
    },

    getNbhdview : function() {
        return this.nbhdview;
    },

    getOverview : function() {
        return this.overview;
    },

    getOverviewPos : function() {
        return this.overviewPos;
    },

    getOverviewDims : function() {
        // FIXME: for now, dimensions are hard-coded.
        return [moose.overviewInsetWidth, moose.overviewInsetHeight];
    },

    showOverviewPanel : function(b) {
        var panel = this.overviewPanel;
        if (b) {
            panel.classList.remove('hidden');
            this.nbhdview.redraw();
            this.overview.redraw();
        } else {
            panel.classList.add('hidden');
        }
        if (this.contextMenuPlugin) {
            this.contextMenuPlugin.noteOverviewVisibility(b);
        }
    },

    overviewPanelIsVisible : function() {
        return ! this.overviewPanel.classList.contains('hidden');
    },

    toggleOverview : function() {
        var vis = this.overviewPanelIsVisible();
        this.showOverviewPanel(!vis);
    },

    setSelectionManager : function(selmgr) {
        this.nbhdview.setSelectionManager(selmgr);
    },

    getActiveInsetTab : function() {
        const tab = this.ovPanelTabGroup.querySelector('.mooseInsetTab-selected');
        return tab.getAttribute('data-moose-inset-tab');
    },

    describeOverviewPanelState : function() {
        return {
            position: this.getOverviewPos(),
            tab: this.getActiveInsetTab(),
            hide: !this.overviewPanelIsVisible(),
        };
    },

    /* If the overview panel is visible, then it obscures one corner of the view box.
     * The unobscured portion is then somewhat "Utah-shaped," and contains two (overlapping)
     * maximal rectangles. Each of these is obtained by deleting either the entire horizontal
     * strip or the entire vertical strip in which the overview inset lies.
     *
     * If the overview panel is not visible, then the entire view box is unobscured.
     *
     * This method returns an Array of Rectangles of length 2 or 1, according to
     * which of the above cases we are in, respectively. The Rectangles give the maximal
     * unobscured view rects, in viewspace coordinates.
     */
    getMaximalViewRects : function() {
        var rects = [],
            W0 = this.getWidth(),
            H0 = this.getHeight();
        if (this.overviewPanelIsVisible()) {
            var pos = this.getOverviewPos(),
                dims = this.getOverviewDims(),
                iw = dims[0],
                ih = dims[1],
                portrait = new Rectangle(0, 0, W0 - iw, H0),
                landscape = new Rectangle(0, 0, W0, H0 - ih);
            switch(pos) {
            case 'tl':
                portrait.translate(iw, 0);
                landscape.translate(0, ih);
                break;
            case 'tr':
                landscape.translate(0, ih);
                break;
            case 'bl':
                portrait.translate(iw, 0);
                break;
            }
            rects.push(portrait);
            rects.push(landscape);
        } else {
            // When the overview panel is not visible, we just have one maximal view
            // rect, occupying the entire view box.
            rects.push(new Rectangle(0, 0, W0, H0));
        }
        return rects;
    },

    /*
    * Pass an integer n:
    *   n == 0: do not allow browser scrolling ever
    *   n == 1: allow browser to scroll only if shift is held down
    *   n == 2: allow scroll only if shift is NOT held down
    *   n == 3: always allow browser to scroll
    */
    allowBrowserScrolling : function(n) {
        this.div.onmousewheel = function(event){
            if (n === 0) {
                return false;
            } else if (n === 3) {
                return true;
            } else if (event.shiftKey) {
                return n === 1;
            } else {
                return n === 2;
            }
        };
    },

    getID : function() {
        return this.id;
    },

    // Node also has this method, and returns true.
    // Useful for determining whether the owner of a decaying node
    // is a node or the floor.
    isNode : function() {
        return false;
    },

    getWidth : function() {
        return this.div.offsetWidth;
    },

    getHeight : function() {
        return this.div.offsetHeight;
    },

    /*
    * Return the global coords of the point that is centred
    * left-to-right and one quarter of the way down from the top
    * in this Floor's display div.
    */
    getCentreHighPoint : function() {
        var W = this.getWidth(), H = this.getHeight();
        var p = [W/2, H/4];
        return this.vbToGlobal(p);
    },

    addViewportListener : function(obj) {
        var id = obj.getID();
        this.viewportListeners[id] = obj;
    },

    addMoveListener : function(obj) {
        var id = obj.getID();
        this.moveListeners[id] = obj;
    },

    addEdge : function(edge) {
        var svg = edge.getSVG();
        this.addEdgeSVG(svg);
        // We keep a set of edges too.
        var dsc = edge.getDesc();
        this.edges[dsc] = edge;
    },

    addEdgeSVG : function(svg) {
        this.edgeGroup.appendChild(svg);
    },

    addNode : function(node) {
        // Add graphical representation of node.
        var div = node.getDiv();
        this.addNodeDiv(div);
        // Add logical representation of node.
        var uid = node.getUID();
        this.roots[uid] = node;
    },

    addNodeDiv : function(div) {
        this.divLayer.appendChild(div);
    },

    writeVersionedForestRepn : function(filter_special= true) {
        const repn = {};
        for (let uid of Object.keys(this.roots)) {
            if (filter_special && uid.slice(0, 8) === 'special.') continue;
            const deduc = this.roots[uid];
            const vlp = `${uid}@${deduc.getVersion()}`;
            repn[vlp] = deduc.writeVersionedTreeRepn();
        }
        return repn;
    },
    
    buildDeducTree : function() {
        const tree = {
            children: [],
        };
        for (let deduc of Object.values(this.roots)) {
            tree.children.push(deduc.buildDeducTree());
        }
        return tree;
    },

    /// Remove the logical -- but not graphical -- representaiton
    /// of the passed node.
    removeNodeLogicalRep : function(node) {
        var uid = node.getUID();
        delete this.roots[uid];
    },

    removeNodeGraphicalRep : function(node) {
        var x = node.getDiv();
        this.divLayer.removeChild(x);
    },

    removeEdgesLogicalRep : function(edges) {
        for (var dsc in edges) {
            delete this.edges[dsc];
        }
    },

    clearSelection : function() {
        this.forest.getSelectionManager().clear();
    },

    reset : function() {
        // Selection
        this.clearSelection();
        // Roots
        for (var uid in this.roots) {
            var node = this.roots[uid];
            this.removeNodeGraphicalRep(node);
        }
        this.roots = {};
        // Edges
        this.forest.removeEdgesGraphicalRep(this.edges);
        this.edges = {};
        //this.resetView();
    },

    resetView : function() {
        // View
        this.x = 0; this.y = 0; this.zs = 1;
        this.move(); // updates homeX and homeY
        this.roam();
    },

    setCoordsOutputElement : function(elt) {
        this.coordsOutput = elt;
    },

    setZoomOutputElement : function(elt) {
        this.zoomOutput = elt;
    },

    /// TODO: uniformise terminology; probably we should
    /// always say 'root' instead of 'node', for the floor;
    /// e.g. 'addRoot' method instead of 'addNode'.
    getAllRoots : function() {
        return moose.objectUnion({},this.roots);
    },

    getAllEdges : function() {
        return moose.objectUnion({},this.edges);
    },


    /* Coordinates

    (19 Apr 2019) These comments will be at odds with those written under
    "Zooming" below. Both are correct; here I want to describe things again,
    in a way that seems better (simpler) to me now.

    There are two spaces:

        realspace: this is where boxes and connectors live
        viewspace: coords in the "glass pane" through which the user looks,
                   and where mouse clicks and drags take place

    At all times we have a "floor transformation" (a, b, c), which means

                    scale(c) translate(a, b)

    (working from right to left, i.e. do the translation first, then scale)
    and this is the transformation from realspace to viewspace.

    The parameters (a, b, c) are stored in the Floor instance under
    (this.x, this.y, this.zs). [In a future redesign, might rename these.]

    Thus, in order to go back and forth between points in realspace and points
    in viewspace, we have the following two linear transformations:

    Realspace to Viewspace:

            realspace (r, s) |--> viewspace ( c*(r + a), c*(s + b) )

                    [c 0 ac][r]   [cr + ac]   [u]
                    [0 c bc][s] = [cs + bc] = [v]
                    [0 0  1][1]   [   1   ]   [1]

    We may refer to the matrix in this transformation as V(a, b, c).

    Viewspace to Realspace:

            viewspace (u, v) |--> realspace (-a + u/c, -b + v/c)

                    [1/c  0  -a][u]   [u/c-a]   [r]
                    [ 0  1/c -b][v] = [v/c-b] = [s]
                    [ 0   0   1][1]   [  1  ]   [1]

    We may refer to the matrix in this transformation as R(a, b, c).
     */

    /* Map a point (r, s) in realspace into viewspace.
     * You may provide a floor transformation abc = [a, b, c]; otherwise the current one is used.
     */
    realspace2viewspace : function(rs, abc) {
        var r = rs[0],
            s = rs[1];
        var a = abc ? abc[0] : this.x,
            b = abc ? abc[1] : this.y,
            c = abc ? abc[2] : this.zs;
        var u = c*(r + a),
            v = c*(s + b);
        return [u, v];
    },

    /* Map a point (u, v) in viewspace into realspace.
     * You may provide a floor transformation abc = [a, b, c]; otherwise the current one is used.
     */
    viewspace2realspace : function(uv, abc) {
        var u = uv[0],
            v = uv[1];
        var a = abc ? abc[0] : this.x,
            b = abc ? abc[1] : this.y,
            c = abc ? abc[2] : this.zs;
        var r = u/c - a,
            s = v/c - b;
        return [r, s];
    },

    /* Map a rectangle in realspace into viewspace.
     * Makes a _new_ Rectangle; does not alter the old one.
     */
    realrect2viewrect : function(rect, abc) {
        var rs = rect.pos();
        var uv = this.realspace2viewspace(rs, abc);
        var c = abc ? abc[2] : this.zs;
        var w = c*rect.w,
            h = c*rect.h;
        return new Rectangle(uv[0], uv[1], w, h);
    },

    /* Map a rectangle in viewspace into realspace.
     * Makes a _new_ Rectangle; does not alter the old one.
     */
    viewrect2realrect : function(rect, abc) {
        var uv = rect.pos();
        var rs = this.viewspace2realspace(uv, abc);
        var c = abc ? abc[2] : this.zs;
        var w = rect.w/c,
            h = rect.h/c;
        return new Rectangle(rs[0], rs[1], w, h);
    },

    /*
    * Zooming:
    
    There are four coordinate spaces:

     global coordinates : the global space where all nodes live
     local coordinates  : coords of a node within its parent node
     client coordinates : coords rel to ULC of browser window area
     viewbox coordinates: client coords minus client ULC of graphArea

    Let (fx, fy) be the current offset of the floor, and zs the zoom scale.
    Since (-fx,-fy) is always to be the point at the origin (by which I
    will always mean the ULC of the graphArea), we make our floor
    transformation a translation of (fx,fy) followed by a scaling by zs.
    That is,

        scale(zs) translate(fx, fy).

    But the question then is how to adjust (fx,fy,zs) in reponse to pan
    and zoom actions.

    Panning is easy. For a pan of (dx,dy) /in viewbox coords/, the
    adjustment is:

      fx <- fx + dx/zs
      fy <- fy + dy/zs
      zs <- zs

    E.g. if zs = 0.5, then pan of dx = 10 in viewbox coords should
    result in all nodes moving 20 px to the right.

    Zooming: here we update not only zs but also fx,fy,
    so that it looks as though the scaling took place around a desired point,
    (x0, y0). If the mouse pointer is currently positioned somehwere over the
    viewbox, then that is the best point for (x0, y0). Otherwise, we can take
    the centre point of the viewbox.

        Let (x0, y0) be desired point around which to zoom
        Suppose zs <- zs*k
        
    The net result we want is the same as that achieved by:

        tr(x0,y0) sc(k) tr(-x0,-y0) sc(zs) tr(fx,fy)

    (as usual, the transformations are applied from right to left),
    and we just need three algebraic rules to let us put this into the form
    we want, namely:

        tr(dx,dy) sc(a) = sc(a) tr(dx/a,dy/a)

        tr(p,q) tr(r,s) = tr(p+r,q+s)

        sc(a) sc(b) = sc(ab)

    Using these, we find:

        tr(x0,y0) sc(k) tr(-x0,-y0) sc(zs) tr(fx,fy)

        = sc(k) tr(x0/k,y0/k) tr(-x0,-y0) sc(zs) tr(fx,fy)

        = sc(k) tr(x0 * (1-k)/k, y0 * (1-k)/k) sc(zs) tr(fx,fy)

        = sc(k) sc(zs) tr( x0 * (1-k)/(zs*k), y0 * (1-k)/(zs*k) ) tr(fx,fy)

        = sc(k*zs) tr( fx + x0 * (1-k)/(zs*k), fy + y0 * (1-k)/(zs*k) )

    So the rule is:

        fx <- fx + x0 * (1-k)/(zs*k)
        fy <- fy + y0 * (1-k)/(zs*k)
        zs <- zs*k
    */
    zoom : function(dir, event) {
        //console.log('zoom');
        var k = 1;
        if (dir=='out') {
            k = 1/this.zoomFactor;
        } else if (dir=='in') {
            k = this.zoomFactor;
        }
        if (k!=1) {
            // Decide the point (x0, y0) around which we zoom
            var x0 = 0, y0 = 0;
            if (event===undefined) {
                // If we didn't get an event, then we don't know where the
                // pointer is, so we zoom around the center of the viewbox.
                var W = this.div.clientWidth, H = this.div.clientHeight;
                x0 = W/2;
                y0 = H/2;
            } else {
                // If we did get an event, then we zoom around the place where
                // the pointer lies.
                // Note: we can't use the event's offsetX, offsetY, since these
                // are relative to whatever div the pointer happens to lie over;
                // in particular, when the pointer lies over some node, then we
                // will get the wrong values.
                // So we use client coords instead.
                var rect = this.div.getBoundingClientRect();
                x0 = event.clientX - rect.left;
                y0 = event.clientY - rect.top;
            }
            var a = (1-k)/(k*this.zs);
            this.x += a*x0; this.y += a*y0;
            this.zs *= k;
            // Pan control:
            if (this.panMode===moose.panMode_Controlled
                && this.forest.getLayoutMethod()===moose.layoutMethod_OrderedList) {
                // If in controlled pan mode, keep contents centered.
                var e = this.computeEmptyViewboxSpace(),
                    w = e[0],
                    h = e[1],
                    b = this.forest.getCurrentVisibleBBoxXYWH(),
                    xb=b[0], yb=b[1], wb=b[2], hb=b[3];
                if (w > 0) this.x = w/2 - xb;
                if (h > 0) this.y = h/2 - yb;
            }
            // Finally, make the move and update the view.
            this.move('zoom');
            this.roam();
        }
    },

    /*
    * Compare the bounding box of currently visible nodes to the space
    * that can be displayed in the viewbox under the supplied zoom level (or
    * the current zoom level if none is supplied).
    * Report how much excess space there is in each dimension.
    */
    computeEmptyViewboxSpace : function(zoomlevel) {
        //var b = this.forest.getCurrentVisibleBBoxXYWH(),
        var b = this.forest.updateCurrentVBB(),
            xb=b[0], yb=b[1], wb=b[2], hb=b[3],
            W0 = this.getWidth(), H0 = this.getHeight(),
            zs = zoomlevel===undefined ? this.zs : zoomlevel,
            W1 = W0/zs, H1 = H0/zs,
            W2 = W1 - wb, H2 = H1 - hb;
        return [W2, H2];
    },

    // 21 Jan 2019: Unifying movement by putting both SVG and div layer
    // inside global container. So for now we no longer need a separate
    // SVG transform.
    /*
    writeSVGTransform : function() {
        var s = '';
        s += 'scale('+this.zs+'),';
        var eps = 0.001;
        var x = Math.abs(this.x) < eps ? 0 : this.x;
        var y = Math.abs(this.y) < eps ? 0 : this.y;
        s += 'translate('+x+','+y+')';
        return s;
    },
    */

    // The difference between CSS and SVG transforms is that
    // for CSS you use spaces, not commas, to separate the
    // parts of the transform, and you write px for the translation.
    writeCSSTransform : function() {
        var s = '';
        s += 'scale('+this.zs+')';
        // If you write a number with scientific notation
        // you will get an error. So if any coordinate is close
        // enough to zero, then just set it to exactly 0.
        var eps = 0.001;
        var x = Math.abs(this.x) < eps ? 0 : this.x;
        var y = Math.abs(this.y) < eps ? 0 : this.y;
        s += ' translate('+x+'px,'+y+'px)';
        return s;
    },

    // BGDoubleClickListener interface method
    noteBGDoubleClick : function() {
        this.viewVisibleNodes();
    },

    // Change the viewbox so that all visible (i.e. visible in the
    // sense that they are not "hidden nodes") nodes can be seen.
    viewVisibleNodes : function(zoomLimit) {
        var v = this.forest.getAllVisibleNodes();
        //console.log(v);
        if (moose.objectSize(v)==0) return;
        var C = this.showcaseNodesCoords(v);
        var x1=C[0], y1=C[1], zs1=C[2];
        if (zoomLimit && zs1 > zoomLimit) {
            zs1 = zoomLimit;
        }
        this.zs = zs1;
        this.x = x1; this.y = y1;
        this.move(); // updates homeX and homeY
        this.roam();
    },

    /*
    * Centre the viewbox on the set of passed nodes.
    */
    showcaseNodes : function(nodes, scalar) {
        var C = this.showcaseNodesCoords(nodes, scalar);
        var x1=C[0], y1=C[1], zs1=C[2];
        this.zs = zs1;
        this.x = x1; this.y = y1;
        this.move(); // updates homeX and homeY
        this.roam();
    },

    /* Take an arbitrary zoom scale and turn it into the closest integer power of
     * our fixed zoomFactor that is less than or equal to the given one. We err on
     * the side of "too small" since "too large" usually means that part of what you
     * wanted to see will wind up off screen.
     */
    discretizeZoomScale : function(z) {
        var zf = this.zoomFactor;
        var r = Math.log(z)/Math.log(zf);
        // Now we want to take the floor of r, but we use a "forgiving floor".
        // This means that if r is very close to the next integer up, then we round up.
        // This is a hack, designed to make this function idempotent.
        // Better would be sth like Python Markupsafe, where we could mark a zoom scale as "already discretized."
        var c = Math.ceil(r);
        if (c - r < 0.01) {
            r = c;
        } else {
            r = Math.floor(r);
        }
        var zs = Math.pow(zf, r);
        return zs;
    },

    /* param squarePegDims: [w, h] for box that you want to fit into other box
     * param roundHoleDims: [w, h] for the other box
     * param scalar: if you want to scale the ideal zoom factor we compute, you can.
     *               Default: 1.
     * param ipzf: boolean saying whether you want an integer power of the Floor's zoom factor.
     *              Default: true.
     *
     * We compute and return the largest possible zoom scale that will allow the square peg
     * to fit into the round hole.
     */
    computeMaximalZoomScale : function(squarePegDims, roundHoleDims, scalar, ipzf) {
        // Grab dims.
        var wb = squarePegDims[0],
            hb = squarePegDims[1],
            W0 = roundHoleDims[0],
            H0 = roundHoleDims[1];
        // Set defaults.
        if (scalar === undefined) scalar = 1;
        if (ipzf === undefined) ipzf = true;
        // In words: if the inside box is "more landscapy" than the outside box,
        // then the width controls; if it is "more portraity", then the height controls.
        var z = wb/hb >= W0/H0 ? W0/wb : H0/hb;
        // Apply scalar.
        z = scalar * z;
        // Adjust to an integer power of the zoomFactor?
        if (ipzf) z = this.discretizeZoomScale(z);
        return z;
    },

    /* Compute view coordinates according to the `view` parameters from a call to Forest.requestState.
     *
     * In order to understand the `objects` and `named` parameters, it is necessary to understand that this
     * set of parameters may have undergone an "enrichment" process. In particular, the set of objects to be
     * viewed may have been enlarged or augmented in some way. In that case, the `objects` parameter is the
     * enlarged or augmented set of objects to be viewed, while the `named` parameter records the original
     * set, given by the user, prior to the augmentation.
     *
     * These parameters are most easily understood in terms of the intended use case; namely, that `objects`
     * be obtained from `named` by including all the _neighbors_ (along deduction or flow arcs) of the boxes
     * listed in `named`. In that case, it is easy to understand that, for example, the `core` and `center`
     * parameters have options to control the pan and zoom based on just the set of `named` boxes, allowing
     * the neighbors thereof not to affect these calculations.
     *
     * Parameters:
     *
     * objects: '<all>' means you want to view everything on the board.
     *      Otherwise this should be an array of libpaths of nodes and deducs that you want to view.
     *
     *      Default: undefined
     *
     * named: as described above, if the `objects` parameter records an augmented set of objects to be viewed,
     *      this parameter will record the original set, prior to augmentation.
     *
     *      Default: undefined
     *
     * core: If a lower zoom bound has been set (see `minZoom` below), and if a zoom level less than this
     *      lower bound would be necessary in order to fit all desired `objects` into the padded viewbox, then
     *      we will attempt instead only to fit the `core` objects into the padded viewbox, i.e. only those
     *      objects listed under this parameter.
     *
     *      Accepts either an array of libpaths, or else keyword `<named>`. The latter means that the core
     *      objects are those listed in the `named` parameter.
     *
     *      Default: '<named>'
     *
     * center: Indicates on which objects the view should be centered *if centering*. (See `panPolicy` below.)
     *      May be either an array of libpaths, or else one of the keywords:
     *          '<all>': center on all the nodes named in `objects`
     *          '<core>': center on all the nodes named in `core`
     *          '<named>': center on all the nodes named in `named`
     *
     *      Note: If `center` is different from '<all>' then the final result may be such that a larger zoom scale
     *      would have permitted the centered nodes all to fit in the padded viewbox.
     *
     *      Default: '<all>'
     *
     * viewboxPaddingPx: Set a constant padding for the viewbox, in pixels.
     *
     *      Default: undefined
     *
     * viewboxPaddingPercent: Set a variable padding as a percentage of the corresponding viewbox dimension (x or y).
     *
     *      Default: 5%.
     *
     * maxZoom: The view will not be zoomed in any more than this, even if all the nodes to be viewed could
     *      fit in the padded viewbox at a closer zoom level.
     *
     *      Default: 1.4
     *
     * minZoom: This is not a hard minimum. If all attempts to fit the whole set of objects to be viewed into
     *      view would require a zoom level less than this value (if set), then an attempt will be made to
     *      instead view the `core` set of objects (see above) at a higher zoom level.
     *
     *      Default: null (no minimum)
     *
     * panPolicy: Must be equal to one of the constants,
     *          moose.autopanPolicy_CenterAlways
     *          moose.autopanPolicy_CenterNever
     *          moose.autopanPolicy_CenterDistant
     *      See doctext where these constants are defined.
     *
     *      Default: moose.autopanPolicy_CenterDistant
     *
     * insetAware: If there is an inset pane (such as for an overview) currently obscuring one corner of the
     *      viewbox, then we attempt to work around it.
     *
     *      The approach is simple-minded, and a more sophisticated optimization scheme awaits future work.
     *
     *      We simply choose the "better" of the two alternative viewboxes obtained by removing either the
     *      horizontal or the vertical strip in which the inset window lies. Here, "better" means that it
     *      permits a larger maximum zoom value.
     *
     *      Default: true
     *
     */
    computeViewCoords : function(userParams) {
        // Start with default parameter values.
        var par = {
            core: '<named>',
            center: '<all>',
            viewboxPaddingPercent: 5,
            maxZoom: this.forest.isInUnifiedMode() ? 1.4 : null,
            minZoom: null,
            panPolicy: moose.autopanPolicy_CenterDistant,
            insetAware: true,
        };
        // And now override with user-supplied values.
        Object.assign(par, userParams);

        // The purpose of this method is to compute the desired floor transformation (a1, b1, c1).
        var a1 = null, b1 = null, c1 = null;

        // As a preparatory step, we must resolve the parameters
        //   objects
        //   core
        //   center
        // that indicate the boxes of interest, into "node-lookups", i.e. objects of the form {uid:Node}.
        var objLookup = null,
            namedLookup = null,
            coreLookup = null,
            centerLookup = null;

        if (par.objects === '<all>') {
            objLookup = this.forest.getAllVisibleNodes({patient: true});
            namedLookup = objLookup;
        } else {
            objLookup = this.forest.getNodes(par.objects);
            namedLookup = this.forest.getNodes(par.named);
        }

        if (par.core === '<named>') {
            coreLookup = namedLookup;
        } else if (par.core !== undefined) {
            coreLookup = this.forest.getNodes(par.core);
        }

        if (par.center === '<all>') {
            centerLookup = objLookup;
        } else if (par.center === '<core>') {
            centerLookup = coreLookup;
        } else if (par.center === '<named>') {
            centerLookup = namedLookup;
        } else if (par.center !== undefined) {
            centerLookup = this.forest.getNodes(par.center);
        } else {
            // Actually centerLookup always should be defined.
            centerLookup = objLookup;
        }

        // We may also be interested in the corresponding rectangles in real space, i.e. the
        // bounding boxes of these sets of nodes.
        var objRect = this.forest.nodesBBoxRect(objLookup),
            coreRect = coreLookup ? this.forest.nodesBBoxRect(coreLookup) : null,
            centerRect = this.forest.nodesBBoxRect(centerLookup);


        // Phase I.
        // Our goal in this phase is to decide on the triple (c1, rr, vr) consisting of:
        //   c1: the desired scaling for the floor transformation;
        //   rr: "real rect" the rectangle in realspace that is to be "viewed" (see Phase II);
        //   vr: "view rect" the rectangle in viewspace within which rr is to be viewed.
        var rr = null,
            vr = null;

        // Two booleans govern this phase, for a total of four possibilities.
        // The first we call `coreMode`, and it means that two things are both true:
        //  (i)  the user has defined a `core` set, and
        //  (ii) the user has set a minimum zoom level.
        // Either of these two optional parameters is meaningless without the other.
        var coreMode = par.core && par.minZoom;

        // The second boolean we call `insetMode`, and it also means that two things are both true:
        //  (i)  the parameter `insetAware` is true, and
        //  (ii) this window is currently showing an inset pane.
        var insetMode = par.insetAware && this.overviewPanelIsVisible();

        // Get all possible view rects. This is an array of length 2 or 1, according to whether
        // we are in inset mode or not, resp.
        var viewrects = this.getMaximalViewRects();
        // Set padding in all viewrects.
        if (par.viewboxPaddingPx) {
            var p = par.viewboxPaddingPx;
            for (var i in viewrects) viewrects[i].padByPixels(p, p);
        } else if (par.viewboxPaddingPercent) {
            var p = par.viewboxPaddingPercent;
            for (var i in viewrects) viewrects[i].padByPercent(p, p);
        }
        // Since there can only be one or two viewrects, it is easier to work with them by name.
        var r0 = viewrects[0],
            r1 = viewrects.length === 2 ? viewrects[1] : null;

        // Now we consider all the cases, based on the two booleans that say whether we are in coreMode and/or insetMode.
        // While the case logic is somewhat tricky, our basic task is simple: we will build an array of "triples" (z, r, v)
        // being a zoom scale, a realrect, and a viewrect. At the end, we will choose any triple with maximal zoom scale.
        var triples = [],
            // We introduce some abbreviations:
            maxZ = this.computeMaximalZoomScale.bind(this),
            A = objRect,
            B = coreRect,
            z0 = par.minZoom;
        // In all cases, one possibility is that we fit realrect A into viewrect r0.
        var m0 = maxZ(A.dims(), r0.dims());
        triples.push([m0, A, r0]);
        // Tricky: we may or may not have a viewrect r1 to consider. To uniformize the case handling, we initialize
        // the zoom level for viewrect r1 to -1, and so it will remain if r1 doesn't exist.
        var m1 = -1;
        if (insetMode) {
            // But if we are in inset mode, so viewrect r1 does exist, then we evaluate it.
            m1 = maxZ(A.dims(), r1.dims());
            triples.push([m1, A, r1]);
        }
        // We consider the coreRect B iff we are in coreMode _and_ in the one or possibly two cases we have already
        // considered, we did not get a zoom scale at or above the min zoom.
        if (coreMode && m0 < z0 && m1 < z0) {
            // In this case we proceed in a way parallel to what we did earlier.
            // We at least consider fitting B into r0.
            var n0 = maxZ(B.dims(), r0.dims());
            triples.push([n0, B, r0]);
            // And we consider fitting B into r1 iff there is an r1.
            var n1 = -1;
            if (insetMode) {
                n1 = maxZ(B.dims(), r1.dims());
                triples.push([n1, B, r1]);
            }
        }
        // Now just choose a triple with maximal zoom.
        var t = null,
            Z = -1;
        for (var i in triples) {
            var s = triples[i];
            if (s[0] > Z) {
                Z = s[0];
                t = s;
            }
        }
        // Finally we can take the zoom scale c1, the realrect rr, and the viewrect vr from this triple.
        c1 = t[0];
        rr = t[1];
        vr = t[2];
        // If a max zoom was set, scale down as needed.
        if (par.maxZoom) c1 = Math.min(c1, par.maxZoom);


        // Phase II.
        // Our goal in this phase is to determine the desired floor translation (a1, b1).
        // We arrive at this by deciding on a way to "view" real rect rr within view rect vr, at scaling c1.
        // There are three ways of viewing, called "inside", "true-centered" and "surrogate-centered".
        //
        // inside: This means that we make the minimal necessary adjustment to the existing
        //         floor translation (a0, b0) so that rr is seen inside vr (i.e. so that the
        //         image of rr under the realspace->viewspace transformation lies inside vr),
        //         at scaling c1.
        //
        // true-centered: This means that we choose that floor translation (a1, b1) that, at scaling c1,
        //                maps the center point of rr to the center point of vr.
        //
        // surrogate-centered: This means that the user has defined a `center` set of nodes, and we
        //                     replace rr with that set's bounding box, then work as in the true-centered case.

        // We will compute the desired translation as the existing one plus a differential.
        var a0 = this.x,
            b0 = this.y,
            dx = 0,
            dy = 0;
        // Whichever view method we wind up using, we will need to compute the rect V in real space
        // that would be visible in the chosen viewrect under the floor transformation (a0, b0, c1),
        // i.e. with existing translation but with the planned scaling c1.
        var V = this.viewrect2realrect(vr, [a0, b0, c1]);
        // Initially assume we are not centering.
        var centering = false;
        if (par.panPolicy === moose.autopanPolicy_CenterAlways) {
            // If it is the CenterAlways policy then we are centering.
            centering = true;
        } else {
            // Compute the "inside" translation (a1, b1).
            // This is the closest vector to the current translation (a0, b0) that would put rr inside V.
            // Does the left edge of rr lie left of that of V?
            if (rr.x < V.x) dx = V.x - rr.x;
            // Does the right edge fo rr lie right of that of V?
            else if (rr.X() > V.X()) dx = V.X() - rr.X();
            // Does the top edge of rr lie above that of V?
            if (rr.y < V.y) dy = V.y - rr.y;
            // Does the bottom edge of rr lie below that of V?
            else if (rr.Y() > V.Y()) dy = V.Y() - rr.Y();
            // Set the desired translation.
            a1 = a0 + dx;
            b1 = b0 + dy;
            // If we are using the CenterNever policy, then that's all there is to do.
            // But if it is the CenterDistant policy, then we need to decide whether the "inside" translation
            // counts as a "distant" one.
            if (par.panPolicy === moose.autopanPolicy_CenterDistant) {
                // Compute the box U in real space that would be visible under floor transform (a1, b1, c1).
                var U = this.viewrect2realrect(vr, [a1, b1, c1]);
                // If there is no intersection, then we consider this a "distant" move, i.e. one that throws away
                // all context, so we might as well center.
                if (U.isDisjointWith(V)) centering = true;
            }
        }
        if (centering) {
            // We always center on the centerRect (which may equal rr already, or may not).
            rr = centerRect;
            var cr = rr.centerPos(),
                cV = V.centerPos();
            dx = cV[0] - cr[0];
            dy = cV[1] - cr[1];
            a1 = a0 + dx;
            b1 = b0 + dy;
        }

        // Set controlled coords?
        if (this.panMode===moose.panMode_Controlled && this.forest.getLayoutMethod()===moose.layoutMethod_OrderedList) {
            // List view should be legible, so set zoom scale at least 1.
            c1 = Math.max(c1, 1);
            var cc = this.controlCoords(a1, b1, c1);
            a1 = cc[0];
            b1 = cc[1];
        }

        return [a1, b1, c1];
    },


    /*
    * Compute the x1, y1, and zs1 coordinates that define the new viewbox
    * we need in order to be able to view all the nodes in the passed
    * set.
    *
    * To be precise, we will never zoom in (if you want that, see the `showcaseNodesCoords` method);
    * we will zoom out as little as necessary (maybe not at all) so that the bounding box of the
    * desired set of nodes can fit into the current viewbox.
    *
    * As for translation, we will translate the minimum amount necessary so that all the nodes
    * that are to be viewed fit (with padding, from global `paddingForViewAdjustment`) into the
    * viewbox.
    *
    * NB: the x1,y1,zs1 we return simply describe the viewbox that is
    * needed, NOT the alterations dx,dy,zs1/zs0 by which the existing
    * one would need to be changed.
    */
    viewNodesCoords : function(nodes) {
        // bbox for nodes
        var b = this.forest.nodesBBoxXYWH(nodes);
        var xb=b[0], yb=b[1], wb=b[2], hb=b[3];
        // own dims and coords
        var x0=this.x, y0=this.y, zs0=this.zs;
        var W0 = this.getWidth(), H0 = this.getHeight();
        var p = this.paddingForViewAdjustment;
        W0 -= 2*p; H0 -= 2*p;
        // viewable global dims at current zoom scale:
        var W1 = W0/zs0, H1 = H0/zs0;
        // Compute new zoom scale.
        var zs1 = zs0;
        if (wb > W1 || hb > H1) {
            // Need to zoom out.
            zs1 = this.computeMaximalZoomScale([wb, hb], [W0, H0]);
        }
        // Compute new translation.
        var W2 = W0/zs1, H2 = H0/zs1, q = p/zs1;
        var wc = W2-wb, hc = H2-hb;
        // Box [q-x0, q-x0+wc] x [q-y0, q-y0+hc] is set of all
        // coords where ULC of b can go so b is visible (inside
        // padding). So adjust translation minimally to put it
        // in there, if it is not already there.
        var x1 = xb < q-x0 ? q-xb : xb > q-x0+wc ? q-xb+wc : x0;
        var y1 = yb < q-y0 ? q-yb : yb > q-y0+hc ? q-yb+hc : y0;
        // Done.
        return [x1,y1,zs1];
    },

    nodeIsOnScreen : function(uid) {
        var node = this.forest.getNode(uid),
            nodes = {uid: node},
            coords1 = this.viewNodesCoords(nodes),
            coords0 = this.getCoords(),
            d = this.distance(coords0, coords1);
        return d < 0.0001;
    },

    /*
    * Like viewNodesCoords function, except centres the nodes, and
    * zooms in as much as possible.
    *
    * EXCEPT: If a second argument is supplied, it should be a
    * scalar s between 0 and 1, then the ideal zoom factor will be scaled
    * by this.
    *
    * Therefore if you pass s = 1 the effect is unchanged; but if e.g.
    * you pass s = 0.5 then we will try to zoom so that the bounding
    * box of the showcased nodes fills only /half/ of the available
    * space, rather than the whole space.
    *
    * OR: You can set the scalar equal to -1, in which case we try
    * to compute a good scalar based on the size of the bounding box
    * to be viewed.
    *
    * The idea is as follows. Consider first the case in which the bounding box
    * to be viewed is very small. Maybe you have selected just a single node,
    * 50 pixels wide, and 20 pixels high. With `scalar = undefined`, you will get
    * a startling close-up view, with this tiny node magnified absurdly to fill the
    * entire screen. In such a case we might like `scalar = 0.1` to scale this node
    * back down to a more reasonable size.
    *
    * On the other hand, if the bounding box is large enough, then the computed zoom
    * scale is just fine. Perhaps we would say that, if the larger of the two dimensions
    * of the box is at least 500 pixels, then we will accept the computed zoom scale. Nothing
    * will look absurdly large in such a case.
    *
    * When you pass `scalar=-1` we enact these guidelines, based on M, the larger of the
    * two dimensions of the bounding box. If M <= 50, we scale down by 0.1. If M >= 500,
    * we do not scale down at all. In between, we linearly interpolate the scaling factor
    * from 0.1 up to 1.0. For example if M == 250 we will scale down to half of what the
    * zoom would otherwise have been.
    *
    */
    showcaseNodesCoords : function(nodes, scalar) {
        // set up scalar
        if (!scalar) scalar = 1;
        // bbox for nodes
        var b = this.forest.nodesBBoxXYWH(nodes);
        var xb=b[0], yb=b[1], wb=b[2], hb=b[3];
        // If scalar == -1, choose a good scalar based on
        // size of bounding box.
        if (scalar === -1) {
            var M = Math.max(wb, hb);
            // TODO: get these constants from a central settings file!
            var P0 = 50, P1 = 500;
            //
            if (M <= P0) {
                scalar = 0.1;
            } else if (M >= P1) {
                scalar = 1;
            } else {
                scalar = 0.1 + 0.9*(M-P0)/(P1-P0);
            }
        }
        // own dims
        var W0 = this.getWidth(), H0 = this.getHeight();
        var p = this.paddingForViewAdjustment;
        W0 -= 2*p; H0 -= 2*p;
        // Compute new zoom scale.
        // First compute maximal zoom scale z.
        var zs1 = this.computeMaximalZoomScale([wb, hb], [W0, H0], scalar);
        // Compute new translation, so that the node bbox is centered.
        var W2 = W0/zs1, H2 = H0/zs1, q = p/zs1;
        var wc = W2-wb, hc = H2-hb;
        var x1 = q - xb + wc/2;
        var y1 = q - yb + hc/2;
        // Done.
        return [x1,y1,zs1];
    },

    /*
    * Compute reasonable starting coordinates for use with List view.
    */
    computeListViewInitialCoords : function() {
        // We'll move to zoom level 1.
        var zs1 = 1.0,
            // As default coords, scroll to top-left
            b = this.forest.updateCurrentVBB(),
            visible_x = b[0],
            visible_y = b[1],
            x1 = -visible_x,
            y1 = -visible_y;
        // But if there is a selected node, try to display it.
        var node = this.forest.getSelectionManager().getSingletonNode();
        if (node) {
            var nb = node.getBBoxXYWH(),
                ny = nb[1],
                nh = nb[3],
                ncy = ny + nh/2,
                H = this.getHeight()/zs1;
            if (nh > H) {
                // Node is taller than viewbox.
                // Put top of node 20% of the way down the viewbox.
                y1 = -ny + H/5;
            } else {
                // Node is not taller than viewbox. Center it.
                y1 = -ncy + H/2;
            }
        }
        // Now control the coords at the desired zoom level.
        var cc = this.controlCoords(x1, y1, zs1);
        x1 = cc[0];
        y1 = cc[1];
        return [x1, y1, zs1];
    },

    /// Convenience method, to transition to viewing all currently
    /// visible nodes.
    viewAllVisibleNodesTransition : function() {
        var v = this.forest.getAllVisibleNodes();
        return this.viewNodesTransition(v);
    },

    /*
    * Perform a view transition to view the nodes in the given set.
    */
    viewNodesTransition : function(nodes) {
        var coords = this.viewNodesCoords(nodes);
        return this.transitionToCoords(coords).changing;
    },

    listViewTransition : function() {
        var coords = this.computeListViewInitialCoords();
        return this.transitionToCoords(coords).changing;
    },

    /**
     * Given an initial set of cooredinates [x0, y0, zs0] and
     * final set of coordinates [x1, y1, zs1], compute the distance
     * between these "points", by assigning z-coords for the different
     * zoom scales, based on an assumed distance between the eye and
     * the screen.
     */
    distance : function(p0, p1) {
        var x0 = p0[0], y0 = p0[1], zs0 = p0[2],
            x1 = p1[0], y1 = p1[1], zs1 = p1[2],
            e = moose.eyeToScreenDistance,
            z0 = e/zs0,
            z1 = e/zs1,
            dx = x1 - x0,
            dy = y1 - y0,
            dz = z1 - z0,
            dx2 = dx*dx,
            dy2 = dy*dy,
            dz2 = dz*dz,
            d = Math.sqrt(dx2 + dy2 + dz2);
        return d;
    },

    /* Another way of computing a "distance" between two points.
     * This time, we consider the projections of the two points into the (x,y)-plane,
     * and report their distance in that plane, adjusted by the geometric mean of the two zoom scales.
     */
    distance2 : function(p0, p1) {
        var x0 = p0[0], y0 = p0[1], zs0 = p0[2],
            x1 = p1[0], y1 = p1[1], zs1 = p1[2],
            dx = x1 - x0,
            dy = y1 - y0,
            dx2 = dx*dx,
            dy2 = dy*dy,
            d = Math.sqrt(dx2 + dy2),
            zs_gm = Math.sqrt(zs0*zs1),
            d_adj = d/zs_gm;
        return d_adj;
    },

    /*
    * We animate the view to the given coordinates (format [x, y, zs]).
    *
    * Pass an optional second arg, `duration` to control how long the transition takes.
    *   undefined: we use a default value.
    *   negative: we use the distance as the duration, for a 1 pixel/ms speed.
    *   Otherwise the given value is used.
    *
    * The `source` arg is optional. This may be defined for the sake of any `move listeners`
    * registered with the Floor, so that they can know the source of the movement.
    *
    * Return an info object with the following fields:
    *   changing: a boolean saying whether any view coordinates will actually change.
    *   distance: non-negative float giving the distance travelled in pixels.
    *   duration: non-negative float giving the time duration of the transition, in ms.
    */
    transitionToCoords : function(coords, duration, source) {
        // Current coords:
        var x0=this.x, y0=this.y, zs0=this.zs;
        // Coords to move to:
        var x1=coords[0], y1=coords[1], zs1=coords[2];
        // Distance to move:
        var distance = this.distance2([x0, y0, zs0], coords),
            changing = (distance > 0);
        //console.log('distance: ', distance);
        // Duration:
        if (duration === undefined) duration = moose.transitionDuration;
        if (duration < 0) duration = distance;
        // Set up the transition.
        var te = this.container  // "te" = "transition element"
        te.style.transitionProperty = 'transform';
        te.style.transitionDuration = duration + 'ms';
        //te.style.transitionTimingFunction = 'linear';
        // Record new coordinates.
        this.zs = zs1;
        this.x = x1; this.y = y1;
        this.move(source); // updates homeX and homeY
        // Notify.
        this.notifyViewportListenersOfTransition([x1, y1, zs1], duration);
        // Start the transition.
        var c = this.writeCSSTransform();
        te.style.transform = c;
        // Return info.
        var info = {
            changing: changing,
            distance: distance,
            duration: duration
        };
        // Queue the post-transition "clean up & report" action, with appropriate delay.
        var delay = changing ? duration + 100 : 0;
        var theFloor = this;
        setTimeout(function(){theFloor.postTransition()}, delay);
        // Return
        return info;
    },

    postTransition : function() {
        var te = this.container
        te.style.transitionProperty = '';
        te.style.transitionDuration = '';
        te.style.transitionTimingFunction = '';
        this.displayCoords();
        this.notifyViewportListeners();
    },

    formatNumForDisp : function(z) {
        return parseInt(''+Math.round(z),10);
    },

    formatPercentForDisp : function(z) {
        var p = this.formatNumForDisp(z*100);
        return p+'%';
    },

    displayCoords : function() {
        var co = this.coordsOutput;
        if (co) {
            var x0 = this.formatNumForDisp(this.x);
            var y0 = this.formatNumForDisp(this.y);
            var s = x0+','+y0;
            //console.log(s);
            co.innerHTML = s;
        }
        var zo = this.zoomOutput;
        if (zo) {
            var z0 = this.formatPercentForDisp(this.zs);
            //console.log(z0);
            zo.innerHTML = ''+z0;
        }
    },

    /* Get the bounding box, in XYWH format, for the viewport.
     *
     * param coords: Optional. If not given, we report the viewport box for the
     *               current floor coords. If given, should be an array [x, y, zs],
     *               and then we will give the viewport box for _those_ floor coords.
     */
    getViewportXYWH : function(coords) {
        var x = this.x,
            y = this.y,
            zs = this.zs;
        if (coords) {
            x = coords[0];
            y = coords[1];
            zs = coords[2];
        }
        var W = this.getWidth(),
            H = this.getHeight();
        var b = [-x, -y, W/zs, H/zs];
        return b;
    },

    /*
    * If you already have coordinates (X, y, zoom) in mind, and
    * you want to simply go there, with no fanfare, this is the
    * function to use.
    *
    * You may pass them separately, or as a triple.
    */
    gotoCoords : function(x, y, z) {
        if (y === undefined) {
            y = x[1];
            z = x[2];
            x = x[0];
        }
        this.x = x;
        this.y = y;
        // Adjust z to integer power of zoomFactor.
        this.zs = this.discretizeZoomScale(z);
        this.move();
        this.roam();
    },

    getCoords : function() {
        return [this.x, this.y, this.zs];
    },

    /* Return coordsinates with x and y rounded to integers, and
     * with the zoom scale truncated at the thousandths place.
     */
    getTruncatedCoords : function() {
        var coords = this.getCoords(),
            x = coords[0],
            y = coords[1],
            z = coords[2];
        x = Math.round(x);
        y = Math.round(y);
        z = Math.round(1000*z)/1000;
        coords = [x, y, z];
        return coords;
    },

    /*
    *  Keep proposed coordinates within controlled bounds.
    *   proposedX, proposedY give the desired coords, which may be changed
    *   requiredZoom says the zoom level at which the control should take place.
    *                If undefined, this defaults to the current zoom level.
    *
    *   return: controlled coords [x, y]
    */
    controlCoords : function(proposedX, proposedY, requiredZoom) {
        if (requiredZoom===undefined) {
            requiredZoom = this.zs;
        }
        var e = this.computeEmptyViewboxSpace(requiredZoom),
            w = e[0],
            h = e[1],
            b = this.forest.getCurrentVisibleBBoxXYWH(),
            xb=b[0], yb=b[1], wb=b[2], hb=b[3],
            x = proposedX,
            y = proposedY;
        if (w >= 0) {
            // If we have excess horizontal space, keep the board contents
            // centered horizontally.
            x = w/2 - xb;
        } else {
            // If we do not have excess horizontal space, we still want to
            // prevent scrolling any farther than necessary to see everything.
            // This means we want w-xb <= x <= -xb.
            //console.log(this.x, xb, wb);
            if (x < w-xb) x = w-xb;
            else if (x > -xb) x = -xb;
        }
        if (h >= 0) {
            // If we have excess vertical space, keep the board contents
            // centered vertically.
            y = h/2 - yb;
        } else {
            // Otherwise, like in the x-dimension, we want h-yb <= y <= -yb.
            if (y < h-yb) y = h-yb;
            else if (y > -yb) y = -yb;
        }
        return [x, y];
    },

    roam : function() {
        // If in controlled pan mode, then reset x and/or y as appropriate.
        if (this.panMode===moose.panMode_Controlled
            && this.forest.getLayoutMethod()===moose.layoutMethod_OrderedList) {
            var cc = this.controlCoords(this.x, this.y);
            this.x = cc[0];
            this.y = cc[1];
        }

        var c = this.writeCSSTransform();
        this.container.style.transform = c;

        this.displayCoords();
        this.notifyViewportListeners();
        //console.log(this.zs);
    },

    roamTo : function(x,y) {
        this.x = x; this.y = y;
        this.roam();
    },

    roamBy : function(dx,dy) {
        this.x = this.homeX + dx; this.y = this.homeY + dy;
        this.roam();
    },

    move : function(source) {
        this.homeX = this.x; this.homeY = this.y;
        this.notifyMoveListeners(source);
    },

    moveTo : function(x,y) {
        this.roamTo(x,y);
        this.move();
    },

    moveBy : function(dx,dy) {
        this.roamBy(dx,dy);
        this.move();
    },

    scrollPan : function(dx, dy) {
        this.roamBy(dx,dy);
        this.move('scroll');
    },

    getCurrentOffset : function() {
        return [this.x, this.y];
    },

    getHomeOffset : function() {
        return [this.homeX, this.homeY];
    },

    setClientOffset : function(x,y) {
        this.baseX = x; this.baseY = y;
        //console.log('base x,y: '+x+','+y);
    },

    /*
    * Compute baseX, baseY such that a mouse event occurring at
    * clientX, clientY occurs at (clientX-baseX, clientY-baseY) in
    * viewbox coordinates, i.e. coordinates relative to the ULC of
    * the graphArea element.
    * 
    * In other words, baseX, baseY are the client coords of the ULC
    * of the graphArea.
    */
    getBaseOffset : function() {
        /*
        var baseX = this.div.offsetLeft;
        var baseY = this.div.offsetTop;

        //debug
        baseX = 20; baseY = 0;
        //

        return [baseX, baseY];
        */
        return [this.baseX, this.baseY];
    },

    buildMarquee : function() {
        var marquee = document.createElementNS(moose.xhtmlns,'div');
        marquee.style.position = 'absolute';
        marquee.style.background = '#eee';
        marquee.style.border = '3px solid #aaa';
        marquee.style.opacity = '0.5';
        marquee.style.width = '0px';
        marquee.style.height = '0px';
        this.marquee = marquee;
    },

    /*
    * p = [u,v] = viewbox coordinates at which to show the marquee
    */
    showMarqueeAtVC : function(p) {
        // Convert to global coords.
        var g = this.vbToGlobal(p);
        var m = this.marquee;
        m.style.left = g[0]+'px';
        m.style.top  = g[1]+'px';
        this.divLayer.appendChild(m);
    },

    /*
    * Set the rectangle in viewbox coords for the marquee.
    */
    setMarqueeVCRect : function(u,v,w,h) {
        var g = this.vbToGlobal([u,v]);
        var x=g[0], y=g[1];
        var W=w/this.zs, H=h/this.zs;
        var m = this.marquee;
        m.style.left = x+'px'; m.style.top = y+'px';
        m.style.width = W+'px'; m.style.height = H+'px';
        this.marqueeGCRect = [x,y,W,H];
    },

    /*
    * Get the rectangle in global coords for the marquee.
    */
    getMarqueeGCRect : function() {
        return this.marqueeGCRect;
    },

    hideMarquee : function() {
        var m = this.marquee;
        this.divLayer.removeChild(m);
        m.style.width = '0px';
        m.style.height = '0px';
    },

    /*
    * The user has finished dragging out the marquee.
    * Now we compute the selection.
    * The passed boolean says whether the shift key was held
    * down at the time that the mouse was released.
    */
    computeMarqueeSelection : function(shiftKey) {
        // If shift key is not held down, then clear the current
        // selection.
        if (!shiftKey) {
            this.clearSelection();
        }
        // Add clickable nodes in the box to the selection.
        var nodes = this.getOnscreenNodes();
        var R = this.getMarqueeGCRect();
        var n = moose.objectSize(nodes);
        for (var uid in nodes) {
            var node = nodes[uid];
            if (node.isBounded() && node.overlapsGCRect(R)) {
                this.selectNode(node, true, n === 1);
            }
        }
    },

    /*
    * Return the set of nodes that are currently visible
    * in the display area.
    */
    getOnscreenNodes : function() {
        // Should actually keep track of what's visible and what's
        // not if performance becomes an issue.
        // For now we just return all nodes.
        return this.forest.nodes;
    },

    notifyViewportListeners : function() {
        for (var id in this.viewportListeners) {
            var L = this.viewportListeners[id];
            L.noteViewportChange();
        }
    },

    notifyViewportListenersOfTransition : function(coords, duration) {
        for (var id in this.viewportListeners) {
            var L = this.viewportListeners[id];
            L.noteViewportTransition(coords, duration);
        }
    },

    notifyMoveListeners : function(source) {
        for (var id in this.moveListeners) {
            var L = this.moveListeners[id];
            L.noteFloorMove(source, this.homeX, this.homeY, this.zs);
        }
    },

    /*
    * Transform a point p = [u,v] from viewbox coords into
    * global coords.
    *
    * Since (u,v) = sc(zs) tr(fx,fy) (x,y),
    * we have
    *     sc(1/zs) (u,v) = tr(fx,fy) (x,y)
    *     tr(-fx,-fy) sc(1/zs) (u,v) = (x,y).
    */
    vbToGlobal : function(p) {
        var u = p[0], v = p[1];
        var x = u/this.zs - this.x, y = v/this.zs - this.y;
        return [x,y];
    },

    getZoomScale : function() {
        return this.zs;
    },

    displayError : function(s) {
        this.errorBox.innerHTML = s;
        this.errorBox.style.display = 'inline';
    },

    clearError : function() {
        this.errorBox.innerHTML = '';
        this.errorBox.style.display = 'none';
    },

    displaySubtitle : function(s) {
        this.subtitleBox.innerHTML = s;
        this.subtitleBox.style.display = 'inline-block';
    },

    clearSubtitle : function() {
        this.subtitleBox.innerHTML = '';
        this.subtitleBox.style.display = 'none';
    },

    // Dead code
    /*
    fadeOutAndBack : function(hiding) {
        var dur = moose.transitionDuration;
        this.edgeGroup.style.transitionProperty = 'opacity';
        this.edgeGroup.style.transitionDuration = dur + 'ms';
        var theFloor = this;
        this.edgeGroup.addEventListener('transitionend',
            function(){theFloor.fadeOBCallback(hiding)},
        true);
        this.firstFadeCB = true;
        this.edgeGroup.style.opacity = '0';
    },

    fadeOBCallback : function(hiding) {
        var dur = moose.transitionDuration;
        if (this.firstFadeCB) {
            if (hiding) {
                this.edgeGroup.style.transitionDelay = (2*dur) + 'ms';
            } else {
                this.edgeGroup.style.transitionDelay = dur + 'ms';
            }
            this.edgeGroup.style.opacity = '1';
            this.firstFadeCB = false;
        } else {
            // TODO: clear the transition properties.
        }
    }
    */

};

// You can actually initialize with separate x, y, w, h, or
// with a tuple [x, y, w, h].
var Rectangle = function(x, y, w, h) {
    if (y === undefined) {
        this.x = x[0]; this.y = x[1]; this.w = x[2]; this.h = x[3];
    } else {
        this.x = x; this.y = y; this.w = w; this.h = h;
    }

};

Rectangle.prototype = {

    X : function() {
        return this.x + this.w;
    },

    Y : function() {
        return this.y + this.h;
    },

    pos : function() {
        return [this.x, this.y];
    },

    dims : function() {
        return [this.w, this.h];
    },

    translate : function(dx, dy) {
        this.x += dx;
        this.y += dy;
    },

    centerPos : function() {
        return [this.x + this.w/2, this.y + this.h/2];
    },

    /* Pad by pixels.
     * Imagine that we add a certain amount of padding inside this rectangle,
     * up against the outer wall. This method _replaces_ this rectangle by the
     * interior that would so result.
     */
    padByPixels : function(xPix, yPix) {
        this.x += xPix;
        this.w -= 2*xPix;
        this.y += yPix;
        this.h -= 2*yPix;
    },

    // Like padByPixels, only accepting a percentage in each dimension.
    padByPercent : function(xPct, yPct) {
        var xPix = this.w * xPct/100,
            yPix = this.h * yPct/100;
        this.padByPixels(xPix, yPix);
    },

    // Say whether the x-interval of this rectangle overlaps that of another.
    x_overlaps : function(other) {
        var a = this.x,
            b = this.X(),
            c = other.x,
            d = other.X(),
            left = b < c,
            right = a > d;
        return !left && !right;
    },

    // Say whether the y-interval of this rectangle overlaps that of another.
    y_overlaps : function(other) {
        var a = this.y,
            b = this.Y(),
            c = other.y,
            d = other.Y(),
            above = b < c,
            below = a > d;
        return !above && !below;
    },

    // Say whether this rectangle intersects another.
    intersects : function(other) {
        return this.x_overlaps(other) && this.y_overlaps(other);
    },

    // Say whether this rectangle is disjoint with another.
    isDisjointWith : function(other) {
        return !this.intersects(other);
    },

};

export { Floor, Rectangle };
