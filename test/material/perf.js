import mdit from 'markdown-it'
import rendererInlineText from '../../index.js'
import { benchmark, formatBenchmark } from './perf-utils.js'

const ITERATIONS = Number(process.env.ITER || 30)
const REPEAT = Number(process.env.REPEAT || 200)

const baseParagraphs = [
  '文章中の★スターコメント★は処理されます。',
  '文章中の★スターコメント\\★は処理されます。',
  '前%%コメント%%後',
  '本文（図A.1）と (Fig. A-1) を参照します。',
  '本文で **図A.1** と *Fig. A-1* を参照します。',
  '漢字《かんじ》とHTML<span>★スターコメント★</span>。',
]

const sample = baseParagraphs.join('\n\n')
const payload = Array.from({ length: REPEAT }, () => sample).join('\n\n')

const cases = [
  {
    name: 'html:false',
    md: mdit().use(rendererInlineText, {
      ruby: true,
      figureReference: true,
      starComment: true,
      percentComment: true,
    }),
  },
  {
    name: 'html:true',
    md: mdit({ html: true }).use(rendererInlineText, {
      ruby: true,
      figureReference: true,
      starComment: true,
      percentComment: true,
    }),
  },
]

for (const { name, md } of cases) {
  const result = benchmark(md, payload, ITERATIONS)
  console.log(formatBenchmark(name, result))
}
