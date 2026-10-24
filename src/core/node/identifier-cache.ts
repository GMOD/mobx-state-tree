import { type IObservableArray, observable, values } from "mobx"

import {
  type AnyNode,
  type AnyObjectNode,
  type IAnyComplexType,
  ObjectNode,
  fail,
  mobxShallow
} from "../../internal.ts"

let identifierCacheId = 0

/**
 * @internal
 * @hidden
 */
export class IdentifierCache {
  private cacheId = identifierCacheId++

  // n.b. in cache all identifiers are normalized to strings
  private cache = observable.map<string, IObservableArray<AnyObjectNode>>()

  // last time the cache (array) for a given time changed
  // n.b. it is not really the time, but just an integer that gets increased after each modification to the array
  private lastCacheModificationPerId = observable.map<string, number>()

  private updateLastCacheModificationPerId(identifier: string) {
    const lcm = this.lastCacheModificationPerId.get(identifier)
    // we start at 1 since 0 means no update since cache creation
    this.lastCacheModificationPerId.set(
      identifier,
      lcm === undefined ? 1 : lcm + 1
    )
  }

  getLastCacheModificationPerId(identifier: string): string {
    const modificationId = this.lastCacheModificationPerId.get(identifier) || 0
    return `${this.cacheId}-${modificationId}`
  }

  addNodeToCache(node: AnyObjectNode, lastCacheUpdate = true): void {
    if (node.identifierAttribute) {
      const identifier = node.identifier!
      // one observable-map read, not a has() plus a get(): this runs for every
      // identified node created
      let set = this.cache.get(identifier)
      if (!set) {
        set = observable.array<AnyObjectNode>([], mobxShallow)
        this.cache.set(identifier, set)
      }
      if (set.includes(node)) {
        throw fail(`Already registered`)
      }
      set.push(node)
      if (lastCacheUpdate) {
        this.updateLastCacheModificationPerId(identifier)
      }
    }
  }

  mergeCache(node: AnyObjectNode) {
    values(node.identifierCache!.cache).forEach(nodes =>
      nodes.forEach(child => {
        this.addNodeToCache(child)
      })
    )
  }

  notifyDied(node: AnyObjectNode) {
    if (node.identifierAttribute) {
      const id = node.identifier!
      const set = this.cache.get(id)
      if (set) {
        set.remove(node)
        // remove empty sets from cache
        if (!set.length) {
          this.cache.delete(id)
        }
        this.updateLastCacheModificationPerId(id)
      }
    }
  }

  splitCache(splitNode: AnyObjectNode): IdentifierCache {
    const newCache = new IdentifierCache()
    if (this.cache.size === 0) {
      return newCache
    }
    const moveSubtree = (node: AnyNode) => {
      if (!(node instanceof ObjectNode)) {
        return
      }
      if (
        node.identifierAttribute &&
        this.cache.get(node.identifier!)?.includes(node)
      ) {
        this.notifyDied(node)
        newCache.addNodeToCache(node, false)
      }
      node.getChildren().forEach(moveSubtree)
    }
    moveSubtree(splitNode)
    return newCache
  }

  has(type: IAnyComplexType, identifier: string): boolean {
    const set = this.cache.get(identifier)
    if (!set) {
      return false
    }
    return set.some(candidate => type.isAssignableFrom(candidate.type))
  }

  resolve<IT extends IAnyComplexType>(
    type: IT,
    identifier: string
  ): ObjectNode<
    IT["CreationType"],
    IT["SnapshotType"],
    IT["TypeWithoutSTN"]
  > | null {
    const set = this.cache.get(identifier)
    if (!set) {
      return null
    }
    const matches = set.filter(candidate =>
      type.isAssignableFrom(candidate.type)
    )
    switch (matches.length) {
      case 0:
        return null
      case 1:
        return matches[0]!
      default:
        throw fail(
          `Cannot resolve a reference to type '${
            type.name
          }' with id: '${identifier}' unambigously, there are multiple candidates: ${matches
            .map(n => n.path)
            .join(", ")}`
        )
    }
  }
}
