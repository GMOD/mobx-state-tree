// Every interface a public signature returns or accepts has to be exported:
// declaration emit can inline a type alias, but it has to name an interface,
// and a consumer that exports e.g. a `types.resilient(...)` value otherwise
// fails with TS4023. Checked by `pnpm test:types`.

import {
  types,
  type IHooks,
  type IHooksGetter,
  type IMSTArray,
  type IResilientType,
  type IValidationContext,
  type IValidationContextEntry,
  type IValidationError,
  type IValidationResult
} from "../../src/index.ts"

const M = types.model({ id: types.identifier })

const resilient: IResilientType<typeof M, typeof M> = types.resilient(
  M,
  M,
  () => ({ id: "fallback" })
)

const entry: IValidationContextEntry = { path: "", type: M }
const context: IValidationContext = [entry]
const result: IValidationResult = M.validate({ id: "a" }, context)
const firstError: IValidationError | undefined = result[0]

const hooks: IHooksGetter<IMSTArray<typeof M>> = (): IHooks => ({})
const Hooked = types.array(M).hooks(hooks)

console.log(resilient, firstError, Hooked)
