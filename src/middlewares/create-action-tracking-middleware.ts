import { type IMiddlewareEvent, type IMiddlewareHandler } from "../internal.ts"

export interface IActionTrackingMiddlewareHooks<T> {
  filter?: (call: IMiddlewareEvent) => boolean
  onStart: (call: IMiddlewareEvent) => T
  onResume: (call: IMiddlewareEvent, context: T) => void
  onSuspend: (call: IMiddlewareEvent, context: T) => void
  onSuccess: (call: IMiddlewareEvent, context: T, result: any) => void
  onFail: (call: IMiddlewareEvent, context: T, error: any) => void
}

/**
 * Note: Consider migrating to `createActionTrackingMiddleware2`, it is easier to use.
 *
 * Convenience utility to create action based middleware that supports async processes more easily.
 * All hooks are called for both synchronous and asynchronous actions. Except that either `onSuccess` or `onFail` is called
 *
 * The create middleware tracks the process of an action (assuming it passes the `filter`).
 * `onResume` can return any value, which will be passed as second argument to any other hook. This makes it possible to keep state during a process.
 *
 * An action that spawns flows, directly or through flows calling flows,
 * settles when the last of them does, and `onSuccess` / `onFail` report that
 * last one's outcome.
 *
 * See the `atomic` middleware for an example
 *
 * @param hooks
 * @returns
 */
export function createActionTrackingMiddleware<T = any>(
  hooks: IActionTrackingMiddlewareHooks<T>
): IMiddlewareHandler {
  // per middleware, not per module: the entries hold the `context` this
  // middleware's own onStart returned, so two middlewares on one tree would
  // otherwise overwrite each other's context and then delete the shared entry.
  // createActionTrackingMiddleware2 scopes its map the same way.
  //
  // `pending` counts the root action's synchronous run plus every flow spawned
  // under it, since nested flows share the root's rootId
  const runningActions = new Map<number, { context: T; pending: number }>()

  function settle(
    rootId: number,
    call: IMiddlewareEvent,
    outcome: { error: unknown } | { result: unknown }
  ) {
    const root = runningActions.get(rootId)
    if (!root || --root.pending > 0) {
      return
    }
    runningActions.delete(rootId)
    if ("error" in outcome) {
      hooks.onFail(call, root.context, outcome.error)
    } else {
      hooks.onSuccess(call, root.context, outcome.result)
    }
  }

  return function actionTrackingMiddleware(
    call: IMiddlewareEvent,
    next: (actionCall: IMiddlewareEvent) => any,
    _abort: (value: any) => any
  ) {
    if (call.type === "action") {
      if (hooks.filter && hooks.filter(call) !== true) {
        return next(call)
      }
      const context = hooks.onStart(call)
      hooks.onResume(call, context)
      runningActions.set(call.id, { context, pending: 1 })
      let res
      try {
        res = next(call)
      } catch (e) {
        runningActions.delete(call.id)
        hooks.onFail(call, context, e)
        throw e
      }
      hooks.onSuspend(call, context)
      settle(call.id, call, { result: res })
      return res
    }
    const root = runningActions.get(call.rootId)
    if (!root) {
      return next(call)
    }
    switch (call.type) {
      case "flow_spawn":
        root.pending++
        return next(call)
      case "flow_resume":
      case "flow_resume_error":
        hooks.onResume(call, root.context)
        try {
          return next(call)
        } finally {
          hooks.onSuspend(call, root.context)
        }
      case "flow_throw":
        settle(call.rootId, call, { error: call.args[0] })
        return next(call)
      case "flow_return":
        settle(call.rootId, call, { result: call.args[0] })
        return next(call)
    }
  }
}
