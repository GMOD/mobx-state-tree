let livelinessChecking = "warn";
/**
 * Defines what MST should do when running into reads / writes to objects that have died.
 * By default it will print a warning.
 * Use the `"error"` option to easy debugging to see where the error was thrown and when the offending read / write took place
 *
 * @param mode `"warn"`, `"error"` or `"ignore"`
 */
export function setLivelinessChecking(mode) {
    livelinessChecking = mode;
}
/**
 * Returns the current liveliness checking mode.
 *
 * @returns `"warn"`, `"error"` or `"ignore"`
 */
export function getLivelinessChecking() {
    return livelinessChecking;
}
/**
 * @deprecated use setLivelinessChecking instead
 * @hidden
 *
 * Defines what MST should do when running into reads / writes to objects that have died.
 * By default it will print a warning.
 * Use the `"error"` option to easy debugging to see where the error was thrown and when the offending read / write took place
 *
 * @param mode `"warn"`, `"error"` or `"ignore"`
 */
export function setLivelynessChecking(mode) {
    setLivelinessChecking(mode);
}
//# sourceMappingURL=livelinessChecking.js.map