/**
 * Valid types for identifiers.
 */
export type ReferenceIdentifier = string | number;
/**
 * @internal
 * @hidden
 */
export declare function normalizeIdentifier(id: ReferenceIdentifier): string;
/**
 * @internal
 * @hidden
 */
export declare function isValidIdentifier(id: any): id is ReferenceIdentifier;
/**
 * @internal
 * @hidden
 */
export declare function assertIsValidIdentifier(id: ReferenceIdentifier, argNumber: number | number[]): void;
