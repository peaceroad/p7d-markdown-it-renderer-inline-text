import assert from 'assert'
import fs from 'fs'
import path from 'path'
import mdit from 'markdown-it'
import mdRendererInlineText from '../index.js'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const MARKDOWN_HEADER = /^\[Markdown\]\s*$/
const SUPPORTED_EXAMPLES = new Set([
  'ruby',
  'starComment',
  'starCommentParagraph',
  'starCommentLine',
  'starCommentHtml',
  'complex',
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
    ms[idx + 1] = {
      markdown: normalize(entry.markdown),
      html: normalize(entry.outputs.default),
      htmlStarCommentDelete: normalize(entry.outputs.delete),
      htmlStarCommentHtml: normalize(entry.outputs.html),
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
  })
  const mdWithHtml = mdit({ html: true }).use(mdRendererInlineText, {
    ruby: true,
    starComment: true,
  })
  const mdStarCommentDelete = mdit().use(mdRendererInlineText, {
    ruby: true,
    starComment: true,
    starCommentDelete: true,
  })
  const mdStarCommentDeleteWithHtml = mdit({ html: true }).use(mdRendererInlineText, {
    ruby: true,
    starComment: true,
    starCommentDelete: true,
  })
  const mdStarCommentParagraph = mdit().use(mdRendererInlineText, {
    starComment: true,
    starCommentParagraph: true,
  })
  const mdStarCommentParagraphWithHtml = mdit({ html: true }).use(mdRendererInlineText, {
    starComment: true,
    starCommentParagraph: true,
  })
  const mdStarCommentParagraphDelete = mdit().use(mdRendererInlineText, {
    starComment: true,
    starCommentParagraph: true,
    starCommentDelete: true,
  })
  const mdStarCommentParagraphDeleteWithHtml = mdit({ html: true }).use(mdRendererInlineText, {
    starComment: true,
    starCommentParagraph: true,
    starCommentDelete: true,
  })
  const mdStarCommentLine = mdit().use(mdRendererInlineText, {
    starComment: true,
    starCommentLine: true,
  })
  const mdStarCommentLineWithHtml = mdit({ html: true }).use(mdRendererInlineText, {
    starComment: true,
    starCommentLine: true,
  })
  const mdStarCommentDeleteLine = mdit().use(mdRendererInlineText, {
    starComment: true,
    starCommentDelete: true,
    starCommentLine: true,
  })
  const mdStarCommentDeleteLineWithHtml = mdit({ html: true }).use(mdRendererInlineText, {
    starComment: true,
    starCommentDelete: true,
    starCommentLine: true,
  })
  const mdStarCommentHtmlInline = mdit({ html: true }).use(mdRendererInlineText, {
    ruby: true,
    starComment: true,
    insideHtml: true,
  })
  const mdStarCommentDeleteHtmlInline = mdit({ html: true }).use(mdRendererInlineText, {
    ruby: true,
    starComment: true,
    starCommentDelete: true,
    insideHtml: true,
  })

  const errors = []
  for (let n = 1; n < ms.length; n++) {
    const entry = ms[n]
    if (!entry || entry.markdown === undefined) continue
    const markdown = entry.markdown

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

    if (example === 'starCommentHtml') {
      const baseHtml = mdWithHtml.render(markdown)
      compareOutput(errors, example, n, '[htmlInline base]', markdown, baseHtml, entry.html)
      const htmlConverted = mdStarCommentHtmlInline.render(markdown)
      compareOutput(errors, example, n, '[htmlInline starComment]', markdown, htmlConverted, entry.htmlStarCommentHtml)
      const htmlDeleted = mdStarCommentDeleteHtmlInline.render(markdown)
      compareOutput(errors, example, n, '[htmlInline delete]', markdown, htmlDeleted, entry.htmlStarCommentDelete)
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

if (totalErrors === 0) {
  console.log('All tests passed.')
} else {
  console.log(totalErrors + ' tests failed.')
  process.exit(1)
}
