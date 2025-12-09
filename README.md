# p7d-markdown-it-renderer-inline-text

A markdown-it plugin. This plugin modify inline text of rendering HTML:

- Ruby
- Star comment

## Install

```samp
npm i @peaceroad/markdown-it-renderer-inline-text
```

## Ruby

- Match: `(<ruby>)?([\p{sc=Han}0-9A-Za-z.\-_]+)《([^》]+?)》(<\/ruby>)?/u`
- Replace: `<ruby>$2<rp>《</rp><rt>$3</rt><rp>》</rp></ruby>`

### Use

```js
const md = require('markdown-it')
const mdRendererInlineText = require('@peaceroad/markdown-it-renderer-inline-text')

md({html: true}).use(mdRendererInlineText, {ruby: true})

console.log(md.render('この環境では超電磁砲《レールガン》を変換できます。');
//<p>この環境では<ruby>超電磁砲<rp>《</rp><rt>レールガン</rt><rp>》</rp></ruby>を変換できます。</p>

console.log(md.render('ここには高出力<ruby>超電磁砲《レールガン》</ruby>が装備されています。');
//<p>ここには高出力<ruby>超電磁砲<rp>《</rp><rt>レールガン</rt><rp>》</rp></ruby>が装備されています。</p>
```

Notice. If this program has not `html: true`,  output same HTML.

### Example

```
[Markdown]
この環境では超電磁砲《レールガン》を変換できます。
[HTML]
<p>この環境では<ruby>超電磁砲<rp>《</rp><rt>レールガン</rt><rp>》</rp></ruby>を変換できます。</p>

[Markdown]
ここには高出力<ruby>超電磁砲《レールガン》</ruby>が装備されています。
[HTML]
<p>ここには高出力<ruby>超電磁砲<rp>《</rp><rt>レールガン</rt><rp>》</rp></ruby>が装備されています。</p>

[Markdown]
CSSはW3C《だぶるさんしー》は策定しています。
[HTML]
<p>CSSは<ruby>W3C<rp>《</rp><rt>だぶるさんしー</rt><rp>》</rp></ruby>は策定しています。</p>

[Markdown]
CSSは非営利団体<ruby>W3C《だぶるさんしー》</ruby>は策定しています。
[HTML]
<p>CSSは非営利団体<ruby>W3C<rp>《</rp><rt>だぶるさんしー</rt><rp>》</rp></ruby>は策定しています。</p>
```

## Star Comment

The following string is considered a comment.

- There is a ★ at the beginning of the paragraph line.
- Strings surrounded by ★
- Replace: `<span class="star-comment">$1</span>`

Enable `starCommentHtml: true` (requires `md({ html: true })`) when you also want ★ comments that live inside inline HTML tags or HTML block tokens to be converted.

### Basic use

```js
const md = require('markdown-it')
const mdRendererInlineText = require('@peaceroad/markdown-it-renderer-inline-text')

md().use(mdRendererInlineText, {
  starComment: true,
})

console.log(md.render('文章中の★スターコメント★は処理されます。'))
//<p>文章中の<span class="star-comment">★スターコメント★</span>は処理されます。</p>

console.log(md.render('スターは\★と書けばコメント扱いされません★。'))
//<p>スターは★と書けばコメント扱いされません★。</p>
```

Inline HTML such as `<span>★…★</span>` is ignored by default so you can safely mix handwritten markup. Enable `starCommentHtml: true` (with `md({ html: true })`) when you also want ★ comments that live inside inline HTML tags to be converted.

### HTML inside inline tags (`starCommentHtml`)

```js
const md = require('markdown-it')
const mdRendererInlineText = require('@peaceroad/markdown-it-renderer-inline-text')

md({html: true}).use(mdRendererInlineText, {
  starComment: true,
  starCommentHtml: true,
})

console.log(md.render('段落内の<span class="note">★スターコメント★</span>も対象です。'))
//<p>段落内の<span class="note"><span class="star-comment">★スターコメント★</span></span>も対象です。</p>

console.log(md.render('<p>HTMLブロック内★スターコメント★</p>'))
//<p>HTMLブロック内<span class="star-comment">★スターコメント★</span></p>
```

`starCommentHtml` also honors `starCommentDelete`, so inline HTML spans or block-level HTML snippets containing ★ comments disappear when deletion mode is enabled.

### Paragraph comments (`starCommentParagraph`)

```js
const md = require('markdown-it')
const mdRendererInlineText = require('@peaceroad/markdown-it-renderer-inline-text')

md().use(mdRendererInlineText, {
  starComment: true,
  starCommentParagraph: true,
})

console.log(md.render('文章中の★スターコメント★は処理されます。');
//<p>文章中の<span class="star-comment">★スターコメント★</span>は処理されます。</p>
console.log(md.render('★文頭にスターがあるとその段落をコメント段落として処理します。');
//<p>文章中の<span class="star-comment">★文頭にスターがあるとその段落をコメント段落として処理します。</span></p>
```

### Line comments (`starCommentLine`)

`starCommentLine` treats every editor line that begins with ★ as a star comment, even if the paragraph continues on other lines. Lines rendered inside fenced code blocks or math blocks are ignored so snippets remain untouched. Combine it with `starCommentDelete` when you want to strip those lines entirely.

```js
md().use(mdRendererInlineText, {
  starComment: true,
  starCommentLine: true,
})
```

```
[Markdown]
この行は通常行です。
★この行はスターコメント行です。
この行は通常行です。
[HTML]
<p>この行は通常行です。この行は通常行です。</p>
```

### Escaping ★

By using `\` before ★, it will be converted without making it a comment. However, if two or more `\` characters are used in succession, they will be converted differently from the Markdown specifications (for now). Details are below.

```
[Markdown]
文章中★のスターコメント\★は処理されます。
[HTML]
<p>文章中★のスターコメント★は処理されます。</p>

[Markdown]
文章中★のスターコメント\\★は処理されます。
[HTML]
<p>文章中★のスターコメント★は処理されます。</p>

[Markdown]
文章中★のスターコメント\\\★は処理されます。
[HTML]
<p>文章中<span class="star-comment">★のスターコメント\\★</span>は処理されます。</p>
```

### Delete star comment

Delete star comment output entirely.

```js
const md = require('markdown-it')
const mdRendererInlineText = require('@peaceroad/markdown-it-renderer-inline-text')

md().use(mdRendererInlineText, {
  starComment: true,
  starCommentParagraph: true,
  starCommentDelete: true,
})

console.log(md.render('文章中の★スターコメント★は処理されます。')
//<p>文章中のは処理されます。</p>

console.log(md.render('★この段落はコメントとみなします。')
// '' (Deleted paragraph element.)
```

Enable `starCommentLine: true` together with `starCommentDelete` when you want to drop entire ★ lines regardless of paragraph boundaries.
List items that begin with ★ are also removed when `starCommentParagraph` runs with `starCommentDelete`, so comment-only bullets don’t leave empty markers.
`starCommentHtml: true` works together with `starCommentDelete`, so ★ comments inside inline HTML (e.g. `<span>★…★</span>`) are removed as well when deletion is enabled.
```
