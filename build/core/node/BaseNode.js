import { createAtom } from "mobx";
import { devMode, EventHandlers, fail } from "../../utils.js";
import { escapeJsonPath } from "../json-patch.js";
import { Hook } from "./Hook.js";
import { NodeLifeCycle } from "./NodeLifeCycle.js";
/**
 * @internal
 * @hidden
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export class BaseNode {
    type;
    environment;
    _escapedSubpath;
    _subpath;
    get subpath() {
        return this._subpath;
    }
    _subpathUponDeath;
    get subpathUponDeath() {
        return this._subpathUponDeath;
    }
    _pathUponDeath;
    get pathUponDeath() {
        return this._pathUponDeath;
    }
    storedValue; // usually the same type as the value, but not always (such as with references)
    get value() {
        return this.type.getValue(this);
    }
    aliveAtom;
    _state = NodeLifeCycle.INITIALIZING;
    get state() {
        return this._state;
    }
    set state(val) {
        const wasAlive = this.isAlive;
        this._state = val;
        const isAlive = this.isAlive;
        if (this.aliveAtom && wasAlive !== isAlive) {
            this.aliveAtom.reportChanged();
        }
    }
    _hookSubscribers;
    fireInternalHook(name) {
        if (this._hookSubscribers) {
            this._hookSubscribers.emit(name, this, name);
        }
    }
    registerHook(hook, hookHandler) {
        if (!this._hookSubscribers) {
            this._hookSubscribers = new EventHandlers();
        }
        return this._hookSubscribers.register(hook, hookHandler);
    }
    _parent;
    get parent() {
        return this._parent;
    }
    constructor(type, parent, subpath, environment) {
        this.type = type;
        this.environment = environment;
        this.environment = environment;
        this.baseSetParent(parent, subpath);
    }
    getReconciliationType() {
        return this.type;
    }
    pathAtom;
    baseSetParent(parent, subpath) {
        this._parent = parent;
        this._subpath = subpath;
        this._escapedSubpath = undefined; // regenerate when needed
        if (this.pathAtom) {
            this.pathAtom.reportChanged();
        }
    }
    /*
     * Returns (escaped) path representation as string
     */
    get path() {
        return this.getEscapedPath(true);
    }
    getEscapedPath(reportObserved) {
        if (reportObserved) {
            if (!this.pathAtom) {
                this.pathAtom = createAtom(`path`);
            }
            this.pathAtom.reportObserved();
        }
        if (!this.parent) {
            return "";
        }
        // regenerate escaped subpath if needed
        if (this._escapedSubpath === undefined) {
            this._escapedSubpath = !this._subpath ? "" : escapeJsonPath(this._subpath);
        }
        return (this.parent.getEscapedPath(reportObserved) + "/" + this._escapedSubpath);
    }
    get isRoot() {
        return this.parent === null;
    }
    get isAlive() {
        return this.state !== NodeLifeCycle.DEAD;
    }
    get isDetaching() {
        return this.state === NodeLifeCycle.DETACHING;
    }
    get observableIsAlive() {
        if (!this.aliveAtom) {
            this.aliveAtom = createAtom(`alive`);
        }
        this.aliveAtom.reportObserved();
        return this.isAlive;
    }
    baseFinalizeCreation(whenFinalized) {
        if (devMode()) {
            if (!this.isAlive) {
                // istanbul ignore next
                throw fail("assertion failed: cannot finalize the creation of a node that is already dead");
            }
        }
        // goal: afterCreate hooks runs depth-first. After attach runs parent first, so on afterAttach the parent has completed already
        if (this.state === NodeLifeCycle.CREATED) {
            if (this.parent) {
                if (this.parent.state !== NodeLifeCycle.FINALIZED) {
                    // parent not ready yet, postpone
                    return;
                }
                this.fireHook(Hook.afterAttach);
            }
            this.state = NodeLifeCycle.FINALIZED;
            if (whenFinalized) {
                whenFinalized();
            }
        }
    }
    baseFinalizeDeath() {
        if (this._hookSubscribers) {
            this._hookSubscribers.clearAll();
        }
        this._subpathUponDeath = this._subpath;
        this._pathUponDeath = this.getEscapedPath(false);
        this.baseSetParent(null, "");
        this.state = NodeLifeCycle.DEAD;
    }
    baseAboutToDie() {
        this.fireHook(Hook.beforeDestroy);
    }
}
//# sourceMappingURL=BaseNode.js.map