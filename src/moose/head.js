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

var moose = {};

// -------------------------------------------------------------------
// Unique IDs

moose.nextID = 0;

moose.takeNextID = function() {
    var n = moose.nextID;
    moose.nextID = n+1;
    return n;
};

/*
* Set obj.id to be the next available unique id number,
* and register this object under this id in moose.objects.
*/
moose.registerNextID = function(obj) {
    var n = moose.nextID;
    moose.nextID = n+1;
    obj.id = n;
    moose.objects[n] = obj;
};

// -------------------------------------------------------------------
// Some constants / configuration

moose.xhtmlns = 'http://www.w3.org/1999/xhtml';
moose.svgns   = 'http://www.w3.org/2000/svg';

moose.KLaySpacing = 20;
moose.KLayBorderSpacingForDeducLabels = 30;
moose.KOpt = {
    direction      :"de.cau.cs.kieler.direction",
    distributeNodes:"de.cau.cs.kieler.klay.layered.distributeNodes",
    borderSpacing  :"de.cau.cs.kieler.borderSpacing",
    layoutHierarchy:"de.cau.cs.kieler.layoutHierarchy",
    spacing        :"de.cau.cs.kieler.spacing",
    edgeRouting    :"de.cau.cs.kieler.edgeRouting"
};

/* In ELK, "padding" is the counterpart to KLay's "borderSpacing".
 * However, you cannot just pass an integer. You must pass a string that
 * defines top, bottom, left, and right padding. (Any that are undefined
 * go to zero.)
 *
 * For us, it is simple because we always want the same padding on all
 * four sides. This function writes the required string for you.
 */
moose.ELKPadding = function(n) {
    return `top=${n}, bottom=${n}, left=${n}, right=${n}`
};
moose.ELKOpt = {
    direction        :"org.eclipse.elk.direction",
    padding          :"org.eclipse.elk.padding",
    hierarchyHandling:"org.eclipse.elk.hierarchyHandling",
    spacingInLayer   :"org.eclipse.elk.spacing.nodeNode",
    spacingBtwLayer  :"org.eclipse.elk.layered.spacing.nodeNodeBetweenLayers",
    edgeRouting      :"org.eclipse.elk.edgeRouting",
    directionCongruency: "org.eclipse.elk.layered.directionCongruency",
};

// URLs with which to obtain the data we need.
// Set moose.appUrlPrefix as needed.
moose.appUrlPrefix = '';
moose.baseUrls = {
    loadDashgraph: '/ise/loadDashgraph',
    getDeductionClosure: '/ise/getDeductionClosure',
    forestUpdateHelper: '/ise/forestUpdateHelper',
    getEnrichment: '/ise/getEnrichment',
};
moose.urlFor = function(role) {
    return moose.appUrlPrefix + (moose.baseUrls[role] || '/');
};


moose.arrowHeadLength = 7;
moose.arrowHeadPointiness = 0.2; //

moose.scrollSpeed = 3;

moose.imageLoadingTimeout = 5000; // ms

moose.doubleClickTime = 250; // ms
moose.hoverPopupDelay = 500; // ms

moose.transitionDuration = 1000; // ms

// At this time, the dimensions of the overview inset are hard-coded.
// This is not great. FIXME
moose.overviewInsetWidth = 240; // px
moose.overviewInsetHeight = 240; // px

// This is used in order to convert zoom scales into z-coordinates.
// These in turn are useful in computing distances travelled in the
// three-dimensional view space.
moose.eyeToScreenDistance = 3000; // pixels

moose.maxZoomFactor = 10;
moose.minZoomFactor = 0.1;

moose.embeddedModeScaleFactor = 0.125;

moose.nodeGlow_Default = '#8FF';
moose.nodeGlow_Antecedent = '#8F8';
moose.nodeGlow_Consequent = '#F88';

moose.polylineDisplayMode_AlwaysVisible = 0;
moose.polylineDisplayMode_VisibleWhenHighlighted = 1;

moose.edgeRouting_Ortho = 'ORTHOGONAL';
moose.edgeRouting_Polyline = 'POLYLINE';

moose.expansionMode_Unified = 'unified';
moose.expansionMode_Embedded = 'embedded';

moose.layoutMethod_FlowChartDown = 'KLayDown';
moose.layoutMethod_FlowChartUp = 'KLayUp';
// "UpDC" means "upward with downward compound nodes".
// While KLay supports this, unfortunately we cannot get it to work in ELK.
moose.layoutMethod_FlowChartUpDC = 'KLayUpDC';
moose.layoutMethod_OrderedList = 'OrderedList1';

moose.layoutMethods = {};
moose.layoutMethods[moose.layoutMethod_FlowChartDown] = 1;
moose.layoutMethods[moose.layoutMethod_FlowChartUp] = 1;
moose.layoutMethods[moose.layoutMethod_FlowChartUpDC] = 1;
moose.layoutMethods[moose.layoutMethod_OrderedList] = 1;

moose.flowLayoutMethod_to_direc = {};
moose.flowLayoutMethod_to_direc[moose.layoutMethod_FlowChartDown] = "DOWN";
moose.flowLayoutMethod_to_direc[moose.layoutMethod_FlowChartUp] = "UP";
moose.flowLayoutMethod_to_direc[moose.layoutMethod_FlowChartUpDC] = "UP";

moose.connMode_ShowAll = 'showAllConns';
moose.connMode_ShowSelected = 'showSelConns';

moose.layoutMethod_to_ConnMode = {};
moose.layoutMethod_to_ConnMode[moose.layoutMethod_FlowChartDown] = moose.connMode_ShowAll;
moose.layoutMethod_to_ConnMode[moose.layoutMethod_FlowChartUp] = moose.connMode_ShowAll;
moose.layoutMethod_to_ConnMode[moose.layoutMethod_FlowChartUpDC] = moose.connMode_ShowAll;
moose.layoutMethod_to_ConnMode[moose.layoutMethod_OrderedList] = moose.connMode_ShowSelected;

moose.panMode_Free = 'freePan';
moose.panMode_Controlled = 'controlledPan';

// When auto-panning, in what cases should we center the nodes we are moving in order to view?
// Under the `CenterAlways` policy, we always center the nodes we are moving in order to view.
moose.autopanPolicy_CenterAlways = 'centerAlways';
// Under the `CenterNever` policy, we never center the nodes we are moving in order to view.
// We only move the minimum amount necessary to bring all the nodes into the padded viewbox.
moose.autopanPolicy_CenterNever = 'centerNever';
// Under the `CenterDistant` policy, we center only when we are moving so far that nothing
// currently in the padded viewbox is going to remain therein. Thus, this policy says that, if
// we are able to "preserve some context," then we should aim to preserve as much as possible;
// however, if we have to move so far away that all context would be lost anyway, then we might
// as well center the new subject.
moose.autopanPolicy_CenterDistant = 'centerDistant';


moose.viewMethod_Overview = 'overview';
moose.viewMethod_Static = 'static';
moose.viewMethod_Showcase = 'showcase';
moose.viewMethod_OrderedListView = 'OrderedListView';

moose.transitionMethod_FadeSlideFade = 'fadeSlideFade';
moose.transitionMethod_instantChange = 'instantChange';

moose.selectionStyle_Node = 'Node';
moose.selectionStyle_NodeEdges = 'NodeEdges';
moose.selectionStyle_NodeEdgesNbrs = 'NodeEdgesNbrs';

// The moose sometimes distributes signals, e.g. mouse events,
// to forests based on their IDs. Therefore all forests need to
// be registered with the moose. That is achieved automatically
// by the Forest constructor.
moose.forests = {};

// For general distribution of signals, the moose keeps the set
// of all objects with IDs.
moose.objects = {};

// Place to store global event handlers
moose.globalHandlers = {};

moose.defaultNodeStyles = {
    asrt:{
        bdstyle:'solid',
        bdweight:'normal',
        color:'black',
        shape:'rect'
    },
    cite:{
        bdstyle:'solid',
        bdweight:'normal',
        color:'black',
        shape:'stadium'
    },
    ded:{
        bdstyle:'solid',
        bdweight:'normal',
        color:'black',
        shape:'rect'
    },
    dummy:{
        bdstyle:'none',
        bdweight:'normal',
        color:'black',
        shape:'rect'
    },
    exis:{
        bdstyle:'solid',
        bdweight:'normal',
        color:'black',
        shape:'rect'
    },
    flse:{
        bdstyle:'solid',
        bdweight:'normal',
        color:'black',
        shape:'rect'
    },
    ghost:{
        bdstyle:'dashed',
        bdweight:'normal',
        color:'gray',
        shape:'stadium'
    },
    intr:{
        bdstyle:'solid',
        bdweight:'bold',
        color:'black',
        shape:'rect'
    },
    mthd:{
        bdstyle:'solid',
        bdweight:'normal',
        color:'black',
        shape:'hexagon'
    },
    qstn:{
        bdstyle:'dashed',
        bdweight:'normal',
        color:'gray',
        shape:'rect'
    },
    rels:{
        bdstyle:'solid',
        bdweight:'normal',
        color:'black',
        shape:'rect'
    },
    subded:{
        bdstyle:'solid',
        bdweight:'normal',
        color:'black',
        shape:'rect'
    },
    supp:{
        bdstyle:'dashed',
        bdweight:'normal',
        color:'black',
        shape:'rect'
    },
    ucon:{
        bdstyle:'none',
        bdweight:'normal',
        color:'black',
        shape:'rect'
    },
    univ:{
        bdstyle:'solid',
        bdweight:'normal',
        color:'black',
        shape:'rect'
    },
    with:{
        bdstyle:'solid',
        bdweight:'normal',
        color:'black',
        shape:'rect'
    }
};

moose.getStyleForNodeType = function(nodetype) {
    return moose.defaultNodeStyles[nodetype];
};

// -------------------------------------------------------------------
// Miscellaneous top-level functions

/*
* Identify a right-click.
*
* Note, this is not to be used if your goal is to trigger a context menu.
* For that, you should be binding to the oncontextmenu event. Instead, this
* is intended for cases in which you're trying to handle left-clicks only, and
* need a way to ensure it wasn't a right-click. (Otherwise, e.g. the user right-clicks a
* node to get its context menu, and the node starts moving as if it were
* being dragged.)
*/
moose.isRightClick = function(event) {
    return event.which === 3 || event.button === 2
};

/*
* Determine the distances from the mouse pointer to all four sides of a div.
*
* param event: An Event object from which to read the mouse position.
* param div: The div whose boundaries are in question.
*
* return: Object with keys 'top', 'bottom', 'left', and 'right', giving the
*         orthogonal distances from the mouse pointer to those four sides of
*         the given div, respectively.
*
*         The distances are signed, so that all are positive iff the mouse
*         is currently inside the div.
*/
moose.mouseDistancesToBoxSides = function(event, div) {
    var xm = event.clientX,
        ym = event.clientY,
        r = div.getBoundingClientRect(),
        x = r.left,
        X = x + r.width,
        y = r.top,
        Y = y + r.height,
        d = {
            left: xm - x,
            right: X - xm,
            top: ym - y,
            bottom: Y - ym
        };
    return d;
};

/*
* Set a handler on the global document element.
* This is useful for mousemove and mouseup.
*/
moose.setGlobalHandler = function(eventName, handler) {
    // First remove any existing handler for the same event name.
    // This is experimental. Will we ever want two handlers under the same name?
    // If so, may need to change this. For now, it is a solution to the problem of
    // clicking and dragging, running the pointer off screen (e.g. onto the developer tools
    // area), then coming back and discovering you now can't stop moving the background,
    // even if you click again. That happened because we left the original move handler in
    // existence, then overwrote our record of it with a new one. This left us no way to
    // ever remove the first one. So now we remove it first, before overwriting it.
    moose.clearGlobalHandler(eventName);
    // Now record and set the new handler.
    moose.globalHandlers[eventName] = handler;
    document.documentElement.addEventListener(eventName, handler);
}

moose.clearGlobalHandler = function(eventName) {
    var handler = moose.globalHandlers[eventName];
    if (handler) document.documentElement.removeEventListener(eventName, handler);
}

/* This function provides an easy way to chain MathJax typeset promises.
 * See <https://docs.mathjax.org/en/latest/web/typeset.html>
 */
moose.typeset = function(elements) {
    MathJax.startup.promise = MathJax.startup.promise.then(
        () => MathJax.typesetPromise(elements)
    ).catch(console.error);
    return MathJax.startup.promise;
}

/* Simple XMLHttpRequest utility
 *
 * param url: the url to be accessed
 * optional params object:
 *      method: "GET", "POST" etc. Defaults to "GET"
 *      query: pass an object defining key-value pairs that you want added
 *          as a query string on the end of the URL
 *      form: pass an object defining key-value pairs that you want to be
 *          sent in form-encoded format in the body of the request
 *      handleAs: 'text', 'json', or 'blob'. Defaults to 'text'
 *
 * return: promise that resolves with the response from the request
 */
moose.xhr = function(url, params) {
    if (params.query) {
        url += "?"+(new URLSearchParams(params.query)).toString();
    }
    const init = {
        method: params.method || "GET"
    };
    if (params.form) {
        init.body = new URLSearchParams(params.form);
    }
    const handleAs = params.handleAs || 'text';
    return fetch(url, init).then(resp => {
        if (!resp.ok) {
            throw new Error(`HTTP error! status: ${resp.status}`);
        }
        if (handleAs === 'json') {
            return resp.json();
        } else if (handleAs === 'blob') {
            return resp.blob();
        } else {
            return resp.text();
        }
    });
}

moose.xhrFor = function(role, params) {
    const url = moose.urlFor(role);
    return moose.xhr(url, params);
};

moose.eventsMixin = {
    on(eventType, callback) {
        const cbs = this.listeners[eventType] || [];
        cbs.push(callback);
        this.listeners[eventType] = cbs;
    },

    off(eventType, callback) {
        const cbs = this.listeners[eventType] || [];
        const i0 = cbs.indexOf(callback);
        if (i0 >= 0) {
            cbs.splice(i0, 1);
            this.listeners[eventType] = cbs;
        }
    },

    dispatch(event) {
        /* Subtle point: In general, we are always careful not to modify an
         * iterable while we are in the process of iterating over it. Here, we don't
         * know whether a callback might `off` itself as a part of its process,
         * thereby modifying our array of listeners while we are iterating over it!
         * Therefore, to be safe, we have to iterate over a _copy_ of our array of
         * registered listeners. */
        const cbs = (this.listeners[event.type] || []).slice();
        for (let cb of cbs) {
            cb(event);
        }
    },
};

// -------------------------------------------------------------------
// "FlexList" operations

/* A FlexList is a string or an array of strings.
 * The point is to allow the user flexibility in specifying parameters.
 * E.g. the user can write
 * {
 *   "foo": "bar"
 * }
 * or
 * {
 *  "foo": ["bar", "spam"]
 * }
 * and both are accepted.
 */

/* Convert a FlexList into a "set", implemented as an object with keys pointing to unity.
 */
moose.flexListToSet = function(fl) {
    var set = {};
    if (typeof(fl) === "string") {
        set[fl] = 1;
    } else {
        for (var i in fl) {
            set[fl[i]] = 1;
        }
    }
    return set;
};

/* A BoxList is a FlexList which, if it is a string, is equal either to an (approved)
 * keyword (depending on the application) or to a libpath, and which, if it is an array
 * is an array of libpaths.
 *
 * A BoxList will be said to be "in normal form" or "normalized" when it is equal either
 * to a keyword string, or an array of libpaths; thus, never just a single libpath string.
 *
 * Note: This function identifies libpaths as any string containing a dot at positive index.
 * Thus, it assumes that keywords either do not contain a dot, or at most begin with one.
 */
moose.normalizeBoxlist = function(bl) {
    if (typeof(bl) === "string" && bl.indexOf('.') > 0) {
        return [bl];
    } else {
        return bl;
    }
};

/* A multipath is a special notation for indicating multiple libpaths that
 * share a common prefix and/or suffix.
 * For example,
 *
 *    a.b.{c.d,e}.f
 *
 * indicates the two libpaths a.b.c.d.f and a.b.e.f
 *
 * At most one pair of braces is allowed.
 * There should be no whitespace inside the braces.
 */

/* Convert a multipath to a set of libpaths.
 * Tolerates a libpath that is not a multipath at all, returning a singleton set.
 */
moose.multipathToSet = function(mp) {
    var lps = {};
    var i0 = mp.indexOf("{");
    if (i0 < 0) {
        // There's no braces.
        lps[mp] = 1;
    } else {
        var i1 = mp.indexOf("}");
        if (i1 <= i0) {
            console.log("Malformed multipath: ", mp);
        } else {
            var prefix = mp.slice(0, i0),
                suffix = mp.slice(i1+1),
                multi  = mp.slice(i0+1, i1).split(',');
            multi.forEach(function(m){
                lps[prefix+m+suffix] = 1;
            });
        }
    }
    return lps;
};

moose.getRepoPart = function(libpath) {
    return libpath.split('.').slice(0, 3).join('.');
};

/* Say whether libpath A is segment-wise prefix of libpath B.
 */
moose.libpathIsPrefixOf = function(A, B) {
    if (B.startsWith(A)) {
        const rem = B.slice(A.length);
        return rem.length === 0 || rem[0] === '.';
    }
    return false;
}

// -------------------------------------------------------------------
// Object set operations

moose.objectShallowCopy = function(A) {
    return moose.objectUnion(A, {});
};

moose.objectUnion = function(A,B) {
    var C = {};
    for (var k in A) {
        C[k] = A[k];
    }
    for (var k in B) {
        C[k] = B[k];
    }
    return C;
};

moose.objectIntersection = function(A,B) {
    var C = {};
    for (var k in A) {
        if (B.hasOwnProperty(k)) {
            C[k] = A[k];
        }
    }
    return C;
};

moose.objectDifference = function(A,B) {
    var C = {};
    for (var k in A) {
        if (B.hasOwnProperty(k)) {continue;}
        C[k] = A[k];
    }
    return C;
};

moose.objectSize = function(A) {
    var n = 0;
    for (var k in A) { n++; }
    return n;
};

// -------------------------------------------------------------------
// CSS class methods

/*
* elt: a DOM element
* cls: a class string to be added or removed
* b: boolean: true = add the class, false = remove it
*
* This is so we don't need jQuery just for its addClass and removeClass methods.
*/
moose.setClass = function(elt, cls, b) {
    // Build list of existing classes.
    var exStr = elt.getAttribute('class'),
        exArr = [],
        didFindNewCls = false,
        newArr = [];
    if (exStr!==null) {
        exArr = exStr.split(' ');
    }
    for (var i in exArr) {
        name = exArr[i];
        if (b) {
            // Want to add cls if not already present.
            if (name===cls) didFindNewCls = true;
        } else {
            // Want to remove cls if present.
            if (name===cls) continue;
        }
        newArr.push(name);
    }
    if (b && !didFindNewCls) newArr.push(cls);
    // Finally, set the new class string.
    elt.setAttribute('class', newArr.join(' '));
};


// -------------------------------------------------------------------

/*
* Return the union of two bounding boxes form [x,y,w,h].
*/
moose.bBoxXYWHUnion = function(B1,B2) {
    var x = Math.min(B1[0],B2[0]);
    var y = Math.min(B1[1],B2[1]);
    var w = Math.max(B1[0]+B1[2],B2[0]+B2[2]) - x;
    var h = Math.max(B1[1]+B1[3],B2[1]+B2[3]) - y;
    return [x,y,w,h];
};

/*
* For each edge in each node in the passed set of nodes,
* add a reference to it in the passed 'edges' dictionary.
*/
moose.allEdgesInNodeSet = function(nodes, edges) {
    for (var uid in nodes) {
        var n = nodes[uid];
        n.getAllEdgesRec(edges);
    }
};

// Function to programmatically submit form data.
moose.post = function(path, params, method) {
    // Set method to post by default if not specified.
    method = method || "post";

    var form = document.createElement("form");
    form.setAttribute("method", method);
    form.setAttribute("action", path);

    for(var key in params) {
        if(params.hasOwnProperty(key)) {
            var hiddenField = document.createElement("input");
            hiddenField.setAttribute("type", "hidden");
            hiddenField.setAttribute("name", key);
            hiddenField.setAttribute("value", params[key]);

            form.appendChild(hiddenField);
         }
    }

    document.body.appendChild(form);
    form.submit();
}

// -------------------------------------------------------------------
// A simple "forest sort" class.
// You pass it "nodes" by telling it the ID of the node and the
// ID of the node's parent. Root nodes are identified when the
// passed parent ID is null.
//
// Finally you call its 'writeList' function to get a list of
// the IDs of all nodes in the forest, with the only guarantee
// being that if A is parent of B then A comes before B in the
// list. (Thus, by transitivity, if A is any ancestor of Z then
// A comes before Z in the list.)
// Actually this is what is known as a topological sorting or
// topological ordering.

moose.ForestSort = function() {
    // [ID1, ID2, ..., IDn], nodes with null parentID
    this.roots = [];
    // { parentID : [childID1, ..., childIDn] }
    this.children = {};
    // { ID : parentID }
    this.par = {};
};

moose.ForestSort.prototype = {

    addNode : function(ID, parentID) {
        this.par[ID] = parentID;
        if (parentID) {
            var siblings = [];
            if (this.children.hasOwnProperty(parentID)) {
                siblings = this.children[parentID];
            }
            siblings.push(ID);
            this.children[parentID] = siblings;
        } else {
            this.roots.push(ID);
        }
    },

    /// Pseudoroots are nodes that have a parentID, but that
    /// parent node was never added to the tree.
    /// We have to use these are starting points, in addition
    /// to the proper roots.
    computePseudoRoots : function() {
        const psr = [];
        for (var ID in this.par) {
            var parentID = this.par[ID];
            if (parentID != null &&
                !this.par.hasOwnProperty(parentID)
            ) {
                psr.push(ID);
            }
        }
        return psr;
    },

    writeList : function() {
        const L = [];
        var start = this.computePseudoRoots().concat(this.roots);
        for (var i in start) {
            var rootID = start[i];
            var queue = [rootID];
            while (queue.length > 0) {
                var ID = queue[0];
                queue.splice(0,1);
                L.push(ID);
                if (this.children.hasOwnProperty(ID)) {
                    var kids = this.children[ID];
                    queue = queue.concat(kids);
                }
            }
        }
        return L;
    }

};

// -------------------------------------------------------------------

moose.copyTextToClipboard = function(text) {
  const box = document.createElement("textarea");
    box.value = text;
    box.style.opacity = 0;
    document.body.appendChild(box);
    box.focus();
    box.select();
    document.execCommand('copy');
    box.remove();
};

// -------------------------------------------------------------------

/* Remove everything from inside a DOM element.
 */
moose.removeAllChildNodes = function(parent) {
    while (parent.firstChild) {
        parent.removeChild(parent.firstChild);
    }
}

export { moose };
