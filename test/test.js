import assert from 'assert'
import fs from 'fs'
import path from 'path'
import mdit from 'markdown-it'
import cjkBreaks from '@peaceroad/markdown-it-cjk-breaks-mod'
import strongJa from '@peaceroad/markdown-it-strong-ja'
import mdRendererInlineText from '../index.js'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const MARKDOWN_HEADER_REGEXP = /^\[Markdown\]\s*$/
const HTML_HEADER_REGEXP = /^\[HTML(?::([^\]]+))?\]\s*$/

const SUPPORTED_EXAMPLES = new Set([
  'cjkDefault',
  'cjkHalfEither',
  'cjkHalfEitherNormalize',
  'ruby',
  'starComment',
  'starCommentParagraph',
  'starCommentLine',
  'starCommentLineParagraph',
  'starCommentLineCjk',
  'starCommentHtml',
  'complex',
  'percentComment',
  'percentCommentOptions',
  'percentCommentParagraph',
  'percentCommentLine',
])

const toCamelCase = (value) => value.replace(/-([a-z])/g, (_, ch) => ch.toUpperCase())

const normalizeBlock = (value) => {
  if (value == null) return ''
  const stripped = String(value).replace(/(?:\r?\n)+$/g, '')
  return stripped ? stripped + '\n' : ''
}

const parseExampleContent = (content) => {
  const lines = content.split(/\r?\n/)
  const entries = []
  let current = null
  let section = null
  let label = 'default'

  const flush = () => {
    if (!current) return
    current.markdown = normalizeBlock(current.markdown)
    Object.keys(current.outputs).forEach((key) => {
      current.outputs[key] = normalizeBlock(current.outputs[key])
    })
    entries.push(current)
    current = null
    section = null
    label = 'default'
  }

  for (const rawLine of lines) {
    const trimmed = rawLine.trim()
    if (MARKDOWN_HEADER_REGEXP.test(trimmed)) {
      flush()
      current = { markdown: '', outputs: {}, labels: [] }
      section = 'markdown'
      continue
    }

    const htmlMatch = trimmed.match(HTML_HEADER_REGEXP)
    if (htmlMatch) {
      if (!current) {
        current = { markdown: '', outputs: {}, labels: [] }
      }
      section = 'html'
      label = (htmlMatch[1] || 'default').trim().toLowerCase()
      if (current.outputs[label] === undefined) {
        current.outputs[label] = ''
        current.labels.push(label)
      }
      continue
    }

    if (!current || !section) continue
    if (section === 'markdown') {
      current.markdown += rawLine + '\n'
    } else {
      current.outputs[label] += rawLine + '\n'
    }
  }

  flush()
  return entries
}

const createRenderers = () => {
  const md = mdit().use(mdRendererInlineText, {
    ruby: true,
    starComment: true,
    percentComment: true,
  })
  const mdWithHtml = mdit({ html: true }).use(mdRendererInlineText, {
    ruby: true,
    starComment: true,
    percentComment: true,
  })

  return {
    md,
    mdWithHtml,
    mdStarDelete: mdit().use(mdRendererInlineText, {
      ruby: true,
      starComment: true,
      percentComment: true,
      starCommentDelete: true,
    }),
    mdStarDeleteWithHtml: mdit({ html: true }).use(mdRendererInlineText, {
      ruby: true,
      starComment: true,
      percentComment: true,
      starCommentDelete: true,
    }),
    mdStarCommentParagraph: mdit().use(mdRendererInlineText, {
      starComment: true,
      percentComment: true,
      starCommentParagraph: true,
    }),
    mdStarCommentParagraphWithHtml: mdit({ html: true }).use(mdRendererInlineText, {
      starComment: true,
      percentComment: true,
      starCommentParagraph: true,
    }),
    mdStarCommentParagraphDelete: mdit().use(mdRendererInlineText, {
      starComment: true,
      percentComment: true,
      starCommentParagraph: true,
      starCommentDelete: true,
    }),
    mdStarCommentParagraphDeleteWithHtml: mdit({ html: true }).use(mdRendererInlineText, {
      starComment: true,
      percentComment: true,
      starCommentParagraph: true,
      starCommentDelete: true,
    }),
    mdStarCommentLine: mdit().use(mdRendererInlineText, {
      starComment: true,
      percentComment: true,
      starCommentLine: true,
    }),
    mdStarCommentLineWithHtml: mdit({ html: true }).use(mdRendererInlineText, {
      starComment: true,
      percentComment: true,
      starCommentLine: true,
    }),
    mdStarCommentLineCjk: mdit().use(mdRendererInlineText, {
      starComment: true,
      percentComment: true,
      starCommentLine: true,
    }).use(cjkBreaks, { either: true }),
    mdStarCommentLineParagraph: mdit().use(mdRendererInlineText, {
      starComment: true,
      percentComment: true,
      starCommentLine: true,
      starCommentParagraph: true,
    }),
    mdStarCommentLineParagraphWithHtml: mdit({ html: true }).use(mdRendererInlineText, {
      starComment: true,
      percentComment: true,
      starCommentLine: true,
      starCommentParagraph: true,
    }),
    mdStarCommentDeleteLineWithHtml: mdit({ html: true }).use(mdRendererInlineText, {
      starComment: true,
      percentComment: true,
      starCommentDelete: true,
      starCommentLine: true,
    }),
    mdStarCommentDeleteLineParagraphWithHtml: mdit({ html: true }).use(mdRendererInlineText, {
      starComment: true,
      percentComment: true,
      starCommentDelete: true,
      starCommentLine: true,
      starCommentParagraph: true,
    }),
    mdStarCommentHtmlInline: mdit({ html: true }).use(mdRendererInlineText, {
      ruby: true,
      starComment: true,
      percentComment: true,
    }),
    mdStarCommentDeleteHtmlInline: mdit({ html: true }).use(mdRendererInlineText, {
      ruby: true,
      starComment: true,
      percentComment: true,
      starCommentDelete: true,
    }),
    mdPercentOn: mdit().use(mdRendererInlineText, {
      starComment: true,
      percentComment: true,
    }),
    mdPercentOff: mdit().use(mdRendererInlineText, {
      starComment: true,
      percentComment: false,
    }),
    mdPercentDelete: mdit().use(mdRendererInlineText, {
      starComment: true,
      percentComment: true,
      percentCommentDelete: true,
    }),
    mdPercentCommentParagraph: mdit().use(mdRendererInlineText, {
      percentComment: true,
      percentCommentParagraph: true,
    }),
    mdPercentCommentParagraphDelete: mdit().use(mdRendererInlineText, {
      percentComment: true,
      percentCommentParagraph: true,
      percentCommentDelete: true,
    }),
    mdPercentCommentLine: mdit().use(mdRendererInlineText, {
      percentComment: true,
      percentCommentLine: true,
    }),
    mdPercentCommentDeleteLine: mdit().use(mdRendererInlineText, {
      percentComment: true,
      percentCommentLine: true,
      percentCommentDelete: true,
    }),
    mdCjkDefault: mdit().use(mdRendererInlineText, {
      ruby: true,
      starComment: true,
      percentComment: true,
    }).use(cjkBreaks),
    mdCjkHalfEither: mdit().use(mdRendererInlineText, {
      ruby: true,
      starComment: true,
      percentComment: true,
    }).use(cjkBreaks, {
      spaceAfterPunctuation: 'half',
      either: true,
    }),
    mdCjkHalfEitherNormalize: mdit().use(mdRendererInlineText, {
      ruby: true,
      starComment: true,
      percentComment: true,
    }).use(cjkBreaks, {
      spaceAfterPunctuation: 'half',
      normalizeSoftBreaks: true,
      either: true,
    }),
  }
}

const resolveFixtureRenderer = (example, label, renderers) => {
  switch (example) {
    case 'cjkDefault':
      return label === 'default' ? renderers.mdCjkDefault : null
    case 'cjkHalfEither':
      return label === 'default' ? renderers.mdCjkHalfEither : null
    case 'cjkHalfEitherNormalize':
      return label === 'default' ? renderers.mdCjkHalfEitherNormalize : null
    case 'ruby':
      if (label === 'default' || label === 'delete') return renderers.mdWithHtml
      if (label === 'false') return renderers.md
      return null
    case 'starComment':
      if (label === 'default') return renderers.mdWithHtml
      if (label === 'false') return renderers.md
      if (label === 'delete') return renderers.mdStarDeleteWithHtml
      if (label === 'deletefalse') return renderers.mdStarDelete
      return null
    case 'starCommentParagraph':
      if (label === 'default') return renderers.mdStarCommentParagraphWithHtml
      if (label === 'false') return renderers.mdStarCommentParagraph
      if (label === 'delete') return renderers.mdStarCommentParagraphDeleteWithHtml
      return null
    case 'starCommentLine':
      if (label === 'default') return renderers.mdStarCommentLineWithHtml
      if (label === 'delete') return renderers.mdStarCommentDeleteLineWithHtml
      return null
    case 'starCommentLineParagraph':
      if (label === 'default') return renderers.mdStarCommentLineParagraphWithHtml
      if (label === 'delete') return renderers.mdStarCommentDeleteLineParagraphWithHtml
      return null
    case 'starCommentLineCjk':
      return label === 'default' ? renderers.mdStarCommentLineCjk : null
    case 'starCommentHtml':
      if (label === 'default') return renderers.mdWithHtml
      if (label === 'html') return renderers.mdStarCommentHtmlInline
      if (label === 'delete') return renderers.mdStarCommentDeleteHtmlInline
      return null
    case 'complex':
      if (label === 'default') return renderers.md
      if (label === 'delete') return renderers.mdStarDelete
      return null
    case 'percentComment':
      if (label === 'default') return renderers.mdPercentOn
      if (label === 'delete') return renderers.mdPercentDelete
      return null
    case 'percentCommentOptions':
      if (label === 'default') return renderers.mdPercentOn
      if (label === 'disable') return renderers.mdPercentOff
      if (label === 'delete') return renderers.mdPercentDelete
      return null
    case 'percentCommentParagraph':
      if (label === 'default') return renderers.mdPercentCommentParagraph
      if (label === 'delete') return renderers.mdPercentCommentParagraphDelete
      return null
    case 'percentCommentLine':
      if (label === 'default') return renderers.mdPercentCommentLine
      if (label === 'delete') return renderers.mdPercentCommentDeleteLine
      return null
    default:
      return null
  }
}

const pushError = (errors, example, index, label, input, actual, expected) => {
  errors.push('[FAIL] ' + example + ' #' + index + ' [' + label + ']'
    + '\nInput: ' + input
    + '\nConvert: ' + actual
    + '\nCorrect: ' + expected)
}

const runFixtureCheck = (entries, example, renderers) => {
  const errors = []
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]
    if (!entry || !entry.markdown) continue
    const labels = entry.labels && entry.labels.length ? entry.labels : Object.keys(entry.outputs || {})
    for (const label of labels) {
      const expected = entry.outputs[label]
      if (expected === undefined) continue
      const renderer = resolveFixtureRenderer(example, label, renderers)
      if (!renderer) {
        pushError(errors, example, i + 1, 'unknown-label:' + label, entry.markdown, '(no renderer)', expected)
        continue
      }
      const actual = renderer.render(entry.markdown)
      if (actual !== expected) {
        pushError(errors, example, i + 1, label, entry.markdown, actual, expected)
      }
    }
  }
  return errors
}

const renderers = createRenderers()
let totalErrors = 0
const files = fs.readdirSync(__dirname).filter((f) => f.endsWith('.txt')).sort()
for (const file of files) {
  console.log('Testing file: ' + file + ' ------------------')
  const baseName = path.basename(file, '.txt')
  const exampleName = baseName.replace(/^example-/, '')
  const exampleType = toCamelCase(exampleName)
  if (!SUPPORTED_EXAMPLES.has(exampleType)) {
    continue
  }
  const content = fs.readFileSync(path.join(__dirname, file), 'utf8')
  const entries = parseExampleContent(content)
  const errors = runFixtureCheck(entries, exampleType, renderers)
  if (errors.length) {
    console.log('Check: ' + exampleType + ' (' + file + ') =======================')
    errors.forEach((err) => console.log(err))
  }
  totalErrors += errors.length
}
if (totalErrors > 0) {
  console.log(totalErrors + ' tests failed.')
  process.exit(1)
}

// html:false: inline ★/%% pairs are fixed before markdown inline parsing
{
  const md = mdit().use(mdRendererInlineText, {
    ruby: true,
    starComment: true,
    percentComment: true,
  })
  assert.strictEqual(
    md.render('**前★A**B★後'),
    '<p>**前<span class="star-comment">★A**B★</span>後</p>\n',
  )
  assert.strictEqual(
    md.render('**前%%A**B%%後'),
    '<p>**前<span class="percent-comment">%%A**B%%</span>後</p>\n',
  )
  assert.strictEqual(
    md.render('前★漢字《ない》★後 漢字《そと》'),
    '<p>前<span class="star-comment">★漢字《ない》★</span>後 <ruby>漢字<rp>《</rp><rt>そと</rt><rp>》</rp></ruby></p>\n',
  )
  assert.strictEqual(
    md.render('前★<b>x</b>★後'),
    '<p>前<span class="star-comment">★&lt;b&gt;x&lt;/b&gt;★</span>後</p>\n',
  )
  assert.strictEqual(md.render('\\★x★'), '<p>★x★</p>\n')
  assert.strictEqual(md.render('\\%%x%%'), '<p>%%x%%</p>\n')
}

// html:true: inline preparse is disabled, but text/html-node conversions still work
{
  const md = mdit({ html: true }).use(mdRendererInlineText, {
    ruby: true,
    starComment: true,
    percentComment: true,
  })
  assert.strictEqual(
    md.render('文章中の★スターコメント★は処理されます。'),
    '<p>文章中の<span class="star-comment">★スターコメント★</span>は処理されます。</p>\n',
  )
  assert.strictEqual(
    md.render('**前★A**B★後'),
    '<p>前<span class="star-comment">★AB★</span>後</p>\n',
  )
  assert.strictEqual(
    md.render('**前%%A**B%%後'),
    '<p>前<span class="percent-comment">%%AB%%</span>後</p>\n',
  )
  assert.strictEqual(
    md.render('前<span title="★x★ %%y%% 漢字《かんじ》">漢字《ほんぶん》</span>後'),
    '<p>前<span title="★x★ %%y%% 漢字《かんじ》"><ruby>漢字<rp>《</rp><rt>ほんぶん</rt><rp>》</rp></ruby></span>後</p>\n',
  )
  assert.strictEqual(
    md.render('<code>★★</code>'),
    '<p><code><span class="star-comment">★★</span></code></p>\n',
  )
  assert.strictEqual(
    md.render('★あああ<span>aaaa</span>あああ★'),
    '<p><span class="star-comment">★あああ<span>aaaa</span>あああ★</span></p>\n',
  )
  assert.strictEqual(
    md.render('★**aaa**★'),
    '<p><span class="star-comment">★<strong>aaa</strong>★</span></p>\n',
  )
  assert.strictEqual(
    md.render('<script>const s="★dev★ %%x%% 漢字《かんじ》";</script>'),
    '<script>const s="★dev★ %%x%% 漢字《かんじ》";</script>',
  )
  assert.strictEqual(
    md.render('<div><!-- broken > ★x★ <span>★ok★</span></div>'),
    '<div><!-- broken > ★x★ <span>★ok★</span></div>',
  )
  assert.strictEqual(
    md.render('<script>const s="★dev★";'),
    '<script>const s="★dev★";',
  )
  assert.strictEqual(
    md.render('★A%%B★C%%'),
    '<p><span class="star-comment">★A<span class="percent-comment">%%B★</span>C%%</span></p>\n',
  )
  assert.strictEqual(
    md.render('%%A★B%%C★'),
    '<p><span class="percent-comment">%%A<span class="star-comment">★B%%</span>C★</span></p>\n',
  )
}

// html:true with markdown-it-strong-ja: crossing markers should still normalize without crossed tags
{
  const mdStrongJaFirst = mdit({ html: true })
    .use(strongJa)
    .use(mdRendererInlineText, { starComment: true, percentComment: true })
  assert.strictEqual(
    mdStrongJaFirst.render('**前★A**B★後'),
    '<p>前<span class="star-comment">★AB★</span>後</p>\n',
  )
  assert.strictEqual(
    mdStrongJaFirst.render('★**重大変更**★'),
    '<p><span class="star-comment">★<strong>重大変更</strong>★</span></p>\n',
  )

  const mdStrongJaLast = mdit({ html: true })
    .use(mdRendererInlineText, { starComment: true, percentComment: true })
    .use(strongJa)
  assert.strictEqual(
    mdStrongJaLast.render('**前★A**B★後'),
    '<p>前<span class="star-comment">★AB★</span>後</p>\n',
  )
}

// delete options should stay independent between star and percent modes
{
  const mdPercentLineWithStarDelete = mdit().use(mdRendererInlineText, {
    starComment: true,
    starCommentDelete: true,
    percentComment: true,
    percentCommentLine: true,
  })
  assert.strictEqual(
    mdPercentLineWithStarDelete.render('%%行コメント\n通常'),
    '<p><span class="percent-comment">%%行コメント</span>\n通常</p>\n',
  )

  const mdStarLineWithPercentDelete = mdit().use(mdRendererInlineText, {
    starComment: true,
    starCommentLine: true,
    percentComment: true,
    percentCommentDelete: true,
  })
  assert.strictEqual(
    mdStarLineWithPercentDelete.render('★行コメント\n通常'),
    '<p><span class="star-comment">★行コメント</span>\n通常</p>\n',
  )
}

// paragraph mode can optionally attach comment class to the paragraph block itself
{
  const mdStarParagraphClass = mdit().use(mdRendererInlineText, {
    starComment: true,
    starCommentParagraph: true,
    starCommentParagraphClass: true,
  })
  assert.strictEqual(
    mdStarParagraphClass.render('★本日は売り切れ次第終了です。'),
    '<p class="star-comment">★本日は売り切れ次第終了です。</p>\n',
  )

  const mdStarParagraphClassCustom = mdit().use(mdRendererInlineText, {
    starComment: true,
    starCommentParagraph: true,
    starCommentParagraphClass: 'kitchen-note',
  })
  assert.strictEqual(
    mdStarParagraphClassCustom.render('★本日は売り切れ次第終了です。'),
    '<p class="kitchen-note">★本日は売り切れ次第終了です。</p>\n',
  )

  const mdPercentParagraphClass = mdit().use(mdRendererInlineText, {
    percentComment: true,
    percentCommentParagraph: true,
    percentCommentParagraphClass: true,
    percentClass: 'kitchen-note',
  })
  assert.strictEqual(
    mdPercentParagraphClass.render('%%Soup stock will be prepared from 7am.'),
    '<p class="kitchen-note">%%Soup stock will be prepared from 7am.</p>\n',
  )

  const mdPercentParagraphClassCustom = mdit().use(mdRendererInlineText, {
    percentComment: true,
    percentCommentParagraph: true,
    percentCommentParagraphClass: 'service-note',
    percentClass: 'kitchen-note',
  })
  assert.strictEqual(
    mdPercentParagraphClassCustom.render('%%Soup stock will be prepared from 7am.'),
    '<p class="service-note">%%Soup stock will be prepared from 7am.</p>\n',
  )
}

// percentClass must be escaped safely
{
  const md = mdit().use(mdRendererInlineText, {
    percentComment: true,
    percentClass: 'x" onclick="a&b',
  })
  assert.strictEqual(
    md.render('A&%%X%%B'),
    '<p>A&amp;<span class="x&quot; onclick=&quot;a&amp;b">%%X%%</span>B</p>\n',
  )
}

// option reconfiguration on the same markdown-it instance should work
{
  const mdReuse = mdit().use(mdRendererInlineText, {
    starComment: true,
    percentComment: true,
  })
  assert.strictEqual(mdReuse.render('前★星★後'), '<p>前<span class="star-comment">★星★</span>後</p>\n')

  mdReuse.use(mdRendererInlineText, {
    starComment: true,
    percentComment: true,
    starCommentDelete: true,
  })
  assert.strictEqual(mdReuse.render('前★星★後'), '<p>前後</p>\n')

  mdReuse.use(mdRendererInlineText, {
    starComment: false,
    percentComment: true,
  })
  assert.strictEqual(mdReuse.render('前★星★後'), '<p>前★星★後</p>\n')
  assert.strictEqual(mdReuse.render('前%%P%%後'), '<p>前<span class="percent-comment">%%P%%</span>後</p>\n')
}

// html:true should preserve star/percent option independence
{
  const mdStarOff = mdit({ html: true }).use(mdRendererInlineText, {
    starComment: false,
    percentComment: true,
  })
  assert.strictEqual(
    mdStarOff.render('前★星★後 %%P%%'),
    '<p>前★星★後 <span class="percent-comment">%%P%%</span></p>\n',
  )

  const mdPercentOff = mdit({ html: true }).use(mdRendererInlineText, {
    starComment: true,
    percentComment: false,
  })
  assert.strictEqual(
    mdPercentOff.render('前★星★後 %%P%%'),
    '<p>前<span class="star-comment">★星★</span>後 %%P%%</p>\n',
  )

  const mdStarDeletePercentOff = mdit({ html: true }).use(mdRendererInlineText, {
    starComment: true,
    starCommentDelete: true,
    percentComment: false,
  })
  assert.strictEqual(
    mdStarDeletePercentOff.render('前★星★後 %%P%%'),
    '<p>前後 %%P%%</p>\n',
  )
}

console.log('All tests passed.')
