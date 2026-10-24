import { findParent, types, type IAnyStateTreeNode } from "../../src/index.ts"

interface ViewLike {
  displayName: string
}
declare function isViewLike(thing: unknown): thing is ViewLike
declare function hasLabel(node: object): node is { label: string }

const node = types.model({}).create()

// A guard over `unknown` narrowing to a plain interface, the shape jbrowse's
// `isViewModel` and `isTrackModel` have, narrows the result.
const view = findParent(node, isViewLike)
const viewName: string | undefined = view?.displayName
// @ts-expect-error the result is ViewLike | undefined, not any
const notANumber: number = view

const labelled = findParent(node, hasLabel)
const label: string | undefined = labelled?.label

const any = findParent(node, n => n !== node)
const anyNode: IAnyStateTreeNode | undefined = any
// @ts-expect-error a plain predicate does not narrow
const notALabel: string | undefined = any?.label

export { viewName, notANumber, label, anyNode, notALabel }
