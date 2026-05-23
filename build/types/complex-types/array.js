import { _getAdministration, action, intercept, observable, observe } from "mobx";
import { ComplexType } from "../../core/type/type.js";
import { createActionInvoker } from "../../core/action.js";
import { createObjectNode, isNode } from "../../core/node/create-node.js";
import { convertChildNodesToArray, getStateTreeNode, isStateTreeNode } from "../../core/node/node-utils.js";
import { ObjectNode } from "../../core/node/object-node.js";
import { getContextForPath, popContext, typeCheckFailure, typecheckInternal, typeCheckSuccess } from "../../core/type/type-checker.js";
import { assertIsType, isType, TypeFlags } from "../../core/type/type.js";
import { addHiddenFinalProp, addHiddenWritableProp, devMode, EMPTY_ARRAY, EMPTY_OBJECT, fail, isArray, isPlainObject, mobxShallow } from "../../utils.js";
/**
 * @internal
 * @hidden
 */
export class ArrayType extends ComplexType {
    _subType;
    flags = TypeFlags.Array;
    hookInitializers = [];
    constructor(name, _subType, hookInitializers = []) {
        super(name);
        this._subType = _subType;
        this.hookInitializers = hookInitializers;
    }
    hooks(hooks) {
        const hookInitializers = this.hookInitializers.length > 0
            ? this.hookInitializers.concat(hooks)
            : [hooks];
        return new ArrayType(this.name, this._subType, hookInitializers);
    }
    instantiate(parent, subpath, environment, initialValue) {
        return createObjectNode(this, parent, subpath, environment, initialValue);
    }
    initializeChildNodes(objNode, snapshot = []) {
        const subType = objNode.type._subType;
        const result = {};
        snapshot.forEach((item, index) => {
            const subpath = "" + index;
            result[subpath] = subType.instantiate(objNode, subpath, undefined, item);
        });
        return result;
    }
    createNewInstance(childNodes) {
        const options = { ...mobxShallow, name: this.name };
        return observable.array(convertChildNodesToArray(childNodes), options);
    }
    finalizeNewInstance(node, instance) {
        _getAdministration(instance).dehancer = node.unbox;
        const type = node.type;
        type.hookInitializers.forEach(initializer => {
            const hooks = initializer(instance);
            Object.keys(hooks).forEach(name => {
                const hook = hooks[name];
                const actionInvoker = createActionInvoker(instance, name, hook);
                (!devMode() ? addHiddenFinalProp : addHiddenWritableProp)(instance, name, actionInvoker);
            });
        });
        intercept(instance, this.willChange);
        observe(instance, this.didChange);
    }
    describe() {
        return this.name;
    }
    getChildren(node) {
        return node.storedValue.slice();
    }
    getChildNode(node, key) {
        const index = Number(key);
        if (index < node.storedValue.length) {
            return node.storedValue[index];
        }
        throw fail("Not a child: " + key);
    }
    willChange(change) {
        const node = getStateTreeNode(change.object);
        node.assertWritable({ subpath: "" + change.index });
        const subType = node.type._subType;
        const childNodes = node.getChildren();
        switch (change.type) {
            case "update":
                {
                    if (change.newValue === change.object[change.index]) {
                        return null;
                    }
                    const updatedNodes = reconcileArrayChildren(node, subType, [childNodes[change.index]], [change.newValue], [change.index]);
                    if (!updatedNodes) {
                        return null;
                    }
                    change.newValue = updatedNodes[0];
                }
                break;
            case "splice":
                {
                    const { index, removedCount, added } = change;
                    const addedNodes = reconcileArrayChildren(node, subType, childNodes.slice(index, index + removedCount), added, added.map((_, i) => index + i));
                    if (!addedNodes) {
                        return null;
                    }
                    change.added = addedNodes;
                    // update paths of remaining items
                    for (let i = index + removedCount; i < childNodes.length; i++) {
                        childNodes[i].setParent(node, "" + (i + added.length - removedCount));
                    }
                }
                break;
        }
        return change;
    }
    getSnapshot(node) {
        return node.getChildren().map(childNode => childNode.snapshot);
    }
    processInitialSnapshot(childNodes) {
        const processed = [];
        Object.keys(childNodes).forEach(key => {
            processed.push(childNodes[key].getSnapshot());
        });
        return processed;
    }
    didChange(change) {
        const node = getStateTreeNode(change.object);
        switch (change.type) {
            case "update":
                return void node.emitPatch({
                    op: "replace",
                    path: "" + change.index,
                    value: change.newValue.snapshot,
                    oldValue: change.oldValue ? change.oldValue.snapshot : undefined
                }, node);
            case "splice":
                for (let i = change.removedCount - 1; i >= 0; i--) {
                    node.emitPatch({
                        op: "remove",
                        path: "" + (change.index + i),
                        oldValue: change.removed[i].snapshot
                    }, node);
                }
                for (let i = 0; i < change.addedCount; i++) {
                    node.emitPatch({
                        op: "add",
                        path: "" + (change.index + i),
                        value: node.getChildNode("" + (change.index + i)).snapshot,
                        oldValue: undefined
                    }, node);
                }
                return;
        }
    }
    applyPatchLocally(node, subpath, patch) {
        const target = node.storedValue;
        const index = subpath === "-" ? target.length : Number(subpath);
        switch (patch.op) {
            case "replace":
                target[index] = patch.value;
                break;
            case "add":
                target.splice(index, 0, patch.value);
                break;
            case "remove":
                target.splice(index, 1);
                break;
        }
    }
    applySnapshot(node, snapshot) {
        typecheckInternal(this, snapshot);
        const target = node.storedValue;
        target.replace(snapshot);
    }
    getChildType() {
        return this._subType;
    }
    isValidSnapshot(value, context) {
        if (!isArray(value)) {
            return typeCheckFailure(context, value, "Value is not an array");
        }
        for (let i = 0; i < value.length; i++) {
            getContextForPath(context, "" + i, this._subType);
            const errors = this._subType.validate(value[i], context);
            popContext(context);
            if (errors.length > 0) {
                return errors;
            }
        }
        return typeCheckSuccess();
    }
    getDefaultSnapshot() {
        return EMPTY_ARRAY;
    }
    removeChild(node, subpath) {
        node.storedValue.splice(Number(subpath), 1);
    }
}
ArrayType.prototype.applySnapshot = action(ArrayType.prototype.applySnapshot);
/**
 * `types.array` - Creates an index based collection type who's children are all of a uniform declared type.
 *
 * This type will always produce [observable arrays](https://mobx.js.org/api.html#observablearray)
 *
 * Example:
 * ```ts
 * const Todo = types.model({
 *   task: types.string
 * })
 *
 * const TodoStore = types.model({
 *   todos: types.array(Todo)
 * })
 *
 * const s = TodoStore.create({ todos: [] })
 * unprotect(s) // needed to allow modifying outside of an action
 * s.todos.push({ task: "Grab coffee" })
 * console.log(s.todos[0]) // prints: "Grab coffee"
 * ```
 *
 * @param subtype
 * @returns
 */
export function array(subtype) {
    assertIsType(subtype, 1);
    return new ArrayType(`${subtype.name}[]`, subtype);
}
function reconcileArrayChildren(parent, childType, oldNodes, newValues, newPaths) {
    let nothingChanged = true;
    for (let i = 0;; i++) {
        const hasNewNode = i <= newValues.length - 1;
        const oldNode = oldNodes[i];
        let newValue = hasNewNode ? newValues[i] : undefined;
        const newPath = "" + newPaths[i];
        // for some reason, instead of newValue we got a node, fallback to the storedValue
        // TODO: https://github.com/mobxjs/mobx-state-tree/issues/340#issuecomment-325581681
        if (isNode(newValue)) {
            newValue = newValue.storedValue;
        }
        if (!oldNode && !hasNewNode) {
            // both are empty, end
            break;
        }
        else if (!hasNewNode) {
            // new one does not exists
            nothingChanged = false;
            oldNodes.splice(i, 1);
            if (oldNode instanceof ObjectNode) {
                // since it is going to be returned by pop/splice/shift better create it before killing it
                // so it doesn't end up in an undead state
                oldNode.createObservableInstanceIfNeeded();
            }
            oldNode.die();
            i--;
        }
        else if (!oldNode) {
            // there is no old node, create it
            // check if already belongs to the same parent. if so, avoid pushing item in. only swapping can occur.
            if (isStateTreeNode(newValue) &&
                getStateTreeNode(newValue).parent === parent) {
                // this node is owned by this parent, but not in the reconcilable set, so it must be double
                throw fail(`Cannot add an object to a state tree if it is already part of the same or another state tree. Tried to assign an object to '${parent.path}/${newPath}', but it lives already at '${getStateTreeNode(newValue).path}'`);
            }
            nothingChanged = false;
            const newNode = valueAsNode(childType, parent, newPath, newValue);
            oldNodes.splice(i, 0, newNode);
        }
        else if (areSame(oldNode, newValue)) {
            // both are the same, reconcile
            oldNodes[i] = valueAsNode(childType, parent, newPath, newValue, oldNode);
        }
        else {
            // nothing to do, try to reorder
            let oldMatch = undefined;
            // find a possible candidate to reuse
            for (let j = i; j < oldNodes.length; j++) {
                if (areSame(oldNodes[j], newValue)) {
                    oldMatch = oldNodes.splice(j, 1)[0];
                    break;
                }
            }
            nothingChanged = false;
            const newNode = valueAsNode(childType, parent, newPath, newValue, oldMatch);
            oldNodes.splice(i, 0, newNode);
        }
    }
    return nothingChanged ? null : oldNodes;
}
/**
 * Convert a value to a node at given parent and subpath. Attempts to reuse old node if possible and given.
 */
function valueAsNode(childType, parent, subpath, newValue, oldNode) {
    // ensure the value is valid-ish
    typecheckInternal(childType, newValue);
    function getNewNode() {
        // the new value has a MST node
        if (isStateTreeNode(newValue)) {
            const childNode = getStateTreeNode(newValue);
            childNode.assertAlive(EMPTY_OBJECT);
            // the node lives here
            if (childNode.parent !== null && childNode.parent === parent) {
                childNode.setParent(parent, subpath);
                return childNode;
            }
        }
        // there is old node and new one is a value/snapshot
        if (oldNode) {
            return childType.reconcile(oldNode, newValue, parent, subpath);
        }
        // nothing to do, create from scratch
        return childType.instantiate(parent, subpath, undefined, newValue);
    }
    const newNode = getNewNode();
    if (oldNode && oldNode !== newNode) {
        if (oldNode instanceof ObjectNode) {
            // since it is going to be returned by pop/splice/shift better create it before killing it
            // so it doesn't end up in an undead state
            oldNode.createObservableInstanceIfNeeded();
        }
        oldNode.die();
    }
    return newNode;
}
/**
 * Check if a node holds a value.
 */
function areSame(oldNode, newValue) {
    // never consider dead old nodes for reconciliation
    if (!oldNode.isAlive) {
        return false;
    }
    // the new value has the same node
    if (isStateTreeNode(newValue)) {
        const newNode = getStateTreeNode(newValue);
        return newNode.isAlive && newNode === oldNode;
    }
    // the provided value is the snapshot of the old node
    if (oldNode.snapshot === newValue) {
        return true;
    }
    // Non object nodes don't get reconciled
    if (!(oldNode instanceof ObjectNode)) {
        return false;
    }
    const oldNodeType = oldNode.getReconciliationType();
    // new value is a snapshot with the correct identifier
    return (oldNode.identifier !== null &&
        oldNode.identifierAttribute &&
        isPlainObject(newValue) &&
        oldNodeType.is(newValue) &&
        oldNodeType.isMatchingSnapshotId(oldNode, newValue));
}
/**
 * Returns if a given value represents an array type.
 *
 * @param type
 * @returns `true` if the type is an array type.
 */
export function isArrayType(type) {
    return isType(type) && (type.flags & TypeFlags.Array) > 0;
}
//# sourceMappingURL=array.js.map