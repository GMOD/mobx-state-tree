import { cpSync, statSync } from "node:fs"

cpSync("build", "dist", {
  recursive: true,
  filter: src => {
    try {
      if (statSync(src).isDirectory()) {
        return true
      }
    } catch {
      return false
    }
    return /\.d\.ts$/.test(src)
  }
})
