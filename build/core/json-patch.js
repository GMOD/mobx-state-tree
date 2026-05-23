import { fail, stringStartsWith } from "../utils.js";
/**
 * @internal
 * @hidden
 */
export function splitPatch(patch) {
    if (!("oldValue" in patch)) {
        throw fail(`Patches without \`oldValue\` field cannot be inversed`);
    }
    return [stripPatch(patch), invertPatch(patch)];
}
/**
 * @internal
 * @hidden
 */
export function stripPatch(patch) {
    // strips `oldvalue` information from the patch, so that it becomes a patch conform the json-patch spec
    // this removes the ability to undo the patch
    switch (patch.op) {
        case "add":
            return { op: "add", path: patch.path, value: patch.value };
        case "remove":
            return { op: "remove", path: patch.path };
        case "replace":
            return { op: "replace", path: patch.path, value: patch.value };
    }
}
function invertPatch(patch) {
    switch (patch.op) {
        case "add":
            return {
                op: "remove",
                path: patch.path
            };
        case "remove":
            return {
                op: "add",
                path: patch.path,
                value: patch.oldValue
            };
        case "replace":
            return {
                op: "replace",
                path: patch.path,
                value: patch.oldValue
            };
    }
}
/**
 * Simple simple check to check it is a number.
 */
function isNumber(x) {
    return typeof x === "number";
}
/**
 * Escape slashes and backslashes.
 *
 * http://tools.ietf.org/html/rfc6901
 */
export function escapeJsonPath(path) {
    if (isNumber(path) === true) {
        return "" + path;
    }
    if (path.indexOf("/") === -1 && path.indexOf("~") === -1) {
        return path;
    }
    return path.replace(/~/g, "~0").replace(/\//g, "~1");
}
/**
 * Unescape slashes and backslashes.
 */
export function unescapeJsonPath(path) {
    return path.replace(/~1/g, "/").replace(/~0/g, "~");
}
/**
 * Generates a json-path compliant json path from path parts.
 *
 * @param path
 * @returns
 */
export function joinJsonPath(path) {
    // `/` refers to property with an empty name, while `` refers to root itself!
    if (path.length === 0) {
        return "";
    }
    const getPathStr = (p) => p.map(escapeJsonPath).join("/");
    if (path[0] === "." || path[0] === "..") {
        // relative
        return getPathStr(path);
    }
    else {
        // absolute
        return "/" + getPathStr(path);
    }
}
/**
 * Splits and decodes a json path into several parts.
 *
 * @param path
 * @returns
 */
export function splitJsonPath(path) {
    // `/` refers to property with an empty name, while `` refers to root itself!
    const parts = path.split("/").map(unescapeJsonPath);
    const valid = path === "" ||
        path === "." ||
        path === ".." ||
        stringStartsWith(path, "/") ||
        stringStartsWith(path, "./") ||
        stringStartsWith(path, "../");
    if (!valid) {
        throw fail(`a json path must be either rooted, empty or relative, but got '${path}'`);
    }
    // '/a/b/c' -> ["a", "b", "c"]
    // '../../b/c' -> ["..", "..", "b", "c"]
    // '' -> []
    // '/' -> ['']
    // './a' -> [".", "a"]
    // /./a' -> [".", "a"] equivalent to './a'
    if (parts[0] === "") {
        parts.shift();
    }
    return parts;
}
//# sourceMappingURL=json-patch.js.map