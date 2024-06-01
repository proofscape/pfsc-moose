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

import { d3 } from "./d3.js";

import { moose } from "./head.js";

// -------------------------------------------------------------------
// Point

var Point = function(x,y) {
    this.x = x;
    this.y = y;
}

Point.prototype = {

    copy : function() {
        var x = this.x, y = this.y;
        return new Point(x,y);
    },

    plus : function(other) {
        var x = this.x, y = this.y;
        var u = other.x, v = other.y;
        return new Point(x+u,y+v);
    },

    minus : function(other) {
        var x = this.x, y = this.y;
        var u = other.x, v = other.y;
        return new Point(x-u,y-v);
    },

    times : function(s) {
        var x = this.x, y = this.y;
        return new Point(s*x,s*y);
    },

    mag : function() {
        var x = this.x, y = this.y;
        return Math.sqrt(x*x + y*y);
    },

    perp : function() {
        var x = this.x, y = this.y;
        return new Point(-y,x);
    },

    atan2 : function() {
        var x = this.x, y = this.y;
        return Math.atan2(y,x);
    }

};

// -------------------------------------------------------------------
// Polyline

var Polyline = function(edge, pts) {
    this.edge = edge;
    this.points = pts;
    //this.type = 'ORTHO';
    this.type = 'POLY';
};

Polyline.prototype = {

    getForest : function() {
        return this.edge.head.forest;
    },

    copy : function() {
        var pts = [];
        for (var i in this.points) {
            var pt = this.points[i].copy();
            pts.push(pt);
        }
        var C = new Polyline(this.edge,pts);
    },

    firstPoint : function() {
        return this.points[0];
    },

    lastPoint : function() {
        return this.points[this.points.length - 1];
    },

    writeSVGPathDForPoints : function(pts) {
        var s = '';
        // If less than 2 points, we can't draw anything.
        if (pts.length < 2) { return s; }
        var p = pts[0];
        s += 'M '+p.x+' '+p.y;
        for (var i = 1; i < pts.length; i++) {
            p = pts[i];
            s += ' L '+p.x+' '+p.y;
        }
        return s;
    },

    /* Write the path data for this polyline's path elements.
     *
     * options: {
     *   hook {non-neg. int}: pass a positive value if you want to bend a small "hook"
     *     at the src end of the path, when it is a straight line path (i.e. just 2 points).
     *     This is for use with gradient coloring on the connector glow.
     * }
     */
    writeSVGPathD : function(options) {
        const {
            hook = 0,
        } = options || {};
        let pts = this.points;
        if (hook && pts.length === 2) {
            // Gradient won't work on a straight path. (I guess it needs a 2-d bounding box?)
            // So if it would have been a straight line, we bend a tiny "hook" at the start.
            let [p0, p1] = pts;
            let dy = p1.y > p0.y ? hook : -hook;
            p0.y += dy;
            let ph = new Point(p0.x - hook, p0.y);
            pts = [ph, p0, p1];
        }
        if (this.type==='ORTHO') {
            return this.writeOrthoSVGPathD(pts);
        } else {
            return this.writeGenericSVGPathD(pts);
        }
    },

    writeOrthoSVGPathD : function(pts) {
        var d = '';
        if (pts.length < 2) return d;
        var p = pts[0];
        d += 'M '+p.x+' '+p.y;
        for (var i = 1; i < pts.length; i++) {
            var p = pts[i-1];
            var q = pts[i];
            var dx = q.x - p.x, dy = q.y - p.y;
            if (Math.abs(dx) > Math.abs(dy)) {
                d += ' h '+dx;
            } else {
                d += ' v '+dy;
            }
        }
        return d;
    },

    writeGenericSVGPathD : function(pts) {
        var d = '';
        if (pts.length < 2) return d;
        var p = pts[0];
        d += 'M '+p.x+' '+p.y;
        for (var i = 1; i < pts.length; i++) {
            var p = pts[i];
            d += ' L '+p.x+' '+p.y;
        }
        return d;
    },

    /**
     * Merge neighbouring segments if they are colinear.
     */
    simplify : function() {
        if (this.type==='ORTHO') {
            this.orthoSimplify();
        } else {
            this.genericSimplify();
        }
    },

    genericSimplify : function() {
        var newPts = [];
        var lastDir = 4; // lies well outside range [-PI,+PI] of atan2
        var tol = 0.0175; // about pi/180, or 1 degree tolerance
        var lastPt = null;
        var n = this.points.length;
        for (var i=0; i+1<n; i++) {
            // For each segment, take its initial point only if
            // its direction differs from that of the previous segment
            // by more than the tolerance.
            var a = this.points[i];
            var b = this.points[i+1];
            var d = b.minus(a);
            var dir = d.atan2();
            var delta = dir - lastDir;
            if (Math.abs(delta) > tol) {
                var ap = a.copy();
                newPts.push(ap);
                lastPt = ap;
                lastDir = dir;
            } else {
                // Should we update the direction even if we don't
                // take point a as the next point?
                // Problem is that then a sequence of 1-degree
                // changes will never add up to a large change.
                //var e = b.minus(lastPt);
                //lastDir = e.atan2();
            }
        }
        // Keep the final point.
        newPts.push(this.points[n-1].copy());
        this.points = newPts;
    },

    /**
     * Assuming this is an ORTHO polyline,
     * Merge neighbouring segments if they are colinear.
     */
    orthoSimplify : function() {
        var newPts = [];
        var lastDir = '0';
        var n = this.points.length;
        for (var i=0; i+1<n; i++) {
            // For each segment, take its initial point only if
            // its direction is opposite that of the previous segment.
            var a = this.points[i];
            var b = this.points[i+1];
            var d = b.minus(a);
            var dir = Math.abs(d.x) > Math.abs(d.y) ? 'H' : 'V';
            if (dir!=lastDir) {
                newPts.push(a.copy());
            }
            lastDir = dir;
        }
        // Keep the final point.
        newPts.push(this.points[n-1].copy());
        this.points = newPts;
    },

    /**
     * If this.points.length = n, then D should be a list of
     * length n - 1. It specifies how many bend points to add
     * to each existing segment.
     */
    addNumBPsToSegments : function(D) {
        var n = this.points.length;
        var newPts = [];
        for (var i=0; i + 1 < n; i++) {
            var a = this.points[i];
            var b = this.points[i+1];
            var m = D[i];
            newPts.push(a.copy());
            if (m > 0) {
                var d = b.minus(a);
                var s = 1/(m+1);
                //console.log(s);
                d = d.times(s);
                for (var j=1; j<=m; j++) {
                    var p = a.plus(d.times(j))
                    newPts.push(p);
                }
            }
        }
        newPts.push(this.points[n-1].copy());
        this.points = newPts;
    },

    prepareForDeformationTo : function(other) {
        // Own bend points:
        var S = this.points.slice(1,this.points.length-1);
        // Other bend points:
        var R = other.points.slice(1,other.points.length-1);
        // If number of bends differs, then subdivide as necessary.
        if (S.length != R.length) {
            // Let L,M be shorter,longer lists, respectively.
            var L = S.length < R.length ? S : R;
            var M = S.length < R.length ? R : S;
            // Let n be length of L,
            // n + k be length of M, with k >= 1.
            var n = L.length;
            var k = M.length - n;
            // Let k = q(n+1) + r, with 0 <= r < n+1.
            var r = k % (n+1);
            var q = (k - r) / (n+1);
            // Let P be the polyline with n bend points,
            // and Q that with n + k bend points.
            // We map n of Q's bends to P's n bends.
            // We must distribute the additional k bends among
            // P's n+1 segments.
            // We first assign q bends to each segment.
            var D = [];
            for (var i = 0; i < n+1; i++) {
                D.push(q);
            }
            // Now we must distribute the remaining r bends
            // among the n+1 segments, if r > 0.
            if (r > 0) {
                var delta = (n+1)/r;
                //console.log(delta);
                for (var j = 0; j < r; j++) {
                    var i = Math.floor(delta/2.0+j*delta);
                    D[i]++;
                }
            }
            // D now says how many new points to add to each segment.
            var P = S.length < R.length ? this : other;
            P.addNumBPsToSegments(D);
        }
        // Store copy of other's points, which is now guaranteed to
        // be a one-to-one mapping with own existing points.
        this.newPoints = other.points.slice(0);
    },

    buildSVG : function() {
        const G = document.createElementNS(moose.svgns,'g');
        const groupId = `edge-${this.edge.id}`;
        G.setAttribute('id', groupId);
        if (this.edge.style === "flow") {
            G.setAttribute('class', 'connFlow');
        } else {
            G.setAttribute('class', 'connDed');
        }

        // Gradient
        const grad = document.createElementNS(moose.svgns, 'linearGradient');
        const gradId = `${groupId}-grad`;
        grad.setAttribute('id', gradId);
        this.setGradientEndpts(grad);
        grad.innerHTML = '<stop class="src" offset="5%"/><stop class="tgt" offset="95%"/>';

        // Path
        const E = document.createElementNS(moose.svgns,"path");
        const path_d = this.writeSVGPathD();
        E.setAttribute("d", path_d);
        E.setAttribute('class', 'connector');

        // Glow
        const GL = document.createElementNS(moose.svgns,'path');
        // The length of the hook should be half the glow thickness:
        const glow_d = this.writeSVGPathD({hook: 5});
        GL.setAttribute("d", glow_d);
        GL.setAttribute('class', 'connGlow');
        GL.setAttribute('stroke', `url(#${gradId})`);

        // Arrowhead
        const A = this.makeArrowHead(this.getForest().arrowHeadType);

        // Store and assemble
        this.svgGrad = grad;
        this.svgGlow = GL;
        this.svgPath = E;
        this.svgArrowHead = A;
        G.appendChild(grad);
        G.appendChild(GL);
        G.appendChild(E);
        G.appendChild(A);
        this.svg = G;
    },

    makeArrowHead : function(type) {
        var A = document.createElementNS(moose.svgns,'path');
        var cl = 'connHead';
        if (type.fill==='solid') {
            cl += ' connHeadSolid';
        } else {
            cl += ' connHeadHollow';
        }
        A.setAttribute('class', cl);
        var ahd = this.makeArrowHeadPoints(type);
        if (ahd.indexOf('NaN')==-1) A.setAttribute('d', ahd);
        return A;
    },

    makeArrowHeadPoints : function(type) {
        var L = this.points.slice(-2);
        var A = L[1], C = L[0];
        var D = C.minus(A);
        var l = D.mag();
        var m = moose.arrowHeadLength;
        var V = D.times(m/l);
        var B = A.plus(V);
        var p = moose.arrowHeadPointiness;
        var U = V.times(p);
        var W = U.times(2);
        var T = W.perp();
        var Bp = B.copy();
        if (type.shape==='fledged') Bp = B.plus(U);
        var G = Bp.plus(T);
        var H = Bp.minus(T);
        var pts = [G,A,H];
        if (type.fill==='solid') pts.push(B);
        var d = this.writeSVGPathDForPoints(pts);
        if (type.fill==='solid') d += ' Z';
        return d;
    },

    redraw : function(pts) {
        this.points = pts;
        this.setGradientEndpts();
        const E = this.svgPath;
        const GL = this.svgGlow;
        const path_d = this.writeSVGPathD();
        E.setAttribute('d', path_d);
        const glow_d = this.writeSVGPathD({hook: 5});
        GL.setAttribute('d', glow_d);
        const A = this.svgArrowHead;
        const ahd = this.makeArrowHeadPoints(this.getForest().arrowHeadType);
        A.setAttributeNS(null,'d',ahd);
    },

    setGradientEndpts : function(grad) {
        grad = grad || this.svgGrad;
        const p1 = this.firstPoint();
        const p2 = this.lastPoint();
        const down = p2.y > p1.y;
        grad.setAttribute('x1', 0);
        grad.setAttribute('y1', down ? 0 : 1);
        grad.setAttribute('x2', 0);
        grad.setAttribute('y2', down ? 1 : 0);
    },

    moveTransition : function(pts) {
        // Prepare one-to-one mapping between path points
        var other = new Polyline(this.edge,pts);
        this.prepareForDeformationTo(other);
        // Create line segments
        var N = this.points.length;
        var lines = [];
        this.transitionSegments =
            document.createElementNS(moose.svgns,"g");
        for (var i = 0; i+1 < N; i++) {
            var p1 = this.points[i], p2 = this.points[i+1];
            var L = document.createElementNS(moose.svgns,"line");
            lines.push(L);
            // Set current coords
            L.setAttributeNS(null,'x1',p1.x);
            L.setAttributeNS(null,'y1',p1.y);
            L.setAttributeNS(null,'x2',p2.x);
            L.setAttributeNS(null,'y2',p2.y);
            // Set style
            var s = "fill:none;";
            s += " stroke:#000;";
            if (this.edge.style === "flow") {
                s += " stroke-dasharray:1,5;";
            }
            L.setAttributeNS(null,"style",s);
            // Add to group
            this.transitionSegments.appendChild(L);
        }
        // Hide path and glow
        this.svgPath.classList.add('hidden');
        this.svgGlow.classList.add('hidden');
        // Append the transition segments group
        this.svg.appendChild(this.transitionSegments);
        // Begin the animation
        for (var i in lines) {
            var L = lines[i];
            var q1 = this.newPoints[i], q2 = this.newPoints[(+i)+1];
            d3.select(L).transition()
                .duration(moose.transitionDuration)
                .ease(cssEase)
                .attr('x1', q1.x).attr('y1', q1.y)
                .attr('x2', q2.x).attr('y2', q2.y);
        }
    },

    postMoveTransition : function() {
        // Redraw path and glow, and reveal
        this.points = this.newPoints;
        this.simplify();
        this.redraw(this.points);
        this.svgPath.classList.remove('hidden');
        this.svgGlow.classList.remove('hidden');
        // Remove the transition line segments
        this.svg.removeChild(this.transitionSegments);
    }

};

/*
See util/d3_css_ease_function.py for the script that generated
this lookup table, and for notes on the motivation for this method
of making d3 use the same timing function as CSS's basic "ease".
*/

var cssEaseLookup = [
0.000, 0.004, 0.010, 0.017, 0.024, 0.033, 0.043, 0.054, 0.066, 0.080,
0.095, 0.111, 0.128, 0.146, 0.165, 0.185, 0.206, 0.228, 0.250, 0.273,
0.295, 0.318, 0.341, 0.364, 0.386, 0.409, 0.430, 0.452, 0.473, 0.493,
0.513, 0.533, 0.552, 0.570, 0.588, 0.605, 0.621, 0.637, 0.653, 0.668,
0.683, 0.697, 0.710, 0.723, 0.736, 0.748, 0.760, 0.771, 0.782, 0.792,
0.802, 0.812, 0.822, 0.831, 0.839, 0.848, 0.856, 0.864, 0.871, 0.878,
0.885, 0.892, 0.898, 0.904, 0.910, 0.916, 0.921, 0.927, 0.931, 0.936,
0.941, 0.945, 0.949, 0.953, 0.957, 0.960, 0.964, 0.967, 0.970, 0.973,
0.976, 0.978, 0.981, 0.983, 0.985, 0.987, 0.989, 0.990, 0.992, 0.993,
0.994, 0.995, 0.996, 0.997, 0.998, 0.999, 0.999, 1.000, 1.000, 1.000,
1.000
];

var cssEase = function(t) {
    var Y = cssEaseLookup,
        u = 100*t,
        i = Math.min(Math.max(0, Math.floor(u)), 99),
        d = u - i,
        y0 = Y[i],
        y1 = Y[i+1],
        y = y0 + d*(y1 - y0);
    return y;
};

export { Point, Polyline };
