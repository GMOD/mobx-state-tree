# @jbrowse/mobx-state-tree

Fork of mobx-state-tree v5.4.2 for use in jbrowse

## Current list of changes

- updated typescript
- updated to import actual filepaths instead of node module resolution
- reduced rollup config
- removed process.env.NODE_ENV from code, instead exporting a setDevMode function
- converted tests to vitest
- remove unused dependencies
- updated tslint to eslint and typescript-eslint
- dual CJS/ESM build using main and module fields (pure ESM causes trouble when both are imported in vite)
- added `types.resilient` - wraps a type so that instantiation errors are caught
  and a fallback type is used instead of crashing the entire state tree. This is
  useful for arrays or maps that may contain unknown or invalid entries (e.g.
  plugin types that are not installed). It takes a primary type, a fallback type,
  and a `createFallbackSnapshot` callback that receives the error and original
  snapshot. Note: `isValidSnapshot` always returns success for resilient types,
  meaning any value is considered a valid snapshot. Validation is deferred to
  instantiation time, where failures are caught and routed to the fallback
- removed NonEmptyObject annotation (also at upstream in post v5 versions)
- replaced `unique symbol` phantom properties (`$emptyObject`, `$stateTreeNodeType`) with
  exported string-keyed brand interfaces (`$EmptyObjectBrand`, `$__mstStateTreeNodeType__`),
  fixing tsgo TS4058/TS4023 errors when MST types propagate into exported function return types
