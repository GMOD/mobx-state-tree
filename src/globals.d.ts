// Named keys rather than an index signature: the dot-access text
// `process.env.NODE_ENV` is what downstream bundlers substitute, so it must
// survive `noPropertyAccessFromIndexSignature`.
declare let process: {
  env: {
    NODE_ENV?: string | undefined
    ENABLE_TYPE_CHECK?: string | undefined
  }
}

declare function setImmediate(fn: (...args: any[]) => void): void
