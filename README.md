# p7d-markdown-it-renderer-inline-text

A markdown-it plugin. This plugin modify inline text of rendering HTML:

- Ruby
- Star comment

## Install

```samp
npm i @peaceroad/markdown-it-renderer-inline-text
```

## Ruby

- Match: `/(<ruby>)?([\p{sc=Han}0-9A-Za-z.\-_]+)《([^》]+?)》(<\/ruby>)?/u`
- Convert: `<ruby>$2<rp>《</rp><rt>$3</rt><rp>》</rp></ruby>`

### Use

```js
import md from 'markdown-it'
import mdRendererInlineText from '@peaceroad/markdown-it-renderer-inline-text'

md({html: true}).use(mdRendererInlineText, {ruby: true})

console.log(md.render('この環境では超電磁砲《レールガン》を変換できます。');
//<p>この環境では<ruby>超電磁砲<rp>《</rp><rt>レールガン</rt><rp>》</rp></ruby>を変換できます。</p>

console.log(md.render('ここには高出力<ruby>超電磁砲《レールガン》</ruby>が装備されています。');
//<p>ここには高出力<ruby>超電磁砲<rp>《</rp><rt>レールガン</rt><rp>》</rp></ruby>が装備されています。</p>
```

Notice: If this program has not `html: true`,  output same HTML.

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

- Match: `/(?:^|(?<![^\\]\\))★(.*?)(?<![^\\]\\)★/`
- Convert: `<span class="star-comment">$1</span>`

### Use

```js
import md from 'markdown-it'
import mdRendererInlineText from '@peaceroad/markdown-it-renderer-inline-text'

md({html: true}).use(mdRendererInlineText, {starComment: true})

console.log(md.render('文章中の★スターコメント★は処理されます。');
//<p>文章中の<span class="star-comment">スターコメント</span>は処理されます。</p>
```

### Example

```
[Markdown]
文章中の★スターコメント★は処理されます。
[HTML]
<p>文章中の<span class="star-comment">スターコメント</span>は処理されます。</p>

[Markdown]
文章中の★スターコメント\★は処理されます。
[HTML]
<p>文章中の★スターコメント\★は処理されます。</p>
```
