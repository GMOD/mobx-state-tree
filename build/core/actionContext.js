import { getCurrentActionContext } from "./action.js";
/**
 * Returns the currently executing MST action context, or undefined if none.
 */
export function getRunningActionContext() {
    let current = getCurrentActionContext();
    while (current && current.type !== "action") {
        current = current.parentActionEvent;
    }
    return current;
}
function _isActionContextThisOrChildOf(actionContext, sameOrParent, includeSame) {
    const parentId = typeof sameOrParent === "number" ? sameOrParent : sameOrParent.id;
    let current = includeSame
        ? actionContext
        : actionContext.parentActionEvent;
    while (current) {
        if (current.id === parentId) {
            return true;
        }
        current = current.parentActionEvent;
    }
    return false;
}
/**
 * Returns if the given action context is a parent of this action context.
 */
export function isActionContextChildOf(actionContext, parent) {
    return _isActionContextThisOrChildOf(actionContext, parent, false);
}
/**
 * Returns if the given action context is this or a parent of this action context.
 */
export function isActionContextThisOrChildOf(actionContext, parentOrThis) {
    return _isActionContextThisOrChildOf(actionContext, parentOrThis, true);
}
//# sourceMappingURL=actionContext.js.map