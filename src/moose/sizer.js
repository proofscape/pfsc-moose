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
// sizer

/*
* Pass the document element to which the NodeSizer should add
* its hidden div.
*/
var NodeSizer = function(elt) {
    this.sizerDiv = document.createElement('div');
    this.sizerDiv.style.visibility = 'hidden';
    elt.appendChild(this.sizerDiv);
    this.allNodes = {};
    this.nodeDivs = new Map();
    this.resolve = null;
    this.reject = null;
    this.nodeLabelPlugin = null;
};

NodeSizer.prototype = {

    computeAllNodeSizes : function(nodes) {
        var theSizer = this;
        return new Promise(function(resolve, reject) {
            theSizer.resolve = resolve;
            theSizer.reject = reject;
            theSizer.allNodes = nodes;
            for (var uid in nodes) {
                var node = nodes[uid];
                var nodeDiv = node.buildLabelSizingDiv();
                theSizer.nodeDivs.set(uid, nodeDiv);
                theSizer.sizerDiv.appendChild(nodeDiv);
            }
            moose.typeset([theSizer.sizerDiv])
                // Images need to load (or fail) before they have dimensions
                .then(theSizer.awaitImageLoading.bind(theSizer))
                .then(theSizer.postTypeset.bind(theSizer));
        });
    },

    awaitImageLoading : function() {
        const images = this.sizerDiv.querySelectorAll('img');
        return Promise.all(Array.from(images).map(image => new Promise(resolve => {
            image.addEventListener('load', resolve);
            image.addEventListener('error', resolve);
            if (image.complete) {
                resolve();
            } else {
                // Avoid deadlock, in case we never get a `load` or an `error` event:
                setTimeout(() => {
                    //console.log('img load timeout for:', image);
                    resolve();
                }, moose.imageLoadingTimeout);
            }
        })));
    },

    postTypeset : function() {
        if (this.nodeLabelPlugin) {
            this.nodeLabelPlugin.processLabels(this.nodeDivs).then(this.reportAllSizes.bind(this));
        } else {
            this.reportAllSizes();
        }
    },

    reportAllSizes : function() {
        for (var uid in this.allNodes) {
            var node = this.allNodes[uid];
            var div = this.nodeDivs.get(uid);
            var w = div.offsetWidth;
            var h = div.offsetHeight;
            node.receiveSize([w,h]);
            // Clean up
            this.sizerDiv.removeChild(div);
            this.nodeDivs.delete(uid);

        }
        // Resolve
        this.resolve();
    },

    remove : function() {
        this.sizerDiv.remove();
    },

    setNodeLabelPlugin : function(plugin) {
        this.nodeLabelPlugin = plugin;
    },

};

export { NodeSizer };
