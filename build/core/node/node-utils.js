import { assertArg, EMPTY_ARRAY, fail } from "../../utils.js";
import { joinJsonPath, splitJsonPath } from "../json-patch.js";
import { ObjectNode } from "./object-node.js";
import { ScalarNode } from "./scalar-node.js";
export { NodeLifeCycle } from "./NodeLifeCycle.js";
/**
 * Returns true if the given value is a node in a state tree.
 * More precisely, that is, if the value is an instance of a
 * `types.model`, `types.array` or `types.map`.
 *
 * @param value
 * @returns true if the value is a state tree node.
 */
export function isStateTreeNode(value) {
    return !!(value && value.$treenode);
}
/**
 * @internal
 * @hidden
 */
export function assertIsStateTreeNode(value, argNumber) {
    assertArg(value, isStateTreeNode, "mobx-state-tree node", argNumber);
}
/**
 * @internal
 * @hidden
 */
export function getStateTreeNode(value) {
    if (!isStateTreeNode(value)) {
        // istanbul ignore next
        throw fail(`Value ${value} is no MST Node`);
    }
    return value.$treenode;
}
/**
 * @internal
 * @hidden
 */
export function getStateTreeNodeSafe(value) {
    return (value && value.$treenode) || null;
}
/**
 * @internal
 * @hidden
 */
export function toJSON() {
    return getStateTreeNode(this).snapshot;
}
const doubleDot = (_) => "..";
/**
 * @internal
 * @hidden
 */
export function getRelativePathBetweenNodes(base, target) {
    // PRE condition target is (a child of) base!
    if (base.root !== target.root) {
        throw fail(`Cannot calculate relative path: objects '${base}' and '${target}' are not part of the same object tree`);
    }
    const baseParts = splitJsonPath(base.path);
    const targetParts = splitJsonPath(target.path);
    let common = 0;
    for (; common < baseParts.length; common++) {
        if (baseParts[common] !== targetParts[common]) {
            break;
        }
    }
    // TODO: assert that no targetParts paths are "..", "." or ""!
    return (baseParts.slice(common).map(doubleDot).join("/") +
        joinJsonPath(targetParts.slice(common)));
}
/**
 * @internal
 * @hidden
 */
export function resolveNodeByPath(base, path, failIfResolveFails = true) {
    return resolveNodeByPathParts(base, splitJsonPath(path), failIfResolveFails);
}
/**
 * @internal
 * @hidden
 */
export function resolveNodeByPathParts(base, pathParts, failIfResolveFails = true) {
    let current = base;
    try {
        for (let i = 0; i < pathParts.length; i++) {
            const part = pathParts[i];
            if (part === "..") {
                current = current.parent;
                if (current) {
                    continue;
                } // not everything has a parent
            }
            else if (part === ".") {
                continue;
            }
            else if (current) {
                if (current instanceof ScalarNode) {
                    // check if the value of a scalar resolves to a state tree node (e.g. references)
                    // then we can continue resolving...
                    const value = current.value;
                    if (isStateTreeNode(value)) {
                        current = getStateTreeNode(value);
                        // fall through
                    }
                }
                if (current instanceof ObjectNode) {
                    const subType = current.getChildType(part);
                    if (subType) {
                        current = current.getChildNode(part);
                        if (current) {
                            continue;
                        }
                    }
                }
            }
            throw fail(`Could not resolve '${part}' in path '${joinJsonPath(pathParts.slice(0, i)) || "/"}' while resolving '${joinJsonPath(pathParts)}'`);
        }
    }
    catch (e) {
        if (!failIfResolveFails) {
            return undefined;
        }
        throw e;
    }
    return current;
}
/**
 * @internal
 * @hidden
 */
export function convertChildNodesToArray(childNodes) {
    if (!childNodes) {
        return EMPTY_ARRAY;
    }
    const keys = Object.keys(childNodes);
    if (!keys.length) {
        return EMPTY_ARRAY;
    }
    const result = new Array(keys.length);
    keys.forEach((key, index) => {
        result[index] = childNodes[key];
    });
    return result;
}
//# sourceMappingURL=node-utils.js.map