## [6.4.0](https://github.com/GMOD/mobx-state-tree/compare/v6.3.0...v6.4.0) (2026-08-22)

### Chores

- Delete the union overload generator, dead since the variadic signatures ([0591a1a](https://github.com/GMOD/mobx-state-tree/commit/0591a1a58e5cd200b0329c4c169973d434498057))

### Documentation

- Update stale mst-reflection note in CLAUDE.md ([b3daf01](https://github.com/GMOD/mobx-state-tree/commit/b3daf010bb4e6bad2fe688d55de16473774dec14))
- Scale caveat on ADR 0005 — 262 hydrated schemas is an upper bound ([9c2fccc](https://github.com/GMOD/mobx-state-tree/commit/9c2fccc065a021eb4bafd6d6cc1e9386dea3522f))

### Performance Improvements

- Hoist ModelType closure fields; stripDefault and union quick-match fast paths ([37a27ce](https://github.com/GMOD/mobx-state-tree/commit/37a27ce992a9e65d92b711129f1e92e6e2ec42bc))
- Intern no-options unions on their member-identity tuple ([f0c516f](https://github.com/GMOD/mobx-state-tree/commit/f0c516f410cea8a42f68f50b497d627ee0cc5e6b))

### Refactoring

- Dead-code and consistency sweep ([7c14475](https://github.com/GMOD/mobx-state-tree/commit/7c1447565f470dc440622ee01a7e2a2395b0b11d))
- Default BaseType.describe to the type name; drop nine equivalent overrides ([837350e](https://github.com/GMOD/mobx-state-tree/commit/837350e2ee9c38e80cf51ef288f5a09178eaad9a))

### Types

- Guard signatures, variadic union(), readonly validation results, stricter tsconfig ([43b086e](https://github.com/GMOD/mobx-state-tree/commit/43b086e1612a90e9264c99bfdc52710aab3fba38))
- Restore generic-member inference with a leading 2-arity overload ([4759372](https://github.com/GMOD/mobx-state-tree/commit/475937291d73861f05492f369c425cf4c8d59dd1))

## [6.3.0](https://github.com/GMOD/mobx-state-tree/compare/v6.2.0...v6.3.0) (2026-08-13)

### Bug Fixes

- Scope createActionTrackingMiddleware's running-action map per instance ([6f29930](https://github.com/GMOD/mobx-state-tree/commit/6f2993054c3b4dc11c3e3a770287f0f03eaf806e))
- Stop the isXType guards from narrowing their negative branch to never ([8313f79](https://github.com/GMOD/mobx-state-tree/commit/8313f795d7dd71e4b101f1225eb478ab120debf7))
- Drop the non-null assertion flow() immediately null-checks ([20f4114](https://github.com/GMOD/mobx-state-tree/commit/20f4114cebdb3f4f5828e0391b31be374d37d835))

### Chores

- Drop 26 type assertions the checker proves redundant, and lint for them ([ae202bb](https://github.com/GMOD/mobx-state-tree/commit/ae202bb889487fbd6125b945bc4fc2c6f568c63e))

### Documentation

- Record the jbrowse A/B, and fix two things in the procedure that bite ([414bda6](https://github.com/GMOD/mobx-state-tree/commit/414bda61a999ef4860d5efcf6d3055bec995dff1))

### Performance Improvements

- Put the constant `flags` on the prototype, not on every type object ([f6a4906](https://github.com/GMOD/mobx-state-tree/commit/f6a4906c4b7fbcddb875eff8e301a30329b5bc90))

### Refactoring

- Dedupe and de-clutter without touching the public surface ([2cd9579](https://github.com/GMOD/mobx-state-tree/commit/2cd95790367628fc960a3b300466c418b3041a72))

### Reverts

- Don't hoist `flags` to the prototype; keep the measurement ([a59898d](https://github.com/GMOD/mobx-state-tree/commit/a59898d3cb378ecbb67ef367b9d1e1d51cd2f3f0))

## [6.2.0](https://github.com/GMOD/mobx-state-tree/compare/v6.1.0...v6.2.0) (2026-08-13)

### Bug Fixes

- Dispose the snapshot reaction with its last onSnapshot listener ([65aeb85](https://github.com/GMOD/mobx-state-tree/commit/65aeb85cb6188a1215a5eba7863ddfd45ba65839))
- Kill the fallback node when the snapshot recovers ([e81a964](https://github.com/GMOD/mobx-state-tree/commit/e81a964c6fb4680b258deba66bd1b9952f04255c))
- Count float/finite as primitive types, and guard lazy's splice index ([f0212cc](https://github.com/GMOD/mobx-state-tree/commit/f0212ccb255c3f6ff6951dae410ca37e18ae8539))
- Echo the worktree path from the WorktreeCreate hook ([1e4ad0b](https://github.com/GMOD/mobx-state-tree/commit/1e4ad0beb96124897d321d367e5537fe05f59559))
- An empty name still falls through to the subtype's ([b326bf4](https://github.com/GMOD/mobx-state-tree/commit/b326bf401e1cb65dcac1aacb8c2845e32a7e3fde))

### Chores

- Set up new git worktrees automatically, and record the scroll fix ([becf8b4](https://github.com/GMOD/mobx-state-tree/commit/becf8b4cf7223a939ba3d4af641c3231f21b9cf4))

### Documentation

- Record how to work on this fork, and why reconcile looks the way it does ([b408c3a](https://github.com/GMOD/mobx-state-tree/commit/b408c3a0c62d27d30800c69bdd95915997527668))
- Record the mobx proxy-trap finding and the process.env benchmark trap ([1d113da](https://github.com/GMOD/mobx-state-tree/commit/1d113dac5d3cdb1bd96451d0e71625fb80e33278))
- Record where JBrowse's MST time actually goes ([6e66023](https://github.com/GMOD/mobx-state-tree/commit/6e660234261525f0c5fd4cb9b2b7aa41b563a914))
- Measure the value-churn path, which is where ADR 0002 actually lands ([982513e](https://github.com/GMOD/mobx-state-tree/commit/982513e4cfebcaf8668c49678e4a002672fe0a25))
- Census of what fires per frame during a real LGV scroll ([0d19e66](https://github.com/GMOD/mobx-state-tree/commit/0d19e6610af64ab29c12aefdbd314ac6376c770c))
- Record the type-construction work, and check in its harnesses ([6719977](https://github.com/GMOD/mobx-state-tree/commit/6719977d58c6eec9e2911364bd6c83419ed08c45))
- Record the second type-construction pass, and what it cost to learn ([a40084c](https://github.com/GMOD/mobx-state-tree/commit/a40084cbffa34d9986c954b3ddd1c77694e87c02))
- Correct ADR 0004's ABI claim — the check is `in`, not own keys ([68a5b8c](https://github.com/GMOD/mobx-state-tree/commit/68a5b8c2aefc13bb21d7ae93d6b385ac44f73a60))

### Performance Improvements

- Stop copying the whole array on a single-element write ([f001867](https://github.com/GMOD/mobx-state-tree/commit/f0018671f6b77e058b0f753ba90dd173b4c07f95))
- Cheap fast paths in isPlainObject, union member resolution, id cache ([2e4c046](https://github.com/GMOD/mobx-state-tree/commit/2e4c04621e508fb542daaf750bb63f962f16b590))
- Resolve the property observables once, not once per property ([e82f19a](https://github.com/GMOD/mobx-state-tree/commit/e82f19ab8fb2fed1e54736e3f351f314a3ce3d2c))
- Stop materializing five phantom fields on every type object ([7a3c5a9](https://github.com/GMOD/mobx-state-tree/commit/7a3c5a90adcdbffacaa18762244819119b4afc5e))
- Fold a composite type's name and flags on first read ([912444e](https://github.com/GMOD/mobx-state-tree/commit/912444e6dc8f36f5693ebbe679dfb8c4eb631e9f))
- Undo a slow unshift, and get isType off every type object ([ab4498e](https://github.com/GMOD/mobx-state-tree/commit/ab4498e31bde80f70af2c46c940f64f584421241))
- Keep a type's unset fields on the prototype, not on every type ([c294178](https://github.com/GMOD/mobx-state-tree/commit/c294178d9c4faa55dd4a82d25ed6033898c857ed))
- Hand the rest array straight to the Union ([597a6e0](https://github.com/GMOD/mobx-state-tree/commit/597a6e0c5357d761c21c7e6e7f1c7fc66a3ab9f5))

### Refactoring

- Drop dead parameters, a redundant flags override, and duplicated checks ([b13df37](https://github.com/GMOD/mobx-state-tree/commit/b13df37dd4f428a24fac1d9a7210c1a90425db76))

## [6.1.0](https://github.com/GMOD/mobx-state-tree/compare/v5.13.0...v6.1.0) (2026-08-04)

### Bug Fixes

- Drop the mobx internals removed in mobx 7 ([6a7ee02](https://github.com/GMOD/mobx-state-tree/commit/6a7ee024eab2554e59dd59309598a5dbc373cea8))
- Track applySnapshot's stale keys in a Set ([535764e](https://github.com/GMOD/mobx-state-tree/commit/535764e4e871a60e07c5aa4eee286d7b5dbd4c1d))

### Performance Improvements

- One mobx lookup per property in getSnapshot ([fe0adbf](https://github.com/GMOD/mobx-state-tree/commit/fe0adbf2d742d29addd17b25bdd7e558f1e8d7ea))
- Compare strip-default snapshots by walking, not stringifying ([524c2d6](https://github.com/GMOD/mobx-state-tree/commit/524c2d677e7e33795f2074c6e5b6bf57db1f8ca3))
- Stop allocating candidate arrays on every dispatch ([225b195](https://github.com/GMOD/mobx-state-tree/commit/225b195cfb8f09e26ee982ace6de740ea2bd7a48))
- Fast paths for unescapeJsonPath and EventHandler.emit ([9d1fe92](https://github.com/GMOD/mobx-state-tree/commit/9d1fe92b88affd53dc7c1b2e068d3f4c9f16b60d))

### Refactoring

- Drop dead statements and an unused abstract parameter ([c88f8a0](https://github.com/GMOD/mobx-state-tree/commit/c88f8a0ef003d4ee2c4eedd8a248512411fdc4c0))
- Give reconcileArrayChildren a start index, and type areSame ([35b45cf](https://github.com/GMOD/mobx-state-tree/commit/35b45cfb3595b0fe0703bbbabac2db249c8daa69))

## [5.13.0](https://github.com/GMOD/mobx-state-tree/compare/v5.12.0...v5.13.0) (2026-07-18)

### Features

- Export extendInstance for lazy runtime augmentation ([35b3f3e](https://github.com/GMOD/mobx-state-tree/commit/35b3f3e2ec5ea4075f7a4d176823619d3c539a1d))

### Performance Improvements

- Skip property reprocessing on no-new-prop chain steps ([382419f](https://github.com/GMOD/mobx-state-tree/commit/382419f360420a6f678abc1d646e9988f41b9a96))
- Memoize discriminated-member scan by type string ([e10cc61](https://github.com/GMOD/mobx-state-tree/commit/e10cc61c860ec065bb51a4fa6feda8e0a5b8b33f))
- Reuse derived state + convert only the prop delta on chain steps ([83e523e](https://github.com/GMOD/mobx-state-tree/commit/83e523ef7c4c65d747b7aa373a9c0556f7a137fc))
- Defer eager root snapshot serialization at instance creation ([743526b](https://github.com/GMOD/mobx-state-tree/commit/743526bd2162a1aa97d9bd1ad149f4d3cf436071))
- Read ENABLE_TYPE_CHECK env var once, not per check ([a367cc0](https://github.com/GMOD/mobx-state-tree/commit/a367cc06d029463c59441f40f7f447a2466cad6c))

## [5.12.0](https://github.com/GMOD/mobx-state-tree/compare/v5.11.2...v5.12.0) (2026-07-08)

### Other Changes

- Make keyed array reconciliation O(n) instead of O(n^2) (#13) ([c892379](https://github.com/GMOD/mobx-state-tree/commit/c892379eae39b2fa670139787ba012dc07f4a0e8))
- Clean up snapshot hot path, type casts, and a latent getMembers crash (#12) ([38920db](https://github.com/GMOD/mobx-state-tree/commit/38920dbbe2dd21b0f7fb940b83b8aefe6621d193))
- Remove validation result cache (#14) ([ff0b059](https://github.com/GMOD/mobx-state-tree/commit/ff0b059525d6079caea3d0fcb2ffc1c98d3c9158))
- Remove dead second loop in union determineType (#15) ([412b566](https://github.com/GMOD/mobx-state-tree/commit/412b5664cc1ca38d1ccf33cbf88b6bbd2cbf584b))
- Fix reentrant emit skipping handlers in EventHandler (#16) ([f39d990](https://github.com/GMOD/mobx-state-tree/commit/f39d990de67a5e54e505189f2214ff75b8b454ee))

## [5.11.2](https://github.com/GMOD/mobx-state-tree/compare/v5.11.1...v5.11.2) (2026-07-01)

### Documentation

- Document error message simplifications in README ([9327140](https://github.com/GMOD/mobx-state-tree/commit/9327140beab6ac358d52cccd57fdcf4e01a7ad70))

### Other Changes

- Format ([08fa62f](https://github.com/GMOD/mobx-state-tree/commit/08fa62f3ebbd28980165cd24baa795668ddfb735))
- Modernize tooling, strict types, and remove dead code (#11) ([6c85d4e](https://github.com/GMOD/mobx-state-tree/commit/6c85d4e4ab8ecf2f50dbc4ef1597cb22649e65c2))

## [5.11.1](https://github.com/GMOD/mobx-state-tree/compare/v5.11.0...v5.11.1) (2026-06-10)

### Other Changes

- Improve README: reorganize and add docs for resilient, stripDefault, reflection API ([42745c9](https://github.com/GMOD/mobx-state-tree/commit/42745c91a279bd6765cb586c8f06d70202640029))

### Performance Improvements

- Size short-circuit in defaultSnapshotEquals ([cca7803](https://github.com/GMOD/mobx-state-tree/commit/cca7803351447f58ce5fdb9c6acc671f3159188e))

## [5.11.0](https://github.com/GMOD/mobx-state-tree/compare/v5.10.8...v5.11.0) (2026-06-07)

### Other Changes

- Add types.stripDefault: optional that omits its key from snapshots when default ([1092278](https://github.com/GMOD/mobx-state-tree/commit/1092278f1ac317d50b435216ea49950302469873))

## [5.10.8](https://github.com/GMOD/mobx-state-tree/compare/v5.10.7...v5.10.8) (2026-06-03)

### Other Changes

- Various small refactorings to use better types, (#10) ([b99ad03](https://github.com/GMOD/mobx-state-tree/commit/b99ad03da130c0c57d979a415ca40134769e5045))

## [5.10.7](https://github.com/GMOD/mobx-state-tree/compare/v5.10.6...v5.10.7) (2026-06-03)

### Tests

- Guard snapshotProcessor preProcessor loose-return typing ([150cf91](https://github.com/GMOD/mobx-state-tree/commit/150cf91f8f11103380aa7cafd046e698398037c1))

### Types

- Loosen snapshotProcessor preProcessor return to CreationType | CustomC ([f921ee8](https://github.com/GMOD/mobx-state-tree/commit/f921ee8cdaf5f07d4d9974bf7c04104ec3dd0b63))

## [5.10.6](https://github.com/GMOD/mobx-state-tree/compare/v5.10.5...v5.10.6) (2026-06-02)

### Other Changes

- Type IMSTMap.forEach key as string (keys always normalize to string) ([32e6d85](https://github.com/GMOD/mobx-state-tree/commit/32e6d85f72b5ae58a7ec2dbe32ca3f8f82a9ec78))

## [5.10.5](https://github.com/GMOD/mobx-state-tree/compare/v5.10.4...v5.10.5) (2026-06-02)

### Other Changes

- Last-wins prop merge so overridden discriminants don't collapse to never ([c10543f](https://github.com/GMOD/mobx-state-tree/commit/c10543fe4f9044ffed3da1649e69529042600217))

## [5.10.4](https://github.com/GMOD/mobx-state-tree/compare/v5.10.3...v5.10.4) (2026-06-02)

### Other Changes

- Confine empty-model brand to creation type; stricter create(); runnable type tests ([22fad7a](https://github.com/GMOD/mobx-state-tree/commit/22fad7ae6cd0848f8a0798f5940f903ac74df1a6))

## [5.10.3](https://github.com/GMOD/mobx-state-tree/compare/v5.10.2...v5.10.3) (2026-06-01)

### Other Changes

- Small readme notes ([2f98be4](https://github.com/GMOD/mobx-state-tree/commit/2f98be4b16e8aebffc284c858d8be6d5990629d1))
- Preprocess type ([a09b58d](https://github.com/GMOD/mobx-state-tree/commit/a09b58da9affdf7c491ab444abfe7d56a06cc56a))

## [5.10.2](https://github.com/GMOD/mobx-state-tree/compare/v5.10.1...v5.10.2) (2026-05-29)

### Other Changes

- Format ([f30c5ee](https://github.com/GMOD/mobx-state-tree/commit/f30c5eee9a3f96b180d8111852e51ad705b09d40))
- Add getUnionSubtypes reflection helper and surface getDefaultInstanceOrSnapshot ([2e2f513](https://github.com/GMOD/mobx-state-tree/commit/2e2f51350e659af84c1ea9cc150996b4b44174e1))

## [5.10.1](https://github.com/GMOD/mobx-state-tree/compare/v5.10.0...v5.10.1) (2026-05-29)

### Other Changes

- Add reflection concepts used by jbrowse into public api ([705680d](https://github.com/GMOD/mobx-state-tree/commit/705680d99e31aa3ae447f9398521f1d8c4faa29c))

## [5.10.0](https://github.com/GMOD/mobx-state-tree/compare/v5.9.3...v5.10.0) (2026-05-29)

### Other Changes

- Scope discriminated-union validation errors to the matching member ([eebbad3](https://github.com/GMOD/mobx-state-tree/commit/eebbad37fe919f32402d5845daa7248f4a93e4bc))

## [5.9.3](https://github.com/GMOD/mobx-state-tree/compare/v5.9.2...v5.9.3) (2026-05-28)

### Other Changes

- Update README with tsgo unique-symbol fix notes ([59e1270](https://github.com/GMOD/mobx-state-tree/commit/59e1270390d3d1ec4f2373699c972ffe09d2ee52))
- Clean up README ([a394de3](https://github.com/GMOD/mobx-state-tree/commit/a394de39b6cbb481caa2ad0f2f6dd4d978ce24df))
- Clarify phantom property comment in IStateTreeNode ([c3bc00f](https://github.com/GMOD/mobx-state-tree/commit/c3bc00fc0c3ad48d6598ce542f9249d3f385556e))
- Add more error messaging when snapshot fails ([3b044c3](https://github.com/GMOD/mobx-state-tree/commit/3b044c3fc8262efd80dcbf23deb352ff1f4048e4))

## [5.9.2](https://github.com/GMOD/mobx-state-tree/compare/v5.9.1...v5.9.2) (2026-05-27)

### Other Changes

- Add type-level test for TypeOfValue on reference node instances ([8613279](https://github.com/GMOD/mobx-state-tree/commit/8613279a7c962dcb52b6dc9823e2a11b9d518eee))

## [5.9.1](https://github.com/GMOD/mobx-state-tree/compare/v5.9.0...v5.9.1) (2026-05-27)

### Other Changes

- Updates ([8a2985f](https://github.com/GMOD/mobx-state-tree/commit/8a2985f54a384249390f4238703ec8eb05beedd2))
- Replaced declare const $emptyObject: unique symbol + EmptyObject = { [$emptyObject]?: never } with export interface $EmptyObjectBrand { readonly $**mstEmpty**?: never }. This fixes TS4058 for tsgo (which has a bug handling exported unique symbol in .d.ts files) while still preventing the empty-model snapshot type from collapsing to {}. ([42d5b77](https://github.com/GMOD/mobx-state-tree/commit/42d5b77c72212fee7c02a99bc725aee784792ba1))
- Replace \$stateTreeNodeType unique symbol with string property + export \$EmptyObjectBrand ([7d74330](https://github.com/GMOD/mobx-state-tree/commit/7d7433048941bf7255eab1cb1f273fabb88507c6))

## [5.9.0](https://github.com/GMOD/mobx-state-tree/compare/v5.8.7...v5.9.0) (2026-05-27)

### Other Changes

- Remove public NonEmptyObject, keep internal EmptyObject brand for empty models ([5e5ae2a](https://github.com/GMOD/mobx-state-tree/commit/5e5ae2a23d13dab8740851c7dc60e10eaa187d0a))
- Replace bare Function type with callable signatures ([a5c013e](https://github.com/GMOD/mobx-state-tree/commit/a5c013e78bca1150e5938dfa48a57da39139b0fc))
- Remove dead tslint disable comments, stale TS3 TODO, enable no-unsafe-function-type ([4ea5001](https://github.com/GMOD/mobx-state-tree/commit/4ea50011b399e8a3ed31515bfdc3a089f63c7872))
- Drop ad-hoc as-any casts now that FunctionWithFlag types its brand fields ([2c09604](https://github.com/GMOD/mobx-state-tree/commit/2c09604e308bed0d7b3d9361237e5cb9e32c5183))
- Use discriminated-union narrowing in willChange/didChange instead of casts ([beb4025](https://github.com/GMOD/mobx-state-tree/commit/beb402589bef20c4b86a67a687c16dbe9271ce1e))
- Remove redundant this.flags assignment in CoreType constructor ([f1fc0ea](https://github.com/GMOD/mobx-state-tree/commit/f1fc0ea83827469477216b9f4fec9d9f93000eee))
- Tighten deepFreeze and trivial cast cleanups ([c20fcbb](https://github.com/GMOD/mobx-state-tree/commit/c20fcbbe6976e41a8a5d8e290b510434735991f9))
- Use 'in Hook' instead of (Hook as any)[k] for hook-name check ([b413207](https://github.com/GMOD/mobx-state-tree/commit/b4132074034e650967e4fbb5806c8fed5612dd6f))
- Remove concept of NonEmptyObject (#9) ([b424edc](https://github.com/GMOD/mobx-state-tree/commit/b424edca805aa8651b3c907d4556ee554f286f13))

## [5.8.7](https://github.com/GMOD/mobx-state-tree/compare/v5.8.6...v5.8.7) (2026-05-24)

### Other Changes

- Bump mobx-state-tree ([cab34ad](https://github.com/GMOD/mobx-state-tree/commit/cab34ad20121ee52f8134a72c1bfe63c998a9835))

## [5.8.6](https://github.com/GMOD/mobx-state-tree/compare/v5.8.5...v5.8.6) (2026-05-24)

### Other Changes

- M1 ([b803ed6](https://github.com/GMOD/mobx-state-tree/commit/b803ed6e3063b7e3a68e4f71faca15c6f15cbab5))

## [5.8.5](https://github.com/GMOD/mobx-state-tree/compare/v5.8.4...v5.8.5) (2026-05-24)

### Other Changes

- Updates ([b4b7f6e](https://github.com/GMOD/mobx-state-tree/commit/b4b7f6ea367d88efbdb65e4fcaf9d148781042c9))

## [5.8.3](https://github.com/GMOD/mobx-state-tree/compare/v5.8.2...v5.8.3) (2026-05-24)

### Other Changes

- Modernize rollup build: real bundling, sourcemaps, bundled .d.ts ([11a58b9](https://github.com/GMOD/mobx-state-tree/commit/11a58b900a6e8751c2575776136a3d6e3b0d77e5))

## [5.8.2](https://github.com/GMOD/mobx-state-tree/compare/v5.8.1...v5.8.2) (2026-05-24)

### Other Changes

- Restore trusted publishing workflow, switch all CI/scripts to pnpm ([64eb0ee](https://github.com/GMOD/mobx-state-tree/commit/64eb0ee1eb5216302f03ddba3bd66bb5e2a73bb8))

## [5.8.1](https://github.com/GMOD/mobx-state-tree/compare/v5.7.1...v5.8.1) (2026-05-24)

### Other Changes

- Circulars ([c5a3e6f](https://github.com/GMOD/mobx-state-tree/commit/c5a3e6fb91ab86f82a7644c613395d7673c43aa9))
- Revert to b1b9b4d8 build/source state, bump to 5.8.0 ([aec18ba](https://github.com/GMOD/mobx-state-tree/commit/aec18ba2f6b24ddc6f37ee8c397ff5c137354cf7))

## [5.7.1](https://github.com/GMOD/mobx-state-tree/compare/v5.7.0...v5.7.1) (2026-05-23)

### Other Changes

- CI ([df62e02](https://github.com/GMOD/mobx-state-tree/commit/df62e022a3226fa154d0b41c10b3bb6778ab069c))

## [5.7.0](https://github.com/GMOD/mobx-state-tree/compare/v5.6.10...v5.7.0) (2026-05-23)

### Other Changes

- Switch to tsc-only dual ESM/CJS build, fix webpack scope-hoisting TDZ ([2557e0f](https://github.com/GMOD/mobx-state-tree/commit/2557e0f28ae5506d43876314505012ed60199f1c))
- Clean up package.json to match bam-js conventions ([61e65c6](https://github.com/GMOD/mobx-state-tree/commit/61e65c604ba5ca46283c8c7a6ddeb6abb70bed42))

## [5.6.10](https://github.com/GMOD/mobx-state-tree/compare/v5.6.9...v5.6.10) (2026-05-23)

### Other Changes

- Add sourcemap ([ead14f5](https://github.com/GMOD/mobx-state-tree/commit/ead14f5ac8592f87696d824fb8a330629de5aef5))

## [5.6.9](https://github.com/GMOD/mobx-state-tree/compare/v5.6.8...v5.6.9) (2026-05-23)

### Other Changes

- Format ([ddbb0bc](https://github.com/GMOD/mobx-state-tree/commit/ddbb0bcc1b0a83fa1c5911f387cb3f0a5a5619bd))

## [5.6.7](https://github.com/GMOD/mobx-state-tree/compare/v5.6.6...v5.6.7) (2026-05-23)

### Other Changes

- Misc ([81b6d6a](https://github.com/GMOD/mobx-state-tree/commit/81b6d6aae9cec9722abb43ff48587feb0387b68f))

## [5.6.5](https://github.com/GMOD/mobx-state-tree/compare/v5.6.4...v5.6.5) (2026-05-22)

### Other Changes

- Bump node version ([bf32317](https://github.com/GMOD/mobx-state-tree/commit/bf3231745679b37b480fc3b4c3f7754a2071e825))

## [5.6.4](https://github.com/GMOD/mobx-state-tree/compare/v5.6.3...v5.6.4) (2026-05-22)

### Other Changes

- Normalize ([ac8bd45](https://github.com/GMOD/mobx-state-tree/commit/ac8bd45ef2023bffd1e69556a090ef0894ee76d8))

## [5.6.3](https://github.com/GMOD/mobx-state-tree/compare/v5.6.2...v5.6.3) (2026-05-22)

### Other Changes

- Update repo ([2166457](https://github.com/GMOD/mobx-state-tree/commit/2166457e5855fca2376beed66a9853d6ed1fd9ac))

## [5.6.2](https://github.com/GMOD/mobx-state-tree/compare/v5.6.1...v5.6.2) (2026-05-22)

### Other Changes

- Add trusted publishing ([2e61daf](https://github.com/GMOD/mobx-state-tree/commit/2e61daf5f810d6dc586fd99463ed970e3226c5d5))
- README note about publish ([26dc211](https://github.com/GMOD/mobx-state-tree/commit/26dc211fea70c8573975d40cbbb98b25f9b7db48))

## [5.6.1](https://github.com/GMOD/mobx-state-tree/compare/v5.6.0...v5.6.1) (2026-05-22)

### Other Changes

- Add types.resilient to readme ([011464a](https://github.com/GMOD/mobx-state-tree/commit/011464ac241e4333c3676029ae70e3b748f756eb))
- Get rid of insanely long error messages (#8) ([b1b9b4d](https://github.com/GMOD/mobx-state-tree/commit/b1b9b4d85dab8c07889ff5977a008171f7c3b934))
- No bundle ([8056d8a](https://github.com/GMOD/mobx-state-tree/commit/8056d8a02020570fd3d1a0be44d450283ce56934))
- Shorter errors ([0b3a1eb](https://github.com/GMOD/mobx-state-tree/commit/0b3a1eb5c596d4d9db72fcc83d136f66d2a4bd66))

## [5.6.0](https://github.com/GMOD/mobx-state-tree/compare/v5.5.0...v5.6.0) (2026-02-26)

### Other Changes

- Creates types.resilient to avoid total crashes when something in a types.array fails to initialize (#7) ([0015754](https://github.com/GMOD/mobx-state-tree/commit/0015754081b6626804b23e1d645640d5ef8e6294))

## Earlier releases

v5.5.0 and before are upstream mobx-state-tree, whose changelog lives at
https://github.com/mobxjs/mobx-state-tree/blob/master/CHANGELOG.md. This fork
starts at v5.6.0; its own tags are the sections above.
