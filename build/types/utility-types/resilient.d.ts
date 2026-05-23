import { type IAnyType, type IType } from "../../core/type/type.ts";
export interface IResilientType<IT extends IAnyType, FT extends IAnyType> extends IType<IT["CreationType"] | FT["CreationType"], IT["SnapshotType"] | FT["SnapshotType"], IT["TypeWithoutSTN"] | FT["TypeWithoutSTN"]> {
}
/**
 * `types.resilient` - Wraps a type so that instantiation errors are caught
 * and a fallback type is used instead. This is useful for loading data that
 * may contain unknown or invalid subtrees (e.g., plugin types that are not
 * installed) without crashing the entire state tree.
 *
 * The `createFallbackSnapshot` callback receives the caught error and the
 * original snapshot, and must return a valid snapshot for the fallback type.
 *
 * @param type The type to wrap.
 * @param fallbackType The fallback type to use when instantiation fails.
 * @param createFallbackSnapshot Callback that produces a fallback snapshot from the error and original snapshot.
 * @returns A resilient type.
 */
export declare function resilient<IT extends IAnyType, FT extends IAnyType>(type: IT, fallbackType: FT, createFallbackSnapshot: (error: unknown, snapshot: any) => FT["CreationType"]): IResilientType<IT, FT>;
