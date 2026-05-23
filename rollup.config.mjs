import * as path from "path"

const config = (outFile, format) => ({
  input: "./dist/index.js",
  output: {
    file: path.join("./dist", outFile),
    format,
    sourcemap: true
  },
  external: ["mobx"]
})

export default [
  config("mobx-state-tree.js", "cjs"),
  config("mobx-state-tree.module.js", "es")
]
