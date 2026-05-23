import { action } from "mobx";
import { normalizeIdentifier } from "../../types/utility-types/identifier-utils.js";
import { assertArg, fail, isMutable } from "../../utils.js";
import { getType } from "../mst-operations.js";
import { getStateTreeNode, getStateTreeNodeSafe, isStateTreeNode } from "../node/node-utils.js";
import { typeCheckFailure, typecheckInternal, typeCheckSuccess } from "./type-checker.js";
// Cache for validation results to avoid re-validating the same object against the same type
// Uses WeakMap so cached objects can be garbage collected
const validationCache = new WeakMap();
/**
 * @internal
 * @hidden
 */
export var TypeFlags;
(function (TypeFlags) {
    TypeFlags[TypeFlags["String"] = 1] = "String";
    TypeFlags[TypeFlags["Number"] = 2] = "Number";
    TypeFlags[TypeFlags["Boolean"] = 4] = "Boolean";
    TypeFlags[TypeFlags["Date"] = 8] = "Date";
    TypeFlags[TypeFlags["Literal"] = 16] = "Literal";
    TypeFlags[TypeFlags["Array"] = 32] = "Array";
    TypeFlags[TypeFlags["Map"] = 64] = "Map";
    TypeFlags[TypeFlags["Object"] = 128] = "Object";
    TypeFlags[TypeFlags["Frozen"] = 256] = "Frozen";
    TypeFlags[TypeFlags["Optional"] = 512] = "Optional";
    TypeFlags[TypeFlags["Reference"] = 1024] = "Reference";
    TypeFlags[TypeFlags["Identifier"] = 2048] = "Identifier";
    TypeFlags[TypeFlags["Late"] = 4096] = "Late";
    TypeFlags[TypeFlags["Refinement"] = 8192] = "Refinement";
    TypeFlags[TypeFlags["Union"] = 16384] = "Union";
    TypeFlags[TypeFlags["Null"] = 32768] = "Null";
    TypeFlags[TypeFlags["Undefined"] = 65536] = "Undefined";
    TypeFlags[TypeFlags["Integer"] = 131072] = "Integer";
    TypeFlags[TypeFlags["Custom"] = 262144] = "Custom";
    TypeFlags[TypeFlags["SnapshotProcessor"] = 524288] = "SnapshotProcessor";
    TypeFlags[TypeFlags["Lazy"] = 1048576] = "Lazy";
    TypeFlags[TypeFlags["Finite"] = 2097152] = "Finite";
    TypeFlags[TypeFlags["Float"] = 4194304] = "Float";
})(TypeFlags || (TypeFlags = {}));
/**
 * @internal
 * @hidden
 */
export const cannotDetermineSubtype = "cannotDetermine";
/** @hidden */
const $type = Symbol("$type");
/**
 * A base type produces a MST node (Node in the state tree)
 *
 * @internal
 * @hidden
 */
export class BaseType {
    [$type];
    // these are just to make inner types avaialable to inherited classes
    C;
    S;
    T;
    N;
    isType = true;
    name;
    constructor(name) {
        this.name = name;
    }
    create(snapshot, environment) {
        typecheckInternal(this, snapshot);
        return this.instantiate(null, "", environment, snapshot).value;
    }
    getSnapshot(_node, _applyPostProcess) {
        // istanbul ignore next
        throw fail("unimplemented method");
    }
    isAssignableFrom(type) {
        return type === this;
    }
    validate(value, context) {
        const node = getStateTreeNodeSafe(value);
        if (node) {
            const valueType = getType(value);
            return this.isAssignableFrom(valueType)
                ? typeCheckSuccess()
                : typeCheckFailure(context, value);
            // it is tempting to compare snapshots, but in that case we should always clone on assignments...
        }
        // check cache for object values (only at root level to avoid context mismatches)
        if (typeof value === "object" && value !== null && context.length === 1) {
            const typeCache = validationCache.get(value);
            if (typeCache) {
                const cached = typeCache.get(this);
                if (cached !== undefined) {
                    return cached;
                }
            }
        }
        const result = this.isValidSnapshot(value, context);
        // cache result for object values (only at root level)
        if (typeof value === "object" && value !== null && context.length === 1) {
            let typeCache = validationCache.get(value);
            if (!typeCache) {
                typeCache = new WeakMap();
                validationCache.set(value, typeCache);
            }
            typeCache.set(this, result);
        }
        return result;
    }
    is(thing) {
        return this.validate(thing, [{ path: "", type: this }]).length === 0;
    }
    get Type() {
        // istanbul ignore next
        throw fail("Factory.Type should not be actually called. It is just a Type signature that can be used at compile time with Typescript, by using `typeof type.Type`");
    }
    get TypeWithoutSTN() {
        // istanbul ignore next
        throw fail("Factory.TypeWithoutSTN should not be actually called. It is just a Type signature that can be used at compile time with Typescript, by using `typeof type.TypeWithoutSTN`");
    }
    get SnapshotType() {
        // istanbul ignore next
        throw fail("Factory.SnapshotType should not be actually called. It is just a Type signature that can be used at compile time with Typescript, by using `typeof type.SnapshotType`");
    }
    get CreationType() {
        // istanbul ignore next
        throw fail("Factory.CreationType should not be actually called. It is just a Type signature that can be used at compile time with Typescript, by using `typeof type.CreationType`");
    }
}
BaseType.prototype.create = action(BaseType.prototype.create);
/**
 * A complex type produces a MST node (Node in the state tree)
 *
 * @internal
 * @hidden
 */
export class ComplexType extends BaseType {
    identifierAttribute;
    constructor(name) {
        super(name);
    }
    create(snapshot = this.getDefaultSnapshot(), environment) {
        return super.create(snapshot, environment);
    }
    getValue(node) {
        node.createObservableInstanceIfNeeded();
        return node.storedValue;
    }
    isMatchingSnapshotId(current, snapshot) {
        return (!current.identifierAttribute ||
            current.identifier ===
                normalizeIdentifier(snapshot[current.identifierAttribute]));
    }
    tryToReconcileNode(current, newValue) {
        if (current.isDetaching) {
            return false;
        }
        if (current.snapshot === newValue) {
            // newValue is the current snapshot of the node, noop
            return true;
        }
        if (isStateTreeNode(newValue) && getStateTreeNode(newValue) === current) {
            // the current node is the same as the new one
            return true;
        }
        if (current.type === this &&
            isMutable(newValue) &&
            !isStateTreeNode(newValue) &&
            this.isMatchingSnapshotId(current, newValue)) {
            // the newValue has no node, so can be treated like a snapshot
            // we can reconcile
            current.applySnapshot(newValue);
            return true;
        }
        return false;
    }
    reconcile(current, newValue, parent, subpath) {
        const nodeReconciled = this.tryToReconcileNode(current, newValue);
        if (nodeReconciled) {
            current.setParent(parent, subpath);
            return current;
        }
        // current node cannot be recycled in any way
        current.die(); // noop if detaching
        // attempt to reuse the new one
        if (isStateTreeNode(newValue) && this.isAssignableFrom(getType(newValue))) {
            // newValue is a Node as well, move it here..
            const newNode = getStateTreeNode(newValue);
            newNode.setParent(parent, subpath);
            return newNode;
        }
        // nothing to do, we have to create a new node
        return this.instantiate(parent, subpath, undefined, newValue);
    }
    getSubTypes() {
        return null;
    }
}
ComplexType.prototype.create = action(ComplexType.prototype.create);
/**
 * @internal
 * @hidden
 */
export class SimpleType extends BaseType {
    createNewInstance(snapshot) {
        return snapshot;
    }
    getValue(node) {
        // if we ever find a case where scalar nodes can be accessed without iterating through its parent
        // uncomment this to make sure the parent chain is created when this is accessed
        // if (node.parent) {
        //     node.parent.createObservableInstanceIfNeeded()
        // }
        return node.storedValue;
    }
    getSnapshot(node) {
        return node.storedValue;
    }
    reconcile(current, newValue, parent, subpath) {
        // reconcile only if type and value are still the same, and only if the node is not detaching
        if (!current.isDetaching &&
            current.type === this &&
            current.storedValue === newValue) {
            return current;
        }
        const res = this.instantiate(parent, subpath, undefined, newValue);
        current.die(); // noop if detaching
        return res;
    }
    getSubTypes() {
        return null;
    }
}
/**
 * Returns if a given value represents a type.
 *
 * @param value Value to check.
 * @returns `true` if the value is a type.
 */
export function isType(value) {
    return typeof value === "object" && value && value.isType === true;
}
/**
 * @internal
 * @hidden
 */
export function assertIsType(type, argNumber) {
    assertArg(type, isType, "mobx-state-tree type", argNumber);
}
//# sourceMappingURL=type.js.map