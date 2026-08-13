import { test, expect, vi } from "vitest"
import { types, typecheck, isModelType, IAnyModelType } from "../../src"

if (process.env.NODE_ENV !== "production") {
  test("it should throw if late doesnt received a function as parameter", () => {
    expect(() => {
      types.model({
        after: types.late(1 as any)
      })
    }).toThrow()
  })
}
test("it should accept a type and infer it correctly", () => {
  const Before = types.model({
    after: types.late(() => After)
  })
  const After = types.model({
    name: types.maybe(types.string)
  })
  expect(() =>
    Before.create({ after: { name: "Hello, it's me." } })
  ).not.toThrow()
})
test("late should allow circular references", () => {
  // TypeScript is'nt smart enough to infer self referencing types.
  const Node = types.model({
    childs: types.optional(
      types.array(types.late((): IAnyModelType => Node)),
      []
    )
  })
  expect(() => Node.create()).not.toThrow()
  expect(() => Node.create({ childs: [{}, { childs: [] }] })).not.toThrow()
})
test("late should describe correctly circular references", () => {
  // TypeScript is'nt smart enough to infer self referencing types.
  const Node = types.model("Node", {
    childs: types.array(types.late((): IAnyModelType => Node))
  })
  expect(Node.describe()).toEqual("{ childs: late(() => Node)[]? }")
})
test("should typecheck", () => {
  const NodeObject = types.model("NodeObject", {
    id: types.identifierNumber,
    text: "Hi",
    child: types.maybe(types.late((): IAnyModelType => NodeObject))
  })
  const x = NodeObject.create({ id: 1 })
  try {
    ;(x as any).child = 3
    ;(x as any).floepie = 3
  } catch (e) {
    // ignore, this is about TS
  }
})

test("typecheck should throw an Error when called at runtime, but not log the error", () => {
  const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {})

  const NodeObject = types.model("NodeObject", {
    id: types.identifierNumber,
    text: types.string
  })

  expect(() => {
    typecheck(NodeObject, { id: 1, text: 1 } as any)
  }).toThrow()

  try {
    typecheck(NodeObject, { id: 1, text: 1 } as any)
  } catch (error) {
    expect(error).toBeDefined()
    expect(consoleSpy).not.toHaveBeenCalled()
  }
})

test("#825, late type checking ", () => {
  const Product = types.model({
    details: types.late(() => types.optional(Details, {}))
  })
  const Details = types.model({
    name: types.maybe(types.string)
  })

  const p2 = Product.create({})
  const p = Product.create({ details: { name: "bla" } })
})

test("#916 - 0", () => {
  const Todo = types.model("Todo", {
    title: types.string,
    newTodo: types.optional(
      types.late((): IAnyModelType => Todo),
      {}
    ) // N.B. this definition is never instantiateable!
  })
})

test("#916 - 1", () => {
  const Todo = types.model("Todo", {
    title: types.string,
    newTodo: types.maybe(types.late((): IAnyModelType => Todo))
  })
  const t = Todo.create({
    title: "Get Coffee"
  })
})

test("#916 - 2", () => {
  const Todo = types.model("Todo", {
    title: types.string,
    newTodo: types.maybe(types.late((): IAnyModelType => Todo))
  })
  expect(
    Todo.is({
      title: "A",
      newTodo: { title: " test" }
    })
  ).toBe(true)
  expect(
    Todo.is({
      title: "A",
      newTodo: { title: 7 }
    })
  ).toBe(false)
})

test("#916 - 3", () => {
  const Todo = types.model("Todo", {
    title: types.string,
    newTodo: types.maybe(types.late((): IAnyModelType => Todo))
  })
  const t = Todo.create({
    title: "Get Coffee",
    newTodo: { title: "test" }
  })

  expect(t.newTodo!.title).toBe("test")
})

// The flags of a union/optional wrapping a late type are memoized only once the
// fold is stable, and a late member is exactly what makes it unstable: it
// reports nothing for its subtype until the definition resolves. Caching the
// pre-resolution answer would freeze it forever. See agent-docs/adr/0003.
test("flags folded over a late member are not cached before it resolves", () => {
  let Inner: IAnyModelType | undefined
  const Late = types.late((): IAnyModelType => Inner!)
  const U = types.union(types.string, Late)
  const Opt = types.optional(U, "x")

  // nothing has resolved yet, so neither reports the model flag
  expect(isModelType(U)).toBe(false)
  expect(isModelType(Opt)).toBe(false)

  Inner = types.model("Inner", { a: types.string })
  // force the late type to evaluate its definition
  expect(Late.describe()).toBe("Inner")

  // the earlier reads must not have frozen the pre-resolution fold
  expect(isModelType(U)).toBe(true)
  expect(isModelType(Opt)).toBe(true)
})

test("a union with no late member still folds its flags correctly", () => {
  const U = types.union(types.string, types.model("M", {}))
  expect(isModelType(U)).toBe(true)
  // second read comes from the memo
  expect(isModelType(U)).toBe(true)
  expect(isModelType(types.union(types.string, types.number))).toBe(false)
})
