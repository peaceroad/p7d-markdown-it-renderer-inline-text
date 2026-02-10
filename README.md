# p7d-markdown-it-renderer-inline-text

Inline text transform plugin for markdown-it.

It adds:

- Ruby conversion (`漢字《かんじ》`)
- Star comments (`★...★`)
- Percent comments (`%%...%%`)

## Quick Start

```js
import mdit from 'markdown-it'
import mditRendererInlineText from '@peaceroad/markdown-it-renderer-inline-text'

// Even with html:false, ruby/star/percent transforms work.
const md = mdit({ html: true }).use(mditRendererInlineText, {
  ruby: true,
  starComment: true,
  percentComment: true,
})

console.log(md.render('今夜は★カツ★カレーです。'))
// <p>今夜は<span class="star-comment">★カツ★</span>カレーです。</p>

console.log(md.render('今日は甘味処が%%午後%%休みです。'))
// <p>今日は甘味処が<span class="percent-comment">%%午後%%</span>休みです。</p>

console.log(md.render('昼食は親子丼《おやこどん》です。'))
// <p>昼食は<ruby>親子丼<rp>《</rp><rt>おやこどん</rt><rp>》</rp></ruby>です。</p>
```

## Ruby Syntax

Ruby conversion is based on:

- `(<ruby>)?([Han + 0-9A-Za-z._-]+)《reading》(<\/ruby>)?`

Examples:

```
Input: 寿司は職人《しょくにん》の技です。
Output: <p>寿司は<ruby>職人<rp>《</rp><rt>しょくにん</rt><rp>》</rp></ruby>の技です。</p>

Input: 商品名はRAMEN2025《らーめんにーぜろにーごー》です。
Output: <p>商品名は<ruby>RAMEN2025<rp>《</rp><rt>らーめんにーぜろにーごー</rt><rp>》</rp></ruby>です。</p>
```

When the base text has long kanji runs or includes hiragana/katakana, use explicit `<ruby>...</ruby>` for predictable wrapping:

```md
Input: お店の名物<ruby>鯛茶漬《たいちゃづけ》</ruby>を紹介します。
Output: <p>お店の名物<ruby>鯛茶漬<rp>《</rp><rt>たいちゃづけ</rt><rp>》</rp></ruby>を紹介します。</p>
```

Ruby shorthand conversion works in both `html:true` and `html:false`. With `html:false`, HTML-like input is generally escaped, while ruby shorthand and explicit `<ruby>...</ruby>` wrappers are still rendered as ruby HTML.

`html:false` example:

```md
Input:案内文：<ruby>寿司《すし》</ruby>を掲載します。
Output:<p>案内文：<ruby>寿司<rp>《</rp><rt>すし</rt><rp>》</rp></ruby>を掲載します。</p>
```

## ★ / %% Comment Syntax

Both syntaxes are pair-based markers:

- Star: `★...★` -> `<span class="star-comment">...</span>`
- Percent: `%%...%%` -> `<span class="percent-comment">...</span>` (or custom class)

Behavior summary (without examples):

- Pair matching is per marker type, so `★...★` and `%%...%%` are handled independently.
- Escaped markers (odd backslash parity) stay as plain text.
- In default span mode, matched ranges are wrapped and preserved in output.
- In delete mode, only the enabled marker type is removed from output.
- In inline mode, marker ranges are fixed by preparse before markdown inline formatting.

### Escape Markers

```md
Input:料理名は\★限定★ではありません。
Output:<p>料理名は★限定★ではありません。</p>

Input:今日の注記は\%%内輪%%ではありません。
Output:<p>今日の注記は%%内輪%%ではありません。</p>
```

### Span Element (Default)

Basic:

```
Input: 蕎麦は★売り切れ次第終了です。★美味しいです。
Output: <p>蕎麦は<span class="star-comment">★売り切れ次第終了です。★</span>美味しいです。</p>

Input: 喫茶店に%%季節限定の%%パフェがあります。
Output: <p>喫茶店に<span class="percent-comment">%%季節限定の%%</span>パフェがあります。</p>

Input: 今日は★**本日のおすすめ**の★ハンバーグを注文します。
Output: <p>今日は<span class="star-comment">★**本日のおすすめ**の★</span>ハンバーグを注文します。</p>
```

In `html:true`, inline HTML inside a marker range is kept as HTML:

```md
Input: メニューから★<span>だし</span>香る★うどんを選びます。
Output: <p>メニューから<span class="star-comment">★<span>だし</span>香る★</span>うどんを選びます。</p>
```

Marker priority is high in inline mode (`html:true` / `html:false`): markdown syntax inside marker ranges stays literal.

```
Input: **春★御膳**定★食を案内します。
Output: <p>**春<span class="star-comment">★御膳**定★</span>食を案内します。</p>
```

### Delete option

`starCommentDelete` and `percentCommentDelete` are independent:

- `starCommentDelete: true` removes only `★...★` ranges.
- `percentCommentDelete: true` removes only `%%...%%` ranges.

```js
const md = MarkdownIt().use(rendererInlineText, {
  starComment: true,
  starCommentDelete: true,
  percentComment: true,
  percentCommentDelete: true,
})

console.log(md.render('カレーのメインは%%海老%%鶏肉です。'))
// <p>カレーのメインは鶏肉です。</p>
console.log(md.render('カレーのメインは★あさり★マトンです。'))
// <p>カレーのメインはマトンです。</p>
```

### Line and Paragraph Mode

Line mode example:

Options:`{ starComment: true, starCommentLine: true }`

```md
Input:
通常案内
★売り切れ注意
通常案内
Output:<p>通常案内
<span class="star-comment">★売り切れ注意</span>
通常案内</p>
```

Percent comments follow the same line/paragraph behaviors with `percentCommentLine`, `percentCommentParagraph`, and `percentCommentParagraphClass`.

Paragraph mode example:

Options:`{ starComment: true, starCommentParagraph: true }`

```md
Input:★本日は売り切れ次第終了です。
Output:<p><span class="star-comment">★本日は売り切れ次第終了です。</span></p>
```

Paragraph-only class example:

Options:`{ starComment: true, starCommentParagraph: true, starCommentParagraphClass: true }`

```md
Input:★本日は売り切れ次第終了です。
Output:<p class="star-comment">★本日は売り切れ次第終了です。</p>
```

## Options

- `ruby` (default: `false`)
  Enable ruby conversion.

- `starComment` (default: `false`)
  Enable `★...★` comments.

- `starCommentDelete` (default: `false`)
  Delete star-comment spans instead of rendering them.

- `starCommentParagraph` (default: `false`)
  Paragraph mode for stars (paragraph starts with `★`).

- `starCommentLine` (default: `false`)
  Line mode for stars (editor line starts with `★`).

- `starCommentParagraphClass` (default: `false`)
  In star paragraph mode, add class to `<p>` and skip inner span wrapping. `true` uses `"star-comment"`, and a string uses that class name.

- `percentComment` (default: `false`)
  Enable `%%...%%` comments.

- `percentCommentDelete` (default: `false`)
  Delete percent-comment spans instead of rendering them.

- `percentCommentParagraph` (default: `false`)
  Paragraph mode for percents (paragraph starts with `%%`).

- `percentCommentLine` (default: `false`)
  Line mode for percents (editor line starts with `%%`).

- `percentCommentParagraphClass` (default: `false`)
  In percent paragraph mode, add class to `<p>` and skip inner span wrapping. `true` uses `percentClass`, and a string uses that class name.

- `percentClass` (default: `"percent-comment"`)
  CSS class for percent-comment spans.

Notes:

- If `starCommentLine` is `true`, `starCommentParagraph` is disabled.
- If `percentCommentLine` is `true`, `percentCommentParagraph` is disabled.
- `percentClass` is escaped via `md.utils.escapeHtml`.

## Notes

### Rule Details

- Escape parity rule:
  - Odd number of backslashes before marker: marker is escaped.
  - Even number: marker can participate in pairing.
- In inline mode (`html:true` / `html:false`), preparse handles star/percent pairs first.
- Markdown inline syntax inside a marker range is kept literal (for example, `★**bold**★`, `★\`code\`★`, `★[link](...)★`).
- Ruby conversion runs on text tokens; when marker preparse has already wrapped a range, ruby conversion does not rewrite inside that wrapped marker content.

### HTML Boundary Behavior

- With `html:true`, conversion targets markdown-it inline `text` tokens.
- Raw `html_block` token bodies are not rewritten by this plugin.
- HTML attributes are not rewritten.
- Raw-text elements are skipped: `script`, `style`, `textarea`, `title`.
- With `html:false`, HTML-like input is treated as text and escaped, but marker/ruby transforms still apply. Explicit `<ruby>...</ruby>` wrappers used with ruby shorthand are preserved.

Block/inline example:

```
Input: <div>店内に★売り切れ注意の★張り紙が貼ってあります。</div>
Output: <div>店内に★売り切れ注意の★張り紙が貼ってあります。</div>

Input:
<div>

店内に★売り切れ注意の★張り紙が貼ってあります。

</div>

Output:
<div>
<p>店内に<span class="star-comment">★売り切れ注意の★</span>張り紙が貼ってあります。</p>
</div>
```

### markdown-it Compatibility

- The plugin runs as a core rule and may rewrite `text` tokens to `html_inline`.
- If another plugin expects raw `text` only, run that plugin earlier or support `html_inline`.
- Designed to coexist with `text_join` / `cjk_breaks` by forcing conversion at the tail of core processing.
- Reusing `.use(plugin, options)` on the same markdown-it instance updates active options.

## Install

```bash
npm i @peaceroad/markdown-it-renderer-inline-text
```

This package is ESM (`"type": "module"`).
