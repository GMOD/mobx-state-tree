# Testing a build against JBrowse

`~/src/jbrowse-components` (`$JB` below) installs the published fork from the
pnpm store. It is not linked to this checkout, so a change here reaches it only
through one of the routes below.

## Jest: map the module, leave the store alone

Other sessions on this machine run jbrowse jest too, and anything written into
`$JB/node_modules` is visible to all of them. For jest, write a wrapper config
that imports `$JB/jest.config.js`, sets `rootDir: $JB`, and gives each of its
`projects` a `moduleNameMapper`:

- `^@jbrowse/mobx-state-tree$` to this build's `dist/mobx-state-tree.cjs`
- `^mobx$` to `$JB/node_modules/mobx/dist/index.js`. Without it the build's own
  `require("mobx")` resolves from this checkout, and jbrowse runs against two
  mobx copies.

Run it once with a bogus build path first; it must fail with
`Could not locate module`, which proves the mapping took.

Invoke jest as `node $JB/node_modules/jest/bin/jest.js` rather than through
`pnpm test`, whose pre-run dependency check can reinstall `node_modules`
mid-run. `$JB/node_modules/.bin/jest` is a shell wrapper, so `node` cannot run
it. Scoping and project names are in jbrowse's
`agent-docs/reference/TEST_INFRASTRUCTURE.md`. Jest writes to stderr, so
capture with `> file 2>&1`.

Pre-existing and flaky failures in jbrowse are normal. Run the mapped side
first; an all-pass result cannot hide a pre-existing failure, so a baseline run
is needed only when something goes red.

## tsc: swap the dist, briefly

Jest transforms with babel and never typechecks, so a `.d.ts` change needs
`tsc`, which has no module mapper. Swap the package's `dist` for the shortest
window you can:

- `PKG=$JB/node_modules/.pnpm/@jbrowse+mobx-state-tree@<ver>_mobx@<ver>/node_modules/@jbrowse/mobx-state-tree`
- Check that `$PKG/dist` is byte-identical to a build of this repo at the
  released tag, which is what makes the swap a true A/B.
- `mv "$PKG/dist" "$PKG/dist.orig"`, then copy the build into a fresh
  `$PKG/dist`. The files under `$PKG` are hardlinked into pnpm's
  content-addressable store (`stat -c %h` reads 7+), so writing through them
  corrupts the store for every project sharing the inode; moving the directory
  leaves the originals on their own inodes.
- Restore from a bash `trap restore EXIT INT TERM`, so a failure cannot leave
  another session's checkout on a private build.

## Checking the public surface

Diff the runtime export list
(`Object.keys(require('dist/mobx-state-tree.cjs'))`) and the `index.d.ts`
declaration surface between the old and new builds. `ComplexType`, `BaseType`
and `IdentifierCache` appear in the bundled `.d.ts` but are not exported, so
their signatures are not part of the plugin-facing contract.

To compare types across two builds in one tsc program, give each copy its own
`package.json` name. TypeScript dedupes packages that share a name@version, so
with two copies of `@jbrowse/mobx-state-tree@6.5.2` the new side resolves to
the old declarations and every equivalence check passes. Add an assertion that
has to fail, as a negative control.

jbrowse's own ABI check (`packages/core/src/ReExports/abiPreviousRelease.json`,
`publishedPluginReads.json`) pins only public MST names, so moving or deleting
a type object's field fails no jbrowse test, although third-party code could
still read it.
