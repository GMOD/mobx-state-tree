import { ObservableMap, _interceptReads, action, intercept, observable, observe, values } from "mobx";
import { ComplexType } from "../../core/type/type.js";
import { createActionInvoker } from "../../core/action.js";
import { escapeJsonPath } from "../../core/json-patch.js";
import { getSnapshot } from "../../core/mst-operations.js";
import { createObjectNode } from "../../core/node/create-node.js";
import { getStateTreeNode, isStateTreeNode } from "../../core/node/node-utils.js";
import { ObjectNode } from "../../core/node/object-node.js";
import { getContextForPath, popContext, typeCheckFailure, typecheckInternal, typeCheckSuccess } from "../../core/type/type-checker.js";
import { cannotDetermineSubtype, isType, TypeFlags } from "../../core/type/type.js";
import { addHiddenFinalProp, addHiddenWritableProp, asArray, devMode, EMPTY_OBJECT, fail, isMutable, isPlainObject } from "../../utils.js";
import { isValidIdentifier, normalizeIdentifier } from "../utility-types/identifier-utils.js";
import { ModelType } from "./model.js";
const needsIdentifierError = `Map.put can only be used to store complex values that have an identifier type attribute`;
function tryCollectModelTypes(type, modelTypes) {
    const subtypes = type.getSubTypes();
    if (subtypes === cannotDetermineSubtype) {
        return false;
    }
    if (subtypes) {
        const subtypesArray = asArray(subtypes);
        for (const subtype of subtypesArray) {
            if (!tryCollectModelTypes(subtype, modelTypes)) {
                return false;
            }
        }
    }
    if (type instanceof ModelType) {
        modelTypes.push(type);
    }
    return true;
}
/**
 * @internal
 * @hidden
 */
export var MapIdentifierMode;
(function (MapIdentifierMode) {
    MapIdentifierMode[MapIdentifierMode["UNKNOWN"] = 0] = "UNKNOWN";
    MapIdentifierMode[MapIdentifierMode["YES"] = 1] = "YES";
    MapIdentifierMode[MapIdentifierMode["NO"] = 2] = "NO";
})(MapIdentifierMode || (MapIdentifierMode = {}));
class MSTMap extends ObservableMap {
    constructor(initialData, name) {
        super(initialData, observable.ref.enhancer, name);
    }
    get(key) {
        // maybe this is over-enthousiastic? normalize numeric keys to strings
        return super.get("" + key);
    }
    has(key) {
        return super.has("" + key);
    }
    delete(key) {
        return super.delete("" + key);
    }
    set(key, value) {
        return super.set("" + key, value);
    }
    put(value) {
        if (!value) {
            throw fail(`Map.put cannot be used to set empty values`);
        }
        if (isStateTreeNode(value)) {
            const node = getStateTreeNode(value);
            if (devMode()) {
                if (!node.identifierAttribute) {
                    throw fail(needsIdentifierError);
                }
            }
            if (node.identifier === null) {
                throw fail(needsIdentifierError);
            }
            this.set(node.identifier, value);
            return value;
        }
        else if (!isMutable(value)) {
            throw fail(`Map.put can only be used to store complex values`);
        }
        else {
            const mapNode = getStateTreeNode(this);
            const mapType = mapNode.type;
            if (mapType.identifierMode !== MapIdentifierMode.YES) {
                throw fail(needsIdentifierError);
            }
            const idAttr = mapType.mapIdentifierAttribute;
            const id = value[idAttr];
            if (!isValidIdentifier(id)) {
                // try again but this time after creating a node for the value
                // since it might be an optional identifier
                const newNode = this.put(mapType.getChildType().create(value, mapNode.environment));
                return this.put(getSnapshot(newNode));
            }
            const key = normalizeIdentifier(id);
            this.set(key, value);
            return this.get(key);
        }
    }
}
/**
 * @internal
 * @hidden
 */
export class MapType extends ComplexType {
    _subType;
    identifierMode = MapIdentifierMode.UNKNOWN;
    mapIdentifierAttribute = undefined;
    flags = TypeFlags.Map;
    hookInitializers = [];
    constructor(name, _subType, hookInitializers = []) {
        super(name);
        this._subType = _subType;
        this._determineIdentifierMode();
        this.hookInitializers = hookInitializers;
    }
    hooks(hooks) {
        const hookInitializers = this.hookInitializers.length > 0
            ? this.hookInitializers.concat(hooks)
            : [hooks];
        return new MapType(this.name, this._subType, hookInitializers);
    }
    instantiate(parent, subpath, environment, initialValue) {
        this._determineIdentifierMode();
        return createObjectNode(this, parent, subpath, environment, initialValue);
    }
    _determineIdentifierMode() {
        if (this.identifierMode !== MapIdentifierMode.UNKNOWN) {
            return;
        }
        const modelTypes = [];
        if (tryCollectModelTypes(this._subType, modelTypes)) {
            const identifierAttribute = modelTypes.reduce((current, type) => {
                if (!type.identifierAttribute) {
                    return current;
                }
                if (current && current !== type.identifierAttribute) {
                    throw fail(`The objects in a map should all have the same identifier attribute, expected '${current}', but child of type '${type.name}' declared attribute '${type.identifierAttribute}' as identifier`);
                }
                return type.identifierAttribute;
            }, undefined);
            if (identifierAttribute) {
                this.identifierMode = MapIdentifierMode.YES;
                this.mapIdentifierAttribute = identifierAttribute;
            }
            else {
                this.identifierMode = MapIdentifierMode.NO;
            }
        }
    }
    initializeChildNodes(objNode, initialSnapshot = {}) {
        const subType = objNode.type._subType;
        const result = {};
        Object.keys(initialSnapshot).forEach(name => {
            result[name] = subType.instantiate(objNode, name, undefined, initialSnapshot[name]);
        });
        return result;
    }
    createNewInstance(childNodes) {
        return new MSTMap(childNodes, this.name);
    }
    finalizeNewInstance(node, instance) {
        _interceptReads(instance, node.unbox);
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
        // return (node.storedValue as ObservableMap<any>).values()
        return values(node.storedValue);
    }
    getChildNode(node, key) {
        const childNode = node.storedValue.get("" + key);
        if (!childNode) {
            throw fail("Not a child " + key);
        }
        return childNode;
    }
    willChange(change) {
        const node = getStateTreeNode(change.object);
        const key = change.name;
        node.assertWritable({ subpath: key });
        const mapType = node.type;
        const subType = mapType._subType;
        switch (change.type) {
            case "update":
                {
                    const { newValue } = change;
                    const oldValue = change.object.get(key);
                    if (newValue === oldValue) {
                        return null;
                    }
                    typecheckInternal(subType, newValue);
                    change.newValue = subType.reconcile(node.getChildNode(key), change.newValue, node, key);
                    mapType.processIdentifier(key, change.newValue);
                }
                break;
            case "add":
                {
                    typecheckInternal(subType, change.newValue);
                    change.newValue = subType.instantiate(node, key, undefined, change.newValue);
                    mapType.processIdentifier(key, change.newValue);
                }
                break;
        }
        return change;
    }
    processIdentifier(expected, node) {
        if (this.identifierMode === MapIdentifierMode.YES &&
            node instanceof ObjectNode) {
            const identifier = node.identifier;
            if (identifier !== expected) {
                throw fail(`A map of objects containing an identifier should always store the object under their own identifier. Trying to store key '${identifier}', but expected: '${expected}'`);
            }
        }
    }
    getSnapshot(node) {
        const res = {};
        node.getChildren().forEach(childNode => {
            res[childNode.subpath] = childNode.snapshot;
        });
        return res;
    }
    processInitialSnapshot(childNodes) {
        const processed = {};
        Object.keys(childNodes).forEach(key => {
            processed[key] = childNodes[key].getSnapshot();
        });
        return processed;
    }
    didChange(change) {
        const node = getStateTreeNode(change.object);
        switch (change.type) {
            case "update":
                return void node.emitPatch({
                    op: "replace",
                    path: escapeJsonPath(change.name),
                    value: change.newValue.snapshot,
                    oldValue: change.oldValue ? change.oldValue.snapshot : undefined
                }, node);
            case "add":
                return void node.emitPatch({
                    op: "add",
                    path: escapeJsonPath(change.name),
                    value: change.newValue.snapshot,
                    oldValue: undefined
                }, node);
            case "delete":
                // a node got deleted, get the old snapshot and make the node die
                const oldSnapshot = change.oldValue.snapshot;
                change.oldValue.die();
                // emit the patch
                return void node.emitPatch({
                    op: "remove",
                    path: escapeJsonPath(change.name),
                    oldValue: oldSnapshot
                }, node);
        }
    }
    applyPatchLocally(node, subpath, patch) {
        const target = node.storedValue;
        switch (patch.op) {
            case "add":
            case "replace":
                target.set(subpath, patch.value);
                break;
            case "remove":
                target.delete(subpath);
                break;
        }
    }
    applySnapshot(node, snapshot) {
        typecheckInternal(this, snapshot);
        const target = node.storedValue;
        const currentKeys = {};
        Array.from(target.keys()).forEach(key => {
            currentKeys[key] = false;
        });
        if (snapshot) {
            // Don't use target.replace, as it will throw away all existing items first
            for (const key in snapshot) {
                target.set(key, snapshot[key]);
                currentKeys["" + key] = true;
            }
        }
        Object.keys(currentKeys).forEach(key => {
            if (currentKeys[key] === false) {
                target.delete(key);
            }
        });
    }
    getChildType() {
        return this._subType;
    }
    isValidSnapshot(value, context) {
        if (!isPlainObject(value)) {
            return typeCheckFailure(context, value, "Value is not a plain object");
        }
        for (const key of Object.keys(value)) {
            getContextForPath(context, key, this._subType);
            const errors = this._subType.validate(value[key], context);
            popContext(context);
            if (errors.length > 0) {
                return errors;
            }
        }
        return typeCheckSuccess();
    }
    getDefaultSnapshot() {
        return EMPTY_OBJECT;
    }
    removeChild(node, subpath) {
        node.storedValue.delete(subpath);
    }
}
MapType.prototype.applySnapshot = action(MapType.prototype.applySnapshot);
/**
 * `types.map` - Creates a key based collection type who's children are all of a uniform declared type.
 * If the type stored in a map has an identifier, it is mandatory to store the child under that identifier in the map.
 *
 * This type will always produce [observable maps](https://mobx.js.org/api.html#observablemap)
 *
 * Example:
 * ```ts
 * const Todo = types.model({
 *   id: types.identifier,
 *   task: types.string
 * })
 *
 * const TodoStore = types.model({
 *   todos: types.map(Todo)
 * })
 *
 * const s = TodoStore.create({ todos: {} })
 * unprotect(s)
 * s.todos.set(17, { task: "Grab coffee", id: 17 })
 * s.todos.put({ task: "Grab cookie", id: 18 }) // put will infer key from the identifier
 * console.log(s.todos.get(17).task) // prints: "Grab coffee"
 * ```
 *
 * @param subtype
 * @returns
 */
export function map(subtype) {
    return new MapType(`Map<string, ${subtype.name}>`, subtype);
}
/**
 * Returns if a given value represents a map type.
 *
 * @param type
 * @returns `true` if it is a map type.
 */
export function isMapType(type) {
    return isType(type) && (type.flags & TypeFlags.Map) > 0;
}
//# sourceMappingURL=map.js.map