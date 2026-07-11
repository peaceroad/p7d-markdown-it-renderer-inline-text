# Agents Notes for p7d-markdown-it-renderer-inlines

## Purpose / Positioning
- `index.js` provides a core-rule based implementation that keeps token metadata stable even when other plugins (e.g. `text_join`, `cjk_breaks`) are present.
- It prioritizes compatibility and robustness with other markdown-it plugins and HTML blocks while keeping performance competitive.

## Plugin wiring
- `rendererInlineText` normalizes options at install time and binds them into installed rule closures.
- `starCommentLine` overrides `starCommentParagraph`; `percentCommentLine` overrides `percentCommentParagraph`.
- Hooks are patched once per instance:
  - `md.inline.ruler.before('escape', 'star_percent_escape_meta', applyEscapeMetaInlineRule)` captures backslash parity for ★/%% before markdown-it's escape rule runs (emits sentinels that normalize into token meta).
  - `md.inline.ruler.before('text', 'star_percent_comment_preparse', createCommentPreparseInlineRule(runtime, preparseProfile))` runs inline preparse for ★/%% pairs in inline mode for both `html:false` and `html:true`.
  - `safeCoreRule(..., 'inline_ruler_convert', ...)` installs the core rule for conversion.
  - `patchCoreRulerOrderGuard` wraps core-ruler mutators (`push/after/before/at`) and keeps `inline_ruler_convert` and `paragraph_wrapper_adjust` at the tail, so `text_join` / `cjk_breaks` and later-added core rules don't invalidate metadata.
  - `safeCoreRule(... 'star_comment_line_marker' ...)` runs when `starCommentLine` is enabled.
  - `safeCoreRule(... 'star_comment_paragraph_delete' ...)` runs when `starCommentParagraph` + `starCommentDelete` are enabled.
  - `safeCoreRule(... 'percent_comment_paragraph_delete' ...)` runs when `percentCommentParagraph` + `percentCommentDelete` are enabled.
  - `safeCoreRule(... 'percent_comment_line_marker' ...)` runs when `percentCommentLine` is enabled.
  - `safeCoreRule(..., 'paragraph_wrapper_adjust', ...)` hides paragraph wrappers and applies paragraph classes at token level (no renderer rule override).

## Runtime compilation
- `createRuntimePlan` precomputes feature flags, inline-mode flags (`starInlineEnabled` / `percentInlineEnabled`), and `inlineProfileMask` for the current option set.
- Inline conversion is compiled per `(inlineProfileMask + htmlEnabled bit)` and cached in the installed core-rule closure for that `markdown-it` instance.
- `percentClass` / delete-mode decisions are fixed at install time and propagated into preparse/compiled runners so hot paths avoid repeated option-object reads.
- Analyzer subpath (`./analyzer`) reuses the same option/runtime semantics without running markdown-it.
- Shared option/runtime/line-parity helpers live in `src/shared-runtime.js` and are consumed by both `index.js` and `src/analyzer.js` to reduce drift.
- Analyzer exposes windowed/diff-friendly helpers (`analyzeLineWindow`, `expandToParagraphBoundaries`, `shouldFullAnalyze`) for editor integrations.

## Rendering flow
- Core rule `convertInlineTokens` dispatches to a precompiled inline runner and mutates tokens in place.
- Escape sentinels are normalized once per text token; forced-active/escaped indexes live in token.meta. Backslash runs are cached (`__backslashLookup`) to keep escape checks O(n). Sentinels use noncharacter Unicode points (`U+FDD0..U+FDD5`) to reduce collision risk with normal text/control chars.
- Backslash lookup uses direct parity scans for short inputs, `Uint16Array` for longer inputs, and auto-switches to `Uint32Array` for very long inputs to avoid run-length overflow.
- `html:true`:
  - Conversion runs only on markdown-it inline `text` tokens.
  - Raw `html_block` / `html_inline` token contents are not reparsed or rewritten by this plugin.
  - Inline children use `ensureInlineHtmlContext` to skip conversion inside raw-text HTML regions.
- `html:false`:
  - inline ★/%% preparse emits wrapper `html_inline` tokens early when inline mode is active (same as `html:true`, but with HTML escaping inside wrapped segments).
  - preparse rule advances `state.pos` in `silent` mode when it accepts a marker pair, matching markdown-it `skipToken` contract (prevents crashes in link-label scans like `a[★b★c`).
  - text conversion keeps raw `<` / `>` masked and restored as entities so wrapper injection does not re-enable raw HTML.
  - in ruby mode, masked `<ruby>` wrappers are restored so `<ruby>漢字《かんじ》</ruby>` remains ruby HTML output (wrapper pair required; tag match is case-insensitive).
- Text token conversion order:
  - ruby (`convertRubyKnown`)
  - star/percent pair conversion on remaining `text` tokens in `html:true` (`convertStarCommentInlineSegment` / `convertPercentCommentInlineSegment`)
  - line/paragraph wrapper insertion
  - HTML escaping (`escapeInlineHtml`) when needed (`&`, `<`, `>`, `"`)
- In inline mode, marker ranges are fixed by preparse before markdown inline formatting, so markdown syntax inside `★...★` / `%%...%%` remains literal.
- Line and paragraph modes:
  - `markCommentLinesGlobal` scans each inline token array once and annotates enabled ★/%% line spans without losing logical break boundaries when either mode deletes a line.
  - line delete mode suppresses line content and adjacent breaks.
  - paragraph delete mode hides remaining inline tokens and sets `__starCommentParagraphDelete` / `__percentCommentParagraphDelete`.
  - optional paragraph class mode can add class directly on `<p>` (`starCommentParagraphClass` / `percentCommentParagraphClass`) and skip inner span wrapping.
  - `paragraph_wrapper_adjust` is installed only when needed and keeps a source-marker fast skip to avoid scanning unrelated documents.

## Star-comment line metadata (core rule)
- `ensureStarCommentLineCore` / `ensurePercentCommentLineCore` share a per-render line cache on core state (`state.__commentLineCache`) with source lines, marker flags, and trimmed-line snapshots.
- `isIgnoredCommentLineToken` marks fenced/code/math blocks so their editor lines are skipped.
- Inline token arrays store `__starCommentLineIgnoredLines` and `__starCommentLineBaseLine` for later line mapping.
- For each inline block, the first non-empty line decides whether `STAR_COMMENT_LINE_META_KEY` is set; in line mode it requires all non-empty lines in the block to be ★ lines.

## Known concerns
- Because conversion is token-based (markdown-it output), behavior across HTML boundaries depends on markdown-it block/inline parsing (e.g. blank-line-separated content inside `<div>` can become inline tokens and thus be converted).
- `patchCoreRulerOrderGuard` wraps core-ruler mutators; plugins that mutate `core.ruler.__rules__` directly (without mutators) bypass order-guard reordering.
- Plugin installation is first-use-wins per `markdown-it` instance; use a fresh instance to change option sets.
- Analyzer cache keys are currently line-text based (`lineCache` keyed by the full line string). This is safe for the current line-local cached payloads, but future line-index/context-dependent metadata would require a wider cache key.
- Regex compatibility fallback is built in:
  - ruby conversion first tries Unicode property escapes (`\p{sc=Han}`) and falls back to BMP Han ranges when unavailable; both patterns support bare shorthand and paired `<ruby>...</ruby>` shorthand with case-insensitive tag matching.
  - HTML escaping avoids regex lookbehind so older JS engines can still load the module.

## Performance notes
- Main perf check: `npm run perf` (`test/material/perf.js`).
- Deep inline-token spot check: `node test/material/perf-inline-tokens.js` (env: `ITER`, `REPEAT`, `REPEAT_HEAVY`).
- Analyzer hot paths:
  - `scanInlineRanges` scans ruby matches once per line and filters out ranges that overlap already-detected star/percent marker ranges.
  - `analyzeLines` / `analyzeLineWindow` precompute blank-line flags per target slice to avoid repeated `trim()` work during paragraph-type propagation.
  - `analyzeLineWindow` backtracks only the first partial block to its real paragraph start, keeping paragraph types correct when boundary expansion is disabled or context starts mid-paragraph.
  - `analyzeLines` / `analyzeLineWindow` short-circuit to noop line descriptors when the runtime has no enabled features.
  - Analyzer entry points reuse a module-level default runtime (`createRuntimePlan({})`) when callers omit runtime, avoiding repeated fallback runtime allocations.
  - Analyzer line caches are reused across incremental calls when the `inlineProfileMask` matches; returned `state.lineCache` is intended to be fed back into later analyzer calls.
  - Cache refresh paths prefer single-probe `Map` operations (`get` / `delete`) over paired `has + get/delete` checks.
  - `lineStartsWithStar` / `lineStartsWithPercent` check the first non-whitespace marker directly; escape parity is handled separately by `isEscaped*` helpers where needed.
  - In renderer hot paths, raw inline-HTML context scanning is skipped unless the inline token array actually contains `html_inline` tokens.
  - Core-state line caches split `state.src` on `\n`; markdown-it core normalize has already canonicalized line endings before these core rules run.
  - Ignored fenced/code/math lines are stored as merged source-map intervals rather than one `Set` entry per line, and line caches are built lazily only after an inline marker candidate is found.

## Tests
- Full suite: `npm test`
- Fixture parser in `test/test.js` is strict (label-based expected HTML matching per option profile).
- Option/edge assertions are separated in `test/option-assertions.js` (called from `test/test.js`).
- Analyzer API assertions are in `test/analyzer-assertions.js` (called from `test/test.js`).
- Inline preparse regression coverage includes bracket/link `skipToken` paths (e.g. `a[★b★c`, `[x★y★](...)`).
