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

// ------------------------------------------------------------
// crossings

/* Line Crossing:
 *
 * [x1,x2]: horiz. range of node
 * [y1,y2]: vert. range of node
 * (u1,v1): point p inside node
 * (u2,v2): point q outside node
 *
 * If L is the line connecting points p and q,
 * and if d is the prescribed length of an arrowhead,
 * we return [A,B], where:
 *
 * A is the point where line L first crosses the 
 * boundary of the node, in going from p to q;
 *
 * B is the point on L a distance of d from A, and
 * closer to q, for use in drawing an arrowhead.
 */
moose.lineCrossing = function(x1,x2,y1,y2,u1,v1,u2,v2) {
    var T = []; // list of possible crossing times
    var t; // time variable
    // Does x vary, along L?
    if (u2 != u1) {
        // If so, do we ever cross at x1?
        t = (x1-u1)/(u2-u1);
        if (0 < t && t < 1) { T.push(t); }
        // Do we ever cross at x2?
        t = (x2-u1)/(u2-u1);
        if (0 < t && t < 1) { T.push(t); }
    }
    // Does y vary, along L?
    if (v2 != v1) {
        // Do we ever cross at y1?
        t = (y1-v1)/(v2-v1);
        if (0 < t && t < 1) { T.push(t); }
        // Do we ever cross at y2?
        t = (y2-v1)/(v2-v1);
        if (0 < t && t < 1) { T.push(t); }
    }
    // If T empty, then it was not the case that p is
    // inside the node AND q outside.
    if (T.length == 0) {
        //console.log('T empty');
        //var d = [x1,x2,y1,y2,u1,v1,y2,v2];
        //console.log(d);
        //return null;
        T.push(1); // KLUDGE. Not the best way to handle this, but it prevents a total crash....
    }
    // Else, find smallest value in T.
    var t0 = T.sort()[0];
    // Get crossing point A = (x0,y0).
    var x0 = (u2-u1)*t0 + u1;
    var y0 = (v2-v1)*t0 + v1;
    var A = [Math.round(x0), Math.round(y0)];
    // Get arrowhead base point B.
    var W = moose.normalize( [ u2-u1 , v2-v1 ] );
    var d = moose.arrowHeadLength;
    var B = [ Math.round(A[0]+d*W[0]), Math.round(A[1]+d*W[1]) ];
    //
    return [A,B];
}

moose.normalize = function(P) {
    //Return the unit vector pointing in the same direction as P.
    var r = Math.sqrt(P[0]*P[0] + P[1]*P[1]);
    if (r != 0) {
        return [P[0]/r, P[1]/r];
    }
    else {
        return [0,0];
    }
}


