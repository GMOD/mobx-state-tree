/**
 * Start a timer which return a function, which when called show the
 * number of milliseconds since it started.
 *
 * Passing true will give the current lap time.
 *
 * Example:
 * ```ts
 * const time = start()
 * // 1 second later
 * time() // 1.00
 * // 1 more second later
 * time() // 2.00
 * time(true) // 1.00
 * ```
 */
export const start = () => {
  const started = performance.now()
  let lastLap = started
  return (lapTime = false) => {
    const now = performance.now()
    const from = lapTime ? lastLap : started
    lastLap = now
    return Math.round(now - from)
  }
}
