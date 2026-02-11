import assert from 'assert'

export const runOptionAssertions = ({ mdit, strongJa, mdRendererInlineText }) => {
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
  }

  // html:true with markdown-it-strong-ja: marker-priority output should stay stable
  {
    const mdStrongJaFirst = mdit({ html: true })
      .use(strongJa)
      .use(mdRendererInlineText, { starComment: true, percentComment: true })
    assert.strictEqual(
      mdStrongJaFirst.render('**前★A**B★後'),
      '<p>**前<span class="star-comment">★A**B★</span>後</p>\n',
    )
    assert.strictEqual(
      mdStrongJaFirst.render('★**重大変更**★'),
      '<p><span class="star-comment">★**重大変更**★</span></p>\n',
    )

    const mdStrongJaLast = mdit({ html: true })
      .use(mdRendererInlineText, { starComment: true, percentComment: true })
      .use(strongJa)
    assert.strictEqual(
      mdStrongJaLast.render('**前★A**B★後'),
      '<p>**前<span class="star-comment">★A**B★</span>後</p>\n',
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
