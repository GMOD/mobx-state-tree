// Type-only regression tests for `IMSTMap.merge` / `IMSTMap.replace`, whose
// parameters used to end in `| any` and so accepted anything at all.
// Checked by `pnpm test:types`.

import { types, getSnapshot, type Instance } from "../../src/index.ts"

const Todo = types.model("Todo", {
  id: types.identifier,
  done: types.boolean
})

const Store = types.model("Store", {
  todos: types.map(Todo),
  counts: types.map(types.number)
})

const store = Store.create({ todos: {}, counts: {} })
const todo: Instance<typeof Todo> = Todo.create({ id: "a", done: false })

// plain object maps of snapshots
store.todos.merge({ a: { id: "a", done: true } })
store.todos.replace({ a: { id: "a", done: true } })
store.counts.merge({ a: 1, b: 2 })
store.counts.replace({ a: 1 })

// instances are accepted wherever a snapshot is
store.todos.merge({ a: todo })
store.todos.replace({ a: todo })

// another MST map of the same instance type
declare const other: typeof store.todos
store.todos.merge(other)
store.todos.replace(other)
store.todos.replace(getSnapshot(store.todos))

// ES6 maps
store.counts.merge(new Map([["a", 1]]))
store.counts.replace(new Map<string | number, number>([[1, 2]]))
store.todos.merge(new Map([["a", { id: "a", done: true }]]))

// entry arrays
store.counts.merge([["a", 1]])
store.counts.replace([
  ["a", 1],
  [2, 3]
])
store.todos.replace([["a", { id: "a", done: true }]])

// merge takes no argument at all, matching the runtime and mobx
store.counts.merge()

// @ts-expect-error a scalar is not a map-like
store.counts.merge(42)
// @ts-expect-error nor for replace
store.counts.replace(42)
// @ts-expect-error the values must match the child type
store.counts.merge({ a: "one" })
// @ts-expect-error including in an ES6 map
store.counts.replace(new Map([["a", "one"]]))
// @ts-expect-error including in entry arrays
store.counts.merge([["a", "one"]])
// @ts-expect-error a bare array of values is not an entry array
store.counts.replace([1, 2])
// @ts-expect-error the model's snapshot shape is enforced
store.todos.merge({ a: { id: "a", done: "yes" } })
// @ts-expect-error a map of the wrong child type is rejected
store.todos.replace(store.counts)
