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

import { moose } from "./head.js";
import { LayoutInfo } from "./layoutinfo.js";
import { ListLayout } from "./listlayout.js";

// ------------------------------------------------------------------- 
// Layout

var Layout = function(forest, layoutMethod, graph) {
    moose.registerNextID(this); // sets this.id
    this.forest = forest;
    this.layoutMethod = layoutMethod;
    // FIXME:
    // We still haven't settled on a single good internal
    // representation of a graph. There is the KLayGraph
    // produced by the writeImminentlyVisibleKLayGraph
    // methods, and there is the other thing produced by
    // the writeImminentlyVisibleLayoutObj methods.
    // Eventually, should settle on a single internal format,
    // which should be passed to this Layout object. Then
    // this object can be responsible for translating that into
    // whatever format the layout backend needs, which is
    // selected by the layoutMethod parameter.
    // For now, the user simply must pass in the right format
    // for the chosen layoutMethod.
    this.graph = graph;
    this.resultCode = 0;
    this.errorMessage = '';
    this.layoutInfo = null;
    this.resolve = null;
    this.reject = null;
};

Layout.prototype = {

    getID : function() {
        return this.id;
    },

    getResultCode : function() {
        return this.resultCode;
    },

    getErrorMessage : function() {
        return this.errorMessage;
    },

    getLayoutInfo : function() {
        return this.layoutInfo;
    },

    /*
    * Compute the layout.
    * When your callback is called, the first thing it should do is
    * check the result code using getResultCode.
    * This is a numeric code indicating what happened.
    *
    * Result codes:
    *   0: Success. All data should be available and well-formed.
    *   1: Failure. An error message is available.
    *   2: Failure. No error message is available.
    *
    * In the case of success, use getLayoutInfo to get the LayoutInfo
    * object. In the case of failure, use getErrorMessage.
    */
    computeLayout : function() {
        var theLayoutObj = this;
        return new Promise(function(resolve, reject) {
            theLayoutObj.resolve = resolve;
            theLayoutObj.reject = reject;
            if (theLayoutObj.layoutMethod in moose.flowLayoutMethod_to_direc) {
                //console.log(theLayoutObj.graph);
                if (theLayoutObj.forest && theLayoutObj.forest.useElk) {
                    theLayoutObj.forest.elk.layout(theLayoutObj.graph, {
                        layoutOptions: {
                            [moose.ELKOpt.direction]: moose.flowLayoutMethod_to_direc[theLayoutObj.layoutMethod],
                            [moose.ELKOpt.spacingBtwLayer]: moose.KLaySpacing,
                            [moose.ELKOpt.hierarchyHandling]: "INCLUDE_CHILDREN",
                            [moose.ELKOpt.edgeRouting]: theLayoutObj.forest ?
                                theLayoutObj.forest.edgeRouting : moose.edgeRouting_Ortho,
                            // To preserve the old behavior (from KLay):
                            [moose.ELKOpt.directionCongruency]: 'ROTATION',
                            // Experimenting with tuning the layout:
                            //"org.eclipse.elk.layered.nodePlacement.bk.edgeStraightening": "NONE",
                            //"org.eclipse.elk.layered.nodePlacement.favorStraightEdges": false,
                        }
                    })
                        .then(theLayoutObj.successKLay.bind(theLayoutObj))
                        .catch(theLayoutObj.errorKLay.bind(theLayoutObj));
                } else {
                    var opts = {};
                    var direc = moose.flowLayoutMethod_to_direc[theLayoutObj.layoutMethod];
                    opts[moose.KOpt["direction"]] = direc;
                    opts[moose.KOpt["spacing"]] = moose.KLaySpacing;
                    opts[moose.KOpt["layoutHierarchy"]] = true;
                    opts[moose.KOpt["edgeRouting"]] = theLayoutObj.forest ?
                        theLayoutObj.forest.edgeRouting : moose.edgeRouting_Ortho;

                    theLayoutObj.forest.klay.layout({
                        graph: theLayoutObj.graph,
                        options: opts,
                        success: theLayoutObj.successKLay.bind(theLayoutObj),
                        error: theLayoutObj.errorKLay.bind(theLayoutObj),
                    });
                }
            } else if (theLayoutObj.layoutMethod===moose.layoutMethod_OrderedList) {
                var ll = new ListLayout(theLayoutObj.graph),
                    d = ll.computeLayout();
                theLayoutObj.buildLayoutInfo(d);
            } else {
                console.error('Unknown layout method: ' + theLayoutObj.layoutMethod);
            }
        });
    },
    
    layoutCB : function(d) {
        d = JSON.parse(d);
        //console.log(d);
        this.buildLayoutInfo(d);
    },

    non200LayoutCB : function(statusNumber) {
        var mes = 'Layout server is not responding.\n';
        mes += '\nServer returned code '+statusNumber+'.';
        this.errorMessage = mes;
        this.resultCode = 1;
        this.reject(mes);
    },

    successKLay : function(graph) {
        //console.log(graph);
        this.buildLayoutInfo(graph);
    },

    errorKLay : function(err) {
        console.log(err);
        var mes = 'KLay layout error.\n';
        mes += err.text;
        this.errorMessage = mes;
        this.resultCode = 1;
        this.reject(mes);
    },

    buildLayoutInfo : function(d) {
        // If there was an error, report and quit.
        if (d.hasOwnProperty('ERROR')) {
            var mes = 'Layout error.\n';
            mes += d.ERROR;
            this.errorMessage = mes;
            this.resultCode = 1;
            this.reject(mes);
            return;
        }
        // Else save the layout info.
        var L = {
            layoutMethod : this.layoutMethod,
            data : d
        };
        this.layoutInfo = new LayoutInfo(this.forest, L);
        this.resolve(this.layoutInfo);
    },

};

export { Layout };
