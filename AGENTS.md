# Agents Notes for p7d-markdown-it-renderer-inlines

## Purpose / Positioning
- `index.js` provides a core-rule based implementation that keeps token metadata stable even when other plugins (e.g. `text_join`, `cjk_breaks`) are present.
- It prioritizes compatibility and robustness with other markdown-it plugins and HTML blocks while keeping performance competitive.

## Plugin wiring
- `rendererInlineText` normalizes options on each `.use(...)` call and stores the latest option set on the `markdown-it` instance.
- `starCommentLine` overrides `starCommentParagraph`; `percentCommentLine` overrides `percentCommentParagraph`.
- Hooks are patched once per instance:
  - `md.inline.ruler.before('escape', 'star_percent_escape_meta', applyEscapeMetaInlineRule)` captures backslash parity for ★/%% before markdown-it's escape rule runs (emits sentinels that normalize into token meta).
  - `md.inline.ruler.before('text', 'star_percent_comment_preparse', createCommentPreparseInlineRule(md))` runs inline preparse for ★/%% pairs in inline mode for both `html:false` and `html:true`.
  - `safeCoreRule(..., 'inline_ruler_convert', ...)` installs the core rule for conversion.
  - `patchCoreRulerOrderGuard` wraps core-ruler mutators (`push/after/before/at`) and keeps `inline_ruler_convert` and `paragraph_wrapper_adjust` at the tail, so `text_join` / `cjk_breaks` and later-added core rules don't invalidate metadata.
  - `safeCoreRule(... 'star_comment_line_marker' ...)` runs when `starCommentLine` is enabled.
  - `safeCoreRule(... 'star_comment_paragraph_delete' ...)` runs when `starCommentParagraph` + `starCommentDelete` are enabled.
  - `safeCoreRule(... 'percent_comment_paragraph_delete' ...)` runs when `percentCommentParagraph` + `percentCommentDelete` are enabled.
  - `safeCoreRule(... 'percent_comment_line_marker' ...)` runs when `percentCommentLine` is enabled.
  - `safeCoreRule(..., 'paragraph_wrapper_adjust', ...)` hides paragraph wrappers and applies paragraph classes at token level (no renderer rule override).

## Runtime compilation
- `createRuntimePlan` precomputes feature flags, inline-mode flags (`starInlineEnabled` / `percentInlineEnabled`), and `inlineProfileMask` for the current option set.
- Inline conversion is compiled per `(inlineProfileMask + htmlEnabled bit)` and cached in `md.__inlineTokenRunnerCache`.

## Rendering flow
- Core rule `convertInlineTokens` dispatches to a precompiled inline runner and mutates tokens in place.
- Escape sentinels are normalized once per text token; forced-active/escaped indexes live in token.meta. Backslash runs are cached (`__backslashLookup`) to keep escape checks O(n). Sentinels use noncharacter Unicode points (`U+FDD0..U+FDD5`) to reduce collision risk with normal text/control chars.
- Backslash lookup uses `Uint16Array` by default and auto-switches to `Uint32Array` for long inputs to avoid run-length overflow.
- `html:true`:
  - Conversion runs only on markdown-it inline `text` tokens.
  - Raw `html_block` / `html_inline` token contents are not reparsed or rewritten by this plugin.
  - Inline children use `ensureInlineHtmlContext` to skip conversion inside raw-text HTML regions.
- `html:false`:
  - inline ★/%% preparse emits wrapper `html_inline` tokens early when inline mode is active (same as `html:true`, but with HTML escaping inside wrapped segments).
  - preparse rule advances `state.pos` in `silent` mode when it accepts a marker pair, matching markdown-it `skipToken` contract (prevents crashes in link-label scans like `a[★b★c`).
  - text conversion keeps raw `<` / `>` masked and restored as entities so wrapper injection does not re-enable raw HTML.
  - in ruby mode, masked `<ruby>` wrappers are restored so `<ruby>漢字《かんじ》</ruby>` remains ruby HTML output.
- Text token conversion order:
  - ruby (`convertRubyKnown`)
  - star/percent pair conversion on remaining `text` tokens in `html:true` (`convertStarCommentInlineSegment` / `convertPercentCommentInlineSegment`)
  - line/paragraph wrapper insertion
  - HTML escaping (`escapeInlineHtml`) when needed (`&`, `<`, `>`, `"`)
- In inline mode, marker ranges are fixed by preparse before markdown inline formatting, so markdown syntax inside `★...★` / `%%...%%` remains literal.
- Line and paragraph modes:
  - `markStarCommentLineGlobal` / `markPercentCommentLineGlobal` annotate spans once per inline token array.
  - line delete mode suppresses line content and adjacent breaks.
  - paragraph delete mode hides remaining inline tokens and sets `__starCommentParagraphDelete` / `__percentCommentParagraphDelete`.
  - optional paragraph class mode can add class directly on `<p>` (`starCommentParagraphClass` / `percentCommentParagraphClass`) and skip inner span wrapping.
  - `paragraph_wrapper_adjust` has a runtime gate (`md.__paragraphWrapperAdjustEnabled`) and source-marker fast skip to avoid scanning unrelated documents.

## Star-comment line metadata (core rule)
- `ensureStarCommentLineCore` caches per-source line info in `md.__starCommentLineCache` (lines, `starFlags`, `trimmedLines`).
- `isIgnoredStarLineToken` marks fenced/code/math blocks so their editor lines are skipped.
- Inline token arrays store `__starCommentLineIgnoredLines` and `__starCommentLineBaseLine` for later line mapping.
- For each inline block, the first non-empty line decides whether `STAR_COMMENT_LINE_META_KEY` is set; in line mode it requires all non-empty lines in the block to be ★ lines.

## Known concerns
- Because conversion is token-based (markdown-it output), behavior across HTML boundaries depends on markdown-it block/inline parsing (e.g. blank-line-separated content inside `<div>` can become inline tokens and thus be converted).
- `patchCoreRulerOrderGuard` wraps core-ruler mutators; plugins that mutate `core.ruler.__rules__` directly (without mutators) bypass order-guard reordering.
- The inline-ruler convert rule is registered once per `markdown-it` instance, but reads the latest normalized options from instance state so repeated `.use(...)` calls can reconfigure behavior safely.
- Regex compatibility fallback is built in:
  - ruby conversion first tries Unicode property escapes (`\p{sc=Han}`) and falls back to BMP Han ranges when unavailable.
  - HTML escaping avoids regex lookbehind so older JS engines can still load the module.

## Performance notes
- Main perf check: `npm run perf` (`test/material/perf.js`).
- Deep inline-token spot check: `node test/material/perf-inline-tokens.js` (env: `ITER`, `REPEAT`, `REPEAT_HEAVY`).

## Tests
- Full suite: `npm test`
- Fixture parser in `test/test.js` is strict (label-based expected HTML matching per option profile).
