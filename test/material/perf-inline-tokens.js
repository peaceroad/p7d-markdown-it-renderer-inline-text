import mdit from 'markdown-it'
import rendererInlineText from '../index.js'

const ITERATIONS = Number(process.env.ITER || 30)
const REPEAT = Number(process.env.REPEAT || 200)
const HEAVY_REPEAT = Number(process.env.REPEAT_HEAVY || Math.max(1, Math.floor(REPEAT / 2)))

const baseParagraphs = [
  '文章中の★スターコメント★は処理されます。',
  '文章中の★スターコメント\\★は処理されます。',
  '前%%コメント%%後',
  '漢字《かんじ》とHTML<span>★スターコメント★</span>。',
]

const sample = baseParagraphs.join('\n\n')
const payload = Array.from({ length: REPEAT }, () => sample).join('\n\n')

const heavyParagraphs = [
  '見出し風の長文と★スターコメント★、さらに%%パーセント%%と漢字《かんじ》を混ぜます。',
  '複数の★スター★が★連続★し、\\★エスケープや\\\\★も含みます。',
  'HTML <span class="note">★スターコメント★</span> と <em>漢字《かんじ》</em> の混在。',
  'コード風の `文字列\\★` と HTML <a href="#">リンク★コメント★</a>。',
  '<div>ブロック★コメント★内の漢字《かんじ》と%%コメント%%</div>',
]

const heavySample = heavyParagraphs.join('\n\n')
const heavyPayload = Array.from({ length: HEAVY_REPEAT }, () => heavySample).join('\n\n')

const buildMarkdown = (useHtml, plugin) => {
  const md = useHtml ? mdit({ html: true }) : mdit()
  return md.use(plugin, {
    ruby: true,
    starComment: true,
    percentComment: true,
  })
}

const cases = [
  {
    name: 'core html:false',
    md: buildMarkdown(false, rendererInlineText),
  },
  {
    name: 'core html:true',
    md: buildMarkdown(true, rendererInlineText),
  },
]

const benchmark = (md, payloadValue) => {
  md.render(payloadValue)
  const samples = []
  for (let i = 0; i < ITERATIONS; i++) {
    const start = process.hrtime.bigint()
    md.render(payloadValue)
    const end = process.hrtime.bigint()
    samples.push(Number(end - start) / 1e6)
  }
  const sum = samples.reduce((a, b) => a + b, 0)
  const avg = sum / samples.length
  const min = Math.min(...samples)
  const max = Math.max(...samples)
  return { avg, min, max, runs: samples.length }
}

const payloads = [
  { name: 'base', value: payload },
  { name: 'heavy', value: heavyPayload },
]

for (const payloadEntry of payloads) {
  console.log(`[${payloadEntry.name}]`)
  for (const { name, md } of cases) {
    const result = benchmark(md, payloadEntry.value)
    console.log(`${name}: avg=${result.avg.toFixed(2)}ms min=${result.min.toFixed(2)}ms max=${result.max.toFixed(2)}ms runs=${result.runs}`)
  }
}
