# Agents Notes for p7d-markdown-it-renderer-inlines

`index.js` wires the plugin as a single markdown-it inline renderer rule. The flow:

1. Options are merged with defaults once when the plugin is registered.
2. Depending on the flags, the plugin patches markdown-it:
   - `md.renderer.rules.text` is replaced with our inline renderer.
   - `md.core.ruler.after('inline', …)` registers helpers that annotate inline token arrays (star-line metadata, list pruning, etc.). These run on every `md.render` call once registered.
   - `md.renderer.rules.paragraph_open` / `paragraph_close` are wrapped so we can suppress paragraph/list wrappers once the inline metadata is known.
   - When `insideHtml` is enabled (either explicitly or implicitly by passing `{ html: true }` to the plugin options) the plugin also wraps `md.renderer.rules.html_inline` and `html_block`. The wrapper swaps in converted token content long enough to capture the downstream renderer’s output, then restores the original HTML string so other plugins see the same inputs.
3. During rendering, every inline `text` token is routed through `convertInlineText`. The helper inspects the markdown-it rendering context once per token (detecting whether HTML mode is on) and caches ruby-wrapper state when needed. Ruby conversion is applied only when the trigger character is present, and star-comment conversion runs afterward so that ruby output can be wrapped inside the star spans.
4. Star-comment paragraph/line modes rely on metadata attached to the inline token list (in core rules) so the renderer can decide whether to wrap or drop content without re-scanning block structure.

## Inline HTML context

- `ensureInlineHtmlContext` walks each inline token list once, tracking a lightweight stack of open HTML inline tags so that only text nodes nested inside inline markup get the `__insideHtmlInline` marker. Void elements (e.g. `br`, `img`, `input`, etc.) are skipped up front, and the self-closing regex is only consulted when necessary, which keeps the scan cheap for large documents.
- When ruby handling is enabled alongside HTML, `detectRubyWrapper` simply inspects the neighboring `html_inline` tokens instead of re-parsing strings, so we only add `<ruby>` wrappers when markdown-it did not already supply them.

## Core metadata passes

- `ensureStarCommentLineCore` lazily creates the ignored-line set and caches each inline block’s end line so both the main scan and global-mode lookahead reuse it. The loop bails as soon as it sees a non-empty, non-star line, which keeps large lists fast.
- `markStarCommentLineGlobal` reuses a single `breakIdx` per line and only checks the ignored-line set when the metadata actually needs it.
- Inline token arrays track a `__starCommentLineCandidate` flag, so we only rescan for global star lines until the metadata is built. Once `__starCommentLineGlobalProcessed` is set, subsequent renders skip the expensive pass entirely while still honoring the cached metadata.
- Paragraph and list suppression still happens via `patchParagraphRulesForStarLine`, but only once per `markdown-it` instance.

## Renderer wrappers

- `createHtmlTokenWrapper` encapsulates the logic for both `html_inline` and `html_block`: it runs ruby conversion first, then star-comment conversion on the html token’s `content`, delegates to the downstream renderer, then restores the original string so other plugins see unmodified HTML. This keeps the HTML conversion path in sync for inline and block tokens while avoiding repeated boilerplate.

## insideHtml specifics

- Inline HTML conversion respects nested structures by tracking when a text token is “inside” an HTML span. We only rewrite those spans when `insideHtml` is true; otherwise the inline content is left intact so handwritten markup is untouched. Callers can set `insideHtml: true` or simply pass `{ html: true }` to the plugin to flip it on automatically.
- HTML block tokens are processed with the same splitter, allowing multi-paragraph `<div>` fixtures that mix Markdown content after the block.
- Because markdown-it plugins run in registration order, ask you to register this plugin after any other plugin that overrides `html_inline`/`html_block` if they expect those renderers to see the converted content.

## Additional Extension Ideas

- Expose a hook so callers can register custom inline markers (besides `★`) while reusing the same metadata plumbing; this mostly requires threading marker definitions into `findUsableStar`/`STAR_PAIR_REGEXP`.
- Allow user-provided HTML transformers to plug into `createHtmlTokenWrapper` so arbitrary rewrites (e.g., tooltip injection) can piggyback on the existing safe swapping pattern.
- Cache `convertStarCommentHtmlContent` results per HTML token when rendering the same document repeatedly, which would benefit server-side rendering scenarios with identical inputs.

