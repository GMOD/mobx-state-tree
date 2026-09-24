import {
  type AnyObjectNode,
  BaseNode,
  type Hook,
  NodeLifeCycle,
  type SimpleType,
  devMode,
  fail,
  freeze
} from "../../internal.ts"

/**
 * @internal
 * @hidden
 */
export class ScalarNode<C, S, T> extends BaseNode<C, S, T> {
  // note about hooks:
  // - afterCreate is not emitted in scalar nodes, since it would be emitted in
  //   the constructor, before anybody could subscribe to it
  // - afterCreationFinalization could be emitted, but there's no need for it right now
  // - beforeDetach reaches a scalar node only through notifyDetachOf, when an
  //   ancestor is detached; a scalar node cannot be detached itself

  declare readonly type: SimpleType<C, S, T>

  constructor(
    simpleType: SimpleType<C, S, T>,
    parent: AnyObjectNode | null,
    subpath: string,
    environment: any,
    initialSnapshot: C
  ) {
    super(simpleType, parent, subpath, environment)
    try {
      this.storedValue = simpleType.createNewInstance(initialSnapshot)
    } catch (e) {
      // short-cut to die the instance, to avoid the snapshot computed starting to throw...
      this.state = NodeLifeCycle.DEAD
      throw e
    }

    this.state = NodeLifeCycle.CREATED
    this.finalizeCreation()
  }

  get root(): AnyObjectNode {
    // future optimization: store root ref in the node and maintain it
    if (!this.parent) {
      throw fail(`This scalar node is not part of a tree`)
    }
    return this.parent.root
  }

  setParent(newParent: AnyObjectNode, subpath: string): void {
    const parentChanged = this.parent !== newParent
    const subpathChanged = this.subpath !== subpath

    if (!parentChanged && !subpathChanged) {
      return
    }

    if (devMode()) {
      if (!subpath) {
        // istanbul ignore next
        throw fail("assertion failed: subpath expected")
      }
      if (!newParent) {
        // istanbul ignore next
        throw fail("assertion failed: parent expected")
      }
      if (parentChanged) {
        // istanbul ignore next
        throw fail("assertion failed: scalar nodes cannot change their parent")
      }
    }

    this.environment = undefined // use parent's
    this.baseSetParent(this.parent, subpath)
  }

  get snapshot(): S {
    return freeze(this.getSnapshot())
  }

  getSnapshot(): S {
    return this.type.getSnapshot(this)
  }

  override toString(): string {
    const path = (this.isAlive ? this.path : this.pathUponDeath) || "<root>"
    return `${this.type.name}@${path}${this.isAlive ? "" : " [dead]"}`
  }

  finalizeCreation(): void {
    this.baseFinalizeCreation()
  }

  aboutToDie(): void {
    this.baseAboutToDie()
  }

  finalizeDeath(): void {
    this.baseFinalizeDeath()
  }

  protected fireHook(name: Hook): void {
    this.fireInternalHook(name)
  }
}
