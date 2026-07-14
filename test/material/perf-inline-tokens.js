import mdit from 'markdown-it'
import rendererInlineText from '../../index.js'
import { benchmark, formatBenchmark } from './perf-utils.js'

const ITERATIONS = Number(process.env.ITER || 30)
const REPEAT = Number(process.env.REPEAT || 200)
const HEAVY_REPEAT = Number(process.env.REPEAT_HEAVY || Math.max(1, Math.floor(REPEAT / 2)))

const baseParagraphs = [
  '文章中の★スターコメント★は処理されます。',
  '文章中の★スターコメント\\★は処理されます。',
  '前%%コメント%%後',
  '本文（図A.1）と (Figure.A-1) を参照します。',
  '本文で **図A.1** と *Figure.A-1* を参照します。',
  '漢字《かんじ》とHTML<span>★スターコメント★</span>。',
]

const sample = baseParagraphs.join('\n\n')
const payload = Array.from({ length: REPEAT }, () => sample).join('\n\n')

const heavyParagraphs = [
  '見出し風の長文と★スターコメント★、さらに%%パーセント%%と漢字《かんじ》を混ぜます。',
  '図番号（図Ａ-１）と (Figure.A-1)、対象外の（figure 3）を混ぜます。',
  '明示した **図Ａ-１** と *Figure.A-1*、通常の **重要** を混ぜます。',
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
    figureReference: true,
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

const payloads = [
  { name: 'base', value: payload },
  { name: 'heavy', value: heavyPayload },
]

for (const payloadEntry of payloads) {
  console.log(`[${payloadEntry.name}]`)
  for (const { name, md } of cases) {
    const result = benchmark(md, payloadEntry.value, ITERATIONS)
    console.log(formatBenchmark(name, result))
  }
}
