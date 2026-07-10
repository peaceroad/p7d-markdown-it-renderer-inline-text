export const benchmark = (md, payload, iterations) => {
  // Warm up parsing, transformation, and renderer JIT paths.
  md.render(payload)
  const runCount = Math.max(1, Math.trunc(Number(iterations) || 1))
  const samples = new Array(runCount)
  for (let i = 0; i < runCount; i++) {
    const start = process.hrtime.bigint()
    md.render(payload)
    samples[i] = Number(process.hrtime.bigint() - start) / 1e6
  }

  samples.sort((a, b) => a - b)
  const sum = samples.reduce((a, b) => a + b, 0)
  const midpoint = samples.length >> 1
  const median = samples.length & 1
    ? samples[midpoint]
    : (samples[midpoint - 1] + samples[midpoint]) / 2
  const p95 = samples[Math.ceil(samples.length * 0.95) - 1]
  return {
    avg: sum / samples.length,
    median,
    p95,
    min: samples[0],
    max: samples[samples.length - 1],
    runs: samples.length,
  }
}

export const formatBenchmark = (name, result) => {
  return `${name}: median=${result.median.toFixed(2)}ms p95=${result.p95.toFixed(2)}ms avg=${result.avg.toFixed(2)}ms min=${result.min.toFixed(2)}ms max=${result.max.toFixed(2)}ms runs=${result.runs}`
}
