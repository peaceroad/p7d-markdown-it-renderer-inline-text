import assert from 'assert'

export const runOptionAssertions = ({ mdit, cjkBreaks, strongJa, mdRendererInlineText }) => {
  // Rules installed before markdown-it's escape rule must preserve hardbreak semantics.
  {
    const src = 'A\\  \nB'
    const expected = mdit().render(src)
    const actual = mdit().use(mdRendererInlineText, {
      starComment: true,
      percentComment: true,
    }).render(src)
    assert.strictEqual(actual, expected)
  }

  // Core/inline anchors remain available across markdown-it built-in presets.
  {
    for (const preset of ['default', 'commonmark', 'zero']) {
      const md = mdit(preset).use(mdRendererInlineText, {
        ruby: true,
        starComment: true,
        percentComment: true,
        figureReference: true,
      })
      const html = md.render('前★星★後%%注%% 漢字《かんじ》 （図A）')
      assert.ok(html.includes('<span class="star-comment">★星★</span>'), preset)
      assert.ok(html.includes('<span class="percent-comment">%%注%%</span>'), preset)
      assert.ok(html.includes('<ruby>漢字<rp>《</rp><rt>かんじ</rt><rp>》</rp></ruby>'), preset)
      assert.ok(html.includes('（<span class="f-ref">図A</span>）'), preset)
    }
  }

  // Figure references wrap only the label/identifier while preserving paired parentheses.
  {
    const examples = [
      ['（図1）', '（<span class="f-ref">図1</span>）'],
      ['（図１）', '（<span class="f-ref">図１</span>）'],
      ['（図A）', '（<span class="f-ref">図A</span>）'],
      ['（図Ａ）', '（<span class="f-ref">図Ａ</span>）'],
      ['（図1.1）', '（<span class="f-ref">図1.1</span>）'],
      ['（図A.1）', '（<span class="f-ref">図A.1</span>）'],
      ['（図1-1）', '（<span class="f-ref">図1-1</span>）'],
      ['（図A-1）', '（<span class="f-ref">図A-1</span>）'],
      ['(図A-1)', '(<span class="f-ref">図A-1</span>)'],
      ['（Figure 1）', '（<span class="f-ref">Figure 1</span>）'],
      ['（Figure A.1）', '（<span class="f-ref">Figure A.1</span>）'],
      ['(Figure 1-1)', '(<span class="f-ref">Figure 1-1</span>)'],
      ['(Figure Ａ-１)', '(<span class="f-ref">Figure Ａ-１</span>)'],
      ['（Figure.1）', '（<span class="f-ref">Figure.1</span>）'],
      ['(Figure.A-1)', '(<span class="f-ref">Figure.A-1</span>)'],
      ['(Figure.A.1)', '(<span class="f-ref">Figure.A.1</span>)'],
      ['(Fig 1)', '(<span class="f-ref">Fig 1</span>)'],
      ['（Fig A.1）', '（<span class="f-ref">Fig A.1</span>）'],
      ['(Fig.1)', '(<span class="f-ref">Fig.1</span>)'],
      ['(Fig.A-1)', '(<span class="f-ref">Fig.A-1</span>)'],
      ['(Fig.A.1)', '(<span class="f-ref">Fig.A.1</span>)'],
      ['(Fig. 1)', '(<span class="f-ref">Fig. 1</span>)'],
      ['（Fig.　Ａ-１）', '（<span class="f-ref">Fig.　Ａ-１</span>）'],
    ]
    for (const html of [false, true]) {
      const md = mdit({ html }).use(mdRendererInlineText, { figureReference: true })
      for (const [src, expected] of examples) {
        assert.strictEqual(md.renderInline(src), expected, `${html}:${src}`)
      }
    }
  }

  // Figure references work in list text and preserve surrounding whitespace.
  {
    const md = mdit().use(mdRendererInlineText, { figureReference: true })
    assert.strictEqual(
      md.render('- 本文（図A.1）参照\n- See (Figure 1-1).'),
      '<ul>\n'
        + '<li>本文（<span class="f-ref">図A.1</span>）参照</li>\n'
        + '<li>See (<span class="f-ref">Figure 1-1</span>).</li>\n'
        + '</ul>\n',
    )
    assert.strictEqual(
      md.renderInline(' (Figure A) '),
      ' (<span class="f-ref">Figure A</span>) ',
    )
  }

  // Figure-reference wrappers use balanced inline tokens and the default renderer.
  {
    const md = mdit().use(mdRendererInlineText, { figureReference: true })
    const children = md.parseInline('前（図A.1）後', {})[0].children
    assert.deepStrictEqual(
      children.map((token) => ({
        type: token.type,
        tag: token.tag,
        nesting: token.nesting,
        level: token.level,
        content: token.content,
        attrs: token.attrs,
      })),
      [
        { type: 'text', tag: '', nesting: 0, level: 0, content: '前（', attrs: null },
        {
          type: 'figure_reference_open',
          tag: 'span',
          nesting: 1,
          level: 0,
          content: '',
          attrs: [['class', 'f-ref']],
        },
        { type: 'text', tag: '', nesting: 0, level: 1, content: '図A.1', attrs: null },
        {
          type: 'figure_reference_close',
          tag: 'span',
          nesting: -1,
          level: 0,
          content: '',
          attrs: null,
        },
        { type: 'text', tag: '', nesting: 0, level: 0, content: '）後', attrs: null },
      ],
    )
    assert.strictEqual(md.renderer.rules.figure_reference_open, undefined)
    assert.strictEqual(md.renderer.rules.figure_reference_close, undefined)
  }

  // Figure-reference tag/class options are normalized and safely rendered.
  {
    const mdBold = mdit().use(mdRendererInlineText, {
      figureReference: true,
      figureReferenceTag: ' B ',
      figureReferenceClass: ' figure-number ',
    })
    assert.strictEqual(
      mdBold.renderInline('（図A）'),
      '（<b class="figure-number">図A</b>）',
    )

    const mdItalic = mdit().use(mdRendererInlineText, {
      figureReference: true,
      figureReferenceTag: 'i',
      figureReferenceClass: 'x" onclick="a&b',
    })
    assert.strictEqual(
      mdItalic.renderInline('(Figure 1)'),
      '(<i class="x&quot; onclick=&quot;a&amp;b">Figure 1</i>)',
    )

    assert.throws(
      () => mdit().use(mdRendererInlineText, {
        figureReference: true,
        figureReferenceTag: 'script',
      }),
      /figureReferenceTag must be one of: span, b, i/,
    )
  }

  // Figure-reference matching is fail-closed and honors Markdown/HTML boundaries.
  {
    const md = mdit({ html: true }).use(mdRendererInlineText, {
      figureReference: true,
      starComment: true,
    })
    assert.strictEqual(
      md.renderInline(
        '（figure 1） （fig. 1） (FIG.1) （図a） （図1_1） (Figure A.1）'
          + ' （図１．１） （図Ａ－１） （Figure．1） (Figure.A－1)'
          + ' （図1：1） (Figure-1) (Figure .1) (Fig-1) (Fig .1)',
      ),
      '（figure 1） （fig. 1） (FIG.1) （図a） （図1_1） (Figure A.1）'
        + ' （図１．１） （図Ａ－１） （Figure．1） (Figure.A－1)'
        + ' （図1：1） (Figure-1) (Figure .1) (Fig-1) (Fig .1)',
    )
    assert.strictEqual(
      md.renderInline('`（図1）` [（図A）](https://example.test/(Figure%201)) <i title="(Figure 2)">x</i>'),
      '<code>（図1）</code> <a href="https://example.test/(Figure%201)">（<span class="f-ref">図A</span>）</a> <i title="(Figure 2)">x</i>',
    )
    assert.strictEqual(
      md.renderInline('![（図1）](figure.png)'),
      '<img src="figure.png" alt="（図1）">',
    )
    assert.strictEqual(
      md.renderInline('[x（図1）](https://example.test)'),
      '<a href="https://example.test">x（<span class="f-ref">図1</span>）</a>',
    )
    assert.strictEqual(
      md.renderInline('a[（図1）x'),
      'a[（<span class="f-ref">図1</span>）x',
    )
    assert.strictEqual(
      md.renderInline('<script>（図1）★注★</script><span>（図2）</span>'),
      '<script>（図1）★注★</script><span>（<span class="f-ref">図2</span>）</span>',
    )
    assert.strictEqual(
      md.renderInline('<style>(Figure 1)</style><textarea>（図A）</textarea><title>（図1）</title>'),
      '<style>(Figure 1)</style><textarea>（図A）</textarea><title>（図1）</title>',
    )
    assert.strictEqual(
      md.renderInline('<script><b>（図1）★注★</b></script>（図2）★外★'),
      '<script><b>（図1）★注★</b></script>（<span class="f-ref">図2</span>）<span class="star-comment">★外★</span>',
    )
    assert.strictEqual(
      md.renderInline('\\(Figure 1) (Figure 2)'),
      '(Figure 1) (<span class="f-ref">Figure 2</span>)',
    )
    assert.strictEqual(md.renderInline('\\（図1）'), '\\（図1）')
    assert.strictEqual(
      md.renderInline('\\\\（図1）'),
      '\\（<span class="f-ref">図1</span>）',
    )

    const mdText = mdit({ html: false }).use(mdRendererInlineText, {
      figureReference: true,
    })
    assert.strictEqual(
      mdText.renderInline('<i title="(Figure 2)">x</i>'),
      '&lt;i title=&quot;(<span class="f-ref">Figure 2</span>)&quot;&gt;x&lt;/i&gt;',
    )
  }

  // The shared preparse chooses the earliest figure/comment candidate.
  {
    const md = mdit().use(mdRendererInlineText, {
      figureReference: true,
      starComment: true,
      percentComment: true,
    })
    assert.strictEqual(
      md.renderInline('前（図1）★注★後'),
      '前（<span class="f-ref">図1</span>）<span class="star-comment">★注★</span>後',
    )
    assert.strictEqual(
      md.renderInline('前★注★（図1）後'),
      '前<span class="star-comment">★注★</span>（<span class="f-ref">図1</span>）後',
    )
    assert.strictEqual(
      md.renderInline('前★（図1）★後'),
      '前<span class="star-comment">★（図1）★</span>後',
    )
    assert.strictEqual(
      md.renderInline('前%%（図1）%%後'),
      '前<span class="percent-comment">%%（図1）%%</span>後',
    )
    assert.strictEqual(
      md.renderInline('前（図A）%%注%%後'),
      '前（<span class="f-ref">図A</span>）<span class="percent-comment">%%注%%</span>後',
    )
    assert.strictEqual(
      md.renderInline('前%%注%%（図A）後'),
      '前<span class="percent-comment">%%注%%</span>（<span class="f-ref">図A</span>）後',
    )
    assert.strictEqual(
      md.renderInline('前★未完 （図1）後'),
      '前★未完 （<span class="f-ref">図1</span>）後',
    )
    assert.strictEqual(
      md.renderInline('前%%未完 （図A）後'),
      '前%%未完 （<span class="f-ref">図A</span>）後',
    )
  }

  // Figure-reference tokens remain balanced inside line/paragraph comment wrappers.
  {
    const mdLine = mdit().use(mdRendererInlineText, {
      figureReference: true,
      starComment: true,
      starCommentLine: true,
    })
    assert.strictEqual(
      mdLine.render('★参照（図1）'),
      '<p><span class="star-comment">★参照（<span class="f-ref">図1</span>）</span></p>\n',
    )

    const mdParagraphClass = mdit().use(mdRendererInlineText, {
      figureReference: true,
      percentComment: true,
      percentCommentParagraph: true,
      percentCommentParagraphClass: true,
    })
    assert.strictEqual(
      mdParagraphClass.render('%%See (Figure A.1)'),
      '<p class="percent-comment">%%See (<span class="f-ref">Figure A.1</span>)</p>\n',
    )
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
    assert.strictEqual(
      md.render('案内:<RUBY>寿司《すし》</RUBY>です。'),
      '<p>案内:<ruby>寿司<rp>《</rp><rt>すし</rt><rp>》</rp></ruby>です。</p>\n',
    )
    assert.strictEqual(
      md.render('案内:<RUBY>寿司《すし》です。'),
      '<p>案内:&lt;RUBY&gt;<ruby>寿司<rp>《</rp><rt>すし</rt><rp>》</rp></ruby>です。</p>\n',
    )
    assert.strictEqual(md.render('\\★x★'), '<p>★x★</p>\n')
    assert.strictEqual(md.render('\\%%x%%'), '<p>%%x%%</p>\n')
    assert.strictEqual(
      md.render('\uFDD0prefix ★x★ \uFDD2suffix %%y%%'),
      '<p>\uFDD0prefix <span class="star-comment">★x★</span> \uFDD2suffix <span class="percent-comment">%%y%%</span></p>\n',
    )
  }

  // html:true: inline ★/%% preparse is also enabled (marker-priority path)
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
      '<p>**前<span class="star-comment">★A**B★</span>後</p>\n',
    )
    assert.strictEqual(
      md.render('**前%%A**B%%後'),
      '<p>**前<span class="percent-comment">%%A**B%%</span>後</p>\n',
    )
    assert.strictEqual(
      md.render('前<span title="★x★ %%y%% 漢字《かんじ》">漢字《ほんぶん》</span>後'),
      '<p>前<span title="★x★ %%y%% 漢字《かんじ》"><ruby>漢字<rp>《</rp><rt>ほんぶん</rt><rp>》</rp></ruby></span>後</p>\n',
    )
    assert.strictEqual(
      md.render('案内:<RUBY>寿司《すし》</RUBY>です。'),
      '<p>案内:<RUBY>寿司<rp>《</rp><rt>すし</rt><rp>》</rp></RUBY>です。</p>\n',
    )
    assert.strictEqual(
      md.render('案内:<RUBY>寿司《すし》です。'),
      '<p>案内:<RUBY><ruby>寿司<rp>《</rp><rt>すし</rt><rp>》</rp></ruby>です。</p>\n',
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
      '<p><span class="star-comment">★**aaa**★</span></p>\n',
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
      '<p><span class="star-comment">★A%%B★</span>C%%</p>\n',
    )
    assert.strictEqual(
      md.render('%%A★B%%C★'),
      '<p><span class="percent-comment">%%A★B%%</span>C★</p>\n',
    )
  }

  // bracket/link scanning edge cases should stay stable (skipToken / silent path)
  {
    const md = mdit({ html: true }).use(mdRendererInlineText, {
      starComment: true,
      percentComment: true,
    })
    assert.strictEqual(
      md.render('a[★b★c'),
      '<p>a[<span class="star-comment">★b★</span>c</p>\n',
    )
    assert.strictEqual(
      md.render('a[%%b%%c'),
      '<p>a[<span class="percent-comment">%%b%%</span>c</p>\n',
    )
    assert.strictEqual(
      md.render('[x★y★](https://example.com)'),
      '<p><a href="https://example.com">x<span class="star-comment">★y★</span></a></p>\n',
    )
    assert.strictEqual(
      md.render('[x%%y%%](https://example.com)'),
      '<p><a href="https://example.com">x<span class="percent-comment">%%y%%</span></a></p>\n',
    )
    assert.strictEqual(
      md.render('%%a\\%%%b%%'),
      '<p><span class="percent-comment">%%a\\%%%</span>b%%</p>\n',
    )
  }

  // html:true with markdown-it-strong-ja: marker-priority output should stay stable
  {
    const mdStrongJaFirst = mdit({ html: true })
      .use(strongJa)
      .use(mdRendererInlineText, { starComment: true, percentComment: true, figureReference: true })
    assert.strictEqual(
      mdStrongJaFirst.render('**前★A**B★後'),
      '<p>**前<span class="star-comment">★A**B★</span>後</p>\n',
    )
    assert.strictEqual(
      mdStrongJaFirst.render('★**重大変更**★'),
      '<p><span class="star-comment">★**重大変更**★</span></p>\n',
    )
    assert.strictEqual(
      mdStrongJaFirst.render('**（図A.1）**'),
      '<p><strong>（<span class="f-ref">図A.1</span>）</strong></p>\n',
    )

    const mdStrongJaLast = mdit({ html: true })
      .use(mdRendererInlineText, { starComment: true, percentComment: true, figureReference: true })
      .use(strongJa)
    assert.strictEqual(
      mdStrongJaLast.render('**前★A**B★後'),
      '<p>**前<span class="star-comment">★A**B★</span>後</p>\n',
    )
    assert.strictEqual(
      mdStrongJaLast.render('**（図A.1）**'),
      '<p><strong>（<span class="f-ref">図A.1</span>）</strong></p>\n',
    )
  }

  // The core order guard supports cjk-breaks on either side of this plugin.
  {
    const option = {
      ruby: true,
      starComment: true,
      starCommentLine: true,
      percentComment: true,
      percentCommentLine: true,
      figureReference: true,
    }
    const src = '★注記です。\n通常です。（図A.1）'
    const pluginFirst = mdit().use(mdRendererInlineText, option).use(cjkBreaks, { either: true })
    const cjkFirst = mdit().use(cjkBreaks, { either: true }).use(mdRendererInlineText, option)
    assert.strictEqual(pluginFirst.render(src), cjkFirst.render(src))
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

  // Mixed star/percent line modes share one logical-line scan so deleting one
  // line cannot erase the break boundary needed to classify the next line.
  {
    const mdBothDelete = mdit().use(mdRendererInlineText, {
      starComment: true,
      starCommentLine: true,
      starCommentDelete: true,
      percentComment: true,
      percentCommentLine: true,
      percentCommentDelete: true,
    })
    assert.strictEqual(mdBothDelete.render('★star\n%%percent'), '')
    assert.strictEqual(mdBothDelete.render('%%percent\n★star'), '')
    assert.strictEqual(
      mdBothDelete.render('通常\n★star\n%%percent'),
      '<p>通常</p>\n',
    )

    const mdStarDelete = mdit().use(mdRendererInlineText, {
      starComment: true,
      starCommentLine: true,
      starCommentDelete: true,
      percentComment: true,
      percentCommentLine: true,
    })
    assert.strictEqual(
      mdStarDelete.render('★star\n%%percent'),
      '<p><span class="percent-comment">%%percent</span></p>\n',
    )
  }

  // Ignored block lines are indexed as ranges; markers in code stay untouched.
  {
    const fenceBody = Array.from({ length: 200 }, (_, idx) => `code ${idx} ★x★ %%y%%`).join('\n')
    const src = `\`\`\`text\n${fenceBody}\n\`\`\`\n\n★line comment`
    const md = mdit().use(mdRendererInlineText, {
      starComment: true,
      starCommentLine: true,
      percentComment: true,
      percentCommentLine: true,
    })
    const html = md.render(src)
    assert.ok(html.includes('code 0 ★x★ %%y%%'))
    assert.ok(html.includes('code 199 ★x★ %%y%%'))
    assert.ok(html.endsWith('<p><span class="star-comment">★line comment</span></p>\n'))
  }

  // paragraph delete after a previous list item must not jump back to that list item
  {
    const src = [
      '# タイトル',
      '',
      '本文。',
      '',
      '- [source](https://example.com)',
      '',
      '本文。',
      '',
      '---',
      '',
      '★以下ソース★',
      '',
      '- source item',
      '  - https://example.com',
      '',
    ].join('\n')
    const md = mdit({ html: true }).use(mdRendererInlineText, {
      starComment: true,
      starCommentDelete: true,
      starCommentParagraph: true,
      starCommentLine: false,
    })
    assert.strictEqual(
      md.render(src),
      '<h1>タイトル</h1>\n'
        + '<p>本文。</p>\n'
        + '<ul>\n'
        + '<li><a href="https://example.com">source</a></li>\n'
        + '</ul>\n'
        + '<p>本文。</p>\n'
        + '<hr>\n'
        + '\n'
        + '<ul>\n'
        + '<li>source item\n'
        + '<ul>\n'
        + '<li>https://example.com</li>\n'
        + '</ul>\n'
        + '</li>\n'
        + '</ul>\n',
    )
  }

  // percent paragraph delete shares the same list-boundary guard
  {
    const src = [
      '- [source](https://example.com)',
      '',
      '---',
      '',
      '%%sources%%',
      '',
      '- source item',
      '',
    ].join('\n')
    const md = mdit({ html: true }).use(mdRendererInlineText, {
      percentComment: true,
      percentCommentDelete: true,
      percentCommentParagraph: true,
      percentCommentLine: false,
    })
    assert.strictEqual(
      md.render(src),
      '<ul>\n'
        + '<li><a href="https://example.com">source</a></li>\n'
        + '</ul>\n'
        + '<hr>\n'
        + '\n'
        + '<ul>\n'
        + '<li>source item</li>\n'
        + '</ul>\n',
    )
  }

  // later core rules may blank inline.content; line-mode fallback must still inspect children
  {
    const md = mdit().use(mdRendererInlineText, {
      starComment: true,
      starCommentLine: true,
      percentComment: true,
      percentCommentLine: true,
    })
    md.core.ruler.after('inline', 'blank_inline_content_for_test', (state) => {
      const tokens = state.tokens || []
      for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i]
        if (token && token.type === 'inline' && token.children && token.children.length) {
          token.content = ''
        }
      }
    })
    assert.strictEqual(
      md.render('★line\n%%note'),
      '<p><span class="star-comment">★line</span>\n<span class="percent-comment">%%note</span></p>\n',
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

    const mdStarParagraphClassTrimFallback = mdit().use(mdRendererInlineText, {
      starComment: true,
      starCommentParagraph: true,
      starCommentParagraphClass: '   ',
    })
    assert.strictEqual(
      mdStarParagraphClassTrimFallback.render('★本日は売り切れ次第終了です。'),
      '<p class="star-comment">★本日は売り切れ次第終了です。</p>\n',
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

  // paragraph class must not affect non-paragraph modes
  {
    const mdStarInlineOnly = mdit().use(mdRendererInlineText, {
      starComment: true,
      starCommentParagraph: false,
      starCommentParagraphClass: 'inline-ignored',
    })
    assert.strictEqual(
      mdStarInlineOnly.render('前★注記★後'),
      '<p>前<span class="star-comment">★注記★</span>後</p>\n',
    )

    const mdPercentLineWins = mdit().use(mdRendererInlineText, {
      percentComment: true,
      percentCommentLine: true,
      percentCommentParagraph: true,
      percentCommentParagraphClass: 'paragraph-ignored',
      percentClass: 'service-note',
    })
    assert.strictEqual(
      mdPercentLineWins.render('%%line\n通常'),
      '<p><span class="service-note">%%line</span>\n通常</p>\n',
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

  // plugin installation is first-use-wins on the same markdown-it instance
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
    assert.strictEqual(mdReuse.render('前★星★後'), '<p>前<span class="star-comment">★星★</span>後</p>\n')

    mdReuse.use(mdRendererInlineText, {
      starComment: false,
      percentComment: true,
    })
    assert.strictEqual(mdReuse.render('前★星★後'), '<p>前<span class="star-comment">★星★</span>後</p>\n')
    assert.strictEqual(mdReuse.render('前%%P%%後'), '<p>前<span class="percent-comment">%%P%%</span>後</p>\n')
    assert.strictEqual(
      mdReuse.inline.ruler.__rules__.filter((rule) => rule.name === 'star_percent_comment_preparse').length,
      1,
    )
    assert.strictEqual(
      mdReuse.core.ruler.__rules__.filter((rule) => rule.name === 'inline_ruler_convert').length,
      1,
    )
  }

  // The closure-local compiled runner cache varies only by the current HTML mode.
  {
    const md = mdit({ html: false }).use(mdRendererInlineText, {
      ruby: true,
      starComment: true,
    })
    const src = '前★<b>x</b>★後 漢字《かんじ》'
    const escaped = '前<span class="star-comment">★&lt;b&gt;x&lt;/b&gt;★</span>後 '
      + '<ruby>漢字<rp>《</rp><rt>かんじ</rt><rp>》</rp></ruby>'
    const raw = '前<span class="star-comment">★<b>x</b>★</span>後 '
      + '<ruby>漢字<rp>《</rp><rt>かんじ</rt><rp>》</rp></ruby>'
    assert.strictEqual(md.renderInline(src), escaped)
    md.options.html = true
    assert.strictEqual(md.renderInline(src), raw)
    md.options.html = false
    assert.strictEqual(md.renderInline(src), escaped)
  }

  // The shared preparse is installed for inline comments or figure references.
  {
    const mdStarLineOnly = mdit().use(mdRendererInlineText, {
      starComment: true,
      starCommentLine: true,
    })
    assert.strictEqual(
      mdStarLineOnly.inline.ruler.__rules__.filter((rule) => rule.name === 'star_percent_comment_preparse').length,
      0,
    )

    const mdStarParagraphOnly = mdit().use(mdRendererInlineText, {
      starComment: true,
      starCommentParagraph: true,
    })
    assert.strictEqual(
      mdStarParagraphOnly.inline.ruler.__rules__.filter((rule) => rule.name === 'star_percent_comment_preparse').length,
      0,
    )

    const mdPercentLineOnly = mdit().use(mdRendererInlineText, {
      percentComment: true,
      percentCommentLine: true,
    })
    assert.strictEqual(
      mdPercentLineOnly.inline.ruler.__rules__.filter((rule) => rule.name === 'star_percent_comment_preparse').length,
      0,
    )

    const mdInlinePair = mdit().use(mdRendererInlineText, {
      starComment: true,
      percentComment: true,
    })
    assert.strictEqual(
      mdInlinePair.inline.ruler.__rules__.filter((rule) => rule.name === 'star_percent_comment_preparse').length,
      1,
    )

    const mdFigureOnly = mdit().use(mdRendererInlineText, {
      figureReference: true,
    })
    assert.strictEqual(
      mdFigureOnly.inline.ruler.__rules__.filter((rule) => rule.name === 'star_percent_comment_preparse').length,
      1,
    )
    assert.strictEqual(
      mdFigureOnly.inline.ruler.__rules__.filter((rule) => rule.name === 'star_percent_escape_meta').length,
      0,
    )
    assert.strictEqual(
      mdFigureOnly.core.ruler.__rules__.filter((rule) => rule.name === 'inline_ruler_convert').length,
      0,
    )
  }

  // option independence should hold in html:true and html:false
  {
    const mdStarOffHtmlTrue = mdit({ html: true }).use(mdRendererInlineText, {
      starComment: false,
      percentComment: true,
    })
    assert.strictEqual(
      mdStarOffHtmlTrue.render('前★星★後%%P%%'),
      '<p>前★星★後<span class="percent-comment">%%P%%</span></p>\n',
    )

    const mdPercentOffHtmlTrue = mdit({ html: true }).use(mdRendererInlineText, {
      starComment: true,
      percentComment: false,
    })
    assert.strictEqual(
      mdPercentOffHtmlTrue.render('前★星★後%%P%%'),
      '<p>前<span class="star-comment">★星★</span>後%%P%%</p>\n',
    )

    const mdStarOffHtmlFalse = mdit().use(mdRendererInlineText, {
      starComment: false,
      percentComment: true,
    })
    assert.strictEqual(
      mdStarOffHtmlFalse.render('前★星★後%%P%%'),
      '<p>前★星★後<span class="percent-comment">%%P%%</span></p>\n',
    )

    const mdPercentOffHtmlFalse = mdit().use(mdRendererInlineText, {
      starComment: true,
      percentComment: false,
    })
    assert.strictEqual(
      mdPercentOffHtmlFalse.render('前★星★後%%P%%'),
      '<p>前<span class="star-comment">★星★</span>後%%P%%</p>\n',
    )
  }
}
