import mdit from 'markdown-it'
import rendererInlineText from '../../index.js'

const ITERATIONS = Number(process.env.ITER || 30)
const REPEAT = Number(process.env.REPEAT || 200)

const baseParagraphs = [
  '文章中の★スターコメント★は処理されます。',
  '文章中の★スターコメント\\★は処理されます。',
  '前%%コメント%%後',
  '漢字《かんじ》とHTML<span>★スターコメント★</span>。',
]

const sample = baseParagraphs.join('\n\n')
const payload = Array.from({ length: REPEAT }, () => sample).join('\n\n')

const cases = [
  {
    name: 'html:false',
    md: mdit().use(rendererInlineText, {
      ruby: true,
      starComment: true,
      percentComment: true,
    }),
  },
  {
    name: 'html:true',
    md: mdit({ html: true }).use(rendererInlineText, {
      ruby: true,
      starComment: true,
      percentComment: true,
    }),
  },
]

const benchmark = (md) => {
  // warm up
  md.render(payload)
  const samples = []
  for (let i = 0; i < ITERATIONS; i++) {
    const start = process.hrtime.bigint()
    md.render(payload)
    const end = process.hrtime.bigint()
    samples.push(Number(end - start) / 1e6)
  }
  const sum = samples.reduce((a, b) => a + b, 0)
  const avg = sum / samples.length
  const min = Math.min(...samples)
  const max = Math.max(...samples)
  return { avg, min, max, runs: samples.length }
}

for (const { name, md } of cases) {
  const result = benchmark(md)
  console.log(`${name}: avg=${result.avg.toFixed(2)}ms min=${result.min.toFixed(2)}ms max=${result.max.toFixed(2)}ms runs=${result.runs}`)
}
