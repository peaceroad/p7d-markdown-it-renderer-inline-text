# Agents Notes for p7d-markdown-it-renderer-inlines

## Plugin wiring
- `rendererInlineText` merges options once per `markdown-it` instance; passing `{ html: true }` into the plugin options flips `insideHtml` on automatically.
- `starCommentLine` overrides `starCommentParagraph` (paragraph mode is disabled when line mode is enabled).
- Hooks are patched once per instance:
  - `md.renderer.rules.text` is replaced by `convertInlineText`.
  - `md.core.ruler.after('inline', 'star_comment_line_marker', ...)` runs when `starCommentLine` is enabled.
  - `md.core.ruler.after('inline', 'star_comment_paragraph_delete', ...)` runs when `starCommentParagraph` + `starCommentDelete` are enabled.
  - `md.renderer.rules.paragraph_open` / `paragraph_close` are wrapped only when delete mode needs to suppress wrappers.
  - `html_inline` / `html_block` renderers are wrapped when `insideHtml` is on and ruby/star conversion is enabled; wrappers restore original HTML after rendering.

## Rendering flow
- `convertInlineText` coerces non-string `token.content` to a safe string, uses precomputed `rubyEnabled`/`starEnabled` flags, and short-circuits when inline-only ★ mode sees no ★/placeholder (or when both features are off).
- When `starComment` is enabled, `convertStarComment` handles both ★ spans and ruby conversion so ruby output can be wrapped inside star comments.
- When only ruby is enabled, `convertRubyKnown` runs only when the ruby trigger is present.
- `escapeInlineHtml` runs after conversion when `<`, `>`, or `&` exists to keep inline text safe.

## Star-comment line metadata (core rule)
- `ensureStarCommentLineCore` caches per-source line info in `md.__starCommentLineCache` (lines, `starFlags`, `trimmedLines`).
- `isIgnoredStarLineToken` marks fenced/code/math blocks so their editor lines are skipped.
- Inline token arrays store `__starCommentLineIgnoredLines` and `__starCommentLineBaseLine` for later line mapping.
- For each inline block, the first non-empty line decides whether `STAR_COMMENT_LINE_META_KEY` is set; in line mode it requires all non-empty lines in the block to be ★ lines.

## Line-mode rendering pass
- `markStarCommentLineGlobal` runs once per inline token array (guarded by `__starCommentLineGlobalProcessed`) and annotates line spans:
  - `__starLineGlobalStart` / `__starLineGlobal` / `__starLineGlobalEnd` on tokens that belong to ★ lines.
  - delete mode uses `suppressTokenOutput` to hide tokens and adjacent line breaks.
- `hasStarCommentLineCandidate` plus `__starCommentLineCandidate` avoids rescans when no ★ appears.

## Star-comment conversion
- Paragraph mode uses `isStarCommentParagraph` and caches the result on the inline token array.
- Delete mode hides the rest of the inline tokens via `hideInlineTokensAfter` and sets `__starCommentParagraphDelete` so paragraph wrappers are skipped.
- Cross-token star pairs are resolved by `hasNextStar` / `findUsableStarInToken`:
  - reserves star indices (`__starCommentReservedIdxs`) so each star closes at most once,
  - stores `__starCommentInjectedCloseAt` or `__starCommentDeleteFrom`,
  - `injectStarClosePlaceholders` inserts placeholders that are later replaced with `</span>`.

## HTML handling
- `ensureInlineHtmlContext` scans inline tokens once and marks text inside inline HTML with `__insideHtmlInline` (void tags are skipped; self-closing detection is cheap).
- When `insideHtml` is false, text nodes flagged with `__insideHtmlInline` are left untouched so handwritten HTML stays intact.
- `detectRubyWrapper` checks neighboring `html_inline` tokens to avoid double `<ruby>` wrappers.
- `createHtmlTokenWrapper` converts ruby and ★ comments inside `html_inline` / `html_block` content, delegates to downstream renderers, then restores the original HTML string.
