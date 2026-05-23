import { action } from "mobx";
import { BaseNode } from "./BaseNode.js";
import { devMode, fail, freeze } from "../../utils.js";
import { NodeLifeCycle } from "./NodeLifeCycle.js";
/**
 * @internal
 * @hidden
 */
export class ScalarNode extends BaseNode {
    constructor(simpleType, parent, subpath, environment, initialSnapshot) {
        super(simpleType, parent, subpath, environment);
        try {
            this.storedValue = simpleType.createNewInstance(initialSnapshot);
        }
        catch (e) {
            // short-cut to die the instance, to avoid the snapshot computed starting to throw...
            this.state = NodeLifeCycle.DEAD;
            throw e;
        }
        this.state = NodeLifeCycle.CREATED;
        // for scalar nodes there's no point in firing this event since it would fire on the constructor, before
        // anybody can actually register for/listen to it
        // this.fireHook(Hook.AfterCreate)
        this.finalizeCreation();
    }
    get root() {
        // future optimization: store root ref in the node and maintain it
        if (!this.parent) {
            throw fail(`This scalar node is not part of a tree`);
        }
        return this.parent.root;
    }
    setParent(newParent, subpath) {
        const parentChanged = this.parent !== newParent;
        const subpathChanged = this.subpath !== subpath;
        if (!parentChanged && !subpathChanged) {
            return;
        }
        if (devMode()) {
            if (!subpath) {
                // istanbul ignore next
                throw fail("assertion failed: subpath expected");
            }
            if (!newParent) {
                // istanbul ignore next
                throw fail("assertion failed: parent expected");
            }
            if (parentChanged) {
                // istanbul ignore next
                throw fail("assertion failed: scalar nodes cannot change their parent");
            }
        }
        this.environment = undefined; // use parent's
        this.baseSetParent(this.parent, subpath);
    }
    get snapshot() {
        return freeze(this.getSnapshot());
    }
    getSnapshot() {
        return this.type.getSnapshot(this);
    }
    toString() {
        const path = (this.isAlive ? this.path : this.pathUponDeath) || "<root>";
        return `${this.type.name}@${path}${this.isAlive ? "" : " [dead]"}`;
    }
    die() {
        if (!this.isAlive || this.state === NodeLifeCycle.DETACHING) {
            return;
        }
        this.aboutToDie();
        this.finalizeDeath();
    }
    finalizeCreation() {
        this.baseFinalizeCreation();
    }
    aboutToDie() {
        this.baseAboutToDie();
    }
    finalizeDeath() {
        this.baseFinalizeDeath();
    }
    fireHook(name) {
        this.fireInternalHook(name);
    }
}
ScalarNode.prototype.die = action(ScalarNode.prototype.die);
//# sourceMappingURL=scalar-node.js.map