const sharedOutput = {
  sourcemap: true,
  generatedCode: "es2015"
}

export default {
  input: "./build/index.js",
  external: id => !/^[./]/.test(id),
  onwarn(warning, defaultHandler) {
    if (warning.code === "CIRCULAR_DEPENDENCY") {
      console.error("CIRCULAR:", warning.message)
      return
    }
    defaultHandler(warning)
  },
  output: [
    {
      ...sharedOutput,
      file: "./dist/index.js",
      format: "es"
    },
    {
      ...sharedOutput,
      file: "./dist/index.cjs",
      format: "cjs",
      exports: "named",
      interop: "auto"
    }
  ]
}
