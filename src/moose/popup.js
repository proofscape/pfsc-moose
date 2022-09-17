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

class Popup {

    /* param items: optional Array of DOM elements that should be added to the popup.
     *      Note: items should have style `position: relative;` so that their size
     *      contributes to the size of the overall popup. Otherwise automatic positioning
     *      of the popup in the `placeInBoxNearMouse` method will not work.
     * param direction: string indicating how you want the items in this popup (added now or later)
     *      to be arranged, when there are more than one. May be equal to any valid value for
     *      the `flex-direction` CSS attribute, such as `row` or `column`.
     *      Defaults to `column` if undefined.
     */
    constructor({ items, direction, opaque }) {
        this.items = items || [];
        this.direction = direction || 'column';
        this.opaque = opaque || false;
        this.x = 0;
        this.y = 0;
        this.zs = 1;
        const box = document.createElement('div');
        box.classList.add('popupBox', 'hidden');
        if (this.opaque) {
            box.classList.add('opaque');
        }
        box.style.flexDirection = this.direction;
        this.box = box;
        // Add items, if any.
        for (const item of this.items) {
            box.appendChild(item);
        }
        // We add the box to the document now, but it is still invisible
        // until user calls `show()` method.
        const body = document.querySelector('body');
        body.appendChild(box);
    }

    addItem(item) {
        this.items.push(item);
        this.box.appendChild(item);
    }

    get w() {
        const rect = this.box.getBoundingClientRect();
        return rect.width;
    }

    get h() {
        const rect = this.box.getBoundingClientRect();
        return rect.height;
    }

    setPos(x, y) {
        this.x = x;
        this.y = y;
        this.box.style.left = x + 'px';
        this.box.style.top = y + 'px';
    }

    setZoomScale(zs) {
        this.zs = zs;
        this.box.style.transform = 'scale('+zs+')';
    }

    hide() {
        this.box.classList.add('hidden');
    }

    show() {
        this.box.classList.remove('hidden');
    }

    remove() {
        this.box.remove();
    }

    /* Place this popup at an optimal position, under the constraints that
     * (a) it be within the bounding box of a given DOM element, and (b)
     * it be near the current position of the mouse.
     *
     * param boxElt: the DOM element whose bounding box defines the space
     *      we have to work with.
     * param event: a mouse event, from which we can read the current position
     *      of the mouse.
     *
     * return: nothing; we simply set this Popup's position.
     */
    placeInBoxNearMouse(boxElt, event) {
        const p = this;
        const d = moose.mouseDistancesToBoxSides(event, boxElt);
        // Consider placing the box above, right, below, or left of the pointer.
        // For each possibility, compute a cost.
        const W = d.left + d.right,
              H = d.top + d.bottom,
              cs = 16;  // cursor size (assumed)
        const cost = [
            // Above
            (p.h + cs - d.top) + (p.w - W),
            // Below
            (p.h + 2*cs - d.bottom) + (p.w - W),
            // Left
            (p.w + cs - d.left) + (p.h - H),
            // Right
            (p.w + 2*cs - d.right) + (p.h - H)
        ];
        // Compute argmin.
        let mincost = p.h + p.w + 4*cs,  // effectively +infinity
            argmin = -1;
        for (let i = 0; i < 4; i++) {
            const c = cost[i];
            if (c < mincost) {
                mincost = c;
                argmin = i;
            }
        }
        // Position the popup on a best side.
        let x = event.clientX,
            y = event.clientY;
        const hw = p.w/2,
              hh = p.h/2;
        if (argmin < 2) {
            // Set x-coord.
            if (p.w >= W) x -= d.left;
            else if (d.left < hw) x -= d.left;
            else if (d.right < hw)  x -= (p.w - d.right);
            else x -= hw;
            // Set y-coord.
            y += argmin === 0 ? -p.h - cs : 2*cs;
        } else {
            // Set y-coord.
            if (p.h >= H) y -= d.top;
            else if (d.top < hh) y -= d.top;
            else if (d.bottom < hh) y -= (p.h - d.bottom);
            else y -= hh;
            // Set x-coord.
            x += argmin === 2 ? -p.w - cs : 2*cs;
        }
        p.setPos(x, y);
    }
}

export {
    Popup
};
