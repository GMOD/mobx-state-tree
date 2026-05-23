import { _getAdministration, _interceptReads, action, computed, defineProperty, getAtom, intercept, makeObservable, observable, observe, set } from "mobx";
import { ComplexType } from "../../core/type/type.js";
import { createActionInvoker } from "../../core/action.js";
import { escapeJsonPath } from "../../core/json-patch.js";
import { createObjectNode } from "../../core/node/create-node.js";
import { Hook } from "../../core/node/Hook.js";
import { getStateTreeNode, isStateTreeNode } from "../../core/node/node-utils.js";
import { getContextForPath, popContext, typeCheckFailure, typecheckInternal, typeCheckSuccess } from "../../core/type/type-checker.js";
import { isType, TypeFlags } from "../../core/type/type.js";
import { addHiddenFinalProp, addHiddenWritableProp, assertArg, assertIsString, devMode, EMPTY_ARRAY, EMPTY_OBJECT, fail, freeze, isPlainObject, isPrimitive, mobxShallow } from "../../utils.js";
import { getPrimitiveFactoryFromValue } from "../primitives.js";
import { optional } from "../utility-types/optional.js";
import { ArrayType } from "./array.js";
import { MapType } from "./map.js";
const PRE_PROCESS_SNAPSHOT = "preProcessSnapshot";
const POST_PROCESS_SNAPSHOT = "postProcessSnapshot";
function objectTypeToString() {
    return getStateTreeNode(this).toString();
}
const defaultObjectOptions = {
    name: "AnonymousModel",
    properties: {},
    initializers: EMPTY_ARRAY
};
function toPropertiesObject(declaredProps) {
    const keysList = Object.keys(declaredProps);
    const alreadySeenKeys = new Set();
    keysList.forEach(key => {
        if (alreadySeenKeys.has(key)) {
            throw fail(`${key} is declared twice in the model. Model should not contain the same keys`);
        }
        alreadySeenKeys.add(key);
    });
    // loop through properties and ensures that all items are types
    return keysList.reduce((props, key) => {
        // warn if user intended a HOOK
        if (key in Hook) {
            throw fail(`Hook '${key}' was defined as property. Hooks should be defined as part of the actions`);
        }
        // the user intended to use a view
        const descriptor = Object.getOwnPropertyDescriptor(declaredProps, key);
        if ("get" in descriptor) {
            throw fail("Getters are not supported as properties. Please use views instead");
        }
        // undefined and null are not valid
        const value = descriptor.value;
        if (value === null || value === undefined) {
            throw fail("The default value of an attribute cannot be null or undefined as the type cannot be inferred. Did you mean `types.maybe(someType)`?");
        }
        // its a primitive, convert to its type
        else if (isPrimitive(value)) {
            props[key] = optional(getPrimitiveFactoryFromValue(value), value);
        }
        // map defaults to empty object automatically for models
        else if (value instanceof MapType) {
            props[key] = optional(value, {});
        }
        else if (value instanceof ArrayType) {
            props[key] = optional(value, []);
        }
        // its already a type
        else if (isType(value)) {
            // do nothing, it's already a type
        }
        // its a function, maybe the user wanted a view?
        else if (devMode() && typeof value === "function") {
            throw fail(`Invalid type definition for property '${key}', it looks like you passed a function. Did you forget to invoke it, or did you intend to declare a view / action?`);
        }
        // no other complex values
        else if (devMode() && typeof value === "object") {
            throw fail(`Invalid type definition for property '${key}', it looks like you passed an object. Try passing another model type or a types.frozen.`);
        }
        else {
            throw fail(`Invalid type definition for property '${key}', cannot infer a type from a value like '${value}' (${typeof value})`);
        }
        return props;
    }, { ...declaredProps });
}
/**
 * @internal
 * @hidden
 */
export class ModelType extends ComplexType {
    flags = TypeFlags.Object;
    /*
     * The original object definition
     */
    initializers;
    properties;
    preProcessor;
    postProcessor;
    propertyNames;
    constructor(opts) {
        super(opts.name || defaultObjectOptions.name);
        Object.assign(this, defaultObjectOptions, opts);
        // ensures that any default value gets converted to its related type
        this.properties = toPropertiesObject(this.properties);
        freeze(this.properties); // make sure nobody messes with it
        this.propertyNames = Object.keys(this.properties);
        this.identifierAttribute = this._getIdentifierAttribute();
    }
    _getIdentifierAttribute() {
        let identifierAttribute = undefined;
        this.forAllProps((propName, propType) => {
            if (propType.flags & TypeFlags.Identifier) {
                if (identifierAttribute) {
                    throw fail(`Cannot define property '${propName}' as object identifier, property '${identifierAttribute}' is already defined as identifier property`);
                }
                identifierAttribute = propName;
            }
        });
        return identifierAttribute;
    }
    cloneAndEnhance(opts) {
        return new ModelType({
            name: opts.name || this.name,
            properties: Object.assign({}, this.properties, opts.properties),
            initializers: this.initializers.concat(opts.initializers || []),
            preProcessor: opts.preProcessor || this.preProcessor,
            postProcessor: opts.postProcessor || this.postProcessor
        });
    }
    actions(fn) {
        const actionInitializer = (self) => {
            this.instantiateActions(self, fn(self));
            return self;
        };
        return this.cloneAndEnhance({ initializers: [actionInitializer] });
    }
    instantiateActions(self, actions) {
        // check if return is correct
        if (!isPlainObject(actions)) {
            throw fail(`actions initializer should return a plain object containing actions`);
        }
        // bind actions to the object created
        Object.keys(actions).forEach(name => {
            // warn if preprocessor was given
            if (name === PRE_PROCESS_SNAPSHOT) {
                throw fail(`Cannot define action '${PRE_PROCESS_SNAPSHOT}', it should be defined using 'type.preProcessSnapshot(fn)' instead`);
            }
            // warn if postprocessor was given
            if (name === POST_PROCESS_SNAPSHOT) {
                throw fail(`Cannot define action '${POST_PROCESS_SNAPSHOT}', it should be defined using 'type.postProcessSnapshot(fn)' instead`);
            }
            let action2 = actions[name];
            // apply hook composition
            const baseAction = self[name];
            if (name in Hook && baseAction) {
                const specializedAction = action2;
                action2 = function (...args) {
                    baseAction(...args);
                    specializedAction(...args);
                };
            }
            // the goal of this is to make sure actions using "this" can call themselves,
            // while still allowing the middlewares to register them
            const middlewares = action2.$mst_middleware; // make sure middlewares are not lost
            const boundAction = action2.bind(actions);
            boundAction._isFlowAction =
                action2._isFlowAction || false;
            boundAction.$mst_middleware = middlewares;
            const actionInvoker = createActionInvoker(self, name, boundAction);
            actions[name] = actionInvoker;
            (!devMode() ? addHiddenFinalProp : addHiddenWritableProp)(self, name, actionInvoker);
        });
    }
    named = name => {
        return this.cloneAndEnhance({ name });
    };
    props = properties => {
        return this.cloneAndEnhance({ properties });
    };
    volatile(fn) {
        if (typeof fn !== "function") {
            throw fail(`You passed an ${typeof fn} to volatile state as an argument, when function is expected`);
        }
        const stateInitializer = (self) => {
            this.instantiateVolatileState(self, fn(self));
            return self;
        };
        return this.cloneAndEnhance({ initializers: [stateInitializer] });
    }
    instantiateVolatileState(self, state) {
        // check views return
        if (!isPlainObject(state)) {
            throw fail(`volatile state initializer should return a plain object containing state`);
        }
        set(self, state);
    }
    extend(fn) {
        const initializer = (self) => {
            const { actions, views, state, ...rest } = fn(self);
            for (const key in rest) {
                throw fail(`The \`extend\` function should return an object with a subset of the fields 'actions', 'views' and 'state'. Found invalid key '${key}'`);
            }
            if (state) {
                this.instantiateVolatileState(self, state);
            }
            if (views) {
                this.instantiateViews(self, views);
            }
            if (actions) {
                this.instantiateActions(self, actions);
            }
            return self;
        };
        return this.cloneAndEnhance({ initializers: [initializer] });
    }
    views(fn) {
        const viewInitializer = (self) => {
            this.instantiateViews(self, fn(self));
            return self;
        };
        return this.cloneAndEnhance({ initializers: [viewInitializer] });
    }
    instantiateViews(self, views) {
        // check views return
        if (!isPlainObject(views)) {
            throw fail(`views initializer should return a plain object containing views`);
        }
        Object.getOwnPropertyNames(views).forEach(key => {
            // is this a computed property?
            const descriptor = Object.getOwnPropertyDescriptor(views, key);
            if ("get" in descriptor) {
                defineProperty(self, key, descriptor);
                makeObservable(self, { [key]: computed });
            }
            else if (typeof descriptor.value === "function") {
                // this is a view function, merge as is!
                // See #646, allow models to be mocked
                ;
                (!devMode() ? addHiddenFinalProp : addHiddenWritableProp)(self, key, descriptor.value);
            }
            else {
                throw fail(`A view member should either be a function or getter based property`);
            }
        });
    }
    preProcessSnapshot = preProcessor => {
        const currentPreprocessor = this.preProcessor;
        if (!currentPreprocessor) {
            return this.cloneAndEnhance({ preProcessor });
        }
        else {
            return this.cloneAndEnhance({
                preProcessor: snapshot => currentPreprocessor(preProcessor(snapshot))
            });
        }
    };
    postProcessSnapshot = postProcessor => {
        const currentPostprocessor = this.postProcessor;
        if (!currentPostprocessor) {
            return this.cloneAndEnhance({ postProcessor });
        }
        else {
            return this.cloneAndEnhance({
                postProcessor: snapshot => postProcessor(currentPostprocessor(snapshot))
            });
        }
    };
    instantiate(parent, subpath, environment, initialValue) {
        const value = isStateTreeNode(initialValue)
            ? initialValue
            : this.applySnapshotPreProcessor(initialValue);
        return createObjectNode(this, parent, subpath, environment, value);
        // Optimization: record all prop- view- and action names after first construction, and generate an optimal base class
        // that pre-reserves all these fields for fast object-member lookups
    }
    initializeChildNodes(objNode, initialSnapshot = {}) {
        const type = objNode.type;
        const result = {};
        type.forAllProps((name, childType) => {
            result[name] = childType.instantiate(objNode, name, undefined, initialSnapshot[name]);
        });
        return result;
    }
    createNewInstance(childNodes) {
        const options = { ...mobxShallow, name: this.name };
        return observable.object(childNodes, EMPTY_OBJECT, options);
    }
    finalizeNewInstance(node, instance) {
        addHiddenFinalProp(instance, "toString", objectTypeToString);
        this.forAllProps(name => {
            _interceptReads(instance, name, node.unbox);
        });
        this.initializers.reduce((self, fn) => fn(self), instance);
        intercept(instance, this.willChange);
        observe(instance, this.didChange);
    }
    willChange(chg) {
        // TODO: mobx typings don't seem to take into account that newValue can be set even when removing a prop
        const change = chg;
        const node = getStateTreeNode(change.object);
        const subpath = change.name;
        node.assertWritable({ subpath });
        const childType = node.type.properties[subpath];
        // only properties are typed, state are stored as-is references
        if (childType) {
            typecheckInternal(childType, change.newValue);
            change.newValue = childType.reconcile(node.getChildNode(subpath), change.newValue, node, subpath);
        }
        return change;
    }
    didChange(chg) {
        // TODO: mobx typings don't seem to take into account that newValue can be set even when removing a prop
        const change = chg;
        const childNode = getStateTreeNode(change.object);
        const childType = childNode.type.properties[change.name];
        if (!childType) {
            // don't emit patches for volatile state
            return;
        }
        const oldChildValue = change.oldValue ? change.oldValue.snapshot : undefined;
        childNode.emitPatch({
            op: "replace",
            path: escapeJsonPath(change.name),
            value: change.newValue.snapshot,
            oldValue: oldChildValue
        }, childNode);
    }
    getChildren(node) {
        const res = [];
        this.forAllProps(name => {
            res.push(this.getChildNode(node, name));
        });
        return res;
    }
    getChildNode(node, key) {
        if (!(key in this.properties)) {
            throw fail("Not a value property: " + key);
        }
        const adm = _getAdministration(node.storedValue, key);
        const childNode = adm.raw?.();
        if (!childNode) {
            throw fail("Node not available for property " + key);
        }
        return childNode;
    }
    getSnapshot(node, applyPostProcess = true) {
        const res = {};
        this.forAllProps((name, _type) => {
            try {
                // TODO: FIXME, make sure the observable ref is used!
                const atom = getAtom(node.storedValue, name);
                atom.reportObserved();
            }
            catch (_e) {
                throw fail(`${name} property is declared twice`);
            }
            res[name] = this.getChildNode(node, name).snapshot;
        });
        if (applyPostProcess) {
            return this.applySnapshotPostProcessor(res);
        }
        return res;
    }
    processInitialSnapshot(childNodes) {
        const processed = {};
        Object.keys(childNodes).forEach(key => {
            processed[key] = childNodes[key].getSnapshot();
        });
        return this.applySnapshotPostProcessor(processed);
    }
    applyPatchLocally(node, subpath, patch) {
        if (!(patch.op === "replace" || patch.op === "add")) {
            throw fail(`object does not support operation ${patch.op}`);
        }
        ;
        node.storedValue[subpath] = patch.value;
    }
    applySnapshot(node, snapshot) {
        typecheckInternal(this, snapshot);
        const preProcessedSnapshot = this.applySnapshotPreProcessor(snapshot);
        this.forAllProps(name => {
            ;
            node.storedValue[name] = preProcessedSnapshot[name];
        });
    }
    applySnapshotPreProcessor(snapshot) {
        const processor = this.preProcessor;
        return processor ? processor.call(null, snapshot) : snapshot;
    }
    applySnapshotPostProcessor(snapshot) {
        const postProcessor = this.postProcessor;
        if (postProcessor) {
            return postProcessor.call(null, snapshot);
        }
        return snapshot;
    }
    getChildType(propertyName) {
        assertIsString(propertyName, 1);
        return this.properties[propertyName];
    }
    isValidSnapshot(value, context) {
        const snapshot = this.applySnapshotPreProcessor(value);
        if (!isPlainObject(snapshot)) {
            return typeCheckFailure(context, snapshot, "Value is not a plain object");
        }
        for (const key of this.propertyNames) {
            const propType = this.properties[key];
            getContextForPath(context, key, propType);
            const errors = propType.validate(snapshot[key], context);
            popContext(context);
            if (errors.length > 0) {
                return errors;
            }
        }
        return typeCheckSuccess();
    }
    forAllProps(fn) {
        this.propertyNames.forEach(key => fn(key, this.properties[key]));
    }
    describe() {
        // optimization: cache
        return ("{ " +
            this.propertyNames
                .map(key => key + ": " + this.properties[key].describe())
                .join("; ") +
            " }");
    }
    getDefaultSnapshot() {
        return EMPTY_OBJECT;
    }
    removeChild(node, subpath) {
        ;
        node.storedValue[subpath] = undefined;
    }
}
ModelType.prototype.applySnapshot = action(ModelType.prototype.applySnapshot);
/**
 * `types.model` - Creates a new model type by providing a name, properties, volatile state and actions.
 *
 * See the [model type](/concepts/trees#creating-models) description or the [getting started](intro/getting-started.md#getting-started-1) tutorial.
 */
export function model(...args) {
    if (devMode() && typeof args[0] !== "string" && args[1]) {
        throw fail("Model creation failed. First argument must be a string when two arguments are provided");
    }
    const name = typeof args[0] === "string" ? args.shift() : "AnonymousModel";
    const properties = args.shift() || {};
    return new ModelType({ name, properties });
}
/**
 * `types.compose` - Composes a new model from one or more existing model types.
 * This method can be invoked in two forms:
 * Given 2 or more model types, the types are composed into a new Type.
 * Given first parameter as a string and 2 or more model types,
 * the types are composed into a new Type with the given name
 */
export function compose(...args) {
    // TODO: just join the base type names if no name is provided
    const hasTypename = typeof args[0] === "string";
    const typeName = hasTypename ? args[0] : "AnonymousModel";
    if (hasTypename) {
        args.shift();
    }
    // check all parameters
    if (devMode()) {
        args.forEach((type, i) => {
            assertArg(type, isModelType, "mobx-state-tree model type", hasTypename ? i + 2 : i + 1);
        });
    }
    return args
        .reduce((prev, cur) => prev.cloneAndEnhance({
        name: prev.name + "_" + cur.name,
        properties: cur.properties,
        initializers: cur.initializers,
        preProcessor: (snapshot) => cur.applySnapshotPreProcessor(prev.applySnapshotPreProcessor(snapshot)),
        postProcessor: (snapshot) => cur.applySnapshotPostProcessor(prev.applySnapshotPostProcessor(snapshot))
    }))
        .named(typeName);
}
/**
 * Returns if a given value represents a model type.
 *
 * @param type
 * @returns
 */
export function isModelType(type) {
    return isType(type) && (type.flags & TypeFlags.Object) > 0;
}
//# sourceMappingURL=model.js.map