import { fail, setImmediateWithFallback } from "../utils.js";
import { getCurrentActionContext, getNextActionId, getParentActionContext, runWithActionContext } from "./action.js";
/**
 * See [asynchronous actions](concepts/async-actions.md).
 *
 * @returns The flow as a promise.
 */
export function flow(generator) {
    return createFlowSpawner(generator.name, generator);
}
/**
 * @deprecated Not needed since TS3.6.
 * Used for TypeScript to make flows that return a promise return the actual promise result.
 *
 * @param val
 * @returns
 */
export function castFlowReturn(val) {
    return val;
}
/**
 * @experimental
 * experimental api - might change on minor/patch releases
 *
 * Convert a promise-returning function to a generator-returning one.
 * This is intended to allow for usage of `yield*` in async actions to
 * retain the promise return type.
 *
 * Example:
 * ```ts
 * function getDataAsync(input: string): Promise<number> { ... }
 * const getDataGen = toGeneratorFunction(getDataAsync);
 *
 * const someModel.actions(self => ({
 *   someAction: flow(function*() {
 *     // value is typed as number
 *     const value = yield* getDataGen("input value");
 *     ...
 *   })
 * }))
 * ```
 */
export function toGeneratorFunction(p) {
    return function* (...args) {
        return (yield p(...args));
    };
}
/**
 * @experimental
 * experimental api - might change on minor/patch releases
 *
 * Convert a promise to a generator yielding that promise
 * This is intended to allow for usage of `yield*` in async actions to
 * retain the promise return type.
 *
 * Example:
 * ```ts
 * function getDataAsync(input: string): Promise<number> { ... }
 *
 * const someModel.actions(self => ({
 *   someAction: flow(function*() {
 *     // value is typed as number
 *     const value = yield* toGenerator(getDataAsync("input value"));
 *     ...
 *   })
 * }))
 * ```
 */
export function* toGenerator(p) {
    return (yield p);
}
/**
 * @internal
 * @hidden
 */
export function createFlowSpawner(name, generator) {
    const spawner = function flowSpawner(...flowArgs) {
        // Implementation based on https://github.com/tj/co/blob/master/index.js
        const runId = getNextActionId();
        const parentContext = getCurrentActionContext();
        if (!parentContext) {
            throw fail("a mst flow must always have a parent context");
        }
        const parentActionContext = getParentActionContext(parentContext);
        if (!parentActionContext) {
            throw fail("a mst flow must always have a parent action context");
        }
        const contextBase = {
            name,
            id: runId,
            tree: parentContext.tree,
            context: parentContext.context,
            parentId: parentContext.id,
            allParentIds: [...parentContext.allParentIds, parentContext.id],
            rootId: parentContext.rootId,
            parentEvent: parentContext,
            parentActionEvent: parentActionContext
        };
        function wrap(fn, type, arg) {
            fn.$mst_middleware = spawner.$mst_middleware; // pick up any middleware attached to the flow
            return runWithActionContext({
                ...contextBase,
                type,
                args: [arg]
            }, fn);
        }
        return new Promise(function (resolve, reject) {
            let gen;
            const init = function asyncActionInit(...initArgs) {
                gen = generator(...initArgs);
                onFulfilled(undefined); // kick off the flow
            };
            init.$mst_middleware = spawner.$mst_middleware;
            runWithActionContext({
                ...contextBase,
                type: "flow_spawn",
                args: flowArgs
            }, init);
            function onFulfilled(res) {
                let ret;
                try {
                    // prettier-ignore
                    const cancelError = wrap((_r) => { ret = gen.next(_r); }, "flow_resume", res);
                    if (cancelError instanceof Error) {
                        ret = gen.throw(cancelError);
                    }
                }
                catch (e) {
                    // prettier-ignore
                    setImmediateWithFallback(() => {
                        wrap((_r) => { reject(e); }, "flow_throw", e);
                    });
                    return;
                }
                next(ret);
                return;
            }
            function onRejected(err) {
                let ret;
                try {
                    // prettier-ignore
                    wrap((_r) => { ret = gen.throw(_r); }, "flow_resume_error", err); // or yieldError?
                }
                catch (e) {
                    // prettier-ignore
                    setImmediateWithFallback(() => {
                        wrap((_r) => { reject(e); }, "flow_throw", e);
                    });
                    return;
                }
                next(ret);
            }
            function next(ret) {
                if (ret.done) {
                    // prettier-ignore
                    setImmediateWithFallback(() => {
                        wrap((r) => { resolve(r); }, "flow_return", ret.value);
                    });
                    return;
                }
                // TODO: support more type of values? See https://github.com/tj/co/blob/249bbdc72da24ae44076afd716349d2089b31c4c/index.js#L100
                if (!ret.value || typeof ret.value.then !== "function") {
                    // istanbul ignore next
                    throw fail("Only promises can be yielded to `async`, got: " + ret);
                }
                return ret.value.then(onFulfilled, onRejected);
            }
        });
    };
    spawner._isFlowAction = true;
    return spawner;
}
//# sourceMappingURL=flow.js.map