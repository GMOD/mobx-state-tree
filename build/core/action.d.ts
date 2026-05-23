import { type IDisposer } from "../utils.ts";
import type { IActionContext } from "./actionContext.ts";
import { type IAnyStateTreeNode } from "./node/node-utils.ts";
export type IMiddlewareEventType = "action" | "flow_spawn" | "flow_resume" | "flow_resume_error" | "flow_return" | "flow_throw";
export interface IMiddlewareEvent extends IActionContext {
    /** Event type */
    readonly type: IMiddlewareEventType;
    /** Parent event unique id */
    readonly parentId: number;
    /** Parent event object */
    readonly parentEvent: IMiddlewareEvent | undefined;
    /** Root event unique id */
    readonly rootId: number;
    /** Id of all events, from root until current (excluding current) */
    readonly allParentIds: number[];
}
export interface FunctionWithFlag extends Function {
    _isMSTAction?: boolean;
    _isFlowAction?: boolean;
}
/**
 * @internal
 * @hidden
 */
export type IMiddleware = {
    handler: IMiddlewareHandler;
    includeHooks: boolean;
};
export type IMiddlewareHandler = (actionCall: IMiddlewareEvent, next: (actionCall: IMiddlewareEvent, callback?: (value: any) => any) => void, abort: (value: any) => void) => any;
/**
 * @internal
 * @hidden
 */
export declare function getCurrentActionContext(): IMiddlewareEvent | undefined;
/**
 * @internal
 * @hidden
 */
export declare function getNextActionId(): number;
/**
 * @internal
 * @hidden
 */
export declare function runWithActionContext(context: IMiddlewareEvent, fn: Function): any;
/**
 * @internal
 * @hidden
 */
export declare function getParentActionContext(parentContext: IMiddlewareEvent | undefined): IMiddlewareEvent | undefined;
/**
 * @internal
 * @hidden
 */
export declare function createActionInvoker<T extends FunctionWithFlag>(target: IAnyStateTreeNode, name: string, fn: T): (...args: any[]) => any;
/**
 * Middleware can be used to intercept any action is invoked on the subtree where it is attached.
 * If a tree is protected (by default), this means that any mutation of the tree will pass through your middleware.
 *
 * For more details, see the [middleware docs](concepts/middleware.md)
 *
 * @param target Node to apply the middleware to.
 * @param middleware Middleware to apply.
 * @returns A callable function to dispose the middleware.
 */
export declare function addMiddleware(target: IAnyStateTreeNode, handler: IMiddlewareHandler, includeHooks?: boolean): IDisposer;
/**
 * Binds middleware to a specific action.
 *
 * Example:
 * ```ts
 * type.actions(self => {
 *   function takeA____() {
 *       self.toilet.donate()
 *       self.wipe()
 *       self.wipe()
 *       self.toilet.flush()
 *   }
 *   return {
 *     takeA____: decorate(atomic, takeA____)
 *   }
 * })
 * ```
 *
 * @param handler
 * @param fn
 * @param includeHooks
 * @returns The original function
 */
export declare function decorate<T extends Function>(handler: IMiddlewareHandler, fn: T, includeHooks?: boolean): T;
