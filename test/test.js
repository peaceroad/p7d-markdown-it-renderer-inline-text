import assert from 'assert'
import fs from 'fs'
import path from 'path'
import mdit from 'markdown-it'
import cjkBreaks from '@peaceroad/markdown-it-cjk-breaks-mod'
import mdRendererInlineText from '../index.js'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const MARKDOWN_HEADER = /^\[Markdown\]\s*$/
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

const toCamelCase = (value) => {
  return value.replace(/-([a-z])/g, (_, ch) => ch.toUpperCase())
}

const parseExampleContent = (content) => {
  const lines = content.split(/\r?\n/)
  const entries = []
  let current = null
  let section = null
  let currentLabel = 'default'

  const flush = () => {
    if (current) {
      entries.push(current)
      current = null
      section = null
      currentLabel = 'default'
    }
  }

  for (const rawLine of lines) {
    const trimmed = rawLine.trim()
    if (MARKDOWN_HEADER.test(trimmed)) {
      flush()
      current = { markdown: '', outputs: {} }
      section = 'markdown'
      continue
    }
    const htmlMatch = trimmed.match(/^\[HTML(?::([^\]]+))?\]\s*$/)
    if (htmlMatch) {
      section = 'html'
      currentLabel = (htmlMatch[1] || 'default').trim().toLowerCase()
      if (current && current.outputs[currentLabel] === undefined) {
        current.outputs[currentLabel] = ''
      }
      continue
    }
    if (!current) {
      continue
    }
    if (section === 'markdown') {
      current.markdown += rawLine + '\n'
    } else if (section === 'html' && currentLabel) {
      current.outputs[currentLabel] += rawLine + '\n'
    }
  }
  flush()

  const ms = [null]
  const normalize = (value) => {
    if (!value) return ''
    const stripped = value.replace(/(?:\r?\n)+$/g, '')
    return stripped ? stripped + '\n' : ''
  }
  entries.forEach((entry, idx) => {
    const normalizedOutputs = {}
    Object.keys(entry.outputs || {}).forEach((key) => {
      normalizedOutputs[key] = normalize(entry.outputs[key])
    })
    ms[idx + 1] = {
      markdown: normalize(entry.markdown),
      html: normalizedOutputs.default,
      htmlStarCommentDelete: normalizedOutputs.delete,
      htmlStarCommentHtml: normalizedOutputs.html,
      outputs: normalizedOutputs,
    }
  })
  return ms
}

const pushError = (errors, example, index, label, input, actual, expected) => {
  errors.push('[FAIL] ' + example + ' #' + index + ' ' + label
    + '\nInput: ' + input
    + '\nConvert: ' + actual
    + '\nCorrect: ' + expected)
}

const compareOutput = (errors, example, index, label, input, actual, expected) => {
  if (expected === undefined) return
  try {
    assert.strictEqual(actual, expected)
  } catch (err) {
    pushError(errors, example, index, label, input, actual, expected)
  }
}

const check = (ms, example) => {
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
  const mdStarCommentDelete = mdit().use(mdRendererInlineText, {
    ruby: true,
    starComment: true,
    percentComment: true,
    starCommentDelete: true,
  })
  const mdStarCommentDeleteWithHtml = mdit({ html: true }).use(mdRendererInlineText, {
    ruby: true,
    starComment: true,
    percentComment: true,
    starCommentDelete: true,
  })
  const mdStarCommentParagraph = mdit().use(mdRendererInlineText, {
    starComment: true,
    percentComment: true,
    starCommentParagraph: true,
  })
  const mdStarCommentParagraphWithHtml = mdit({ html: true }).use(mdRendererInlineText, {
    starComment: true,
    percentComment: true,
    starCommentParagraph: true,
  })
  const mdStarCommentParagraphDelete = mdit().use(mdRendererInlineText, {
    starComment: true,
    percentComment: true,
    starCommentParagraph: true,
    starCommentDelete: true,
  })
  const mdStarCommentParagraphDeleteWithHtml = mdit({ html: true }).use(mdRendererInlineText, {
    starComment: true,
    percentComment: true,
    starCommentParagraph: true,
    starCommentDelete: true,
  })
  const mdStarCommentLine = mdit().use(mdRendererInlineText, {
    starComment: true,
    percentComment: true,
    starCommentLine: true,
  })
  const mdStarCommentLineWithHtml = mdit({ html: true }).use(mdRendererInlineText, {
    starComment: true,
    percentComment: true,
    starCommentLine: true,
  })
  const mdStarCommentLineCjk = mdit().use(mdRendererInlineText, {
    starComment: true,
    percentComment: true,
    starCommentLine: true,
  }).use(cjkBreaks, {
    either: true,
  })
  const mdStarCommentLineParagraph = mdit().use(mdRendererInlineText, {
    starComment: true,
    percentComment: true,
    starCommentLine: true,
    starCommentParagraph: true,
  })
  const mdStarCommentLineParagraphWithHtml = mdit({ html: true }).use(mdRendererInlineText, {
    starComment: true,
    percentComment: true,
    starCommentLine: true,
    starCommentParagraph: true,
  })
  const mdStarCommentDeleteLine = mdit().use(mdRendererInlineText, {
    starComment: true,
    percentComment: true,
    starCommentDelete: true,
    starCommentLine: true,
  })
  const mdStarCommentDeleteLineWithHtml = mdit({ html: true }).use(mdRendererInlineText, {
    starComment: true,
    percentComment: true,
    starCommentDelete: true,
    starCommentLine: true,
  })
  const mdStarCommentDeleteLineParagraph = mdit().use(mdRendererInlineText, {
    starComment: true,
    percentComment: true,
    starCommentDelete: true,
    starCommentLine: true,
    starCommentParagraph: true,
  })
  const mdStarCommentDeleteLineParagraphWithHtml = mdit({ html: true }).use(mdRendererInlineText, {
    starComment: true,
    percentComment: true,
    starCommentDelete: true,
    starCommentLine: true,
    starCommentParagraph: true,
  })
  const mdStarCommentHtmlInline = mdit({ html: true }).use(mdRendererInlineText, {
    ruby: true,
    starComment: true,
    percentComment: true,
  })
  const mdStarCommentDeleteHtmlInline = mdit({ html: true }).use(mdRendererInlineText, {
    ruby: true,
    starComment: true,
    percentComment: true,
    starCommentDelete: true,
  })
  const mdPercentCommentParagraph = mdit().use(mdRendererInlineText, {
    percentComment: true,
    percentCommentParagraph: true,
  })
  const mdPercentCommentParagraphWithHtml = mdit({ html: true }).use(mdRendererInlineText, {
    percentComment: true,
    percentCommentParagraph: true,
  })
  const mdPercentCommentParagraphDelete = mdit().use(mdRendererInlineText, {
    percentComment: true,
    percentCommentParagraph: true,
    percentCommentDelete: true,
  })
  const mdPercentCommentParagraphDeleteWithHtml = mdit({ html: true }).use(mdRendererInlineText, {
    percentComment: true,
    percentCommentParagraph: true,
    percentCommentDelete: true,
  })
  const mdPercentCommentLine = mdit().use(mdRendererInlineText, {
    percentComment: true,
    percentCommentLine: true,
  })
  const mdPercentCommentLineWithHtml = mdit({ html: true }).use(mdRendererInlineText, {
    percentComment: true,
    percentCommentLine: true,
  })
  const mdPercentCommentDeleteLine = mdit().use(mdRendererInlineText, {
    percentComment: true,
    percentCommentLine: true,
    percentCommentDelete: true,
  })
  const mdPercentCommentDeleteLineWithHtml = mdit({ html: true }).use(mdRendererInlineText, {
    percentComment: true,
    percentCommentLine: true,
    percentCommentDelete: true,
  })
  const mdCjkDefault = mdit().use(mdRendererInlineText, {
    ruby: true,
    starComment: true,
    percentComment: true,
  }).use(cjkBreaks)
  const mdCjkHalfEither = mdit().use(mdRendererInlineText, {
    ruby: true,
    starComment: true,
    percentComment: true,
  }).use(cjkBreaks, {
    spaceAfterPunctuation: 'half',
    either: true,
  })
  const mdCjkHalfEitherNormalize = mdit().use(mdRendererInlineText, {
    ruby: true,
    starComment: true,
    percentComment: true,
  }).use(cjkBreaks, {
    spaceAfterPunctuation: 'half',
    normalizeSoftBreaks: true,
    either: true,
  })

  const errors = []
  for (let n = 1; n < ms.length; n++) {
    const entry = ms[n]
    if (!entry || entry.markdown === undefined) continue
    const markdown = entry.markdown
    const outputs = entry.outputs || {}
    const expected = (key, fallback) => {
      if (outputs[key] !== undefined) return outputs[key]
      return fallback
    }

    if (example === 'percentCommentOptions') {
      const mdOn = mdit().use(mdRendererInlineText, {
        starComment: true,
        percentComment: true,
      })
      const mdOff = mdit().use(mdRendererInlineText, {
        starComment: true,
        percentComment: false,
      })
      const mdDelete = mdit().use(mdRendererInlineText, {
        starComment: true,
        percentComment: true,
        percentCommentDelete: true,
      })
      compareOutput(errors, example, n, '[percentComment:true]', markdown, mdOn.render(markdown), outputs.default)
      compareOutput(errors, example, n, '[percentComment:false]', markdown, mdOff.render(markdown), outputs.disable)
      compareOutput(errors, example, n, '[percentCommentDelete]', markdown, mdDelete.render(markdown), outputs.delete)
      continue
    }

    if (example === 'percentCommentParagraph') {
      compareOutput(errors, example, n, '[paragraph HTML:false]', markdown, mdPercentCommentParagraph.render(markdown), expected('false', outputs.default))
      compareOutput(errors, example, n, '[paragraph HTML:true]', markdown, mdPercentCommentParagraphWithHtml.render(markdown), expected('true', outputs.default))
      compareOutput(errors, example, n, '[paragraphDelete HTML:false]', markdown, mdPercentCommentParagraphDelete.render(markdown), expected('deletefalse', outputs.delete))
      compareOutput(errors, example, n, '[paragraphDelete HTML:true]', markdown, mdPercentCommentParagraphDeleteWithHtml.render(markdown), expected('deletetrue', outputs.delete))
      continue
    }

    if (example === 'percentCommentLine') {
      compareOutput(errors, example, n, '[line HTML:false]', markdown, mdPercentCommentLine.render(markdown), expected('false', outputs.default))
      compareOutput(errors, example, n, '[line HTML:true]', markdown, mdPercentCommentLineWithHtml.render(markdown), expected('true', outputs.default))
      compareOutput(errors, example, n, '[lineDelete HTML:false]', markdown, mdPercentCommentDeleteLine.render(markdown), expected('deletefalse', outputs.delete))
      compareOutput(errors, example, n, '[lineDelete HTML:true]', markdown, mdPercentCommentDeleteLineWithHtml.render(markdown), expected('deletetrue', outputs.delete))
      continue
    }

    if (example === 'ruby' || example === 'starComment' || example === 'complex') {
      const h = md.render(markdown)
      compareOutput(errors, example, n, '[HTML:false]', markdown, h, expected('false', entry.html))
      const hh = mdWithHtml.render(markdown)
      compareOutput(errors, example, n, '[HTML:true]', markdown, hh, expected('true', entry.html))
    }

    if (example === 'starComment' || example === 'complex') {
      const hscd = mdStarCommentDelete.render(markdown)
      compareOutput(errors, example, n, '[starCommentDelete HTML:false]', markdown, hscd, expected('deletefalse', entry.htmlStarCommentDelete))
      const hscdh = mdStarCommentDeleteWithHtml.render(markdown)
      compareOutput(errors, example, n, '[starCommentDelete HTML:true]', markdown, hscdh, expected('deletetrue', entry.htmlStarCommentDelete))
    }

    if (example === 'starCommentParagraph') {
      const hp = mdStarCommentParagraph.render(markdown)
      compareOutput(errors, example, n, '[paragraph HTML:false]', markdown, hp, expected('false', entry.html))
      const hph = mdStarCommentParagraphWithHtml.render(markdown)
      compareOutput(errors, example, n, '[paragraph HTML:true]', markdown, hph, expected('true', entry.html))
      const hpd = mdStarCommentParagraphDelete.render(markdown)
      compareOutput(errors, example, n, '[paragraphDelete HTML:false]', markdown, hpd, expected('deletefalse', entry.htmlStarCommentDelete))
      const hpdh = mdStarCommentParagraphDeleteWithHtml.render(markdown)
      compareOutput(errors, example, n, '[paragraphDelete HTML:true]', markdown, hpdh, expected('deletetrue', entry.htmlStarCommentDelete))
    }

    if (example === 'starCommentLine') {
      const hscl = mdStarCommentLine.render(markdown)
      compareOutput(errors, example, n, '[line HTML:false]', markdown, hscl, expected('false', entry.html))
      const hsclh = mdStarCommentLineWithHtml.render(markdown)
      compareOutput(errors, example, n, '[line HTML:true]', markdown, hsclh, expected('true', entry.html))
      const hscld = mdStarCommentDeleteLine.render(markdown)
      compareOutput(errors, example, n, '[lineDelete HTML:false]', markdown, hscld, expected('deletefalse', entry.htmlStarCommentDelete))
      const hscldh = mdStarCommentDeleteLineWithHtml.render(markdown)
      compareOutput(errors, example, n, '[lineDelete HTML:true]', markdown, hscldh, expected('deletetrue', entry.htmlStarCommentDelete))
    }

    if (example === 'starCommentLineCjk') {
      const hscl = mdStarCommentLineCjk.render(markdown)
      compareOutput(errors, example, n, '[line cjk either]', markdown, hscl, entry.html)
    }

    if (example === 'starCommentLineParagraph') {
      const hsclp = mdStarCommentLineParagraph.render(markdown)
      compareOutput(errors, example, n, '[lineParagraph HTML:false]', markdown, hsclp, expected('false', entry.html))
      const hsclph = mdStarCommentLineParagraphWithHtml.render(markdown)
      compareOutput(errors, example, n, '[lineParagraph HTML:true]', markdown, hsclph, expected('true', entry.html))
      const hsclpd = mdStarCommentDeleteLineParagraph.render(markdown)
      compareOutput(errors, example, n, '[lineParagraphDelete HTML:false]', markdown, hsclpd, expected('deletefalse', entry.htmlStarCommentDelete))
      const hsclpdh = mdStarCommentDeleteLineParagraphWithHtml.render(markdown)
      compareOutput(errors, example, n, '[lineParagraphDelete HTML:true]', markdown, hsclpdh, expected('deletetrue', entry.htmlStarCommentDelete))
    }

    if (example === 'starCommentHtml') {
      const baseHtml = mdWithHtml.render(markdown)
      compareOutput(errors, example, n, '[htmlInline base]', markdown, baseHtml, entry.html)
      const htmlConverted = mdStarCommentHtmlInline.render(markdown)
      compareOutput(errors, example, n, '[htmlInline starComment]', markdown, htmlConverted, entry.htmlStarCommentHtml)
      const htmlDeleted = mdStarCommentDeleteHtmlInline.render(markdown)
      compareOutput(errors, example, n, '[htmlInline delete]', markdown, htmlDeleted, entry.htmlStarCommentDelete)
    }

    if (example === 'cjkDefault') {
      const hcjk = mdCjkDefault.render(markdown)
      compareOutput(errors, example, n, '[cjk default]', markdown, hcjk, entry.html)
    }

    if (example === 'cjkHalfEither') {
      const hcjk = mdCjkHalfEither.render(markdown)
      compareOutput(errors, example, n, '[cjk half either]', markdown, hcjk, entry.html)
    }

    if (example === 'cjkHalfEitherNormalize') {
      const hcjk = mdCjkHalfEitherNormalize.render(markdown)
      compareOutput(errors, example, n, '[cjk half either normalize]', markdown, hcjk, entry.html)
    }
  }
  return errors
}

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
  const examplePath = path.join(__dirname, file)
  const exampleCont = fs.readFileSync(examplePath, 'utf-8').trim()
  const fixtures = parseExampleContent(exampleCont)
  const errors = check(fixtures, exampleType)
  if (errors.length) {
    console.log('Check: ' + exampleType + ' (' + file + ') =======================')
    errors.forEach((e) => console.log(e))
  }
  totalErrors += errors.length
}

// simple smoke tests for %% comments
{
  const mdPercent = mdit().use(mdRendererInlineText, {
    starComment: true,
    percentComment: true,
  })
  const rendered = mdPercent.render('前%%コメント%%後')
  assert.strictEqual(rendered, '<p>前<span class="percent-comment">%%コメント%%</span>後</p>\n')

  const mdPercentDelete = mdit().use(mdRendererInlineText, {
    starComment: true,
    percentComment: true,
    starCommentDelete: true,
  })
  const renderedDelete = mdPercentDelete.render('前%%コメント%%後')
  assert.strictEqual(renderedDelete, '<p>前<span class="percent-comment">%%コメント%%</span>後</p>\n')
}

// option reconfiguration on same markdown-it instance
{
  const mdReuse = mdit().use(mdRendererInlineText, {
    starComment: true,
  })
  assert.strictEqual(mdReuse.render('前★星★後'), '<p>前<span class="star-comment">★星★</span>後</p>\n')

  mdReuse.use(mdRendererInlineText, {
    starComment: false,
    percentComment: true,
  })
  assert.strictEqual(mdReuse.render('前%%パー%%後'), '<p>前<span class="percent-comment">%%パー%%</span>後</p>\n')
  assert.strictEqual(mdReuse.render('前★星★後'), '<p>前★星★後</p>\n')

  mdReuse.use(mdRendererInlineText, {
    ruby: false,
    starComment: false,
    percentComment: false,
  })
  assert.strictEqual(mdReuse.render('前%%パー%%と★星★後'), '<p>前%%パー%%と★星★後</p>\n')
  assert.strictEqual(mdReuse.render('\\★無効時'), '<p>\\★無効時</p>\n')
  assert.strictEqual(mdReuse.render('\\%%無効時'), '<p>%%無効時</p>\n')
}

// escaped %% at the beginning of a line should not be treated as percent-comment line
{
  const markdown = '\\%%エスケープ行\n通常行'
  const expected = '<p>%%エスケープ行\n通常行</p>\n'

  const mdLine = mdit().use(mdRendererInlineText, {
    percentComment: true,
    percentCommentLine: true,
  })
  assert.strictEqual(mdLine.render(markdown), expected)

  const mdLineDelete = mdit().use(mdRendererInlineText, {
    percentComment: true,
    percentCommentLine: true,
    percentCommentDelete: true,
  })
  assert.strictEqual(mdLineDelete.render(markdown), expected)
}

// percentCommentLine should override percentCommentParagraph
{
  const mdLinePriority = mdit().use(mdRendererInlineText, {
    percentComment: true,
    percentCommentLine: true,
    percentCommentParagraph: true,
  })
  const rendered = mdLinePriority.render('%%先頭行\n通常行')
  assert.strictEqual(rendered, '<p><span class="percent-comment">%%先頭行</span>\n通常行</p>\n')
}

// html:true should convert markers in HTML text nodes
{
  const mdHtmlOption = mdit({ html: true }).use(mdRendererInlineText, {
    ruby: true,
    starComment: true,
    percentComment: true,
  })
  const rendered = mdHtmlOption.render('<p>★星★ %%パー%% 漢字《かんじ》</p>')
  assert.strictEqual(rendered, '<p><span class="star-comment">★星★</span> <span class="percent-comment">%%パー%%</span> <ruby>漢字<rp>《</rp><rt>かんじ</rt><rp>》</rp></ruby></p>')

  const blockRendered = mdHtmlOption.render('<div>★内★ %%内%% 漢字《かんじ》</div>')
  assert.strictEqual(blockRendered, '<div><span class="star-comment">★内★</span> <span class="percent-comment">%%内%%</span> <ruby>漢字<rp>《</rp><rt>かんじ</rt><rp>》</rp></ruby></div>')

  const mdHtmlOptionDelete = mdit({ html: true }).use(mdRendererInlineText, {
    ruby: true,
    starComment: true,
    percentComment: true,
    starCommentDelete: true,
  })
  assert.strictEqual(mdHtmlOptionDelete.render('<div>★内★ %%内%% 漢字《かんじ》</div>'), '<div> <span class="percent-comment">%%内%%</span> <ruby>漢字<rp>《</rp><rt>かんじ</rt><rp>》</rp></ruby></div>')

  const htmlCommentCase = '<div><!-- a > ★x★ %%y%% 漢字《かんじ》 --><span>★ok★ %%p%% 漢字《かんじ》</span></div>'
  assert.strictEqual(
    mdHtmlOption.render(htmlCommentCase),
    '<div><!-- a > ★x★ %%y%% 漢字《かんじ》 --><span><span class="star-comment">★ok★</span> <span class="percent-comment">%%p%%</span> <ruby>漢字<rp>《</rp><rt>かんじ</rt><rp>》</rp></ruby></span></div>',
  )

  const malformedCommentCase = '<div><!-- broken > ★x★ <span>★ok★</span></div>'
  assert.strictEqual(mdHtmlOption.render(malformedCommentCase), malformedCommentCase)

  const htmlAttrCase = '<div data-note="★x★ %%y%% 漢字《かんじ》">本文★内★ %%内%% 漢字《ほんぶん》</div>'
  assert.strictEqual(
    mdHtmlOption.render(htmlAttrCase),
    '<div data-note="★x★ %%y%% 漢字《かんじ》">本文<span class="star-comment">★内★</span> <span class="percent-comment">%%内%%</span> <ruby>漢字<rp>《</rp><rt>ほんぶん</rt><rp>》</rp></ruby></div>',
  )

  assert.strictEqual(
    mdHtmlOption.render('<div>★漢字《ない》★ 漢字《そと》</div>'),
    '<div><span class="star-comment">★漢字《ない》★</span> <ruby>漢字<rp>《</rp><rt>そと</rt><rp>》</rp></ruby></div>',
  )
  assert.strictEqual(
    mdHtmlOption.render('<div>%%漢字《ない》%% 漢字《そと》</div>'),
    '<div><span class="percent-comment">%%<ruby>漢字<rp>《</rp><rt>ない</rt><rp>》</rp></ruby>%%</span> <ruby>漢字<rp>《</rp><rt>そと</rt><rp>》</rp></ruby></div>',
  )

  const rawTextTags = [
    '<script>const msg="★dev★"; const note="%%x%%"; const r="漢字《かんじ》";</script>',
    '<style>.x:before{content:"★dev★ %%x%% 漢字《かんじ》";}</style>',
    '<textarea>★dev★ %%x%% 漢字《かんじ》</textarea>',
    '<title>★dev★ %%x%% 漢字《かんじ》</title>',
    '<SCRIPT>const msg="★dev★"; const note="%%x%%"; const r="漢字《かんじ》";</SCRIPT>',
  ]
  for (const raw of rawTextTags) {
    assert.strictEqual(mdHtmlOption.render(raw), raw)
  }

  const rawInline = '前<title>★dev★ %%x%% 漢字《かんじ》</title>後'
  assert.strictEqual(mdHtmlOption.render(rawInline), '<p>前<title>★dev★ %%x%% 漢字《かんじ》</title>後</p>\n')

  const rawWithAttr = '<script type="text/plain" data-note=">★x★ %%y%% 漢字《かんじ》">★dev★ %%x%% 漢字《かんじ》</script>'
  assert.strictEqual(mdHtmlOption.render(rawWithAttr), rawWithAttr)
}

// html:true converts text nodes in HTML (ruby/star/percent), but keeps tag internals untouched
{
  const mdHtmlDefault = mdit({ html: true }).use(mdRendererInlineText, {
    ruby: true,
    starComment: true,
    percentComment: true,
  })
  assert.strictEqual(
    mdHtmlDefault.render('前<span>★内★ %%内%% 漢字《かんじ》</span>後★外★'),
    '<p>前<span><span class="star-comment">★内★</span> <span class="percent-comment">%%内%%</span> <ruby>漢字<rp>《</rp><rt>かんじ</rt><rp>》</rp></ruby></span>後<span class="star-comment">★外★</span></p>\n',
  )
  assert.strictEqual(
    mdHtmlDefault.render('<div>★内★ %%内%% 漢字《かんじ》</div>'),
    '<div><span class="star-comment">★内★</span> <span class="percent-comment">%%内%%</span> <ruby>漢字<rp>《</rp><rt>かんじ</rt><rp>》</rp></ruby></div>',
  )
  assert.strictEqual(
    mdHtmlDefault.render('前<span title="★x★ %%y%% 漢字《かんじ》">漢字《ほんぶん》</span>後'),
    '<p>前<span title="★x★ %%y%% 漢字《かんじ》"><ruby>漢字<rp>《</rp><rt>ほんぶん</rt><rp>》</rp></ruby></span>後</p>\n',
  )

  const mdHtmlRubyDefault = mdit({ html: true }).use(mdRendererInlineText, {
    ruby: true,
  })
  assert.strictEqual(
    mdHtmlRubyDefault.render('前<span>漢字《かんじ》</span>後'),
    '<p>前<span><ruby>漢字<rp>《</rp><rt>かんじ</rt><rp>》</rp></ruby></span>後</p>\n',
  )
  assert.strictEqual(
    mdHtmlRubyDefault.render('<div>漢字《かんじ》</div>'),
    '<div><ruby>漢字<rp>《</rp><rt>かんじ</rt><rp>》</rp></ruby></div>',
  )

  assert.throws(
    () => mdit({ html: true }).use(mdRendererInlineText, {
      ruby: true,
      insideHtml: true,
    }),
    /insideHtml.*removed/i,
  )
  assert.throws(
    () => mdit({ html: true }).use(mdRendererInlineText, {
      ruby: true,
      insideHtml: false,
    }),
    /insideHtml.*removed/i,
  )

  const mdHtmlRawOff = mdit({ html: true }).use(mdRendererInlineText, {
    ruby: true,
    starComment: true,
    percentComment: true,
  })
  assert.strictEqual(
    mdHtmlRawOff.render('<script>const s="★dev★ %%x%% 漢字《かんじ》";</script>'),
    '<script>const s="★dev★ %%x%% 漢字《かんじ》";</script>',
  )
}

// percentClass should be escaped safely for HTML attributes
{
  const mdEscapedClass = mdit().use(mdRendererInlineText, {
    percentComment: true,
    percentClass: 'x" onclick="alert(1)',
  })
  const rendered = mdEscapedClass.render('前%%コメント%%後')
  assert.strictEqual(rendered, '<p>前<span class="x&quot; onclick=&quot;alert(1)">%%コメント%%</span>後</p>\n')
}

// ampersands in source text should not double-escape plugin-injected class entities
{
  const mdEscapedClassAmp = mdit().use(mdRendererInlineText, {
    percentComment: true,
    percentClass: 'x" onclick="a&b',
  })
  const rendered = mdEscapedClassAmp.render('A&%%X%%B')
  assert.strictEqual(rendered, '<p>A&amp;<span class="x&quot; onclick=&quot;a&amp;b">%%X%%</span>B</p>\n')

  const mdEmptyClass = mdit().use(mdRendererInlineText, {
    percentComment: true,
    percentClass: '   ',
  })
  assert.strictEqual(mdEmptyClass.render('前%%X%%後'), '<p>前<span class="percent-comment">%%X%%</span>後</p>\n')
}

// malformed slash tags and raw HTML tags stay escaped in html:false
{
  const mdEscapeCompat = mdit().use(mdRendererInlineText, {
    starComment: true,
    percentComment: true,
  })
  assert.strictEqual(mdEscapeCompat.render('<e/ee>'), '<p>&lt;e/ee&gt;</p>\n')
  assert.strictEqual(mdEscapeCompat.render('前%%X%%<a title=">ok">L</a>後'), '<p>前<span class="percent-comment">%%X%%</span>&lt;a title="&gt;ok"&gt;L&lt;/a&gt;後</p>\n')
}

// html:false must escape raw HTML even when inline wrappers are injected
{
  const mdStrictStar = mdit().use(mdRendererInlineText, {
    starComment: true,
  })
  assert.strictEqual(mdStrictStar.render('★コメント★<script>alert(1)</script>'), '<p><span class="star-comment">★コメント★</span>&lt;script&gt;alert(1)&lt;/script&gt;</p>\n')

  const mdStrictPercent = mdit().use(mdRendererInlineText, {
    percentComment: true,
  })
  assert.strictEqual(mdStrictPercent.render('前%%コメント%%<img src=x onerror=alert(1)>後'), '<p>前<span class="percent-comment">%%コメント%%</span>&lt;img src=x onerror=alert(1)&gt;後</p>\n')

  const mdStrictStarDelete = mdit().use(mdRendererInlineText, {
    starComment: true,
    starCommentDelete: true,
  })
  assert.strictEqual(mdStrictStarDelete.render('前★コメント★<script>alert(1)</script>後'), '<p>前&lt;script&gt;alert(1)&lt;/script&gt;後</p>\n')

  const mdStrictPercentDelete = mdit().use(mdRendererInlineText, {
    percentComment: true,
    percentCommentDelete: true,
  })
  assert.strictEqual(mdStrictPercentDelete.render('前%%コメント%%<img src=x onerror=1>後'), '<p>前&lt;img src=x onerror=1&gt;後</p>\n')

  const mdHtmlMode = mdit({ html: true }).use(mdRendererInlineText, {
    starComment: true,
  })
  assert.strictEqual(mdHtmlMode.render('★コメント★<script>alert(1)</script>'), '<p><span class="star-comment">★コメント★</span><script>alert(1)</script></p>\n')

  const mdStrictRuby = mdit().use(mdRendererInlineText, {
    ruby: true,
  })
  assert.strictEqual(
    mdStrictRuby.render('<span>漢字《かんじ》</span>'),
    '<p>&lt;span&gt;<ruby>漢字<rp>《</rp><rt>かんじ</rt><rp>》</rp></ruby>&lt;/span&gt;</p>\n',
  )
  assert.strictEqual(
    mdStrictRuby.render('<ruby>漢字《かんじ》</ruby>'),
    '<p>&lt;ruby&gt;<ruby>漢字<rp>《</rp><rt>かんじ</rt><rp>》</rp></ruby>&lt;/ruby&gt;</p>\n',
  )

  const mdStrictAll = mdit().use(mdRendererInlineText, {
    ruby: true,
    starComment: true,
    percentComment: true,
  })
  assert.strictEqual(
    mdStrictAll.render('<script>★dev★ %%x%% 漢字《かんじ》</script>'),
    '<p>&lt;script&gt;<span class="star-comment">★dev★</span> <span class="percent-comment">%%x%%</span> <ruby>漢字<rp>《</rp><rt>かんじ</rt><rp>》</rp></ruby>&lt;/script&gt;</p>\n',
  )

  const mdStrictStarRuby = mdit().use(mdRendererInlineText, {
    ruby: true,
    starComment: true,
  })
  assert.strictEqual(
    mdStrictStarRuby.render('前★漢字《ない》★後 漢字《そと》'),
    '<p>前<span class="star-comment">★漢字《ない》★</span>後 <ruby>漢字<rp>《</rp><rt>そと</rt><rp>》</rp></ruby></p>\n',
  )
}

// html:false escaping should stay consistent in paragraph/line comment modes
{
  const mdPercentParagraphSafe = mdit().use(mdRendererInlineText, {
    percentComment: true,
    percentCommentParagraph: true,
  })
  assert.strictEqual(mdPercentParagraphSafe.render('%%段落<script>alert(1)</script>'), '<p><span class="percent-comment">%%段落&lt;script&gt;alert(1)&lt;/script&gt;</span></p>\n')

  const mdPercentLineSafe = mdit().use(mdRendererInlineText, {
    percentComment: true,
    percentCommentLine: true,
  })
  assert.strictEqual(mdPercentLineSafe.render('%%行<script>alert(1)</script>\n通常'), '<p><span class="percent-comment">%%行&lt;script&gt;alert(1)&lt;/script&gt;</span>\n通常</p>\n')

  const mdPercentLineDeleteSafe = mdit().use(mdRendererInlineText, {
    percentComment: true,
    percentCommentLine: true,
    percentCommentDelete: true,
  })
  assert.strictEqual(mdPercentLineDeleteSafe.render('%%削除<script>x</script>\n通常<img src=x onerror=1>'), '<p>通常&lt;img src=x onerror=1&gt;</p>\n')

  const mdStarLineSafe = mdit().use(mdRendererInlineText, {
    starComment: true,
    starCommentLine: true,
  })
  assert.strictEqual(mdStarLineSafe.render('★行<script>alert(1)</script>\n通常'), '<p><span class="star-comment">★行&lt;script&gt;alert(1)&lt;/script&gt;</span>\n通常</p>\n')

  const mdStarLineDeleteSafe = mdit().use(mdRendererInlineText, {
    starComment: true,
    starCommentLine: true,
    starCommentDelete: true,
  })
  assert.strictEqual(mdStarLineDeleteSafe.render('★削除<script>x</script>\n通常<img src=x onerror=1>'), '<p>通常&lt;img src=x onerror=1&gt;</p>\n')
}

// html:true should keep wrappers balanced around inline HTML boundaries
{
  const mdPercentParagraphHtml = mdit({ html: true }).use(mdRendererInlineText, {
    percentComment: true,
    percentCommentParagraph: true,
  })
  assert.strictEqual(mdPercentParagraphHtml.render('%%段落<script>alert(1)</script>'), '<p><span class="percent-comment">%%段落</span><script>alert(1)</script></p>\n')

  const mdStarParagraphHtml = mdit({ html: true }).use(mdRendererInlineText, {
    starComment: true,
    starCommentParagraph: true,
  })
  assert.strictEqual(mdStarParagraphHtml.render('★段落<script>alert(1)</script>'), '<p><span class="star-comment">★段落</span><script>alert(1)</script></p>\n')

  const mdPercentLineHtml = mdit({ html: true }).use(mdRendererInlineText, {
    percentComment: true,
    percentCommentLine: true,
  })
  assert.strictEqual(mdPercentLineHtml.render('%%行<script>alert(1)</script>\n通常'), '<p><span class="percent-comment">%%行</span><script>alert(1)</script>\n通常</p>\n')

  const mdStarLineHtml = mdit({ html: true }).use(mdRendererInlineText, {
    starComment: true,
    starCommentLine: true,
  })
  assert.strictEqual(mdStarLineHtml.render('★行<script>alert(1)</script>\n通常'), '<p><span class="star-comment">★行</span><script>alert(1)</script>\n通常</p>\n')

  const mdPercentLineDeleteHtml = mdit({ html: true }).use(mdRendererInlineText, {
    percentComment: true,
    percentCommentLine: true,
    percentCommentDelete: true,
  })
  assert.strictEqual(mdPercentLineDeleteHtml.render('%%削除<script>x</script>\n通常<img src=x onerror=1>'), '<p>通常<img src=x onerror=1></p>\n')

  const mdStarLineDeleteHtml = mdit({ html: true }).use(mdRendererInlineText, {
    starComment: true,
    starCommentLine: true,
    starCommentDelete: true,
  })
  assert.strictEqual(mdStarLineDeleteHtml.render('★削除<script>x</script>\n通常<img src=x onerror=1>'), '<p>通常<img src=x onerror=1></p>\n')

  const mdPercentParagraphDeleteHtml = mdit({ html: true }).use(mdRendererInlineText, {
    percentComment: true,
    percentCommentParagraph: true,
    percentCommentDelete: true,
  })
  assert.strictEqual(mdPercentParagraphDeleteHtml.render('%%削除<script>x</script>'), '')

  const mdStarParagraphDeleteHtml = mdit({ html: true }).use(mdRendererInlineText, {
    starComment: true,
    starCommentParagraph: true,
    starCommentDelete: true,
  })
  assert.strictEqual(mdStarParagraphDeleteHtml.render('★削除<script>x</script>'), '')
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

  const mdPercentParagraphWithStarDelete = mdit().use(mdRendererInlineText, {
    starComment: true,
    starCommentDelete: true,
    percentComment: true,
    percentCommentParagraph: true,
  })
  assert.strictEqual(
    mdPercentParagraphWithStarDelete.render('%%段落コメント'),
    '<p><span class="percent-comment">%%段落コメント</span></p>\n',
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

  const mdStarParagraphWithPercentDelete = mdit().use(mdRendererInlineText, {
    starComment: true,
    starCommentParagraph: true,
    percentComment: true,
    percentCommentDelete: true,
  })
  assert.strictEqual(
    mdStarParagraphWithPercentDelete.render('★段落コメント'),
    '<p><span class="star-comment">★段落コメント</span></p>\n',
  )
}

if (totalErrors === 0) {
  console.log('All tests passed.')
} else {
  console.log(totalErrors + ' tests failed.')
  process.exit(1)
}
