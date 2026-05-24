import * as path from "path"

const config = (outFile, format) => ({
  input: "./lib/index.js",
  output: {
    file: path.join("./dist", outFile),
    format: format,
    globals: {
      mobx: "mobx"
    },
    name: format === "umd" ? "mobxStateTree" : undefined
  },
  external: ["mobx"]
})

export default [
  config("mobx-state-tree.js", "cjs"),
  config("mobx-state-tree.umd.js", "umd"),
  config("mobx-state-tree.module.js", "es")
]
