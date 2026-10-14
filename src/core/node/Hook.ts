/**
 * @hidden
 */
export enum Hook {
  afterCreate = "afterCreate",
  afterAttach = "afterAttach",
  afterCreationFinalization = "afterCreationFinalization",
  beforeDetach = "beforeDetach",
  beforeDestroy = "beforeDestroy"
}

/**
 * @internal
 * @hidden
 * An own-key test: `name in Hook` also holds for `Object.prototype` members
 * such as `toString` and `constructor`.
 */
export function isHookName(name: string): name is Hook {
  return Object.prototype.hasOwnProperty.call(Hook, name)
}

export interface IHooks {
  [Hook.afterCreate]?: () => void
  [Hook.afterAttach]?: () => void
  [Hook.beforeDetach]?: () => void
  [Hook.beforeDestroy]?: () => void
}

export type IHooksGetter<T> = (self: T) => IHooks
