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

import { d3 } from "./src/d3.js";

import { moose } from './moose/main.js';
//import './css/moose.css';

function fetchDashgraph(libpath) {
    return new Promise((resolve, reject) => {
        var url = 'test/pfscbuild/' + libpath.replace(/\./g, '/') + '.dg.json';
        d3.json(url).then(dg => {
            resolve({
                libpath: libpath,
                dg: dg
            });
        });
    });
}

function open(forest, lps, opts) {
    var jobs = lps.map(lp => fetchDashgraph(lp));
    return Promise.all(jobs).then(infos => {
        var kd = {};
        infos.forEach(info => {
            var lp = info.libpath, dg = info.dg;
            kd[lp] = dg;
        });
        var opts0 = {
            local: true,
            known_dashgraphs: kd,
            onBoard: lps,
            view: '<all>'
        };
        Object.assign(opts0, opts);
        forest.requestState(opts0);
    });
}

function startup() {
    var mga = document.querySelector('#mga');
    var forest = new moose.Forest(mga, {
        overview: {
            position: 'br'
        }
    });

    var lps67 = [
        'gh.rrmath.lit.H.ilbert.ZB.Thm67.Thm',
        'gh.rrmath.lit.H.ilbert.ZB.Thm67.Pf'
    ];
    var lps9 = [
        'gh.rrmath.lit.H.ilbert.ZB.Thm9.Thm',
        'gh.rrmath.lit.H.ilbert.ZB.Thm9.Pf'
    ];
    var lps8 = [
        'gh.rrmath.lit.H.ilbert.ZB.Thm8.Thm',
        'gh.rrmath.lit.H.ilbert.ZB.Thm8.Pf'
    ];


    open(forest, lps9, {})
    .then(() => {
        setTimeout(() => {
            open(forest, lps8, {
                transition: true,
                view: lps8
            });
        }, 500);
    });

    /*
    open(forest, lps9, {
        layout: moose.layoutMethod_OrderedList
    });
    */

};

if (document.readyState !== 'loading') startup();
else document.addEventListener('DOMContentLoaded', startup);
