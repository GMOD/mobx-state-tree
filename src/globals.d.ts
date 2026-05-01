declare let process: {
  env: Record<string, string | undefined>
}

declare function setImmediate(fn: (...args: any[]) => void): void
