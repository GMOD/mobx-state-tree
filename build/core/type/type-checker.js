import { EMPTY_ARRAY, fail, isPrimitive, isTypeCheckingEnabled } from "../../utils.js";
import { getStateTreeNode, isStateTreeNode } from "../node/node-utils.js";
import { TypeFlags } from "./type.js";
// Computed lazily because TypeFlags lives in type.ts and type.ts is in an
// (otherwise benign) load-order cycle with this file — reading the enum
// at module init would TDZ.
function isPrimitiveTypeFlags(type) {
    return ((type.flags &
        (TypeFlags.String |
            TypeFlags.Number |
            TypeFlags.Integer |
            TypeFlags.Boolean |
            TypeFlags.Date)) >
        0);
}
const MAX_STRINGIFY_DEPTH = 3;
function safeStringify(value) {
    try {
        const ancestors = [];
        return JSON.stringify(value, function (_key, val) {
            if (val !== null && typeof val === "object") {
                while (ancestors.length > 0 &&
                    ancestors[ancestors.length - 1] !== this) {
                    ancestors.pop();
                }
                if (ancestors.length >= MAX_STRINGIFY_DEPTH) {
                    return Array.isArray(val) ? "[…]" : "{…}";
                }
                ancestors.push(val);
            }
            return val;
        });
    }
    catch (e) {
        // istanbul ignore next
        return `<Unserializable: ${e}>`;
    }
}
/**
 * @internal
 * @hidden
 */
export function prettyPrintValue(value) {
    return typeof value === "function"
        ? `<function${value.name ? " " + value.name : ""}>`
        : isStateTreeNode(value)
            ? `<${value}>`
            : `\`${safeStringify(value)}\``;
}
function shortenPrintValue(valueInString) {
    return valueInString.length < 280
        ? valueInString
        : `${valueInString.substring(0, 272)}......${valueInString.substring(valueInString.length - 8)}`;
}
function toErrorString(error) {
    const { value } = error;
    const type = error.context[error.context.length - 1].type;
    const fullPath = error.context
        .map(({ path }) => path)
        .filter(path => path.length > 0)
        .join("/");
    const pathPrefix = fullPath.length > 0 ? `at path "/${fullPath}" ` : ``;
    const currentTypename = isStateTreeNode(value)
        ? `value of type ${getStateTreeNode(value).type.name}:`
        : isPrimitive(value)
            ? "value"
            : "snapshot";
    const isSnapshotCompatible = type && isStateTreeNode(value) && type.is(getStateTreeNode(value).snapshot);
    return (`${pathPrefix}${currentTypename} ${shortenPrintValue(prettyPrintValue(value))} is not assignable ${type ? `to type: \`${type.name}\`` : ``}` +
        (error.message ? ` (${error.message})` : "") +
        (type
            ? isPrimitiveTypeFlags(type) || isPrimitive(value)
                ? `.`
                : `, expected an instance of \`${type.name}\` or a snapshot like \`${shortenPrintValue(type.describe())}\` instead.` +
                    (isSnapshotCompatible
                        ? " (Note that a snapshot of the provided value is compatible with the targeted type)"
                        : "")
            : `.`));
}
/**
 * @internal
 * @hidden
 * Pushes a new entry onto the context array (mutates in place for performance).
 * Returns the same context array for chaining.
 */
export function getContextForPath(context, path, type) {
    context.push({ path, type });
    return context;
}
/**
 * @internal
 * @hidden
 * Pops the last entry from the context array (mutates in place).
 * Must be called after validation to restore context state.
 */
export function popContext(context) {
    context.pop();
}
/**
 * @internal
 * @hidden
 */
export function typeCheckSuccess() {
    return EMPTY_ARRAY;
}
/**
 * @internal
 * @hidden
 */
export function typeCheckFailure(context, value, message) {
    // Clone context since it may be mutated after this error is created
    return [{ context: context.slice(), value, message }];
}
/**
 * @internal
 * @hidden
 */
export function flattenTypeErrors(errors) {
    return errors.flat();
}
// TODO; doublecheck: typecheck should only needed to be invoked from: type.create and array / map / value.property will change
/**
 * @internal
 * @hidden
 */
export function typecheckInternal(type, value) {
    // runs typeChecking if it is in dev-mode or through a process.env.ENABLE_TYPE_CHECK flag
    if (isTypeCheckingEnabled()) {
        typecheck(type, value);
    }
}
/**
 * Run's the typechecker for the given type on the given value, which can be a snapshot or an instance.
 * Throws if the given value is not according the provided type specification.
 * Use this if you need typechecks even in a production build (by default all automatic runtime type checks will be skipped in production builds)
 *
 * @param type Type to check against.
 * @param value Value to be checked, either a snapshot or an instance.
 */
export function typecheck(type, value) {
    const errors = type.validate(value, [{ path: "", type }]);
    if (errors.length > 0) {
        throw fail(validationErrorsToString(type, value, errors));
    }
}
const MAX_ERRORS_REPORTED = 10;
function validationErrorsToString(type, value, errors) {
    if (errors.length === 0) {
        return undefined;
    }
    const shown = errors.slice(0, MAX_ERRORS_REPORTED).map(toErrorString);
    const overflow = errors.length - shown.length;
    if (overflow > 0) {
        shown.push(`(… and ${overflow} more error${overflow === 1 ? "" : "s"})`);
    }
    return (`Error while converting ${shortenPrintValue(prettyPrintValue(value))} to \`${type.name}\`:\n\n    ` + shown.join("\n    "));
}
//# sourceMappingURL=type-checker.js.map