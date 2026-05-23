import { BaseType, ComplexType } from "../../core/type/type.js";
import { getSnapshot } from "../../core/mst-operations.js";
import { isStateTreeNode } from "../../core/node/node-utils.js";
import { ObjectNode } from "../../core/node/object-node.js";
import { typeCheckFailure } from "../../core/type/type-checker.js";
import { assertIsType, isType, TypeFlags } from "../../core/type/type.js";
import { devMode, fail } from "../../utils.js";
import { isUnionType } from "./union.js";
/** @hidden */
const $preProcessorFailed = Symbol("$preProcessorFailed");
class SnapshotProcessor extends BaseType {
    _subtype;
    _processors;
    get flags() {
        return this._subtype.flags | TypeFlags.SnapshotProcessor;
    }
    constructor(_subtype, _processors, name) {
        super(name || _subtype.name);
        this._subtype = _subtype;
        this._processors = _processors;
    }
    describe() {
        return `snapshotProcessor(${this._subtype.describe()})`;
    }
    preProcessSnapshot(sn) {
        if (this._processors.preProcessor) {
            return this._processors.preProcessor.call(null, sn);
        }
        return sn;
    }
    preProcessSnapshotSafe(sn) {
        try {
            return this.preProcessSnapshot(sn);
        }
        catch (_e) {
            return $preProcessorFailed;
        }
    }
    postProcessSnapshot(sn, node) {
        if (this._processors.postProcessor) {
            return this._processors.postProcessor.call(null, sn, node.storedValue);
        }
        return sn;
    }
    _fixNode(node) {
        // the node has to use these methods rather than the original type ones
        proxyNodeTypeMethods(node.type, this, "create");
        if (node instanceof ObjectNode) {
            node.hasSnapshotPostProcessor = !!this._processors.postProcessor;
        }
        const oldGetSnapshot = node.getSnapshot;
        node.getSnapshot = () => this.postProcessSnapshot(oldGetSnapshot.call(node), node);
        if (!isUnionType(this._subtype)) {
            node.getReconciliationType = () => {
                return this;
            };
        }
    }
    instantiate(parent, subpath, environment, initialValue) {
        const processedInitialValue = isStateTreeNode(initialValue)
            ? initialValue
            : this.preProcessSnapshot(initialValue);
        const node = this._subtype.instantiate(parent, subpath, environment, processedInitialValue);
        this._fixNode(node);
        return node;
    }
    reconcile(current, newValue, parent, subpath) {
        const node = this._subtype.reconcile(current, isStateTreeNode(newValue) ? newValue : this.preProcessSnapshot(newValue), parent, subpath);
        if (node !== current) {
            this._fixNode(node);
        }
        return node;
    }
    getSnapshot(node, applyPostProcess = true) {
        const sn = this._subtype.getSnapshot(node);
        return applyPostProcess ? this.postProcessSnapshot(sn, node) : sn;
    }
    isValidSnapshot(value, context) {
        const processedSn = this.preProcessSnapshotSafe(value);
        if (processedSn === $preProcessorFailed) {
            return typeCheckFailure(context, value, "Failed to preprocess value");
        }
        return this._subtype.validate(processedSn, context);
    }
    getSubTypes() {
        return this._subtype;
    }
    is(thing) {
        const value = isType(thing)
            ? this._subtype
            : isStateTreeNode(thing)
                ? getSnapshot(thing, false)
                : this.preProcessSnapshotSafe(thing);
        if (value === $preProcessorFailed) {
            return false;
        }
        return (this._subtype.validate(value, [{ path: "", type: this._subtype }])
            .length === 0);
    }
    isAssignableFrom(type) {
        return this._subtype.isAssignableFrom(type);
    }
    isMatchingSnapshotId(current, snapshot) {
        if (!(this._subtype instanceof ComplexType)) {
            return false;
        }
        const processedSn = this.preProcessSnapshot(snapshot);
        return this._subtype.isMatchingSnapshotId(current, processedSn);
    }
}
function proxyNodeTypeMethods(nodeType, snapshotProcessorType, ...methods) {
    for (const method of methods) {
        nodeType[method] = snapshotProcessorType[method].bind(snapshotProcessorType);
    }
}
/**
 * `types.snapshotProcessor` - Runs a pre/post snapshot processor before/after serializing a given type.
 *
 * Example:
 * ```ts
 * const Todo1 = types.model({ text: types.string })
 * // in the backend the text type must be null when empty
 * interface BackendTodo {
 *     text: string | null
 * }
 *
 * const Todo2 = types.snapshotProcessor(Todo1, {
 *     // from snapshot to instance
 *     preProcessor(snapshot: BackendTodo) {
 *         return {
 *             text: sn.text || "";
 *         }
 *     },
 *
 *     // from instance to snapshot
 *     postProcessor(snapshot, node): BackendTodo {
 *         return {
 *             text: !sn.text ? null : sn.text
 *         }
 *     }
 * })
 * ```
 *
 * @param type Type to run the processors over.
 * @param processors Processors to run.
 * @param name Type name, or undefined to inherit the inner type one.
 * @returns
 */
export function snapshotProcessor(type, processors, name) {
    assertIsType(type, 1);
    if (devMode()) {
        if (processors.postProcessor &&
            typeof processors.postProcessor !== "function") {
            // istanbul ignore next
            throw fail("postSnapshotProcessor must be a function");
        }
        if (processors.preProcessor &&
            typeof processors.preProcessor !== "function") {
            // istanbul ignore next
            throw fail("preSnapshotProcessor must be a function");
        }
    }
    return new SnapshotProcessor(type, processors, name);
}
//# sourceMappingURL=snapshotProcessor.js.map