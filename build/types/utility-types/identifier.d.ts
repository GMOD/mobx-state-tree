import { SimpleType } from "../../core/type/type.ts";
import type { AnyObjectNode } from "../../core/node/object-node.ts";
import type { ScalarNode } from "../../core/node/scalar-node.ts";
import { type IValidationContext, type IValidationResult } from "../../core/type/type-checker.ts";
import { type ISimpleType, TypeFlags } from "../../core/type/type.ts";
declare abstract class BaseIdentifierType<T> extends SimpleType<T, T, T> {
    private readonly validType;
    readonly flags = TypeFlags.Identifier;
    constructor(name: string, validType: "string" | "number");
    instantiate(parent: AnyObjectNode | null, subpath: string, environment: any, initialValue: this["C"]): this["N"];
    reconcile(current: this["N"], newValue: this["C"], parent: AnyObjectNode, subpath: string): this["N"];
    isValidSnapshot(value: this["C"], context: IValidationContext): IValidationResult;
}
/**
 * @internal
 * @hidden
 */
export declare class IdentifierType extends BaseIdentifierType<string> {
    readonly flags = TypeFlags.Identifier;
    constructor();
    describe(): string;
}
/**
 * @internal
 * @hidden
 */
export declare class IdentifierNumberType extends BaseIdentifierType<number> {
    constructor();
    getSnapshot(node: ScalarNode<number, number, number>): number;
    describe(): string;
}
/**
 * `types.identifier` - Identifiers are used to make references, lifecycle events and reconciling works.
 * Inside a state tree, for each type can exist only one instance for each given identifier.
 * For example there couldn't be 2 instances of user with id 1. If you need more, consider using references.
 * Identifier can be used only as type property of a model.
 * This type accepts as parameter the value type of the identifier field that can be either string or number.
 *
 * Example:
 * ```ts
 *  const Todo = types.model("Todo", {
 *      id: types.identifier,
 *      title: types.string
 *  })
 * ```
 *
 * @returns
 */
export declare const identifier: ISimpleType<string>;
/**
 * `types.identifierNumber` - Similar to `types.identifier`. This one will serialize from / to a number when applying snapshots
 *
 * Example:
 * ```ts
 *  const Todo = types.model("Todo", {
 *      id: types.identifierNumber,
 *      title: types.string
 *  })
 * ```
 *
 * @returns
 */
export declare const identifierNumber: ISimpleType<number>;
/**
 * Returns if a given value represents an identifier type.
 *
 * @param type
 * @returns
 */
export declare function isIdentifierType<IT extends typeof identifier | typeof identifierNumber>(type: IT): type is IT;
export { assertIsValidIdentifier, isValidIdentifier, normalizeIdentifier, type ReferenceIdentifier } from "./identifier-utils.ts";
