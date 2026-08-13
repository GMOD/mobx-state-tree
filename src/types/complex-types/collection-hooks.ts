import {
  EMPTY_ARRAY,
  type IHooksGetter,
  addHiddenFinalProp,
  addHiddenWritableProp,
  createActionInvoker,
  devMode
} from "../../internal.ts"

/**
 * Shared backing for `types.array(...).hooks(fn)` / `types.map(...).hooks(fn)`:
 * both collection types keep a list of hook getters on the type and install the
 * returned lifecycle hooks as actions on each instance.
 *
 * @internal
 * @hidden
 */
export type HookInitializers<T> = ReadonlyArray<IHooksGetter<T>>

/**
 * Append `hooks` to a collection type's initializer list. `EMPTY_ARRAY` is the
 * shared default, so a type that never calls `.hooks()` allocates nothing.
 *
 * @internal
 * @hidden
 */
export function appendHookInitializer<T>(
  current: HookInitializers<T>,
  hooks: IHooksGetter<T>
): HookInitializers<T> {
  return current.length > 0 ? [...current, hooks] : [hooks]
}

/**
 * Install every hook the type's initializers produce onto `instance` as an MST
 * action, mirroring how a model's `.actions()` members are attached.
 *
 * @internal
 * @hidden
 */
export function installHookInitializers<T>(
  hookInitializers: HookInitializers<T>,
  instance: T
): void {
  const addProp = !devMode() ? addHiddenFinalProp : addHiddenWritableProp
  for (const initializer of hookInitializers) {
    const hooks = initializer(instance)
    for (const name of Object.keys(hooks)) {
      const hook = hooks[name as keyof typeof hooks]!
      addProp(instance, name, createActionInvoker(instance, name, hook))
    }
  }
}

/**
 * The empty initializer list every collection type starts with.
 *
 * @internal
 * @hidden
 */
export const NO_HOOK_INITIALIZERS = EMPTY_ARRAY as HookInitializers<any>
