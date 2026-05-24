import path from "path"
import sourcemaps from "rollup-plugin-sourcemaps2"
import dts from "rollup-plugin-dts"

const bundle = (outFile, format) => ({
  input: "./lib/index.js",
  external: ["mobx"],
  plugins: [sourcemaps()],
  output: {
    file: path.join("./dist", outFile),
    format,
    sourcemap: true,
    globals: { mobx: "mobx" }
  }
})

const types = {
  input: "./lib/index.d.ts",
  external: ["mobx"],
  plugins: [dts()],
  output: {
    file: "./dist/index.d.ts",
    format: "es"
  }
}

export default [
  bundle("mobx-state-tree.cjs", "cjs"),
  bundle("mobx-state-tree.mjs", "es"),
  types
]
