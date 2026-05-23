import { BaseType } from "../../core/type/type.js";
import { isStateTreeNode } from "../../core/node/node-utils.js";
import { flattenTypeErrors, typeCheckFailure, typeCheckSuccess } from "../../core/type/type-checker.js";
import { assertIsType, isType, TypeFlags } from "../../core/type/type.js";
import { assertArg, devMode, fail, isPlainObject, isTypeCheckingEnabled } from "../../utils.js";
import { ModelType } from "../complex-types/model.js";
/**
 * @internal
 * @hidden
 */
export class Union extends BaseType {
    _types;
    _dispatcher;
    _eager = true;
    get flags() {
        let result = TypeFlags.Union;
        this._types.forEach(type => {
            result |= type.flags;
        });
        return result;
    }
    constructor(name, _types, options) {
        super(name);
        this._types = _types;
        options = {
            eager: true,
            dispatcher: undefined,
            ...options
        };
        this._dispatcher = options.dispatcher;
        if (!options.eager) {
            this._eager = false;
        }
    }
    isAssignableFrom(type) {
        return this._types.some(subType => subType.isAssignableFrom(type));
    }
    describe() {
        return ("(" + this._types.map(factory => factory.describe()).join(" | ") + ")");
    }
    instantiate(parent, subpath, environment, initialValue) {
        const type = this.determineType(initialValue, undefined);
        if (!type) {
            throw fail(this.noMatchMessage(initialValue));
        } // can happen in prod builds
        return type.instantiate(parent, subpath, environment, initialValue);
    }
    reconcile(current, newValue, parent, subpath) {
        const type = this.determineType(newValue, current.getReconciliationType());
        if (!type) {
            throw fail(this.noMatchMessage(newValue));
        } // can happen in prod builds
        return type.reconcile(current, newValue, parent, subpath);
    }
    noMatchMessage(value) {
        const discriminator = isPlainObject(value) && typeof value.type === "string"
            ? ` for snapshot with type "${value.type}"`
            : "";
        return `No matching type for union ${this.name}${discriminator}`;
    }
    determineType(value, reconcileCurrentType) {
        // try the dispatcher, if defined
        if (this._dispatcher) {
            return this._dispatcher(value);
        }
        // fast path: when type checking is disabled, try quick structural matching first
        if (!isTypeCheckingEnabled()) {
            const quickMatch = this.tryQuickMatch(value, reconcileCurrentType);
            if (quickMatch) {
                return quickMatch;
            }
            // for plain object snapshots that didn't match via quick path, try all types
            // with quick matching before falling back to full validation
            // (state tree nodes must go through full validation for type identity checks)
            if (isPlainObject(value) && !isStateTreeNode(value)) {
                for (const type of this._types) {
                    if (this.snapshotLooksLikeType(value, type)) {
                        return type;
                    }
                }
            }
        }
        // find the most accomodating type
        // if we are using reconciliation try the current node type first (fix for #1045)
        if (reconcileCurrentType) {
            if (reconcileCurrentType.is(value)) {
                return reconcileCurrentType;
            }
            return this._types
                .filter(t => t !== reconcileCurrentType)
                .find(type => type.is(value));
        }
        else {
            return this._types.find(type => type.is(value));
        }
    }
    tryQuickMatch(value, reconcileCurrentType) {
        // state tree nodes need full type compatibility checking
        // (e.g., A.is(B.create()) must return false even if snapshots are compatible)
        if (isStateTreeNode(value)) {
            return undefined;
        }
        // for non-object values, try primitive matching
        if (!isPlainObject(value)) {
            return this.tryMatchPrimitive(value);
        }
        // for objects, try structural matching against model types
        const typesToCheck = reconcileCurrentType
            ? [
                reconcileCurrentType,
                ...this._types.filter(t => t !== reconcileCurrentType)
            ]
            : this._types;
        for (const type of typesToCheck) {
            if (this.snapshotLooksLikeType(value, type)) {
                return type;
            }
        }
        return undefined;
    }
    tryMatchPrimitive(value) {
        const valueType = typeof value;
        for (const type of this._types) {
            const flags = type.flags;
            if ((valueType === "string" && flags & TypeFlags.String) ||
                (valueType === "number" &&
                    flags &
                        (TypeFlags.Number |
                            TypeFlags.Integer |
                            TypeFlags.Float |
                            TypeFlags.Finite)) ||
                (valueType === "boolean" && flags & TypeFlags.Boolean) ||
                (value === null && flags & TypeFlags.Null) ||
                (value === undefined && flags & TypeFlags.Undefined)) {
                return type;
            }
            // for literals, check exact value match
            if (flags & TypeFlags.Literal) {
                if (type.is(value)) {
                    return type;
                }
            }
        }
        return undefined;
    }
    snapshotLooksLikeType(value, type) {
        // for model types, check if snapshot has all the required property keys
        // and that any literal-typed properties match exactly
        if (type instanceof ModelType) {
            const props = type.properties;
            // use cached propertyNames from ModelType instead of Object.keys()
            for (const key of type.propertyNames) {
                const propType = props[key];
                const isOptional = propType.flags & TypeFlags.Optional;
                const propValue = value[key];
                // check required properties exist and are not undefined
                // (unless the type accepts undefined, which Optional types do)
                if (!isOptional) {
                    if (!(key in value) || propValue === undefined) {
                        return false;
                    }
                }
                // for literal types, verify the value matches exactly
                // this is critical for discriminated unions
                if (propType.flags & TypeFlags.Literal) {
                    if (!propType.is(propValue)) {
                        return false;
                    }
                }
            }
            return true;
        }
        return false;
    }
    isValidSnapshot(value, context) {
        if (this._dispatcher) {
            return this._dispatcher(value).validate(value, context);
        }
        // for plain-object snapshots, prefer union members whose literal-typed
        // discriminator properties match the value (e.g. {type: "MsaView"})
        // so error output is scoped to the intended branch instead of every member
        const candidates = isPlainObject(value) && !isStateTreeNode(value)
            ? this._types.filter(t => this.snapshotLooksLikeType(value, t))
            : [];
        const typesToValidate = candidates.length > 0 ? candidates : this._types;
        const allErrors = [];
        let applicableTypes = 0;
        for (const type of typesToValidate) {
            const errors = type.validate(value, context);
            if (errors.length === 0) {
                if (this._eager) {
                    return typeCheckSuccess();
                }
                else {
                    applicableTypes++;
                }
            }
            else {
                allErrors.push(errors);
            }
        }
        if (applicableTypes === 1) {
            return typeCheckSuccess();
        }
        return typeCheckFailure(context, value, "No type is applicable for the union").concat(flattenTypeErrors(allErrors));
    }
    getSubTypes() {
        return this._types;
    }
}
/**
 * `types.union` - Create a union of multiple types. If the correct type cannot be inferred unambiguously from a snapshot, provide a dispatcher function of the form `(snapshot) => Type`.
 *
 * @param optionsOrType
 * @param otherTypes
 * @returns
 */
export function union(optionsOrType, ...otherTypes) {
    const options = isType(optionsOrType) ? undefined : optionsOrType;
    const types = isType(optionsOrType)
        ? [optionsOrType, ...otherTypes]
        : otherTypes;
    const name = "(" + types.map(type => type.name).join(" | ") + ")";
    // check all options
    if (devMode()) {
        if (options) {
            assertArg(options, o => isPlainObject(o), "object { eager?: boolean, dispatcher?: Function }", 1);
        }
        types.forEach((type, i) => {
            assertIsType(type, options ? i + 2 : i + 1);
        });
    }
    return new Union(name, types, options);
}
/**
 * Returns if a given value represents a union type.
 *
 * @param type
 * @returns
 */
export function isUnionType(type) {
    return (type.flags & TypeFlags.Union) > 0;
}
//# sourceMappingURL=union.js.map