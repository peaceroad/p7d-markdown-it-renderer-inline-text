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
    insideHtml: true,
  })
  const mdStarCommentDeleteHtmlInline = mdit({ html: true }).use(mdRendererInlineText, {
    ruby: true,
    starComment: true,
    percentComment: true,
    starCommentDelete: true,
    insideHtml: true,
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

    if (example === 'percentCommentOptions') {
      const outputs = entry.outputs || {}
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
      const outputs = entry.outputs || {}
      compareOutput(errors, example, n, '[paragraph HTML:false]', markdown, mdPercentCommentParagraph.render(markdown), outputs.default)
      compareOutput(errors, example, n, '[paragraph HTML:true]', markdown, mdPercentCommentParagraphWithHtml.render(markdown), outputs.default)
      compareOutput(errors, example, n, '[paragraphDelete HTML:false]', markdown, mdPercentCommentParagraphDelete.render(markdown), outputs.delete)
      compareOutput(errors, example, n, '[paragraphDelete HTML:true]', markdown, mdPercentCommentParagraphDeleteWithHtml.render(markdown), outputs.delete)
      continue
    }

    if (example === 'percentCommentLine') {
      const outputs = entry.outputs || {}
      compareOutput(errors, example, n, '[line HTML:false]', markdown, mdPercentCommentLine.render(markdown), outputs.default)
      compareOutput(errors, example, n, '[line HTML:true]', markdown, mdPercentCommentLineWithHtml.render(markdown), outputs.default)
      compareOutput(errors, example, n, '[lineDelete HTML:false]', markdown, mdPercentCommentDeleteLine.render(markdown), outputs.delete)
      compareOutput(errors, example, n, '[lineDelete HTML:true]', markdown, mdPercentCommentDeleteLineWithHtml.render(markdown), outputs.delete)
      continue
    }

    if (example === 'ruby' || example === 'starComment' || example === 'complex') {
      const h = md.render(markdown)
      compareOutput(errors, example, n, '[HTML:false]', markdown, h, entry.html)
      const hh = mdWithHtml.render(markdown)
      compareOutput(errors, example, n, '[HTML:true]', markdown, hh, entry.html)
    }

    if (example === 'starComment' || example === 'complex') {
      const hscd = mdStarCommentDelete.render(markdown)
      compareOutput(errors, example, n, '[starCommentDelete HTML:false]', markdown, hscd, entry.htmlStarCommentDelete)
      const hscdh = mdStarCommentDeleteWithHtml.render(markdown)
      compareOutput(errors, example, n, '[starCommentDelete HTML:true]', markdown, hscdh, entry.htmlStarCommentDelete)
    }

    if (example === 'starCommentParagraph') {
      const hp = mdStarCommentParagraph.render(markdown)
      compareOutput(errors, example, n, '[paragraph HTML:false]', markdown, hp, entry.html)
      const hph = mdStarCommentParagraphWithHtml.render(markdown)
      compareOutput(errors, example, n, '[paragraph HTML:true]', markdown, hph, entry.html)
      const hpd = mdStarCommentParagraphDelete.render(markdown)
      compareOutput(errors, example, n, '[paragraphDelete HTML:false]', markdown, hpd, entry.htmlStarCommentDelete)
      const hpdh = mdStarCommentParagraphDeleteWithHtml.render(markdown)
      compareOutput(errors, example, n, '[paragraphDelete HTML:true]', markdown, hpdh, entry.htmlStarCommentDelete)
    }

    if (example === 'starCommentLine') {
      const hscl = mdStarCommentLine.render(markdown)
      compareOutput(errors, example, n, '[line HTML:false]', markdown, hscl, entry.html)
      const hsclh = mdStarCommentLineWithHtml.render(markdown)
      compareOutput(errors, example, n, '[line HTML:true]', markdown, hsclh, entry.html)
      const hscld = mdStarCommentDeleteLine.render(markdown)
      compareOutput(errors, example, n, '[lineDelete HTML:false]', markdown, hscld, entry.htmlStarCommentDelete)
      const hscldh = mdStarCommentDeleteLineWithHtml.render(markdown)
      compareOutput(errors, example, n, '[lineDelete HTML:true]', markdown, hscldh, entry.htmlStarCommentDelete)
    }

    if (example === 'starCommentLineParagraph') {
      const hsclp = mdStarCommentLineParagraph.render(markdown)
      compareOutput(errors, example, n, '[lineParagraph HTML:false]', markdown, hsclp, entry.html)
      const hsclph = mdStarCommentLineParagraphWithHtml.render(markdown)
      compareOutput(errors, example, n, '[lineParagraph HTML:true]', markdown, hsclph, entry.html)
      const hsclpd = mdStarCommentDeleteLineParagraph.render(markdown)
      compareOutput(errors, example, n, '[lineParagraphDelete HTML:false]', markdown, hsclpd, entry.htmlStarCommentDelete)
      const hsclpdh = mdStarCommentDeleteLineParagraphWithHtml.render(markdown)
      compareOutput(errors, example, n, '[lineParagraphDelete HTML:true]', markdown, hsclpdh, entry.htmlStarCommentDelete)
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
  assert.strictEqual(renderedDelete, '<p>前後</p>\n')
}

if (totalErrors === 0) {
  console.log('All tests passed.')
} else {
  console.log(totalErrors + ' tests failed.')
  process.exit(1)
}
