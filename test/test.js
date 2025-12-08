import assert from 'assert'
import fs from 'fs'
import path from 'path'
import mdit from 'markdown-it'
import mdRendererInlineText from '../index.js'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const check = (ms, example) => {
  const md = mdit().use(mdRendererInlineText, {
    ruby: true,
    starComment: true,
  })
  const mdWithHtml = mdit({html: true}).use(mdRendererInlineText, {
    ruby: true,
    starComment: true,
  })
  const mdStarCommentDelete = mdit().use(mdRendererInlineText, {
    ruby: true,
    starComment: true,
    starCommentDelete: true,
  })
  const mdStarCommentDeleteWidthHtml = mdit({html: true}).use(mdRendererInlineText, {
    ruby: true,
    starComment: true,
    starCommentDelete: true,
  })

  const mdStarCommentLine = mdit().use(mdRendererInlineText, {
    starComment: true,
    starCommentLine: true,
  })
  const mdStarCommentLineWithHtml = mdit({html: true}).use(mdRendererInlineText, {
    starComment: true,
    starCommentLine: true,
  })
  const mdStarCommentDeleteLine = mdit().use(mdRendererInlineText, {
    starComment: true,
    starCommentDelete: true,
    starCommentLine: true,
  })
  const mdStarCommentDeleteLineWithHtml = mdit({html: true}).use(mdRendererInlineText, {
    starComment: true,
    starCommentDelete: true,
    starCommentLine: true,
  })


  let errors = []
  let n = 1
  while (n < ms.length) {
    //if (n !== 2) { n++; continue }
    const m = ms[n].markdown
    if (example === 'ruby' || example === 'starComment') {
      const h = md.render(m)
      try {
        assert.strictEqual(h, ms[n].html)
      } catch(e) {
        errors.push('[FAIL] ' + example + ' #' + n + ' [HTML: false]\nInput: ' + ms[n].markdown + '\nConvert: ' + h + '\nCorrect: ' + ms[n].html)
      }

      const hh = mdWithHtml.render(m)
      try {
        assert.strictEqual(hh, ms[n].html)
      } catch(e) {
        errors.push('[FAIL] ' + example + ' #' + n + ' [HTML: true]\nInput: ' + ms[n].markdown + '\nConvert: ' + hh + '\nCorrect: ' + ms[n].html)
      }
    }

    if (example === 'starComment') {
      const hscd = mdStarCommentDelete.render(m)
      try {
        assert.strictEqual(hscd, ms[n].htmlStarCommentDelete)
      } catch(e) {
        errors.push('[FAIL] ' + example + ' #' + n + ' [starCommentDelete HTML: false]\nInput: ' + ms[n].markdown + '\nConvert: ' + hscd + '\nCorrect: ' + ms[n].htmlStarCommentDelete)
      }

      const hscdh = mdStarCommentDeleteWidthHtml.render(m)
      try {
        assert.strictEqual(hscdh, ms[n].htmlStarCommentDelete)
      } catch(e) {
        errors.push('[FAIL] ' + example + ' #' + n + ' [starCommentDelete HTML: true]\nInput: ' + ms[n].markdown + '\nConvert: ' + hscdh + '\nCorrect: ' + ms[n].htmlStarCommentDelete)
      }
    }

    if (example === 'starCommentLine') {
      const hscl = mdStarCommentLine.render(m)
      try {
        assert.strictEqual(hscl, ms[n].html)
      } catch(e) {
        errors.push('[FAIL] ' + example + ' #' + n + ' [starCommentLine HTML: false]\nInput: ' + ms[n].markdown + '\nConvert: ' + hscl + '\nCorrect: ' + ms[n].html)
      }
      const hscldh = mdStarCommentLineWithHtml.render(m)
      try {
        assert.strictEqual(hscldh, ms[n].html)
      } catch(e) {
        errors.push('[FAIL] ' + example + ' #' + n + ' [starCommentLine HTML: true]\nInput: ' + ms[n].markdown + '\nConvert: ' + hscldh + '\nCorrect: ' + ms[n].html)
      }
      const hscdl = mdStarCommentDeleteLine.render(m)
      try {
        assert.strictEqual(hscdl, ms[n].htmlStarCommentDelete)
      } catch(e) {
        errors.push('[FAIL] ' + example + ' #' + n + ' [starCommentDeleteLine HTML: false]\nInput: ' + ms[n].markdown + '\nConvert: ' + hscdl + '\nCorrect: ' + ms[n].htmlStarCommentDelete)
      }
      const hscdldh = mdStarCommentDeleteLineWithHtml.render(m)
      try {
        assert.strictEqual(hscdldh, ms[n].htmlStarCommentDelete)
      } catch(e) {
        errors.push('[FAIL] ' + example + ' #' + n + ' [starCommentDeleteLine HTML: true]\nInput: ' + ms[n].markdown + '\nConvert: ' + hscdldh + '\nCorrect: ' + ms[n].htmlStarCommentDelete)
      }
    }

    n++
  }
  return errors
  }

// (Aggregated run is performed below)
let totalErrors = 0
// Find all .txt fixtures in this test directory
const files = fs.readdirSync(__dirname)
const txtFiles = files.filter(f => f.endsWith('.txt'))
for (const file of txtFiles) {
  console.log ('Tests files: ' + file)
  const example = path.basename(file, '.txt')
  const examplePath = path.join(__dirname, file)
  const exampleCont = fs.readFileSync(examplePath, 'utf-8').trim()
  let ms = [];
  let ms0 = exampleCont.split(/\n*\[Markdown\]\n/)
  let n = 1
  while (n < ms0.length) {
    let mhs = ms0[n].split(/\n+\[HTML[^\]]*?\]\n/)
    let i = 1
    while (i < 3) {
      if (mhs[i] === undefined) {
        mhs[i] = ''
      } else {
        mhs[i] = mhs[i].replace(/$/,'\n')
      }
      i++
    }
    ms[n] = {
      markdown: mhs[0],
      html: mhs[1],
      htmlStarCommentDelete: mhs[2],
    }
    n++
  }
  const errors = check(ms, example)
  if (errors && errors.length) {
    console.log('Check: ' + example + " =======================")
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
