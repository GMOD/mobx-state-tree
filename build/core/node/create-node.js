import { fail } from "../../utils.js";
import { getStateTreeNodeSafe } from "./node-utils.js";
import { ObjectNode } from "./object-node.js";
import { ScalarNode } from "./scalar-node.js";
/**
 * @internal
 * @hidden
 */
export function createObjectNode(type, parent, subpath, environment, initialValue) {
    const existingNode = getStateTreeNodeSafe(initialValue);
    if (existingNode) {
        if (existingNode.parent) {
            // istanbul ignore next
            throw fail(`Cannot add an object to a state tree if it is already part of the same or another state tree. Tried to assign an object to '${parent ? parent.path : ""}/${subpath}', but it lives already at '${existingNode.path}'`);
        }
        if (parent) {
            existingNode.setParent(parent, subpath);
        }
        // else it already has no parent since it is a pre-requisite
        return existingNode;
    }
    // not a node, a snapshot
    return new ObjectNode(type, parent, subpath, environment, initialValue);
}
/**
 * @internal
 * @hidden
 */
export function createScalarNode(type, parent, subpath, environment, initialValue) {
    return new ScalarNode(type, parent, subpath, environment, initialValue);
}
/**
 * @internal
 * @hidden
 */
export function isNode(value) {
    return value instanceof ScalarNode || value instanceof ObjectNode;
}
//# sourceMappingURL=create-node.js.map