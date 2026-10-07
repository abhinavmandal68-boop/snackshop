// Report backend waits without including customer, token, or payment data.
export function createServerTimer(res) {
  const timings = []
  return async (name, operation) => {
    const started = performance.now()
    try {
      return await operation()
    } finally {
      timings.push(`${name};dur=${(performance.now() - started).toFixed(1)}`)
      res.setHeader('Server-Timing', timings.join(', '))
    }
  }
}
