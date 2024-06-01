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

// ------------------------------------------------------------
// DeducInfo

/*
* d: a deducInfo dictionary from a dashgraph
* node: a reference to the Node object to which this deduc info
*       belongs
*/
var DeducInfo = function(d, node) {
    this.node = node;
    this.libpath = d.libpath;
    this.deduction = d.deduction;
    this.author= d.author;
    this.work = d.work;
    this.friendly_name = d.friendly_name;
    this.creator_type = d.creator_type;
    this.runningDefs = d.runningDefs;
    this.xpans_avail = d.xpans_avail;
    this.targets = d.targets;
    this.target_deduc = d.target_deduc;
    this.target_subdeduc = d.target_subdeduc;
    this.docInfo = d.docInfo;
    this.textRange = d.textRange;
    this.version = d.version;
    this.dependencies = d.dependencies;
};

DeducInfo.prototype = {

    getNode : function() {
        return this.node;
    },

    getWorkShortName : function() {
        if (this.work &&
            this.work.hasOwnProperty('nickname')) {
            return this.work['nickname'];
        } else {
            return '';
        }
    },

    getAuthorShortName : function() {
        if (this.author &&
            this.author.hasOwnProperty('surname')) {
            return this.author['surname'];
        } else {
            return '';
        }
    },
    
    getDeducName : function() {
        return '"'+this.deduction+'"';
    },

    /* Format: array in which each rdef is represented by an array of length two,
     *         giving the lhs string and rhs string, respectively.
     */
    getRunningDefs : function() {
        return this.runningDefs;
    },

    listClarifiedNodes : function() {
        return this.targets;
    },

    presInfoForClarsAvail : function() {
        return this.getXpansAvail();
    },

    getXpansAvail : function() {
        return this.xpans_avail;
    },

    getLibpath : function() {
        return this.libpath;
    },

    getCreatorType : function() {
        return this.creator_type;
    },

    isTLD : function() {
        return this.targets.length === 0;
    },

    getWorkLibpath : function() {
        if (this.work &&
            this.work.hasOwnProperty('libpath')) {
            return this.work.libpath;
        } else {
            return '';
        }
    },

    getAuthorProfile : function() {
        return this.author;
    },

    getWorkInfo : function() {
        return this.work;
    },

    getFriendlyName : function() {
        return this.friendly_name;
    },

    getClarifiedDeduction : function() {
        return this.target_deduc;
    },

    getTargetSubdeduc : function() {
        return this.target_subdeduc;
    },

    getVersion : function() {
        return this.version;
    },

    getDependencies : function() {
        return this.dependencies;
    },

};

export { DeducInfo };
