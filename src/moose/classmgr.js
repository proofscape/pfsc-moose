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


/* Use an instance of this class to help manage a set of classes
 * that may be set on a DOM element.
 */
export class ClassManager {

    static get do_not_restore() {
        return 'cls-mgr-do-not-restore';
    }

    static get temporary_set() {
        return 'cls-mgr-temporary-set';
    }

    constructor(managedElement) {
        this.managedElement = managedElement;
        this.currentClasses = new Set();
        this.classSetStack = [];
        this.savedClassSet = null;
    }

    /* Add classes to the current set.
     *
     * @param classes: iterable of class names to be added to the current set.
     */
    addClasses(classes) {
        this.managedElement.classList.add(...Array.from(classes));
        for (let cls of classes) {
            this.currentClasses.add(cls);
        }
    }

    /* Remove classes from the current set.
     *
     * @param classes: iterable of class names to be removed from the current set.
     */
    removeClasses(classes) {
        this.managedElement.classList.remove(...Array.from(classes));
        for (let cls of classes) {
            this.currentClasses.delete(cls);
        }
    }

    /* Replace the existing class set with a new one.
     *
     * @param classes: iterable of class names to replace the existing set.
     */
    setClasses(classes) {
        this.clearClasses();
        this.addClasses(classes);
    }

    /* Get a fresh copy of our current set of classes.
     */
    getClasses() {
        return new Set(this.currentClasses);
    }

    /* Remove all current classes, or just those matching an optional regex.
     */
    clearClasses(regex) {
        // We want to pass a _copy_ of `this.currentClasses` to `removeClasses` since
        // we don't want to alter a set while iterating over it. But if there's a regex
        // then we'll want an array specifically, so might as well use `Array.from` to make the copy.
        let to_remove = Array.from(this.currentClasses);
        if (regex) {
            to_remove = to_remove.filter(cl => regex.test(cl));
        }
        this.removeClasses(to_remove);
    }

    /* Save a copy of the current set of classes.
     */
    save() {
        this.savedClassSet = this.getClasses();
    }

    /* Restore a previously saved set of classes, but not if:
     *  - the current saved set is `null`, or
     *  - the current saved set contains the `do_not_restore` class, or
     *  - option 'weak' was set, and the saved set contains the `temporary_set` class.
     * Furthermore, if restoring, then replace the saved set with the
     * current state (after reading it!).
     *
     * options: {
     *   weak {bool}: see above
     * }
     */
    restore(options) {
        const {
            weak = false,
        } = options || {};
        const saved = this.savedClassSet;
        if (saved === null) return;
        if (saved.has(ClassManager.do_not_restore)) return;
        if (weak && !this.currentClasses.has(ClassManager.temporary_set)) return;
        this.save();
        this.setClasses(saved);
    }

    /* Push a copy of our current class set onto our stack.
     */
    push() {
        this.classSetStack.push(this.getClasses());
    }

    /* If the stack is nonempty, pop classes and apply, and return true.
     * Otherwise just return false.
     *
     * options: {
     *   weak {bool} if true, then do pop, but apply only if current state
     *     is marked as tmp.
     * }
     */
    pop(options) {
        const {
            weak = false,
        } = options || {};
        if (this.classSetStack.length > 0) {
            const record = this.classSetStack.pop();
            if (!weak || this.currentClasses.has(ClassManager.temporary_set)) {
                this.setClasses(record);
            }
            return true;
        }
        return false;
    }

}

/* Note: The `PacedClassManager` was an experiment. The purpose was to make
 * node coloring flicker if the exact same coloring was set again.
 *
 * Making the Node class use a PacedClassManager instead of an ordinary
 * ClassManager for its color classes, and setting a cooldownTime of 80ms or so,
 * actually worked great, for its intended purpose. But it was causing weird
 * problems with hovercolor. It made hovercoloring very unstable, and you
 * could easily wind up with the color left in place after mouseout. Wasn't
 * able to figure out the problem. Would be nice to make this work properly.
 */

/* With this ClassManager you set a cooldown time.
 * After a class is removed, it will not be added again until at least
 * this time has passed.
 */
export class PacedClassManager extends ClassManager {

    constructor(managedElement, cooldownTime) {
        super(managedElement);
        this.cooldownTime = cooldownTime; // milliseconds
        this.cooldownPromises = new Map();
        /*
        this.exceptions = new Set([
            ClassManager.do_not_restore,
            ClassManager.temporary_set,
        ]);
        */
    }

    removeClasses(classes) {
        super.removeClasses(classes);
        for (let cls of classes) {
            this.cooldownPromises.set(cls, new Promise(r => setTimeout(r, this.cooldownTime)));
        }
    }

    addClasses(classes) {
        classes = Array.from(classes);
        Promise.all(classes.map(cls => this.cooldownPromises.get(cls) || Promise.resolve())).then(() => {
            super.addClasses(classes);
        });
        /*
        for (let cls of classes) {
            if (this.exceptions.has(cls)) {
                super.addClasses([cls]);
            } else {
                const p = this.cooldownPromises.get(cls) || Promise.resolve();
                p.then(() => super.addClasses([cls]));
            }
        }
         */
    }

}
