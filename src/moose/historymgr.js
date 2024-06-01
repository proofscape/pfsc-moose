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

// -------------------------------------------------------------------
// HistoryManager

var HistoryManager = function(forest) {
    moose.registerNextID(this); // sets this.id
    this.forest = forest;
    this.floor = forest.floor;
    this.floor.addMoveListener(this);
    this.selectionmgr = forest.getSelectionManager();

    this.frames = [];
    this.ptr = 0;
    this.n = 0;
    this.MAX_FRAMES = 100;

    this.EPSILON = 1;

    this.scrollTimeout = null;
    this.zoomTimeout = null;

    this.navEnableHandlers = [];
};

HistoryManager.prototype = {

    getID: function() {
        return this.id;
    },

    addNavEnableHandler: function(callback) {
        this.navEnableHandlers.push(callback);
    },

    publishNavEnable: function() {
        let b = this.canGoBack(),
            f = this.canGoForward();
        this.navEnableHandlers.forEach(cb => {
            cb({
                back: b,
                fwd: f,
                origin: this.forest,
            });
        });
    },

    noteFloorMove: function(source, x, y, zs) {

        // If the source was the history manager itself, we definitely do not want
        // to record the frame.
        if (source === this) return;

        var mgr = this;
        // Since scroll and zoom events tend to come in rapid succession, we wait for a one second
        // delay before recording a frame for either of these sources.
        if (source === 'scroll') {
            window.clearTimeout(this.scrollTimeout);
            this.scrollTimeout = window.setTimeout(function(){
                mgr.recordFrame(x, y, zs);
            }, 1000);
        }
        else if (source === 'zoom') {
            window.clearTimeout(this.zoomTimeout);
            this.zoomTimeout = window.setTimeout(function(){
                mgr.recordFrame(x, y, zs);
            }, 1000);
        }

        // For any other source (at present the floor doesn't actually mark any others besides
        // scroll and zoom anyway -- i.e. `source` will be `undefined`), we record the frame immediately.
        else {
            this.recordFrame(x, y, zs);
        }
    },

    /* Say whether two frames are considered equivalent.
     */
    equivFrames: function(f1, f2) {
        return (
            Math.abs(f1.x-f2.x) < this.EPSILON &&
            Math.abs(f1.y-f2.y) < this.EPSILON &&
            Math.abs(f1.zs-f2.zs) < this.EPSILON/10.0
        );
    },

    recordFrame: function(x, y, zs) {
        //console.log('record frame:', x, y, zs);

        // Define the new frame.
        var frame = {
            x: x,
            y: y,
            zs: zs
        };

        // If equivalent to current frame, do not record.
        // This prevents our recording a new frame after the user merely clicks
        // on the background.
        if (this.n > 0 && this.equivFrames(frame, this.frames[this.ptr])) return;

        // We will record the frame.
        // First enrich it with selection info.
        frame.select = this.selectionmgr.getSelection();

        // Recording a new frame causes us to forget any "forward" history.
        if (this.ptr > 0) this.frames = this.frames.slice(this.ptr);
        this.ptr = 0;
        // Add frame at front of queue.
        this.n = this.frames.unshift(frame);
        // Stay within max allowed number of frames.
        if (this.n > this.MAX_FRAMES) {
            this.frames.pop();
            this.n--;
        }
        this.publishNavEnable();
    },

    canGoBack: function() {
        return (this.ptr < this.n - 1);
    },

    canGoForward: function() {
        return (this.ptr > 0);
    },

    goBack: function() {
        //console.log('go back');
        if (!this.canGoBack()) return;
        this.ptr++;
        this.reinstate();
        this.publishNavEnable();
    },

    goForward: function() {
        //console.log('go fwd');
        if (!this.canGoForward()) return;
        this.ptr--;
        this.reinstate();
        this.publishNavEnable();
    },

    reinstate: function() {
        var frame = this.frames[this.ptr];
        var coords = [frame.x, frame.y, frame.zs];
        var dur = -1; // use speed-based duration (1 px/ms)
        this.floor.transitionToCoords(coords, dur, this);
        this.selectionmgr.setSelection(frame.select);
    },

};

export { HistoryManager };
