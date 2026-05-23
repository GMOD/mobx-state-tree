import { action, observable, when } from "mobx";
import { SimpleType } from "../../core/type/type.js";
import { createScalarNode } from "../../core/node/create-node.js";
import { typeCheckFailure, typeCheckSuccess } from "../../core/type/type-checker.js";
import { TypeFlags } from "../../core/type/type.js";
import { deepFreeze, isSerializable } from "../../utils.js";
export function lazy(name, options) {
    // TODO: fix this unknown casting to be stricter
    return new Lazy(name, options);
}
/**
 * @internal
 * @hidden
 */
export class Lazy extends SimpleType {
    options;
    flags = TypeFlags.Lazy;
    loadedType = null;
    pendingNodeList = observable.array();
    constructor(name, options) {
        super(name);
        this.options = options;
        when(() => this.pendingNodeList.length > 0 &&
            this.pendingNodeList.some(node => node.isAlive &&
                this.options.shouldLoadPredicate(node.parent ? node.parent.value : null)), () => {
            this.options.loadType().then(action((type) => {
                this.loadedType = type;
                this.pendingNodeList.forEach(node => {
                    if (!node.parent) {
                        return;
                    }
                    if (!this.loadedType) {
                        return;
                    }
                    node.parent.applyPatches([
                        {
                            op: "replace",
                            path: `/${node.subpath}`,
                            value: node.snapshot
                        }
                    ]);
                });
            }));
        });
    }
    describe() {
        return `<lazy ${this.name}>`;
    }
    instantiate(parent, subpath, environment, value) {
        if (this.loadedType) {
            return this.loadedType.instantiate(parent, subpath, environment, value);
        }
        const node = createScalarNode(this, parent, subpath, environment, deepFreeze(value));
        this.pendingNodeList.push(node);
        when(() => !node.isAlive, () => this.pendingNodeList.splice(this.pendingNodeList.indexOf(node), 1));
        return node;
    }
    isValidSnapshot(value, context) {
        if (this.loadedType) {
            return this.loadedType.validate(value, context);
        }
        if (!isSerializable(value)) {
            return typeCheckFailure(context, value, "Value is not serializable and cannot be lazy");
        }
        return typeCheckSuccess();
    }
    reconcile(current, value, parent, subpath) {
        if (this.loadedType) {
            current.die();
            return this.loadedType.instantiate(parent, subpath, parent.environment, value);
        }
        return super.reconcile(current, value, parent, subpath);
    }
}
//# sourceMappingURL=lazy.js.map