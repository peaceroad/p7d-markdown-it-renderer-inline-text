# p7d-markdown-it-renderer-inline-text

A markdown-it plugin. This plugin modify inline text of rendering HTML:

- Ruby (漢字《かんじ》)
- Star comment (`★コメント★`)
- Percent comment (`%% Comment %%`)

## Install

```samp
npm i @peaceroad/markdown-it-renderer-inline-text
```

This package is ESM (`"type": "module"`).

## Ruby

- Match: `(<ruby>)?([\p{sc=Han}0-9A-Za-z.\-_]+)《([^》]+?)》(<\/ruby>)?/u`
- Replace: `<ruby>$2<rp>《</rp><rt>$3</rt><rp>》</rp></ruby>`

### Use

```js
import MarkdownIt from 'markdown-it'
import mditRendererInlineText from '@peaceroad/markdown-it-renderer-inline-text'

const md = MarkdownIt({ html: true }).use(mditRendererInlineText, { ruby: true })

console.log(md.render('この環境では超電磁砲《レールガン》を変換できます。'))
//<p>この環境では<ruby>超電磁砲<rp>《</rp><rt>レールガン</rt><rp>》</rp></ruby>を変換できます。</p>

console.log(md.render('ここには高出力<ruby>超電磁砲《レールガン》</ruby>が装備されています。'))
//<p>ここには高出力<ruby>超電磁砲<rp>《</rp><rt>レールガン</rt><rp>》</rp></ruby>が装備されています。</p>
```

Notice. With `html: false`, raw HTML-like input is escaped by markdown-it, but ruby markers are still converted in text (including inputs like `<ruby>漢字《かんじ》</ruby>`).

With `html: true`, ruby conversion applies to HTML text nodes (between tags). Tag internals such as attribute values are left untouched.

Ruby marker conversion targets the base-text class in the regex above. If your base includes spaces/kana/symbols, write full ruby HTML explicitly:

```js
const md = MarkdownIt({ html: true }).use(mditRendererInlineText, { ruby: true })

console.log(md.render('語句: <ruby>かな 混在<rp>(</rp><rt>かなこんざい</rt><rp>)</rp></ruby>'))
//<p>語句: <ruby>かな 混在<rp>(</rp><rt>かなこんざい</rt><rp>)</rp></ruby></p>
```

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

With `html: true`, ★ comments in HTML text nodes (between tags) are converted by default. Attribute values are not rewritten.

### Basic use

```js
import MarkdownIt from 'markdown-it'
import mditRendererInlineText from '@peaceroad/markdown-it-renderer-inline-text'

const md = MarkdownIt().use(mditRendererInlineText, {
  starComment: true,
})

console.log(md.render('文章中の★スターコメント★は処理されます。'))
//<p>文章中の<span class="star-comment">★スターコメント★</span>は処理されます。</p>

console.log(md.render('スターは\★と書けばコメント扱いされません★。'))
//<p>スターは★と書けばコメント扱いされません★。</p>
```

Inline HTML such as `<span>★…★</span>` is converted in text nodes by default when `html: true`, while tag attributes stay untouched.

When `starComment` and `ruby` are both enabled, ruby conversion intentionally runs only outside `★...★` spans.

```js
import MarkdownIt from 'markdown-it'
import mditRendererInlineText from '@peaceroad/markdown-it-renderer-inline-text'

const md = MarkdownIt({ html: true }).use(mditRendererInlineText, {
  starComment: true,
  ruby: true,
})

console.log(md.render('段落内の<span class="note">★スターコメント★</span>も対象です。'))
//<p>段落内の<span class="note"><span class="star-comment">★スターコメント★</span></span>も対象です。</p>

console.log(md.render('<p>HTMLブロック内★スターコメント★。漢字《かんじ》</p>'))
//<p>HTMLブロック内<span class="star-comment">★スターコメント★</span>。<ruby>漢字<rp>《</rp><rt>かんじ</rt><rp>》</rp></ruby></p>
```

`starCommentDelete` also works inside HTML text nodes, so inline HTML spans or block-level HTML snippets containing ★ comments disappear when deletion mode is enabled.

For safety, raw-text HTML elements (`script`, `style`, `textarea`, `title`) are never rewritten.

### Paragraph comments (`starCommentParagraph`)

```js
import MarkdownIt from 'markdown-it'
import mdRendererInlineText from '@peaceroad/markdown-it-renderer-inline-text'

const md = MarkdownIt().use(mdRendererInlineText, {
  starComment: true,
  starCommentParagraph: true,
})

console.log(md.render('文章中の★スターコメント★は処理されます。'))
//<p>文章中の<span class="star-comment">★スターコメント★</span>は処理されます。</p>
console.log(md.render('★文頭にスターがあるとその段落をコメント段落として処理します。'))
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
import MarkdownIt from 'markdown-it'
import mdRendererInlineText from '@peaceroad/markdown-it-renderer-inline-text'

const md = MarkdownIt().use(mdRendererInlineText, {
  starComment: true,
  starCommentParagraph: true,
  starCommentDelete: true,
})

console.log(md.render('文章中の★スターコメント★は処理されます。'))
//<p>文章中のは処理されます。</p>

console.log(md.render('★この段落はコメントとみなします。'))
// '' (Deleted paragraph element.)
```

Enable `starCommentLine: true` together with `starCommentDelete` when you want to drop entire ★ lines regardless of paragraph boundaries.
List items that begin with ★ are also removed when `starCommentParagraph` runs with `starCommentDelete`, so comment-only bullets don’t leave empty markers.
★ comments inside inline HTML (e.g. `<span>★…★</span>`) are removed as well when deletion is enabled.

## Percent Comment

Strings wrapped with `%%` become percent comments. `percentCommentDelete: true` removes only percent comments, while `starCommentDelete: true` removes only star comments. `percentComment: false` leaves the raw markers unchanged. Customize the span class with `percentClass` (default: `percent-comment`). With `html: true`, percent markers in HTML text nodes are converted by default (attributes are not rewritten).

Paragraph-level percent comments are supported when `percentCommentParagraph: true`; if a paragraph starts with `%%`, the whole paragraph body is wrapped (or removed when deletion flags are on). Line-level percent comments are supported when `percentCommentLine: true`; any editor line starting with `%%` is wrapped (or removed under delete flags). Paragraph mode is ignored when line mode is on.

```js
md().use(mdRendererInlineText, {
  starComment: true,
  percentComment: true,
})

md({ html: true }).use(mdRendererInlineText, {
  starComment: true,
  percentComment: true,
  percentCommentDelete: true, // removes only %%...%%
})

md().use(mdRendererInlineText, {
  starComment: true,
  starCommentDelete: true,
  percentComment: true,
})
// `starCommentDelete: true` removes only ★...★
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

[Markdown]
前%%コメント%%後
[HTML:starCommentDelete]
<p>前<span class="percent-comment">%%コメント%%</span>後</p>
```

## Compatibility

This plugin runs as a core rule after `text_join` / `cjk_breaks` and may rewrite `text` tokens to `html_inline` when it injects spans or escapes HTML. If you have post-processing plugins that expect raw `text` tokens, run them before this plugin or make them handle `html_inline`.

`starCommentLine` uses line breaks as they exist after core processing. Plugins that normalize or remove softbreaks (for example, `markdown-it-cjk-breaks-mod` in `either` or `normalizeSoftBreaks` mode) can merge lines, so a line that begins with ★ in the source may not be treated as a line comment after normalization.

Calling `.use(plugin, options)` again on the same `markdown-it` instance updates this plugin's active options; the conversion core rule is kept single-registered and reads the latest options from instance state.

With `html: false`, raw HTML from Markdown source is escaped even when this plugin injects inline wrappers (`★...★`, `%%...%%`, ruby tags). Ruby markers still convert in text, so `<ruby>漢字《かんじ》</ruby>` renders as escaped outer tags plus expanded ruby markup.

Behavior summary:

| markdown-it option | HTML text nodes (between tags) | Tag attributes | Raw-text tags (`script/style/textarea/title`) | Ruby inside `★...★` |
| --- | --- | --- | --- | --- |
| `html: false` | Source is treated as text; markers can convert, then `<` / `>` are escaped | N/A (tags are not parsed as HTML) | N/A (same reason) | Not converted inside star span; outside star can convert |
| `html: true` | Converted for ruby/★/%% when each option is enabled | Never rewritten | Preserved as-is | Not converted inside star span; outside star can convert |

Runtime requirements: modern engines are recommended, but the plugin now includes fallbacks for environments without regex lookbehind and without Unicode property escapes (ruby fallback uses BMP Han ranges).

Breaking change: `insideHtml` option was removed. Passing `insideHtml` now throws during plugin initialization.

## Testing and performance

- Run all fixtures: `npm test`
- Run the simple benchmark (env vars: `ITER`, `REPEAT`): `npm run perf`
- Run the inline-token benchmark (env vars: `ITER`, `REPEAT`, `REPEAT_HEAVY`): `node test/material/perf-inline-tokens.js`
