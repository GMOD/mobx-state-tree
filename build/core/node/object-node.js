import { _allowStateChangesInsideComputed, action, computed, reaction } from "mobx";
import { BaseNode } from "./BaseNode.js";
import { normalizeIdentifier } from "../../types/utility-types/identifier-utils.js";
import { addHiddenFinalProp, devMode, EMPTY_OBJECT, EventHandlers, extend, fail, freeze, warnError } from "../../utils.js";
import { createActionInvoker, getCurrentActionContext } from "../action.js";
import { escapeJsonPath, splitJsonPath, splitPatch } from "../json-patch.js";
import { getPath } from "../mst-operations.js";
import { Hook } from "./Hook.js";
import { IdentifierCache } from "./identifier-cache.js";
import { getLivelinessChecking } from "./livelinessChecking.js";
import { NodeLifeCycle } from "./NodeLifeCycle.js";
import { convertChildNodesToArray, resolveNodeByPathParts, toJSON } from "./node-utils.js";
let nextNodeId = 1;
const snapshotReactionOptions = {
    onError(e) {
        throw e;
    }
};
/**
 * @internal
 * @hidden
 */
export class ObjectNode extends BaseNode {
    nodeId = ++nextNodeId;
    identifierAttribute;
    identifier; // Identifier is always normalized to string, even if the identifier property isn't
    unnormalizedIdentifier;
    identifierCache;
    isProtectionEnabled = true;
    middlewares;
    hasSnapshotPostProcessor = false;
    _applyPatches;
    applyPatches(patches) {
        this.createObservableInstanceIfNeeded();
        this._applyPatches(patches);
    }
    _applySnapshot;
    applySnapshot(snapshot) {
        this.createObservableInstanceIfNeeded();
        this._applySnapshot(snapshot);
    }
    _autoUnbox = true; // unboxing is disabled when reading child nodes
    _isRunningAction = false; // only relevant for root
    _hasSnapshotReaction = false;
    _observableInstanceState = 0 /* ObservableInstanceLifecycle.UNINITIALIZED */;
    _childNodes;
    _initialSnapshot;
    _cachedInitialSnapshot;
    _cachedInitialSnapshotCreated = false;
    _snapshotComputed;
    constructor(complexType, parent, subpath, environment, initialValue) {
        super(complexType, parent, subpath, environment);
        this._snapshotComputed = computed(() => freeze(this.getSnapshot()));
        this.unbox = this.unbox.bind(this);
        this._initialSnapshot = freeze(initialValue);
        this.identifierAttribute = complexType.identifierAttribute;
        if (!parent) {
            this.identifierCache = new IdentifierCache();
        }
        this._childNodes = complexType.initializeChildNodes(this, this._initialSnapshot);
        // identifier can not be changed during lifecycle of a node
        // so we safely can read it from initial snapshot
        this.identifier = null;
        this.unnormalizedIdentifier = null;
        if (this.identifierAttribute && this._initialSnapshot) {
            let id = this._initialSnapshot[this.identifierAttribute];
            if (id === undefined) {
                // try with the actual node if not (for optional identifiers)
                const childNode = this._childNodes[this.identifierAttribute];
                if (childNode) {
                    id = childNode.value;
                }
            }
            if (typeof id !== "string" && typeof id !== "number") {
                throw fail(`Instance identifier '${this.identifierAttribute}' for type '${this.type.name}' must be a string or a number`);
            }
            // normalize internal identifier to string
            this.identifier = normalizeIdentifier(id);
            this.unnormalizedIdentifier = id;
        }
        if (!parent) {
            this.identifierCache.addNodeToCache(this);
        }
        else {
            parent.root.identifierCache.addNodeToCache(this);
        }
    }
    createObservableInstanceIfNeeded(fireHooks = true) {
        if (this._observableInstanceState ===
            0 /* ObservableInstanceLifecycle.UNINITIALIZED */) {
            this.createObservableInstance(fireHooks);
        }
    }
    createObservableInstance(fireHooks = true) {
        if (devMode()) {
            if (this.state !== NodeLifeCycle.INITIALIZING) {
                // istanbul ignore next
                throw fail("assertion failed: the creation of the observable instance must be done on the initializing phase");
            }
        }
        this._observableInstanceState = 1 /* ObservableInstanceLifecycle.CREATING */;
        // make sure the parent chain is created as well
        // array with parent chain from parent to child
        const parentChain = [];
        let parent = this.parent;
        // for performance reasons we never go back further than the most direct
        // uninitialized parent
        // this is done to avoid traversing the whole tree to the root when using
        // the same reference again
        while (parent &&
            parent._observableInstanceState ===
                0 /* ObservableInstanceLifecycle.UNINITIALIZED */) {
            parentChain.unshift(parent);
            parent = parent.parent;
        }
        // initialize the uninitialized parent chain from parent to child
        for (const p of parentChain) {
            // delay firing hooks until after all parents have been created
            p.createObservableInstanceIfNeeded(false);
        }
        const type = this.type;
        try {
            // @ts-expect-error storedValue type mismatch during initialization
            this.storedValue = type.createNewInstance(this._childNodes);
            this.preboot();
            this._isRunningAction = true;
            type.finalizeNewInstance(this, this.storedValue);
        }
        catch (e) {
            // short-cut to die the instance, to avoid the snapshot computed starting to throw...
            this.state = NodeLifeCycle.DEAD;
            throw e;
        }
        finally {
            this._isRunningAction = false;
        }
        this._observableInstanceState = 2 /* ObservableInstanceLifecycle.CREATED */;
        this._snapshotComputed.trackAndCompute();
        if (this.isRoot) {
            this._addSnapshotReaction();
        }
        this._childNodes = EMPTY_OBJECT;
        this.state = NodeLifeCycle.CREATED;
        if (fireHooks) {
            this.fireHook(Hook.afterCreate);
            // Note that the parent might not be finalized at this point
            // so afterAttach won't be called until later in that case
            this.finalizeCreation();
            // fire the hooks of the parents that we created
            for (const p of parentChain.reverse()) {
                p.fireHook(Hook.afterCreate);
                // This will call afterAttach on the child if necessary
                p.finalizeCreation();
            }
        }
    }
    get root() {
        const parent = this.parent;
        return parent ? parent.root : this;
    }
    clearParent() {
        if (!this.parent) {
            return;
        }
        // detach if attached
        this.fireHook(Hook.beforeDetach);
        const previousState = this.state;
        this.state = NodeLifeCycle.DETACHING;
        const root = this.root;
        const newEnv = root.environment;
        const newIdCache = root.identifierCache.splitCache(this);
        try {
            this.parent.removeChild(this.subpath);
            this.baseSetParent(null, "");
            this.environment = newEnv;
            this.identifierCache = newIdCache;
        }
        finally {
            this.state = previousState;
        }
    }
    setParent(newParent, subpath) {
        const parentChanged = newParent !== this.parent;
        const subpathChanged = subpath !== this.subpath;
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
                throw fail("assertion failed: new parent expected");
            }
            if (this.parent && parentChanged) {
                throw fail(`A node cannot exists twice in the state tree. Failed to add ${this} to path '${newParent.path}/${subpath}'.`);
            }
            if (!this.parent && newParent.root === this) {
                throw fail(`A state tree is not allowed to contain itself. Cannot assign ${this} to path '${newParent.path}/${subpath}'`);
            }
            if (!this.parent &&
                !!this.environment &&
                this.environment !== newParent.root.environment) {
                throw fail(`A state tree cannot be made part of another state tree as long as their environments are different.`);
            }
        }
        if (parentChanged) {
            // attach to new parent
            this.environment = undefined; // will use root's
            newParent.root.identifierCache.mergeCache(this);
            this.baseSetParent(newParent, subpath);
            this.fireHook(Hook.afterAttach);
        }
        else if (subpathChanged) {
            // moving to a new subpath on the same parent
            this.baseSetParent(this.parent, subpath);
        }
    }
    fireHook(name) {
        this.fireInternalHook(name);
        const fn = this.storedValue &&
            typeof this.storedValue === "object" &&
            this.storedValue[name];
        if (typeof fn === "function") {
            // we check for it to allow old mobx peer dependencies that don't have the method to work (even when still bugged)
            if (_allowStateChangesInsideComputed) {
                _allowStateChangesInsideComputed(() => {
                    fn.apply(this.storedValue);
                });
            }
            else {
                fn.apply(this.storedValue);
            }
        }
    }
    _snapshotUponDeath;
    // advantage of using computed for a snapshot is that nicely respects transactions etc.
    get snapshot() {
        if (this.hasSnapshotPostProcessor) {
            this.createObservableInstanceIfNeeded();
        }
        return this._snapshotComputed.get();
    }
    // NOTE: we use this method to get snapshot without creating @computed overhead
    getSnapshot() {
        if (!this.isAlive) {
            return this._snapshotUponDeath;
        }
        return this._observableInstanceState === 2 /* ObservableInstanceLifecycle.CREATED */
            ? this._getActualSnapshot()
            : this._getCachedInitialSnapshot();
    }
    _getActualSnapshot() {
        return this.type.getSnapshot(this);
    }
    _getCachedInitialSnapshot() {
        if (!this._cachedInitialSnapshotCreated) {
            const type = this.type;
            const childNodes = this._childNodes;
            const snapshot = this._initialSnapshot;
            this._cachedInitialSnapshot = type.processInitialSnapshot(childNodes, snapshot);
            this._cachedInitialSnapshotCreated = true;
        }
        return this._cachedInitialSnapshot;
    }
    isRunningAction() {
        if (this._isRunningAction) {
            return true;
        }
        if (this.isRoot) {
            return false;
        }
        return this.parent.isRunningAction();
    }
    assertAlive(context) {
        const livelinessChecking = getLivelinessChecking();
        if (!this.isAlive && livelinessChecking !== "ignore") {
            const error = this._getAssertAliveError(context);
            switch (livelinessChecking) {
                case "error":
                    throw fail(error);
                case "warn":
                    warnError(error);
            }
        }
    }
    _getAssertAliveError(context) {
        const escapedPath = this.getEscapedPath(false) || this.pathUponDeath || "";
        const subpath = (context.subpath && escapeJsonPath(context.subpath)) || "";
        let actionContext = context.actionContext || getCurrentActionContext();
        // try to use a real action context if possible since it includes the action name
        if (actionContext &&
            actionContext.type !== "action" &&
            actionContext.parentActionEvent) {
            actionContext = actionContext.parentActionEvent;
        }
        let actionFullPath = "";
        if (actionContext && actionContext.name != null) {
            // try to use the context, and if it not available use the node one
            const actionPath = (actionContext &&
                actionContext.context &&
                getPath(actionContext.context)) ||
                escapedPath;
            actionFullPath = `${actionPath}.${actionContext.name}()`;
        }
        return `You are trying to read or write to an object that is no longer part of a state tree. (Object type: '${this.type.name}', Path upon death: '${escapedPath}', Subpath: '${subpath}', Action: '${actionFullPath}'). Either detach nodes first, or don't use objects after removing / replacing them in the tree.`;
    }
    getChildNode(subpath) {
        this.assertAlive({
            subpath
        });
        this._autoUnbox = false;
        try {
            return this._observableInstanceState ===
                2 /* ObservableInstanceLifecycle.CREATED */
                ? this.type.getChildNode(this, subpath)
                : this._childNodes[subpath];
        }
        finally {
            this._autoUnbox = true;
        }
    }
    getChildren() {
        this.assertAlive(EMPTY_OBJECT);
        this._autoUnbox = false;
        try {
            return this._observableInstanceState ===
                2 /* ObservableInstanceLifecycle.CREATED */
                ? this.type.getChildren(this)
                : convertChildNodesToArray(this._childNodes);
        }
        finally {
            this._autoUnbox = true;
        }
    }
    getChildType(propertyName) {
        return this.type.getChildType(propertyName);
    }
    get isProtected() {
        return this.root.isProtectionEnabled;
    }
    assertWritable(context) {
        this.assertAlive(context);
        if (!this.isRunningAction() && this.isProtected) {
            throw fail(`Cannot modify '${this}', the object is protected and can only be modified by using an action.`);
        }
    }
    removeChild(subpath) {
        this.type.removeChild(this, subpath);
    }
    // bound on the constructor
    unbox(childNode) {
        if (!childNode) {
            return childNode;
        }
        this.assertAlive({
            subpath: childNode.subpath || childNode.subpathUponDeath
        });
        return this._autoUnbox ? childNode.value : childNode;
    }
    toString() {
        const path = (this.isAlive ? this.path : this.pathUponDeath) || "<root>";
        const identifier = this.identifier ? `(id: ${this.identifier})` : "";
        return `${this.type.name}@${path}${identifier}${this.isAlive ? "" : " [dead]"}`;
    }
    finalizeCreation() {
        this.baseFinalizeCreation(() => {
            for (const child of this.getChildren()) {
                child.finalizeCreation();
            }
            this.fireInternalHook(Hook.afterCreationFinalization);
        });
    }
    detach() {
        if (!this.isAlive) {
            throw fail(`Error while detaching, node is not alive.`);
        }
        this.clearParent();
    }
    preboot() {
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        const self = this;
        this._applyPatches = createActionInvoker(this.storedValue, "@APPLY_PATCHES", (patches) => {
            patches.forEach(patch => {
                if (!patch.path) {
                    self.type.applySnapshot(self, patch.value);
                    return;
                }
                const parts = splitJsonPath(patch.path);
                const node = resolveNodeByPathParts(self, parts.slice(0, -1));
                node.applyPatchLocally(parts[parts.length - 1], patch);
            });
        });
        this._applySnapshot = createActionInvoker(this.storedValue, "@APPLY_SNAPSHOT", (snapshot) => {
            // if the snapshot is the same as the current one, avoid performing a reconcile
            if (snapshot === self.snapshot) {
                return;
            }
            // else, apply it by calling the type logic
            return self.type.applySnapshot(self, snapshot);
        });
        addHiddenFinalProp(this.storedValue, "$treenode", this);
        addHiddenFinalProp(this.storedValue, "toJSON", toJSON);
    }
    die() {
        if (!this.isAlive || this.state === NodeLifeCycle.DETACHING) {
            return;
        }
        this.aboutToDie();
        this.finalizeDeath();
    }
    aboutToDie() {
        if (this._observableInstanceState ===
            0 /* ObservableInstanceLifecycle.UNINITIALIZED */) {
            return;
        }
        this.getChildren().forEach(node => {
            node.aboutToDie();
        });
        // beforeDestroy should run before the disposers since else we could end up in a situation where
        // a disposer added with addDisposer at this stage (beforeDestroy) is actually never released
        this.baseAboutToDie();
        this._internalEventsEmit("dispose" /* InternalEvents.Dispose */);
        this._internalEventsClear("dispose" /* InternalEvents.Dispose */);
    }
    finalizeDeath() {
        // invariant: not called directly but from "die"
        this.getChildren().forEach(node => {
            node.finalizeDeath();
        });
        this.root.identifierCache.notifyDied(this);
        // "kill" the computed prop and just store the last snapshot
        const snapshot = this.snapshot;
        this._snapshotUponDeath = snapshot;
        this._internalEventsClearAll();
        this.baseFinalizeDeath();
    }
    onSnapshot(onChange) {
        this._addSnapshotReaction();
        return this._internalEventsRegister("snapshot" /* InternalEvents.Snapshot */, onChange);
    }
    emitSnapshot(snapshot) {
        this._internalEventsEmit("snapshot" /* InternalEvents.Snapshot */, snapshot);
    }
    onPatch(handler) {
        return this._internalEventsRegister("patch" /* InternalEvents.Patch */, handler);
    }
    emitPatch(basePatch, source) {
        if (this._internalEventsHasSubscribers("patch" /* InternalEvents.Patch */)) {
            const localizedPatch = extend({}, basePatch, {
                path: source.path.substr(this.path.length) + "/" + basePatch.path // calculate the relative path of the patch
            });
            const [patch, reversePatch] = splitPatch(localizedPatch);
            this._internalEventsEmit("patch" /* InternalEvents.Patch */, patch, reversePatch);
        }
        if (this.parent) {
            this.parent.emitPatch(basePatch, source);
        }
    }
    hasDisposer(disposer) {
        return this._internalEventsHas("dispose" /* InternalEvents.Dispose */, disposer);
    }
    addDisposer(disposer) {
        if (!this.hasDisposer(disposer)) {
            this._internalEventsRegister("dispose" /* InternalEvents.Dispose */, disposer, true);
            return;
        }
        throw fail("cannot add a disposer when it is already registered for execution");
    }
    removeDisposer(disposer) {
        if (!this._internalEventsHas("dispose" /* InternalEvents.Dispose */, disposer)) {
            throw fail("cannot remove a disposer which was never registered for execution");
        }
        this._internalEventsUnregister("dispose" /* InternalEvents.Dispose */, disposer);
    }
    removeMiddleware(middleware) {
        if (this.middlewares) {
            const index = this.middlewares.indexOf(middleware);
            if (index >= 0) {
                this.middlewares.splice(index, 1);
            }
        }
    }
    addMiddleWare(handler, includeHooks = true) {
        const middleware = { handler, includeHooks };
        if (!this.middlewares) {
            this.middlewares = [middleware];
        }
        else {
            this.middlewares.push(middleware);
        }
        return () => {
            this.removeMiddleware(middleware);
        };
    }
    applyPatchLocally(subpath, patch) {
        this.assertWritable({
            subpath
        });
        this.createObservableInstanceIfNeeded();
        this.type.applyPatchLocally(this, subpath, patch);
    }
    _addSnapshotReaction() {
        if (!this._hasSnapshotReaction) {
            const snapshotDisposer = reaction(() => this.snapshot, snapshot => this.emitSnapshot(snapshot), snapshotReactionOptions);
            this.addDisposer(snapshotDisposer);
            this._hasSnapshotReaction = true;
        }
    }
    // #region internal event handling
    _internalEvents;
    // we proxy the methods to avoid creating an EventHandlers instance when it is not needed
    _internalEventsHasSubscribers(event) {
        return !!this._internalEvents && this._internalEvents.hasSubscribers(event);
    }
    _internalEventsRegister(event, eventHandler, atTheBeginning = false) {
        if (!this._internalEvents) {
            this._internalEvents = new EventHandlers();
        }
        return this._internalEvents.register(event, eventHandler, atTheBeginning);
    }
    _internalEventsHas(event, eventHandler) {
        return (!!this._internalEvents && this._internalEvents.has(event, eventHandler));
    }
    _internalEventsUnregister(event, eventHandler) {
        if (this._internalEvents) {
            this._internalEvents.unregister(event, eventHandler);
        }
    }
    _internalEventsEmit(event, ...args) {
        if (this._internalEvents) {
            this._internalEvents.emit(event, ...args);
        }
    }
    _internalEventsClear(event) {
        if (this._internalEvents) {
            this._internalEvents.clear(event);
        }
    }
    _internalEventsClearAll() {
        if (this._internalEvents) {
            this._internalEvents.clearAll();
        }
    }
}
ObjectNode.prototype.createObservableInstance = action(ObjectNode.prototype.createObservableInstance);
ObjectNode.prototype.detach = action(ObjectNode.prototype.detach);
ObjectNode.prototype.die = action(ObjectNode.prototype.die);
//# sourceMappingURL=object-node.js.map