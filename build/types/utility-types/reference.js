import { SimpleType } from "../../core/type/type.js";
import { applyPatch, getIdentifier } from "../../core/mst-operations.js";
import { createScalarNode } from "../../core/node/create-node.js";
import { Hook } from "../../core/node/Hook.js";
import { getStateTreeNode, isStateTreeNode, NodeLifeCycle } from "../../core/node/node-utils.js";
import { typeCheckFailure, typeCheckSuccess } from "../../core/type/type-checker.js";
import { assertIsType, TypeFlags } from "../../core/type/type.js";
import { devMode, fail } from "../../utils.js";
import { isModelType } from "../complex-types/model.js";
import { isValidIdentifier, normalizeIdentifier } from "./identifier-utils.js";
import { maybe } from "./maybe.js";
function getInvalidationCause(hook) {
    switch (hook) {
        case Hook.beforeDestroy:
            return "destroy";
        case Hook.beforeDetach:
            return "detach";
        default:
            return undefined;
    }
}
class StoredReference {
    targetType;
    identifier;
    node;
    resolvedReference;
    constructor(value, targetType) {
        this.targetType = targetType;
        if (isValidIdentifier(value)) {
            this.identifier = value;
        }
        else if (isStateTreeNode(value)) {
            const targetNode = getStateTreeNode(value);
            if (!targetNode.identifierAttribute) {
                throw fail(`Can only store references with a defined identifier attribute.`);
            }
            const id = targetNode.unnormalizedIdentifier;
            if (id === null || id === undefined) {
                throw fail(`Can only store references to tree nodes with a defined identifier.`);
            }
            this.identifier = id;
        }
        else {
            throw fail(`Can only store references to tree nodes or identifiers, got: '${value}'`);
        }
    }
    updateResolvedReference(node) {
        const normalizedId = normalizeIdentifier(this.identifier);
        const root = node.root;
        const lastCacheModification = root.identifierCache.getLastCacheModificationPerId(normalizedId);
        if (!this.resolvedReference ||
            this.resolvedReference.lastCacheModification !== lastCacheModification) {
            const { targetType } = this;
            // reference was initialized with the identifier of the target
            const target = root.identifierCache.resolve(targetType, normalizedId);
            if (!target) {
                throw new InvalidReferenceError(`[mobx-state-tree] Failed to resolve reference '${this.identifier}' to type '${this.targetType.name}' (from node: ${node.path})`);
            }
            this.resolvedReference = {
                node: target,
                lastCacheModification: lastCacheModification
            };
        }
    }
    get resolvedValue() {
        this.updateResolvedReference(this.node);
        return this.resolvedReference.node.value;
    }
}
/**
 * @internal
 * @hidden
 */
export class InvalidReferenceError extends Error {
    constructor(m) {
        super(m);
        Object.setPrototypeOf(this, InvalidReferenceError.prototype);
    }
}
/**
 * @internal
 * @hidden
 */
export class BaseReferenceType extends SimpleType {
    targetType;
    onInvalidated;
    flags = TypeFlags.Reference;
    constructor(targetType, onInvalidated) {
        super(`reference(${targetType.name})`);
        this.targetType = targetType;
        this.onInvalidated = onInvalidated;
    }
    describe() {
        return this.name;
    }
    isAssignableFrom(type) {
        return this.targetType.isAssignableFrom(type);
    }
    isValidSnapshot(value, context) {
        return isValidIdentifier(value)
            ? typeCheckSuccess()
            : typeCheckFailure(context, value, "Value is not a valid identifier, which is a string or a number");
    }
    fireInvalidated(cause, storedRefNode, referenceId, refTargetNode) {
        // to actually invalidate a reference we need an alive parent,
        // since it is a scalar value (immutable-ish) and we need to change it
        // from the parent
        const storedRefParentNode = storedRefNode.parent;
        if (!storedRefParentNode || !storedRefParentNode.isAlive) {
            return;
        }
        const storedRefParentValue = storedRefParentNode.storedValue;
        if (!storedRefParentValue) {
            return;
        }
        this.onInvalidated({
            cause,
            parent: storedRefParentValue,
            invalidTarget: refTargetNode ? refTargetNode.storedValue : undefined,
            invalidId: referenceId,
            replaceRef(newRef) {
                applyPatch(storedRefNode.root.storedValue, {
                    op: "replace",
                    value: newRef,
                    path: storedRefNode.path
                });
            },
            removeRef() {
                if (isModelType(storedRefParentNode.type)) {
                    this.replaceRef(undefined);
                }
                else {
                    applyPatch(storedRefNode.root.storedValue, {
                        op: "remove",
                        path: storedRefNode.path
                    });
                }
            }
        });
    }
    addTargetNodeWatcher(storedRefNode, referenceId) {
        // this will make sure the target node becomes created
        const refTargetValue = this.getValue(storedRefNode);
        if (!refTargetValue) {
            return undefined;
        }
        const refTargetNode = getStateTreeNode(refTargetValue);
        const hookHandler = (_, refTargetNodeHook) => {
            const cause = getInvalidationCause(refTargetNodeHook);
            if (!cause) {
                return;
            }
            this.fireInvalidated(cause, storedRefNode, referenceId, refTargetNode);
        };
        const refTargetDetachHookDisposer = refTargetNode.registerHook(Hook.beforeDetach, hookHandler);
        const refTargetDestroyHookDisposer = refTargetNode.registerHook(Hook.beforeDestroy, hookHandler);
        return () => {
            refTargetDetachHookDisposer();
            refTargetDestroyHookDisposer();
        };
    }
    watchTargetNodeForInvalidations(storedRefNode, identifier, customGetSet) {
        if (!this.onInvalidated) {
            return;
        }
        let onRefTargetDestroyedHookDisposer;
        // get rid of the watcher hook when the stored ref node is destroyed
        // detached is ignored since scalar nodes (where the reference resides) cannot be detached
        storedRefNode.registerHook(Hook.beforeDestroy, () => {
            if (onRefTargetDestroyedHookDisposer) {
                onRefTargetDestroyedHookDisposer();
            }
        });
        const startWatching = (sync) => {
            // re-create hook in case the stored ref gets reattached
            if (onRefTargetDestroyedHookDisposer) {
                onRefTargetDestroyedHookDisposer();
            }
            // make sure the target node is actually there and initialized
            const storedRefParentNode = storedRefNode.parent;
            const storedRefParentValue = storedRefParentNode && storedRefParentNode.storedValue;
            if (storedRefParentNode &&
                storedRefParentNode.isAlive &&
                storedRefParentValue) {
                let refTargetNodeExists;
                if (customGetSet) {
                    refTargetNodeExists = !!customGetSet.get(identifier, storedRefParentValue);
                }
                else {
                    refTargetNodeExists = storedRefNode.root.identifierCache.has(this.targetType, normalizeIdentifier(identifier));
                }
                if (!refTargetNodeExists) {
                    // we cannot change the reference in sync mode
                    // since we are in the middle of a reconciliation/instantiation and the change would be overwritten
                    // for those cases just let the wrong reference be assigned and fail upon usage
                    // (like current references do)
                    // this means that effectively this code will only run when it is created from a snapshot
                    if (!sync) {
                        this.fireInvalidated("invalidSnapshotReference", storedRefNode, identifier, null);
                    }
                }
                else {
                    onRefTargetDestroyedHookDisposer = this.addTargetNodeWatcher(storedRefNode, identifier);
                }
            }
        };
        if (storedRefNode.state === NodeLifeCycle.FINALIZED) {
            // already attached, so the whole tree is ready
            startWatching(true);
        }
        else {
            if (!storedRefNode.isRoot) {
                // start watching once the whole tree is ready
                storedRefNode.root.registerHook(Hook.afterCreationFinalization, () => {
                    // make sure to attach it so it can start listening
                    if (storedRefNode.parent) {
                        storedRefNode.parent.createObservableInstanceIfNeeded();
                    }
                });
            }
            // start watching once the node is attached somewhere / parent changes
            storedRefNode.registerHook(Hook.afterAttach, () => {
                startWatching(false);
            });
        }
    }
}
/**
 * @internal
 * @hidden
 */
export class IdentifierReferenceType extends BaseReferenceType {
    constructor(targetType, onInvalidated) {
        super(targetType, onInvalidated);
    }
    getValue(storedRefNode) {
        if (!storedRefNode.isAlive) {
            return undefined;
        }
        const storedRef = storedRefNode.storedValue;
        return storedRef.resolvedValue;
    }
    getSnapshot(storedRefNode) {
        const ref = storedRefNode.storedValue;
        return ref.identifier;
    }
    instantiate(parent, subpath, environment, initialValue) {
        const identifier = isStateTreeNode(initialValue)
            ? getIdentifier(initialValue)
            : initialValue;
        const storedRef = new StoredReference(initialValue, this.targetType);
        const storedRefNode = createScalarNode(this, parent, subpath, environment, storedRef);
        storedRef.node = storedRefNode;
        this.watchTargetNodeForInvalidations(storedRefNode, identifier, undefined);
        return storedRefNode;
    }
    reconcile(current, newValue, parent, subpath) {
        if (!current.isDetaching && current.type === this) {
            const compareByValue = isStateTreeNode(newValue);
            const ref = current.storedValue;
            if ((!compareByValue && ref.identifier === newValue) ||
                (compareByValue && ref.resolvedValue === newValue)) {
                current.setParent(parent, subpath);
                return current;
            }
        }
        const newNode = this.instantiate(parent, subpath, undefined, newValue);
        current.die(); // noop if detaching
        return newNode;
    }
}
/**
 * @internal
 * @hidden
 */
export class CustomReferenceType extends BaseReferenceType {
    options;
    constructor(targetType, options, onInvalidated) {
        super(targetType, onInvalidated);
        this.options = options;
    }
    getValue(storedRefNode) {
        if (!storedRefNode.isAlive) {
            return undefined;
        }
        const referencedNode = this.options.get(storedRefNode.storedValue, storedRefNode.parent ? storedRefNode.parent.storedValue : null);
        return referencedNode;
    }
    getSnapshot(storedRefNode) {
        return storedRefNode.storedValue;
    }
    instantiate(parent, subpath, environment, newValue) {
        const identifier = isStateTreeNode(newValue)
            ? this.options.set(newValue, parent ? parent.storedValue : null)
            : newValue;
        const storedRefNode = createScalarNode(this, parent, subpath, environment, identifier);
        this.watchTargetNodeForInvalidations(storedRefNode, identifier, this.options);
        return storedRefNode;
    }
    reconcile(current, newValue, parent, subpath) {
        const newIdentifier = isStateTreeNode(newValue)
            ? this.options.set(newValue, current ? current.storedValue : null)
            : newValue;
        if (!current.isDetaching &&
            current.type === this &&
            current.storedValue === newIdentifier) {
            current.setParent(parent, subpath);
            return current;
        }
        const newNode = this.instantiate(parent, subpath, undefined, newIdentifier);
        current.die(); // noop if detaching
        return newNode;
    }
}
/**
 * `types.reference` - Creates a reference to another type, which should have defined an identifier.
 * See also the [reference and identifiers](https://github.com/mobxjs/mobx-state-tree#references-and-identifiers) section.
 */
export function reference(subType, options) {
    assertIsType(subType, 1);
    if (devMode()) {
        if (options && typeof options === "string") {
            // istanbul ignore next
            throw fail("References with base path are no longer supported. Please remove the base path.");
        }
    }
    const getSetOptions = options
        ? options
        : undefined;
    const onInvalidated = options
        ? options.onInvalidated
        : undefined;
    if (getSetOptions && (getSetOptions.get || getSetOptions.set)) {
        if (devMode()) {
            if (!getSetOptions.get || !getSetOptions.set) {
                throw fail("reference options must either contain both a 'get' and a 'set' method or none of them");
            }
        }
        return new CustomReferenceType(subType, {
            get: getSetOptions.get,
            set: getSetOptions.set
        }, onInvalidated);
    }
    else {
        return new IdentifierReferenceType(subType, onInvalidated);
    }
}
/**
 * Returns if a given value represents a reference type.
 *
 * @param type
 * @returns
 */
export function isReferenceType(type) {
    return (type.flags & TypeFlags.Reference) > 0;
}
/**
 * `types.safeReference` - A safe reference is like a standard reference, except that it accepts the undefined value by default
 * and automatically sets itself to undefined (when the parent is a model) / removes itself from arrays and maps
 * when the reference it is pointing to gets detached/destroyed.
 *
 * The optional options parameter object accepts a parameter named `acceptsUndefined`, which is set to true by default, so it is suitable
 * for model properties.
 * When used inside collections (arrays/maps), it is recommended to set this option to false so it can't take undefined as value,
 * which is usually the desired in those cases.
 * Additionally, the optional options parameter object accepts a parameter named `onInvalidated`, which will be called when the reference target node that the reference is pointing to is about to be detached/destroyed
 *
 * Strictly speaking it is a `types.maybe(types.reference(X))` (when `acceptsUndefined` is set to true, the default) and
 * `types.reference(X)` (when `acceptsUndefined` is set to false), both of them with a customized `onInvalidated` option.
 *
 * @param subType
 * @param options
 * @returns
 */
export function safeReference(subType, options) {
    const refType = reference(subType, {
        ...options,
        onInvalidated(ev) {
            if (options && options.onInvalidated) {
                options.onInvalidated(ev);
            }
            ev.removeRef();
        }
    });
    if (options && options.acceptsUndefined === false) {
        return refType;
    }
    else {
        return maybe(refType);
    }
}
//# sourceMappingURL=reference.js.map