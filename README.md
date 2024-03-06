# p7d-markdown-it-renderer-inline-text

A markdown-it plugin. This plugin modify inline text of rendering HTML:

- Ruby
- Star comment

## Install

```samp
npm i @peaceroad/markdown-it-renderer-inline-text
```

## Ruby

- Match: `(<ruby>)?([\\p{sc=Han}0-9A-Za-z.\\-_]+)《([^》]+?)》(<\/ruby>)?'/u`
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

### Use

```js
const md = require('markdown-it')
const mdRendererInlineText = require('@peaceroad/markdown-it-renderer-inline-text')

md().use(mdRendererInlineText, {
  starComment: true,
  starCommentLine: true,
})

console.log(md.render('文章中の★スターコメント★は処理されます。');
//<p>文章中の<span class="star-comment">★スターコメント★</span>は処理されます。</p>
console.log(md.render('★文頭にスターがあるとその段落をコメント段落として処理します。');
//<p>文章中の<span class="star-comment">★文頭にスターがあるとその段落をコメント段落として処理します。</span></p>
```

Notice. If this program has `html: true`,  output basically the same HTML.

### Example

```
[Markdown]
文章中の★スターコメント★は処理されます。
[HTML]
<p>文章中の<span class="star-comment">★スターコメント★</span>は処理されます。</p>

[Markdown]
★この段落はコメントとみなします。
[HTML]
<p><span class="star-comment">★この段落はコメントとみなします。</span></p>
```

Notice. By using `\` before ★, it will be converted without making it a comment. However, if two or more `\` characters are used in succession, they will be converted differently from the Markdown specifications (for now). Details are below.

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

### Option

Delete star comment.

```js
const md = require('markdown-it')
const mdRendererInlineText = require('@peaceroad/markdown-it-renderer-inline-text')

md().use(mdRendererInlineText, {
  starComment: true,
  starCommentLine: true,
  starCommentDelete: true,
})

console.log(md.render('文章中の★スターコメント★は処理されます。')
//<p>文章中のは処理されます。</p>

console.log(md.render('★この段落はコメントとみなします。')
//<p><span class="star-comment-line"></span></p>
```
