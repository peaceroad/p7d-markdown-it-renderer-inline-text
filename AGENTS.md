# Agents Notes for p7d-markdown-it-renderer-inlines

## Purpose / Positioning
- `index.js` provides a core-rule based implementation that keeps token metadata stable even when other plugins (e.g. `text_join`, `cjk_breaks`) are present.
- It prioritizes compatibility and robustness with other markdown-it plugins and HTML blocks while keeping performance competitive.

## Plugin wiring
- `rendererInlineText` merges options once per `markdown-it` instance; passing `{ html: true }` flips `insideHtml` on automatically.
- `starCommentLine` overrides `starCommentParagraph` (paragraph mode is disabled when line mode is enabled).
- Hooks are patched once per instance:
  - `md.inline.ruler.before('escape', 'star_percent_escape_meta', applyEscapeMetaInlineRule)` captures backslash parity for ★/%% before markdown-it's escape rule runs (emits sentinels that normalize into token meta).
  - `safeCoreRule(..., 'inline_ruler_convert', ...)` installs the core rule for conversion.
  - `patchInlineRulerOrder` ensures `inline_ruler_convert` always runs last, so `text_join` / `cjk_breaks` and other core rules don't invalidate metadata.
  - `safeCoreRule(... 'star_comment_line_marker' ...)` runs when `starCommentLine` is enabled.
  - `safeCoreRule(... 'star_comment_paragraph_delete' ...)` runs when `starCommentParagraph` + `starCommentDelete` are enabled.
  - `safeCoreRule(... 'percent_comment_paragraph_delete' ...)` runs when `percentCommentParagraph` + (`percentCommentDelete` or `starCommentDelete`) are enabled.
  - `safeCoreRule(... 'percent_comment_line_marker' ...)` runs when `percentCommentLine` is enabled.
  - `md.renderer.rules.paragraph_open` / `paragraph_close` are wrapped only when delete mode needs to suppress wrappers.

## Rendering flow
- Core rule `convertInlineTokens` walks `state.tokens` and mutates inline `text` tokens in place, converting to `html_inline` only when necessary.
- Fast-path guard: tokens are skipped unless at least one of the following is needed:
  - inline ★/%% processing
  - ruby conversion (`《` present)
  - line/paragraph wrappers
  - HTML escaping (`<`, `>`, `&`)
- Escape sentinels are normalized once per text token; forced-active/escaped indexes live in token.meta. Backslash runs are cached per token (`__backslashLookup`) to keep escape checks O(n) per token instead of per marker pair.
- Inline ★ handling:
  - `ensureStarPairInfo` builds open/close positions (ignores line-mode tokens and inline HTML when `insideHtml` is false).
  - `applyStarInsertionsWithRuby` inserts `<span>` for star pairs while **avoiding ruby conversion inside ★ spans**.
  - `starInlineOpen` carries unclosed ★ state across tokens.
- Ruby conversion:
  - `convertRubyKnown` is applied only where needed and only when `《` exists in the segment.
  - When inside HTML wrappers, `detectRubyWrapper` avoids double `<ruby>` tags.
- Percent conversion:
  - `convertPercentCommentInlineSegment` wraps %% pairs unless delete mode is on.
- Line and paragraph modes:
  - `markStarCommentLineGlobal` / `markPercentCommentLineGlobal` annotate line spans once per inline token array.
  - Line delete mode suppresses the line content and adjacent breaks (matching renderer behavior).
  - Paragraph delete mode hides the rest of the inline tokens and sets `__starCommentParagraphDelete` / `__percentCommentParagraphDelete`.
- HTML handling:
  - When `insideHtml` is true, both `html_inline` and `html_block` contents are converted in core.
  - When `insideHtml` is false, inline HTML is detected by `ensureInlineHtmlContext` and untouched.
- Escaping:
  - `escapeInlineHtml` runs after conversion when `<`, `>`, or `&` exists.
  - Tokens that need escaping are forced to `html_inline` to avoid markdown-it's default HTML escape.

## Star-comment line metadata (core rule)
- `ensureStarCommentLineCore` caches per-source line info in `md.__starCommentLineCache` (lines, `starFlags`, `trimmedLines`).
- `isIgnoredStarLineToken` marks fenced/code/math blocks so their editor lines are skipped.
- Inline token arrays store `__starCommentLineIgnoredLines` and `__starCommentLineBaseLine` for later line mapping.
- For each inline block, the first non-empty line decides whether `STAR_COMMENT_LINE_META_KEY` is set; in line mode it requires all non-empty lines in the block to be ★ lines.

## Known concerns
- `patchInlineRulerOrder` monkey-patches the core ruler’s `push/after/before` methods per instance; plugins that expect to override those methods may be affected.
- The inline-ruler rule is registered once per `markdown-it` instance; calling the plugin again with different options will not reconfigure the existing core rule.
- Requires modern JS engines (Unicode property escapes + lookbehind in regex); older browsers without these features will not work.

## Performance notes
- Use `node test/test-with-inline-tokens.js` for spot checks (env: `ITER`, `REPEAT`, `REPEAT_HEAVY`).

## Tests
- Full suite: `npm test`
- Perf spot-check: `node test/test-with-inline-tokens.js`
