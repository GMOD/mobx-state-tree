class RunningAction {
    hooks;
    call;
    flowsPending = 0;
    running = true;
    constructor(hooks, call) {
        this.hooks = hooks;
        this.call = call;
        if (hooks) {
            hooks.onStart(call);
        }
    }
    finish(error) {
        if (this.running) {
            this.running = false;
            if (this.hooks) {
                this.hooks.onFinish(this.call, error);
            }
        }
    }
    incFlowsPending() {
        this.flowsPending++;
    }
    decFlowsPending() {
        this.flowsPending--;
    }
    get hasFlowsPending() {
        return this.flowsPending > 0;
    }
}
/**
 * Convenience utility to create action based middleware that supports async processes more easily.
 * The flow is like this:
 * - for each action: if filter passes -> `onStart` -> (inner actions recursively) -> `onFinish`
 *
 * Example: if we had an action `a` that called inside an action `b1`, then `b2` the flow would be:
 * - `filter(a)`
 * - `onStart(a)`
 *   - `filter(b1)`
 *   - `onStart(b1)`
 *   - `onFinish(b1)`
 *   - `filter(b2)`
 *   - `onStart(b2)`
 *   - `onFinish(b2)`
 * - `onFinish(a)`
 *
 * The flow is the same no matter if the actions are sync or async.
 *
 * See the `atomic` middleware for an example
 *
 * @param hooks
 * @returns
 */
export function createActionTrackingMiddleware2(middlewareHooks) {
    const runningActions = new Map();
    return function actionTrackingMiddleware(call, next) {
        // find parentRunningAction
        const parentRunningAction = call.parentActionEvent
            ? runningActions.get(call.parentActionEvent.id)
            : undefined;
        if (call.type === "action") {
            const newCall = {
                ...call,
                // make a shallow copy of the parent action env
                env: parentRunningAction && parentRunningAction.call.env,
                parentCall: parentRunningAction && parentRunningAction.call
            };
            const passesFilter = !middlewareHooks.filter || middlewareHooks.filter(newCall);
            const hooks = passesFilter ? middlewareHooks : undefined;
            const runningAction = new RunningAction(hooks, newCall);
            runningActions.set(call.id, runningAction);
            let res;
            try {
                res = next(call);
            }
            catch (e) {
                runningActions.delete(call.id);
                runningAction.finish(e);
                throw e;
            }
            // sync action finished
            if (!runningAction.hasFlowsPending) {
                runningActions.delete(call.id);
                runningAction.finish();
            }
            return res;
        }
        else {
            if (!parentRunningAction) {
                return next(call);
            }
            switch (call.type) {
                case "flow_spawn": {
                    parentRunningAction.incFlowsPending();
                    return next(call);
                }
                case "flow_resume":
                case "flow_resume_error": {
                    return next(call);
                }
                case "flow_throw": {
                    const error = call.args[0];
                    try {
                        return next(call);
                    }
                    finally {
                        parentRunningAction.decFlowsPending();
                        if (!parentRunningAction.hasFlowsPending) {
                            runningActions.delete(call.parentActionEvent.id);
                            parentRunningAction.finish(error);
                        }
                    }
                }
                case "flow_return": {
                    try {
                        return next(call);
                    }
                    finally {
                        parentRunningAction.decFlowsPending();
                        if (!parentRunningAction.hasFlowsPending) {
                            runningActions.delete(call.parentActionEvent.id);
                            parentRunningAction.finish();
                        }
                    }
                }
            }
        }
    };
}
//# sourceMappingURL=createActionTrackingMiddleware2.js.map