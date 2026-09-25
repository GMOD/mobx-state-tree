import {
  type IArrayDidChange,
  type IArraySplice,
  type IArrayWillChange,
  type IArrayWillSplice,
  type IObservableArray,
  _getAdministration,
  action,
  intercept,
  observable,
  observe
} from "mobx"

import {
  type AnyNode,
  type AnyObjectNode,
  ComplexType,
  EMPTY_ARRAY,
  EMPTY_OBJECT,
  type ExtractCSTWithSTN,
  type HookInitializers,
  type IAnyStateTreeNode,
  type IAnyType,
  type IChildNodesMap,
  type IHooksGetter,
  type IJsonPatch,
  type IStateTreeNode,
  type IType,
  type IValidationContext,
  type IValidationResult,
  NO_HOOK_INITIALIZERS,
  ObjectNode,
  TypeFlags,
  appendHookInitializer,
  assertIsType,
  convertChildNodesToArray,
  createObjectNode,
  fail,
  getContextForPath,
  getStateTreeNode,
  installHookInitializers,
  isArray,
  isNode,
  isPlainObject,
  isStateTreeNode,
  isType,
  ModelType,
  unwrapType,
  mobxShallow,
  normalizeIdentifier,
  popContext,
  typeCheckFailure,
  typeCheckSuccess,
  typecheckInternal
} from "../../internal.ts"

/** @hidden */
export interface IMSTArray<IT extends IAnyType> extends IObservableArray<
  IT["Type"]
> {
  // needs to be split or else it will complain about not being compatible with the array interface
  push(...items: IT["Type"][]): number
  push(...items: ExtractCSTWithSTN<IT>[]): number

  concat(...items: ConcatArray<IT["Type"]>[]): IT["Type"][]
  concat(...items: ConcatArray<ExtractCSTWithSTN<IT>>[]): IT["Type"][]

  concat(...items: (IT["Type"] | ConcatArray<IT["Type"]>)[]): IT["Type"][]
  concat(
    ...items: (ExtractCSTWithSTN<IT> | ConcatArray<ExtractCSTWithSTN<IT>>)[]
  ): IT["Type"][]

  splice(start: number, deleteCount?: number): IT["Type"][]
  splice(
    start: number,
    deleteCount: number,
    ...items: IT["Type"][]
  ): IT["Type"][]
  splice(
    start: number,
    deleteCount: number,
    ...items: ExtractCSTWithSTN<IT>[]
  ): IT["Type"][]

  unshift(...items: IT["Type"][]): number
  unshift(...items: ExtractCSTWithSTN<IT>[]): number
}

/** @hidden */
export interface IArrayType<IT extends IAnyType> extends IType<
  readonly IT["CreationType"][] | undefined,
  IT["SnapshotType"][],
  IMSTArray<IT>
> {
  hooks(hooks: IHooksGetter<IMSTArray<IT>>): IArrayType<IT>
  /** the element type of the array */
  getChildType(): IAnyType
}

/**
 * @internal
 * @hidden
 */
export class ArrayType<IT extends IAnyType> extends ComplexType<
  readonly IT["CreationType"][] | undefined,
  IT["SnapshotType"][],
  IMSTArray<IT>
> {
  readonly flags = TypeFlags.Array

  constructor(
    private readonly _subType: IT,
    private readonly hookInitializers: HookInitializers<
      IMSTArray<IT>
    > = NO_HOOK_INITIALIZERS
  ) {
    super()
  }

  protected override computeName(): string {
    return `${this._subType.name}[]`
  }

  hooks(hooks: IHooksGetter<IMSTArray<IT>>) {
    return new ArrayType(
      this._subType,
      appendHookInitializer(this.hookInitializers, hooks)
    )
  }

  instantiate(
    parent: AnyObjectNode | null,
    subpath: string,
    environment: any,
    initialValue: this["C"] | this["T"]
  ): this["N"] {
    return createObjectNode(this, parent, subpath, environment, initialValue)
  }

  initializeChildNodes(
    objNode: this["N"],
    snapshot: this["C"] = []
  ): IChildNodesMap {
    const subType = (objNode.type as this)._subType
    const result: IChildNodesMap = {}
    snapshot.forEach((item, index) => {
      const subpath = `${index}`
      result[subpath] = subType.instantiate(objNode, subpath, undefined, item)
    })
    return result
  }

  createNewInstance(childNodes: IChildNodesMap): this["T"] {
    const options = { ...mobxShallow, name: this.name }
    return observable.array(
      convertChildNodesToArray(childNodes) as AnyNode[],
      options
    ) as this["T"]
  }

  finalizeNewInstance(node: this["N"], instance: this["T"]): void {
    _getAdministration(instance).dehancer = node.unbox

    installHookInitializers((node.type as this).hookInitializers, instance)

    intercept(instance as IObservableArray<AnyNode>, this.willChange)
    observe(instance as IObservableArray<AnyNode>, this.didChange)
  }

  getChildren(node: this["N"]): AnyNode[] {
    return node.storedValue.slice()
  }

  getChildNode(node: this["N"], key: string): AnyNode {
    const child = node.storedValue[Number(key)]
    if (child) {
      return child
    }
    throw fail(`Not a child: ${key}`)
  }

  willChange(
    change: IArrayWillChange<AnyNode> | IArrayWillSplice<AnyNode>
  ): IArrayWillChange<AnyNode> | IArrayWillSplice<AnyNode> | null {
    const node = getStateTreeNode(change.object as IStateTreeNode<this>)
    node.assertWritable({ subpath: `${change.index}` })
    const subType = (node.type as this)._subType

    switch (change.type) {
      case "update":
        {
          if (change.newValue === change.object[change.index]) {
            return null
          }

          const updatedNodes = reconcileArrayChildren(
            node,
            subType,
            // only the replaced child is reconciled, so read that one node
            // directly — `node.getChildren()` copies the whole backing array,
            // which made a single-element assignment cost O(array length)
            [node.getChildNode(`${change.index}`)],
            [change.newValue],
            change.index
          )
          if (!updatedNodes) {
            return null
          }
          change.newValue = updatedNodes[0]!
        }
        break
      case "splice":
        {
          const { index, removedCount, added } = change
          const childNodes = node.getChildren()

          const addedNodes = reconcileArrayChildren(
            node,
            subType,
            childNodes.slice(index, index + removedCount),
            added,
            index
          )
          if (!addedNodes) {
            return null
          }
          change.added = addedNodes

          // update paths of remaining items
          for (let i = index + removedCount; i < childNodes.length; i++) {
            childNodes[i]!.setParent(node, `${i + added.length - removedCount}`)
          }
        }
        break
    }
    return change
  }

  override getSnapshot(node: this["N"]): this["S"] {
    return node.getChildren().map(childNode => childNode.snapshot)
  }

  processInitialSnapshot(childNodes: IChildNodesMap): this["S"] {
    const processed: this["S"] = []
    Object.keys(childNodes).forEach(key => {
      processed.push(childNodes[key]!.getSnapshot())
    })
    return processed
  }

  didChange(change: IArrayDidChange<AnyNode> | IArraySplice<AnyNode>): void {
    const node = getStateTreeNode(change.object as IAnyStateTreeNode)
    switch (change.type) {
      case "update":
        return void node.emitPatch(
          {
            op: "replace",
            path: `${change.index}`,
            value: change.newValue.snapshot,
            oldValue: change.oldValue ? change.oldValue.snapshot : undefined
          },
          node
        )
      case "splice":
        for (let i = change.removedCount - 1; i >= 0; i--) {
          node.emitPatch(
            {
              op: "remove",
              path: `${change.index + i}`,
              oldValue: change.removed[i]!.snapshot
            },
            node
          )
        }
        for (let i = 0; i < change.addedCount; i++) {
          node.emitPatch(
            {
              op: "add",
              path: `${change.index + i}`,
              value: node.getChildNode(`${change.index + i}`).snapshot,
              oldValue: undefined
            },
            node
          )
        }
        return
    }
  }

  applyPatchLocally(node: this["N"], subpath: string, patch: IJsonPatch): void {
    const target = node.storedValue
    const index = subpath === "-" ? target.length : Number(subpath)
    switch (patch.op) {
      case "replace":
        target[index] = patch.value
        break
      case "add":
        target.splice(index, 0, patch.value)
        break
      case "remove":
        target.splice(index, 1)
        break
    }
  }

  applySnapshot(node: this["N"], snapshot: this["C"]): void {
    typecheckInternal(this, snapshot)
    const target = node.storedValue
    target.replace(snapshot as any)
  }

  getChildType(): IAnyType {
    return this._subType
  }

  isValidSnapshot(
    value: this["C"],
    context: IValidationContext
  ): IValidationResult {
    if (!isArray(value)) {
      return typeCheckFailure(context, value, "Value is not an array")
    }

    for (let i = 0; i < value.length; i++) {
      getContextForPath(context, `${i}`, this._subType)
      const errors = this._subType.validate(value[i], context)
      popContext(context)
      if (errors.length > 0) {
        return errors
      }
    }
    return typeCheckSuccess()
  }

  getDefaultSnapshot(): this["C"] {
    return EMPTY_ARRAY
  }

  removeChild(node: this["N"], subpath: string) {
    node.storedValue.splice(Number(subpath), 1)
  }
}
ArrayType.prototype.applySnapshot = action(ArrayType.prototype.applySnapshot)

/**
 * `types.array` - Creates an index based collection type who's children are all of a uniform declared type.
 *
 * This type will always produce [observable arrays](https://mobx.js.org/api.html#observablearray)
 *
 * Example:
 * ```ts
 * const Todo = types.model({
 *   task: types.string
 * })
 *
 * const TodoStore = types.model({
 *   todos: types.array(Todo)
 * })
 *
 * const s = TodoStore.create({ todos: [] })
 * unprotect(s) // needed to allow modifying outside of an action
 * s.todos.push({ task: "Grab coffee" })
 * console.log(s.todos[0]) // prints: "Grab coffee"
 * ```
 *
 * @param subtype
 * @returns
 */
export function array<IT extends IAnyType>(subtype: IT): IArrayType<IT> {
  assertIsType(subtype, 1)
  return new ArrayType<IT>(subtype)
}

/**
 * @param firstNewPath index the reconciled slice starts at; both call sites
 * hand over a contiguous run, so subpath `i` is simply `firstNewPath + i`
 */
function reconcileArrayChildren<TT>(
  parent: AnyObjectNode,
  childType: IType<any, any, TT>,
  oldNodes: AnyNode[],
  newValues: TT[],
  firstNewPath: number
): AnyNode[] | null {
  let nothingChanged = true
  const result: AnyNode[] = []
  // every old node before `next` is claimed
  const claimed = new Uint8Array(oldNodes.length)
  let next = 0
  let finder: ReuseFinder | undefined

  for (let i = 0; i < newValues.length; i++) {
    while (claimed[next]) {
      next++
    }
    const oldNode = oldNodes[next]
    let newValue = newValues[i]
    const newPath = `${firstNewPath + i}`

    // for some reason, instead of newValue we got a node, fallback to the storedValue
    // TODO: https://github.com/mobxjs/mobx-state-tree/issues/340#issuecomment-325581681
    if (isNode(newValue)) {
      newValue = newValue.storedValue
    }

    if (!oldNode) {
      if (
        isStateTreeNode(newValue) &&
        getStateTreeNode(newValue).parent === parent
      ) {
        // this node is owned by this parent, but not in the reconcilable set, so it must be double
        throw fail(
          `Cannot add an object to a state tree if it is already part of the same or another state tree. Tried to assign an object to '${
            parent.path
          }/${newPath}', but it lives already at '${getStateTreeNode(newValue).path}'`
        )
      }
      nothingChanged = false
      result.push(valueAsNode(childType, parent, newPath, newValue))
    } else if (areSame(oldNode, newValue)) {
      claimed[next] = 1
      result.push(valueAsNode(childType, parent, newPath, newValue, oldNode))
    } else {
      nothingChanged = false
      // a single-element write scans one node, cheaper than building an index
      const j =
        oldNodes.length > 1
          ? (finder ??= new ReuseFinder(childType, oldNodes, claimed)).find(
              newValue,
              next
            )
          : scanForSame(oldNodes, claimed, next, newValue)
      let oldMatch: AnyNode | undefined
      if (j >= 0) {
        claimed[j] = 1
        oldMatch = oldNodes[j]
      }
      result.push(valueAsNode(childType, parent, newPath, newValue, oldMatch))
    }
  }

  for (let j = next; j < oldNodes.length; j++) {
    if (!claimed[j]) {
      nothingChanged = false
      const oldNode = oldNodes[j]!
      if (oldNode instanceof ObjectNode) {
        // since it is going to be returned by pop/splice/shift better create it before killing it
        // so it doesn't end up in an undead state
        oldNode.createObservableInstanceIfNeeded()
      }
      oldNode.die()
    }
  }

  return nothingChanged ? null : result
}

function scanForSame(
  oldNodes: AnyNode[],
  claimed: Uint8Array,
  from: number,
  value: unknown
) {
  for (let j = from; j < oldNodes.length; j++) {
    if (!claimed[j] && areSame(oldNodes[j]!, value)) {
      return j
    }
  }
  return -1
}

/**
 * Picks the old node the reorder branch reuses: the first unclaimed one
 * `areSame` holds for. `areSame` reduces to an equality — node identity for a
 * live node, the old node's snapshot for anything else — except where the
 * value is a plain object and the old node carries an identifier, where it
 * runs `is()` before matching ids. So only that case scans, and an identified
 * plain model looks its id up instead, as ADR 0001 records.
 */
class ReuseFinder {
  private readonly idAttribute: string | undefined
  private byId?: Map<string, number>
  private byNode?: Map<AnyNode, number>
  private bySnapshot?: { first: Map<unknown, number>; nextSame: Int32Array }
  private anyIdentified?: boolean

  constructor(
    childType: IAnyType,
    private readonly oldNodes: AnyNode[],
    private readonly claimed: Uint8Array
  ) {
    this.idAttribute =
      childType instanceof ModelType ? childType.identifierAttribute : undefined
  }

  find(value: unknown, next: number): number {
    let j: number
    if (this.idAttribute && isPlainObject(value)) {
      j =
        this.idIndex(next).get(normalizeIdentifier(value[this.idAttribute])) ??
        -1
    } else if (isStateTreeNode(value)) {
      j = this.nodeIndex(next).get(getStateTreeNode(value)) ?? -1
    } else if (!isPlainObject(value) || !this.hasIdentifiedNode(next)) {
      j = this.firstWithSnapshot(value, next)
    } else {
      return scanForSame(this.oldNodes, this.claimed, next, value)
    }
    return j >= 0 && !this.claimed[j] && areSame(this.oldNodes[j]!, value)
      ? j
      : -1
  }

  // last one wins on a duplicate id, even when it is already claimed
  private idIndex(next: number) {
    if (!this.byId) {
      this.byId = new Map()
      for (let j = next; j < this.oldNodes.length; j++) {
        const node = this.oldNodes[j]!
        if (node instanceof ObjectNode && node.identifier !== null) {
          this.byId.set(node.identifier, j)
        }
      }
    }
    return this.byId
  }

  private nodeIndex(next: number) {
    if (!this.byNode) {
      this.byNode = new Map()
      for (let j = next; j < this.oldNodes.length; j++) {
        this.byNode.set(this.oldNodes[j]!, j)
      }
    }
    return this.byNode
  }

  private hasIdentifiedNode(next: number) {
    if (this.anyIdentified === undefined) {
      this.anyIdentified = this.oldNodes
        .slice(next)
        .some(
          node =>
            node instanceof ObjectNode &&
            node.identifier !== null &&
            !!node.identifierAttribute
        )
    }
    return this.anyIdentified
  }

  private firstWithSnapshot(value: unknown, next: number) {
    if (!this.bySnapshot) {
      const first = new Map<unknown, number>()
      const nextSame = new Int32Array(this.oldNodes.length)
      for (let j = this.oldNodes.length - 1; j >= next; j--) {
        const node = this.oldNodes[j]!
        if (!this.claimed[j] && node.isAlive) {
          const snapshot = node.snapshot
          nextSame[j] = first.get(snapshot) ?? -1
          first.set(snapshot, j)
        }
      }
      this.bySnapshot = { first, nextSame }
    }
    const { first, nextSame } = this.bySnapshot
    const head = first.get(value)
    if (head === undefined) {
      return -1
    }
    let j = head
    while (j >= 0 && (this.claimed[j] || !this.oldNodes[j]!.isAlive)) {
      j = nextSame[j]!
    }
    if (j !== head) {
      first.set(value, j)
    }
    return j
  }
}

/**
 * Convert a value to a node at given parent and subpath. Attempts to reuse old node if possible and given.
 */
function valueAsNode(
  childType: IAnyType,
  parent: AnyObjectNode,
  subpath: string,
  newValue: any,
  oldNode?: AnyNode
) {
  // ensure the value is valid-ish
  typecheckInternal(childType, newValue)

  function getNewNode() {
    // the new value has a MST node
    if (isStateTreeNode(newValue)) {
      const childNode = getStateTreeNode(newValue)
      childNode.assertAlive(EMPTY_OBJECT)

      // the node lives here
      if (childNode.parent !== null && childNode.parent === parent) {
        childNode.setParent(parent, subpath)
        return childNode
      }
    }
    // there is old node and new one is a value/snapshot
    if (oldNode) {
      return childType.reconcile(oldNode, newValue, parent, subpath)
    }

    // nothing to do, create from scratch
    return childType.instantiate(parent, subpath, undefined, newValue)
  }

  const newNode = getNewNode()
  if (oldNode && oldNode !== newNode) {
    if (oldNode instanceof ObjectNode) {
      // since it is going to be returned by pop/splice/shift better create it before killing it
      // so it doesn't end up in an undead state
      oldNode.createObservableInstanceIfNeeded()
    }
    oldNode.die()
  }
  return newNode
}

/**
 * Reconciliation types that carry an identifier expose this; `getReconciliationType`
 * is declared as the general `IAnyType`, on which it isn't part of the surface.
 */
interface SnapshotIdMatcher {
  isMatchingSnapshotId(current: AnyNode, snapshot: any): boolean
}

/**
 * Check if a node holds a value.
 */
function areSame(oldNode: AnyNode, newValue: any): boolean {
  // never consider dead old nodes for reconciliation
  if (!oldNode.isAlive) {
    return false
  }

  // the new value has the same node
  if (isStateTreeNode(newValue)) {
    const newNode = getStateTreeNode(newValue)
    return newNode.isAlive && newNode === oldNode
  }

  // the provided value is the snapshot of the old node
  if (oldNode.snapshot === newValue) {
    return true
  }

  // Non object nodes don't get reconciled
  if (!(oldNode instanceof ObjectNode)) {
    return false
  }

  if (
    oldNode.identifier === null ||
    !oldNode.identifierAttribute ||
    !isPlainObject(newValue)
  ) {
    return false
  }

  const oldNodeType = oldNode.getReconciliationType()
  // new value is a snapshot with the correct identifier
  return (
    oldNodeType.is(newValue) &&
    (oldNodeType as unknown as SnapshotIdMatcher).isMatchingSnapshotId(
      oldNode,
      newValue
    )
  )
}

/**
 * Returns if a type is an array type, or wraps or unions one. For the array
 * type itself, use {@link asArrayType}.
 */
export function isArrayType(type: IAnyType): boolean {
  return isType(type) && (type.flags & TypeFlags.Array) > 0
}

/**
 * The array type `type` builds its values with, seeing through the wrappers
 * {@link unwrapType} does, or `undefined` if that is not an array type.
 */
export function asArrayType(type: IAnyType): IArrayType<IAnyType> | undefined {
  const unwrapped = unwrapType(type)
  return unwrapped instanceof ArrayType ? unwrapped : undefined
}
