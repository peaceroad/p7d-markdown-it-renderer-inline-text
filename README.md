# p7d-markdown-it-renderer-inline-text

A markdown-it plugin. This plugin modify inline text of rendering HTML:

- Ruby (漢字《かんじ》)
- Star comment (`★コメント★`)
- Percent comment (`%% Comment %%`)

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
const mditRendererInlineText = require('@peaceroad/markdown-it-renderer-inline-text')

md({html: true}).use(mditRendererInlineText, {ruby: true})

console.log(md.render('この環境では超電磁砲《レールガン》を変換できます。');
//<p>この環境では<ruby>超電磁砲<rp>《</rp><rt>レールガン</rt><rp>》</rp></ruby>を変換できます。</p>

console.log(md.render('ここには高出力<ruby>超電磁砲《レールガン》</ruby>が装備されています。');
//<p>ここには高出力<ruby>超電磁砲<rp>《</rp><rt>レールガン</rt><rp>》</rp></ruby>が装備されています。</p>
```

Notice. If markdown-it is not created with `html: true`, the renderer never hands HTML tokens to this plugin, so the output stays unchanged.

When you _do_ render HTML, set `insideHtml: true` yourself or just pass `{ html: true }` into the plugin options; the plugin automatically flips `insideHtml` on in that case so ruby markers that live inside raw HTML tokens are converted without extra configuration.

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

Enable `insideHtml: true` yourself, or rely on the automatic toggle that happens whenever you pass `{ html: true }` to the plugin options, when you also want ★ comments or ruby markers that live inside inline HTML tags or HTML block tokens to be converted.

### Basic use

```js
const md = require('markdown-it')
const mditRendererInlineText = require('@peaceroad/markdown-it-renderer-inline-text')

md().use(mdRendererInlineText, {
  starComment: true,
})

console.log(md.render('文章中の★スターコメント★は処理されます。'))
//<p>文章中の<span class="star-comment">★スターコメント★</span>は処理されます。</p>

console.log(md.render('スターは\★と書けばコメント扱いされません★。'))
//<p>スターは★と書けばコメント扱いされません★。</p>
```

Inline HTML such as `<span>★…★</span>` is ignored by default so you can safely mix handwritten markup. Enable `insideHtml: true` (with `md({ html: true })`), or simply pass `{ html: true }` to the plugin options (which automatically flips `insideHtml`) when you also want ★ comments or ruby markers that live inside inline HTML tags to be converted.

```js
const md = require('markdown-it')
const mditRendererInlineText = require('@peaceroad/markdown-it-renderer-inline-text')

md({html: true}).use(mditRendererInlineText, {
  starComment: true,
  ruby: true,
})

console.log(md.render('段落内の<span class="note">★スターコメント★</span>も対象です。'))
//<p>段落内の<span class="note"><span class="star-comment">★スターコメント★</span></span>も対象です。</p>

console.log(md.render('<p>HTMLブロック内★スターコメント★。漢字《かんじ》</p>'))
//<p>HTMLブロック内<span class="star-comment">★スターコメント★</span>。<ruby>漢字<rp>《</rp><rt>かんじ</rt><rp>》</rp></ruby></p>
```

Because `{ html: true }` in the plugin options automatically enables `insideHtml`, you only need to set `insideHtml: true` manually if you run the plugin without html mode globally and still want inline HTML rewrites inside fenced snippets.

`insideHtml` also honors `starCommentDelete`, so inline HTML spans or block-level HTML snippets containing ★ comments disappear when deletion mode is enabled, and ruby markers that live inside those HTML fragments are still converted.

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

When `starCommentLine` and `starCommentParagraph` are both enabled, line comments take precedence and paragraph comment mode is ignored.

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

Backslash escaping now mirrors Markdown: an odd number of `\` characters directly before ★ escapes it (one backslash is consumed), and an even number keeps the comment active while collapsing pairs of backslashes. `%` comment markers (`%%`) follow the same rules when enabled.

Escape handling is captured during inline parsing before markdown-it's own escape rule runs, and backslash runs are cached per text token so counting escapes stays fast even on long lines.

```
[Markdown]
文章中★のスターコメント\★は処理されます。
[HTML]
<p>文章中★のスターコメント★は処理されます。</p>

[Markdown]
文章中★のスターコメント\\★は処理されます。
[HTML]
<p>文章中<span class="star-comment">★のスターコメント\★</span>は処理されます。</p>

[Markdown]
文章中★のスターコメント\\\★は処理されます。
[HTML]
<p>文章中★のスターコメント\★は処理されます。</p>
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
`insideHtml: true` works together with `starCommentDelete`, so ★ comments inside inline HTML (e.g. `<span>★…★</span>`) are removed as well when deletion is enabled.

## Percent Comment

Strings wrapped with `%%` become percent comments. They share the deletion flag with star comments: `percentCommentDelete: true` or `starCommentDelete: true` removes the wrapped text entirely, while `percentComment: false` leaves the raw markers unchanged. Customize the span class with `percentClass` (default: `percent-comment`). Inside inline HTML, percent markers are ignored unless `insideHtml` is on (set automatically when the plugin option includes `{ html: true }`).

Paragraph-level percent comments are supported when `percentCommentParagraph: true`; if a paragraph starts with `%%`, the whole paragraph body is wrapped (or removed when deletion flags are on). Line-level percent comments are supported when `percentCommentLine: true`; any editor line starting with `%%` is wrapped (or removed under delete flags). Paragraph mode is ignored when line mode is on.

```js
md().use(mdRendererInlineText, {
  starComment: true,
  percentComment: true,
})

md({ html: true }).use(mdRendererInlineText, {
  starComment: true,
  percentComment: true,
  percentCommentDelete: true, // also triggered by starCommentDelete
})
```

Example:

```
[Markdown]
前%%コメント%%後
[HTML]
<p>前<span class="percent-comment">%%コメント%%</span>後</p>

[Markdown]
前%%コメント%%後
[HTML:delete]
<p>前後</p>
```

## Testing and performance

- Run all fixtures: `npm test`
- Run the simple benchmark (env vars: `ITER`, `REPEAT`): `npm run perf`
