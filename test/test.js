import assert from 'assert'
import fs from 'fs'
import path from 'path'
import url from 'url'

import mdit from 'markdown-it'
import mdRendererInlineText from '../index.js'

const __dirname = path.dirname(url.fileURLToPath(import.meta.url)).replace(/\\/g, '/')

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

  let n = 1
  while (n < ms.length) {
    //if (n !== 7) { n++; continue }
    const m = ms[n].markdown


    console.log('Test [' + n + ', HTML: false] >>>')
    const h = md.render(m)
    try {
      assert.strictEqual(h, ms[n].html)
    } catch(e) {
      console.log('Input: ' + ms[n].markdown + '\nConvert: ' + h + 'Correct: ' + ms[n].html)
    }

    console.log('Test [' + n + ', HTML: true] >>>')
    const hh = mdWithHtml.render(m)
    try {
      assert.strictEqual(hh, ms[n].html)
    } catch(e) {
      console.log('Input: ' + ms[n].markdown + '\nConvert: ' + hh + 'Correct: ' + ms[n].html)
    }

    if (example !== 'ruby') {
      console.log('Test::starCommentDelete [' + n + ', HTML: false] >>>')
      const hscd = mdStarCommentDelete.render(m)
      try {
        assert.strictEqual(hscd, ms[n].htmlStarCommentDelete)
      } catch(e) {
        console.log('Input: ' + ms[n].markdown + '\nConvert: ' + hscd + 'Correct: ' + ms[n].htmlStarCommentDelete)
      }

      console.log('Test::starCommentDelete [' + n + ', HTML: true] >>>')
      const hscdh = mdStarCommentDeleteWidthHtml.render(m)
      try {
        assert.strictEqual(hscdh, ms[n].htmlStarCommentDelete)
      } catch(e) {
        console.log('Input: ' + ms[n].markdown + '\nConvert: ' + hscdh + 'Correct: ' + ms[n].htmlStarCommentDelete)
      }

    }

    n++
  }
}

const examples = {
  ruby: __dirname + '/example-ruby.txt',
  starComment: __dirname + '/example-star-comment.txt',
  //complex: __dirname + '/example-complex.txt',
}

for (let example in examples) {
  const exampleCont = fs.readFileSync(examples[example], 'utf-8').trim()
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
  console.log('Check: ' + example + " =======================")
  check(ms, example)
}
