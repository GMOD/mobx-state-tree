import { describe, bench } from "vitest"
import { readFileSync } from "fs"
import { join } from "path"

// Import from both built branches
import * as mstBranch1 from "../../dist_branch1/mobx-state-tree.mjs"
import * as mstBranch2 from "../../dist_branch2/mobx-state-tree.mjs"

// Read branch names
const branch1Name = readFileSync(
  join(__dirname, "../../dist_branch1/.branch_name"),
  "utf-8"
).trim()
const branch2Name = readFileSync(
  join(__dirname, "../../dist_branch2/.branch_name"),
  "utf-8"
).trim()

// Helper to create test models for each branch
function createTestModels(mst: typeof mstBranch1) {
  const Item = mst.types.model("Item", {
    id: mst.types.identifier,
    name: mst.types.string,
    value: mst.types.number,
    tags: mst.types.array(mst.types.string)
  })

  const Container = mst.types.model("Container", {
    items: mst.types.array(Item)
  })

  // Union types for discriminated union testing
  const Dog = mst.types.model("Dog", {
    type: mst.types.literal("dog"),
    name: mst.types.string,
    breed: mst.types.string
  })

  const Cat = mst.types.model("Cat", {
    type: mst.types.literal("cat"),
    name: mst.types.string,
    indoor: mst.types.boolean
  })

  const Bird = mst.types.model("Bird", {
    type: mst.types.literal("bird"),
    name: mst.types.string,
    canFly: mst.types.boolean
  })

  const Animal = mst.types.union(Dog, Cat, Bird)

  const Zoo = mst.types.model("Zoo", {
    animals: mst.types.array(Animal)
  })

  // Deep nested model
  const Level3 = mst.types.model("Level3", {
    value: mst.types.string
  })

  const Level2 = mst.types.model("Level2", {
    children: mst.types.array(Level3)
  })

  const Level1 = mst.types.model("Level1", {
    children: mst.types.array(Level2)
  })

  const DeepTree = mst.types.model("DeepTree", {
    children: mst.types.array(Level1)
  })

  return {
    Item,
    Container,
    Dog,
    Cat,
    Bird,
    Animal,
    Zoo,
    DeepTree,
    Level1,
    Level2,
    Level3
  }
}

const models1 = createTestModels(mstBranch1)
const models2 = createTestModels(mstBranch2)

// Counter to generate unique snapshots (avoids caching)
let snapshotCounter = 0

// Generate large snapshot data - each call creates a unique snapshot to avoid caching
function generateLargeArraySnapshot(count: number) {
  const batch = snapshotCounter++
  return {
    items: Array.from({ length: count }, (_, i) => ({
      id: `item-${batch}-${i}`,
      name: `Item ${i}`,
      value: i * 10,
      tags: ["tag1", "tag2", "tag3"]
    }))
  }
}

function generateZooSnapshot(count: number) {
  const batch = snapshotCounter++
  const types = ["dog", "cat", "bird"] as const
  return {
    animals: Array.from({ length: count }, (_, i) => {
      const type = types[i % 3]
      if (type === "dog") {
        return { type: "dog", name: `Animal ${batch}-${i}`, breed: "labrador" }
      } else if (type === "cat") {
        return { type: "cat", name: `Animal ${batch}-${i}`, indoor: true }
      } else {
        return { type: "bird", name: `Animal ${batch}-${i}`, canFly: true }
      }
    })
  }
}

function generateDeepTreeSnapshot(width: number) {
  const batch = snapshotCounter++
  const level3 = Array.from({ length: width }, (_, i) => ({
    value: `leaf-${batch}-${i}`
  }))
  const level2 = Array.from({ length: width }, () => ({
    children: [...level3]
  }))
  const level1 = Array.from({ length: width }, () => ({
    children: [...level2]
  }))
  return { children: level1 }
}

const benchOpts = { warmupIterations: 3, iterations: 20 }

// ============================================
// Benchmark: Large Array Creation
// ============================================
describe("Large array creation (1000 items)", () => {
  bench(
    branch1Name,
    () => {
      const snapshot = generateLargeArraySnapshot(1000)
      models1.Container.create(snapshot)
    },
    benchOpts
  )

  bench(
    branch2Name,
    () => {
      const snapshot = generateLargeArraySnapshot(1000)
      models2.Container.create(snapshot)
    },
    benchOpts
  )
})

// ============================================
// Benchmark: Union Type Array (discriminated unions)
// ============================================
describe("Union type array creation (500 animals)", () => {
  bench(
    branch1Name,
    () => {
      const snapshot = generateZooSnapshot(500)
      models1.Zoo.create(snapshot)
    },
    benchOpts
  )

  bench(
    branch2Name,
    () => {
      const snapshot = generateZooSnapshot(500)
      models2.Zoo.create(snapshot)
    },
    benchOpts
  )
})

// ============================================
// Benchmark: Deep nested tree
// ============================================
describe("Deep nested tree creation (5x5x5 = 125 nodes)", () => {
  bench(
    branch1Name,
    () => {
      const snapshot = generateDeepTreeSnapshot(5)
      models1.DeepTree.create(snapshot)
    },
    benchOpts
  )

  bench(
    branch2Name,
    () => {
      const snapshot = generateDeepTreeSnapshot(5)
      models2.DeepTree.create(snapshot)
    },
    benchOpts
  )
})

// ============================================
// Benchmark: Apply snapshot to existing tree
// ============================================
describe("Apply snapshot to array (100 items)", () => {
  bench(
    branch1Name,
    () => {
      const initialSnapshot = generateLargeArraySnapshot(100)
      const updateSnapshot = generateLargeArraySnapshot(100)
      const store = models1.Container.create(initialSnapshot)
      mstBranch1.applySnapshot(store, updateSnapshot)
    },
    benchOpts
  )

  bench(
    branch2Name,
    () => {
      const initialSnapshot = generateLargeArraySnapshot(100)
      const updateSnapshot = generateLargeArraySnapshot(100)
      const store = models2.Container.create(initialSnapshot)
      mstBranch2.applySnapshot(store, updateSnapshot)
    },
    benchOpts
  )
})

// ============================================
// Benchmark: type.is() validation with unique snapshots
// ============================================
describe("type.is() validation (1000 items, unique snapshots)", () => {
  bench(
    branch1Name,
    () => {
      const snapshot = generateLargeArraySnapshot(1000)
      models1.Container.is(snapshot)
    },
    benchOpts
  )

  bench(
    branch2Name,
    () => {
      const snapshot = generateLargeArraySnapshot(1000)
      models2.Container.is(snapshot)
    },
    benchOpts
  )
})

// ============================================
// Benchmark: Union type.is() validation with unique snapshots
// ============================================
describe("Union type.is() validation (500 animals, unique)", () => {
  bench(
    branch1Name,
    () => {
      const snapshot = generateZooSnapshot(500)
      models1.Zoo.is(snapshot)
    },
    benchOpts
  )

  bench(
    branch2Name,
    () => {
      const snapshot = generateZooSnapshot(500)
      models2.Zoo.is(snapshot)
    },
    benchOpts
  )
})

// ============================================
// Benchmark: Very large deeply nested tree (10x10x10 = 1000 leaf nodes)
// ============================================
describe("Large nested tree creation (10x10x10 = 1000 leaves)", () => {
  bench(
    branch1Name,
    () => {
      const snapshot = generateDeepTreeSnapshot(10)
      models1.DeepTree.create(snapshot)
    },
    benchOpts
  )

  bench(
    branch2Name,
    () => {
      const snapshot = generateDeepTreeSnapshot(10)
      models2.DeepTree.create(snapshot)
    },
    benchOpts
  )
})

// ============================================
// Benchmark: Large union type array (1000 animals)
// ============================================
describe("Large union array creation (1000 animals)", () => {
  bench(
    branch1Name,
    () => {
      const snapshot = generateZooSnapshot(1000)
      models1.Zoo.create(snapshot)
    },
    benchOpts
  )

  bench(
    branch2Name,
    () => {
      const snapshot = generateZooSnapshot(1000)
      models2.Zoo.create(snapshot)
    },
    benchOpts
  )
})
