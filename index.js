const STAR_CHAR = '★'
const STAR_CHAR_CODE = STAR_CHAR.charCodeAt(0)
const STAR_COMMENT_LINE_META_KEY = 'starCommentLineDelete'
const PERCENT_CHAR = '%'
const PERCENT_CHAR_CODE = PERCENT_CHAR.charCodeAt(0)
const PERCENT_MARKER = PERCENT_CHAR + PERCENT_CHAR
const DEFAULT_STAR_CLASS = 'star-comment'
const DEFAULT_PERCENT_CLASS = 'percent-comment'
const RUBY_MARK_CHAR = '《'
// Internal sentinels keep escape parity and raw-angle masking stable across text_join merges.
// Use noncharacter code points to minimize collisions with user text and toolchain control-char handling.
const ESCAPED_STAR_SENTINEL = '\uFDD0'
const ACTIVE_STAR_SENTINEL = '\uFDD1'
const ESCAPED_PERCENT_SENTINEL = '\uFDD2'
const ACTIVE_PERCENT_SENTINEL = '\uFDD3'
const RAW_HTML_LT_SENTINEL = '\uFDD4'
const RAW_HTML_GT_SENTINEL = '\uFDD5'
const PERCENT_COMMENT_LINE_META_KEY = 'percentCommentLineDelete'
const INLINE_HTML_TAG_REGEXP = /^<\s*(\/)?\s*([A-Za-z][\w:-]*)/i
const INLINE_HTML_SELF_CLOSE_REGEXP = /\/>\s*$/
const INLINE_HTML_VOID_TAGS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link',
  'meta', 'param', 'source', 'track', 'wbr',
])
const INLINE_HTML_RAW_TEXT_TAGS = new Set(['script', 'style', 'textarea', 'title'])
const RUBY_REGEXP_CONTENT = '(<ruby>)?([\\p{sc=Han}0-9A-Za-z.\\-_]+)《([^》]+?)》(<\\/ruby>)?'
const RUBY_REGEXP_FALLBACK_CONTENT = '(<ruby>)?([\\u3400-\\u4DBF\\u4E00-\\u9FFF\\uF900-\\uFAFF0-9A-Za-z.\\-_]+)《([^》]+?)》(<\\/ruby>)?'
const HTML_AMP_REGEXP = /&/g
const HTML_LT_NONTAG_REGEXP = /<(?!\/?[\w\s="/.':;#-\/\?]+>)/g
const HTML_EMPTY_TAG_REGEXP = /<(\/?)>/g
const HTML_SLASHED_TAG_REGEXP = /<([^>]+?\/[^>]+?)>/g

const HTML_ENTITY_AMP = 1
const HTML_ENTITY_LT = 2
const HTML_ENTITY_GT = 4
const HTML_ENTITY_QUOT = 8
const SPECIAL_HTML_NONE = -1
const SPECIAL_HTML_UNCLOSED = -2

const HTML_GT_NONTAG_REGEXP = (() => {
  try {
    return new RegExp("(?<!<\\/?[\\w\\s=\"/.':;#-\\/\\?]+)>(?![^<]*>)", 'g')
  } catch (err) {
    return null
  }
})()

const createRubyRegExp = () => {
  try {
    return new RegExp(RUBY_REGEXP_CONTENT, 'ug')
  } catch (err) {
    return new RegExp(RUBY_REGEXP_FALLBACK_CONTENT, 'g')
  }
}

const RUBY_REGEXP = createRubyRegExp()

const fallbackEscapeHtml = (value) => {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

const escapeTextContent = (value) => {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

const normalizeParagraphClass = (value, fallbackClass) => {
  if (value === false || value == null) return ''
  if (value === true) return fallbackClass
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed || fallbackClass
  }
  return ''
}

const normalizePercentClass = (escapeHtml, value) => {
  const raw = typeof value === 'string' ? value.trim() : ''
  const normalized = raw || DEFAULT_PERCENT_CLASS
  return {
    raw: normalized,
    escaped: escapeHtml(normalized),
  }
}

const maskRawHtmlAngles = (value) => {
  if (!value) return value
  const hasLt = value.indexOf('<') !== -1
  const hasGt = value.indexOf('>') !== -1
  if (!hasLt && !hasGt) return value

  let rebuilt = ''
  for (let i = 0; i < value.length; i++) {
    const ch = value.charCodeAt(i)
    if (ch === 60) { // '<'
      rebuilt += RAW_HTML_LT_SENTINEL
    } else if (ch === 62) { // '>'
      rebuilt += RAW_HTML_GT_SENTINEL
    } else {
      rebuilt += value[i]
    }
  }
  return rebuilt
}

const restoreRawHtmlAngles = (value) => {
  if (!value) return value
  if (value.indexOf(RAW_HTML_LT_SENTINEL) === -1 && value.indexOf(RAW_HTML_GT_SENTINEL) === -1) {
    return value
  }
  let rebuilt = ''
  for (let i = 0; i < value.length; i++) {
    const ch = value[i]
    if (ch === RAW_HTML_LT_SENTINEL) {
      rebuilt += '&lt;'
    } else if (ch === RAW_HTML_GT_SENTINEL) {
      rebuilt += '&gt;'
    } else {
      rebuilt += ch
    }
  }
  return rebuilt
}

const restoreMaskedRubyTags = (value) => {
  if (!value) return value
  if (value.indexOf(RAW_HTML_LT_SENTINEL) === -1) return value
  const openToken = (RAW_HTML_LT_SENTINEL + 'ruby' + RAW_HTML_GT_SENTINEL).toLowerCase()
  const closeToken = (RAW_HTML_LT_SENTINEL + '/ruby' + RAW_HTML_GT_SENTINEL).toLowerCase()
  const openLen = openToken.length
  const closeLen = closeToken.length
  const matchesTokenAt = (pos, token, len) => {
    if (pos < 0 || pos + len > value.length) return false
    return value.slice(pos, pos + len).toLowerCase() === token
  }
  const findToken = (from, token, len) => {
    let pos = value.indexOf(RAW_HTML_LT_SENTINEL, from)
    while (pos !== -1) {
      if (matchesTokenAt(pos, token, len)) return pos
      pos = value.indexOf(RAW_HTML_LT_SENTINEL, pos + 1)
    }
    return -1
  }

  let out = ''
  let i = 0
  while (i < value.length) {
    const openPos = findToken(i, openToken, openLen)
    if (openPos === -1) {
      out += value.slice(i)
      break
    }
    out += value.slice(i, openPos)
    const contentStart = openPos + openLen

    // Restore only full <ruby>...</ruby> pairs.
    const closePos = findToken(contentStart, closeToken, closeLen)
    if (closePos === -1) {
      out += value.slice(openPos)
      break
    }

    out += '<ruby>' + value.slice(contentStart, closePos) + '</ruby>'
    i = closePos + closeLen
  }
  return out
}

const getHtmlEntityFlags = (value) => {
  if (!value) return 0
  let flags = 0
  if (value.indexOf('&') !== -1) flags |= HTML_ENTITY_AMP
  if (value.indexOf('<') !== -1) flags |= HTML_ENTITY_LT
  if (value.indexOf('>') !== -1) flags |= HTML_ENTITY_GT
  if (value.indexOf('"') !== -1) flags |= HTML_ENTITY_QUOT
  return flags
}

const detectRubyWrapper = (tokens, idx) => {
  if (!tokens[idx - 1] || !tokens[idx + 1]) return false
  return tokens[idx - 1].type === 'html_inline'
    && tokens[idx - 1].content === '<ruby>'
    && tokens[idx + 1].type === 'html_inline'
    && tokens[idx + 1].content === '</ruby>'
}

const findSpecialHtmlEnd = (value, start) => {
  if (start + 1 >= value.length) return SPECIAL_HTML_NONE
  const next = value.charCodeAt(start + 1)
  if (next === 33) { // '!'
    if (start + 3 < value.length
      && value.charCodeAt(start + 2) === 45
      && value.charCodeAt(start + 3) === 45) {
      const end = value.indexOf('-->', start + 4)
      return end === -1 ? SPECIAL_HTML_UNCLOSED : end + 2
    }
    if (value.startsWith('<![CDATA[', start)) {
      const end = value.indexOf(']]>', start + 9)
      return end === -1 ? SPECIAL_HTML_UNCLOSED : end + 2
    }
    return SPECIAL_HTML_NONE
  }
  if (next === 63) { // '?'
    const end = value.indexOf('?>', start + 2)
    return end === -1 ? SPECIAL_HTML_UNCLOSED : end + 1
  }
  return SPECIAL_HTML_NONE
}

const getInlineHtmlTagInfo = (tag) => {
  if (!tag || tag.length < 3 || tag.charCodeAt(0) !== 60 || tag.charCodeAt(tag.length - 1) !== 62) {
    return null
  }
  if (tag.startsWith('<!--') || tag.startsWith('<!') || tag.startsWith('<?')) {
    return null
  }
  const tagMatch = tag.match(INLINE_HTML_TAG_REGEXP)
  if (!tagMatch) return null
  const isClosing = !!tagMatch[1]
  const tagName = tagMatch[2] ? tagMatch[2].toLowerCase() : ''
  if (!tagName) return null
  const isVoid = INLINE_HTML_VOID_TAGS.has(tagName)
  let isSelfClosing = false
  if (!isClosing && !isVoid) {
    isSelfClosing = INLINE_HTML_SELF_CLOSE_REGEXP.test(tag)
  }
  return { isClosing, tagName, isVoid, isSelfClosing }
}

const applyTagToStack = (stack, tag) => {
  const info = getInlineHtmlTagInfo(tag)
  if (!info) return { info: null }
  if (info.isClosing) {
    if (stack.length && stack[stack.length - 1] === info.tagName) {
      stack.pop()
    } else {
      const idx = stack.lastIndexOf(info.tagName)
      if (idx !== -1) {
        stack.splice(idx, 1)
      } else if (stack.length) {
        stack.pop()
      }
    }
  } else if (!info.isVoid && !info.isSelfClosing) {
    stack.push(info.tagName)
  }
  return { info }
}

const findHtmlTagEnd = (value, start) => {
  const specialEnd = findSpecialHtmlEnd(value, start)
  if (specialEnd >= start) return specialEnd
  if (specialEnd === SPECIAL_HTML_UNCLOSED) return -1
  let idx = start + 1
  let quote = 0
  while (idx < value.length) {
    const ch = value.charCodeAt(idx)
    if (quote) {
      if (ch === quote) quote = 0
    } else if (ch === 34 || ch === 39) { // " or '
      quote = ch
    } else if (ch === 62) { // '>'
      return idx
    }
    idx++
  }
  return -1
}

const isEscapableHtmlTag = (tag) => {
  if (!tag || tag.length < 3 || tag.charCodeAt(0) !== 60 || tag.charCodeAt(tag.length - 1) !== 62) {
    return false
  }
  if (tag.startsWith('<!--') || tag.startsWith('<!') || tag.startsWith('<?')) {
    return false
  }
  const tagMatch = tag.match(INLINE_HTML_TAG_REGEXP)
  if (!tagMatch) return false

  const isClosing = !!tagMatch[1]
  const tail = tag.slice(tagMatch[0].length, -1).trim()
  if (isClosing) {
    return tail === ''
  }
  if (!tail || tail === '/') return true
  // malformed like <e/ee> is not treated as a tag-like token.
  if (tail.charCodeAt(0) === 47) return false
  return true
}

const getCoreRuleAnchor = (md) => {
  if (!md || !md.core || !md.core.ruler || !md.core.ruler.__rules__) return null
  const rules = md.core.ruler.__rules__
  let anchor = null
  let anchorIdx = -1
  for (let i = 0; i < rules.length; i++) {
    const name = rules[i].name
    if (name === 'text_join' || name === 'cjk_breaks') {
      if (i > anchorIdx) {
        anchorIdx = i
        anchor = name
      }
    }
  }
  return anchor
}

const safeCoreRule = (md, id, handler) => {
  if (!md || !md.core || !md.core.ruler) return
  const anchor = getCoreRuleAnchor(md)
  if (anchor) {
    md.core.ruler.after(anchor, id, handler)
  } else {
    md.core.ruler.after('inline', id, handler)
  }
}

const ensureCoreRuleLastByName = (ruler, ruleName) => {
  if (!ruler || !ruler.__rules__) return
  const rules = ruler.__rules__
  const length = rules.length
  if (!length) return
  if (rules[length - 1] && rules[length - 1].name === ruleName) return
  let idx = -1
  for (let i = 0; i < length - 1; i++) {
    if (rules[i].name === ruleName) {
      idx = i
      break
    }
  }
  if (idx === -1) return
  const [rule] = rules.splice(idx, 1)
  rules.push(rule)
  ruler.__cache__ = null
}

const ensureCoreRuleOrder = (md) => {
  if (!md || !md.core || !md.core.ruler) return
  const ruler = md.core.ruler
  // Keep conversion after text_join/cjk_breaks and later-added core rules.
  ensureCoreRuleLastByName(ruler, 'inline_ruler_convert')
  // Paragraph wrapper adjustments should run after conversion/deletes/line markers.
  ensureCoreRuleLastByName(ruler, 'paragraph_wrapper_adjust')
}

const patchCoreRulerOrderGuard = (md) => {
  if (!md || !md.core || !md.core.ruler) return
  if (md.__coreRulerOrderGuardPatched) return
  md.__coreRulerOrderGuardPatched = true
  const ruler = md.core.ruler

  const wrapMutator = (methodName) => {
    const original = ruler[methodName]
    if (typeof original !== 'function') return
    ruler[methodName] = function guardedCoreRulerMutator (...args) {
      const result = original.apply(this, args)
      ensureCoreRuleOrder(md)
      return result
    }
  }

  wrapMutator('push')
  wrapMutator('after')
  wrapMutator('before')
  wrapMutator('at')
  ensureCoreRuleOrder(md)
}

const ensureInlineHtmlContext = (tokens) => {
  if (!tokens || tokens.__inlineHtmlContextReady) return
  tokens.__inlineHtmlContextReady = true
  const stack = []
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]
    if (!token) continue
    if (token.type === 'html_inline') {
      const raw = token.content || ''
      if (!raw || raw[0] !== '<') continue
      const result = applyTagToStack(stack, raw)
      if (!result.info) {
        continue
      }
    } else if (token.type === 'text' && stack.length) {
      if (INLINE_HTML_RAW_TEXT_TAGS.has(stack[stack.length - 1])) {
        token.meta = token.meta || {}
        token.meta.__insideRawHtmlInline = true
      }
    }
  }
}

const hasInlineHtmlTokens = (tokens) => {
  if (!tokens) return false
  if (tokens.__hasInlineHtmlTokens !== undefined) return tokens.__hasInlineHtmlTokens
  let found = false
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i] && tokens[i].type === 'html_inline') {
      found = true
      break
    }
  }
  tokens.__hasInlineHtmlTokens = found
  return found
}

const hideInlineTokensAfter = (tokens, startIdx, metaKey = '__starCommentDelete') => {
  let pointer = startIdx
  while (pointer < tokens.length) {
    const token = tokens[pointer]
    if (token) {
      token.hidden = true
      token.content = ''
      token.tag = ''
      token.nesting = 0
      if (token.type !== 'text') {
        token.type = 'text'
      }
      token.meta = token.meta || {}
      token.meta[metaKey] = true
    }
    pointer++
  }
}

const countBackslashesBefore = (text, index) => {
  let backslashCount = 0
  let cursor = index - 1
  while (cursor >= 0 && text.charCodeAt(cursor) === 92) {
    backslashCount++
    cursor--
  }
  return backslashCount
}

const createBackslashLookup = (text) => {
  if (!text || text.indexOf('\\') === -1) return null
  const run = new Uint16Array(text.length + 1)
  let streak = 0
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) === 92) {
      streak++
    } else {
      streak = 0
    }
    run[i + 1] = streak
  }
  return (idx) => run[idx]
}

const getBackslashCountBefore = (text, index, meta) => {
  if (meta && meta.__backslashLookup) {
    return meta.__backslashLookup(index)
  }
  return countBackslashesBefore(text, index)
}

const normalizeEscapeSentinels = (text, token) => {
  if (!text) return text
  if (token && token.meta && token.meta.__sentinelNormalized) return text
  const hasSentinel = text.indexOf(ESCAPED_STAR_SENTINEL) !== -1
    || text.indexOf(ACTIVE_STAR_SENTINEL) !== -1
    || text.indexOf(ESCAPED_PERCENT_SENTINEL) !== -1
    || text.indexOf(ACTIVE_PERCENT_SENTINEL) !== -1
  if (!hasSentinel) return text

  if (!token) return text
  const meta = token.meta || (token.meta = {})
  meta.__sentinelNormalized = true
  let activeStars = null
  let escapedStars = null
  let activePercents = null
  let escapedPercents = null

  let rebuilt = ''
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (ch === ESCAPED_STAR_SENTINEL || ch === ACTIVE_STAR_SENTINEL) {
      const next = text[i + 1]
      if (next === STAR_CHAR) {
        const idx = rebuilt.length
        if (ch === ESCAPED_STAR_SENTINEL) {
          if (!escapedStars) {
            escapedStars = meta.__forceEscapedStars || (meta.__forceEscapedStars = [])
          }
          escapedStars.push(idx)
        } else {
          if (!activeStars) {
            activeStars = meta.__forceActiveStars || (meta.__forceActiveStars = [])
          }
          activeStars.push(idx)
        }
      }
      continue
    }
    if (ch === ESCAPED_PERCENT_SENTINEL || ch === ACTIVE_PERCENT_SENTINEL) {
      const next = text[i + 1]
      const next2 = text[i + 2]
      if (next === PERCENT_CHAR && next2 === PERCENT_CHAR) {
        const idx = rebuilt.length
        if (ch === ESCAPED_PERCENT_SENTINEL) {
          if (!escapedPercents) {
            escapedPercents = meta.__forceEscapedPercents || (meta.__forceEscapedPercents = [])
          }
          escapedPercents.push(idx)
        } else {
          if (!activePercents) {
            activePercents = meta.__forceActivePercents || (meta.__forceActivePercents = [])
          }
          activePercents.push(idx)
        }
      }
      continue
    }
    rebuilt += ch
  }
  return rebuilt
}

const isEscapedStar = (text, index, token) => {
  const meta = token && token.meta
  if (meta) {
    const active = meta.__forceActiveStars
    if (active && active.indexOf(index) !== -1) return false
    const escaped = meta.__forceEscapedStars
    if (escaped && escaped.indexOf(index) !== -1) return true
  }
  return (getBackslashCountBefore(text, index, meta) & 1) === 1
}

const isEscapedPercent = (text, index, token) => {
  const meta = token && token.meta
  if (meta) {
    const active = meta.__forceActivePercents
    if (active && active.indexOf(index) !== -1) return false
    const escaped = meta.__forceEscapedPercents
    if (escaped && escaped.indexOf(index) !== -1) return true
  }
  return isEscapedStar(text, index, token)
}

const collapseMarkerEscapes = (value, marker) => {
  if (!value || !marker) return value
  if (value.indexOf(marker) === -1) return value
  if (value.indexOf('\\') === -1) return value

  const markerLen = marker.length
  if (markerLen === 0 || value.length < markerLen) return value
  const lookup = createBackslashLookup(value)
  if (!lookup) return value

  const markerCode = markerLen === 1 ? marker.charCodeAt(0) : 0
  const limit = value.length - markerLen
  let rebuilt = ''
  let cursor = 0
  let i = 0
  let changed = false

  while (i <= limit) {
    const isMarker = markerLen === 1
      ? value.charCodeAt(i) === markerCode
      : value.startsWith(marker, i)
    if (!isMarker) {
      i++
      continue
    }
    const backslashCount = lookup(i)
    if (!backslashCount) {
      i += markerLen
      continue
    }
    changed = true
    const start = i - backslashCount
    if (start > cursor) {
      rebuilt += value.slice(cursor, start)
    }
    const keepCount = backslashCount >> 1
    if (keepCount > 0) rebuilt += '\\'.repeat(keepCount)
    rebuilt += marker
    i += markerLen
    cursor = i
  }

  if (!changed) return value
  if (cursor < value.length) {
    rebuilt += value.slice(cursor)
  }
  return rebuilt
}

const applyEscapeMetaInlineRule = (state, silent) => {
  if (!state || !state.md || !state.md.__escapeMetaEnabled) return false
  const start = state.pos
  const src = state.src
  const max = state.posMax
  if (start >= max || src.charCodeAt(start) !== 92) return false

  let pos = start
  while (pos < max && src.charCodeAt(pos) === 92) pos++
  const run = pos - start
  const next = pos < max ? src.charCodeAt(pos) : -1
  const isStar = next === STAR_CHAR_CODE
  const isPercentPair = next === PERCENT_CHAR_CODE && pos + 1 < max && src.charCodeAt(pos + 1) === PERCENT_CHAR_CODE
  if (!isStar && !isPercentPair) return false

  const escaped = (run & 1) === 1
  const keep = escaped ? run - 1 : run >> 1
  const keepStr = keep > 0 ? '\\'.repeat(keep) : ''

  if (!silent) {
    const token = state.push('text', '', 0)
    if (isStar) {
      const sentinel = escaped ? ESCAPED_STAR_SENTINEL : ACTIVE_STAR_SENTINEL
      token.content = keepStr + sentinel + STAR_CHAR
    } else {
      const sentinel = escaped ? ESCAPED_PERCENT_SENTINEL : ACTIVE_PERCENT_SENTINEL
      token.content = keepStr + sentinel + PERCENT_MARKER
    }
  }

  state.pos = isStar ? pos + 1 : pos + 2
  return true
}

const isEscapedSourceMarker = (src, index, getEscapesBefore = null) => {
  if (getEscapesBefore) {
    return (getEscapesBefore(index) & 1) === 1
  }
  let count = 0
  for (let i = index - 1; i >= 0 && src.charCodeAt(i) === 92; i--) {
    count++
  }
  return (count & 1) === 1
}

const findInlineStarCommentClose = (src, from, max, getEscapesBefore = null, hasSourceBackslash = true) => {
  for (let i = from; i < max; i++) {
    if (src.charCodeAt(i) !== STAR_CHAR_CODE) continue
    if (!hasSourceBackslash || !isEscapedSourceMarker(src, i, getEscapesBefore)) return i
  }
  return -1
}

const findInlinePercentCommentClose = (src, from, max, getEscapesBefore = null, hasSourceBackslash = true) => {
  for (let i = from; i + 1 < max; i++) {
    if (src.charCodeAt(i) !== PERCENT_CHAR_CODE || src.charCodeAt(i + 1) !== PERCENT_CHAR_CODE) continue
    if (!hasSourceBackslash || !isEscapedSourceMarker(src, i, getEscapesBefore)) return i
  }
  return -1
}

const isInlineTextStopCharCode = (code) => {
  // Keep this list aligned with markdown-it `rules_inline/text.mjs` isTerminatorChar.
  switch (code) {
    case 10: // '\n'
    case 33: // !
    case 35: // #
    case 36: // $
    case 37: // %
    case 38: // &
    case 42: // *
    case 43: // +
    case 45: // -
    case 58: // :
    case 60: // <
    case 61: // =
    case 62: // >
    case 64: // @
    case 91: // [
    case 92: // \
    case 93: // ]
    case 94: // ^
    case 95: // _
    case 96: // `
    case 123: // {
    case 125: // }
    case 126: // ~
      return true
    default:
      return false
  }
}

const ensureCommentPreparseSourceFlags = (state, starEnabled, percentEnabled) => {
  if (state.__commentPreparseSourceFlags) return state.__commentPreparseSourceFlags
  const src = state && typeof state.src === 'string' ? state.src : ''
  const flags = {
    hasStar: !!starEnabled && src.indexOf(STAR_CHAR) !== -1,
    hasPercent: !!percentEnabled && src.indexOf(PERCENT_MARKER) !== -1,
  }
  state.__commentPreparseSourceFlags = flags
  return flags
}

const ensureSourceBackslashLookup = (state, src) => {
  if (!state) return null
  if (state.__sourceBackslashLookup !== undefined) return state.__sourceBackslashLookup
  const lookup = createBackslashLookup(src)
  state.__sourceBackslashLookup = lookup
  return lookup
}

const createCommentPreparseInlineRule = (md) => {
  return (state, silent) => {
    const opt = md && md.__rendererInlineTextOptions
    if (!opt) return false
    const htmlEnabled = !!(state && state.md && state.md.options && state.md.options.html)
    if (htmlEnabled) return false

    let starInlineMode = !!(opt.starComment && !opt.starCommentLine && !opt.starCommentParagraph)
    let percentInlineMode = !!(opt.percentComment && !opt.percentCommentLine && !opt.percentCommentParagraph)
    const sourceFlags = ensureCommentPreparseSourceFlags(state, starInlineMode, percentInlineMode)
    if (starInlineMode && !sourceFlags.hasStar) starInlineMode = false
    if (percentInlineMode && !sourceFlags.hasPercent) percentInlineMode = false
    if (!starInlineMode && !percentInlineMode) return false

    const start = state.pos
    const max = state.posMax
    if (start >= max) return false
    const src = state.src
    const getEscapesBefore = ensureSourceBackslashLookup(state, src)
    const hasSourceBackslash = !!getEscapesBefore

    const detectMarkerType = (idx) => {
      if (
        starInlineMode
        && src.charCodeAt(idx) === STAR_CHAR_CODE
        && (!hasSourceBackslash || !isEscapedSourceMarker(src, idx, getEscapesBefore))
      ) {
        return 1
      }
      if (
        percentInlineMode
        && idx + 1 < max
        && src.charCodeAt(idx) === PERCENT_CHAR_CODE
        && src.charCodeAt(idx + 1) === PERCENT_CHAR_CODE
        && (!hasSourceBackslash || !isEscapedSourceMarker(src, idx, getEscapesBefore))
      ) {
        return 2
      }
      return 0
    }

    let markerType = detectMarkerType(start)
    if (!markerType) {
      const startCode = src.charCodeAt(start)
      if (isInlineTextStopCharCode(startCode)) return false
      for (let i = start + 1; i < max; i++) {
        const code = src.charCodeAt(i)
        if (isInlineTextStopCharCode(code)) return false
        markerType = detectMarkerType(i)
        if (!markerType) continue
        if (silent) return false
        const token = state.push('text', '', 0)
        token.content = src.slice(start, i)
        state.pos = i
        return true
      }
      return false
    }

    const closePos = markerType === 1
      ? findInlineStarCommentClose(src, start + 1, max, getEscapesBefore, hasSourceBackslash)
      : findInlinePercentCommentClose(src, start + 2, max, getEscapesBefore, hasSourceBackslash)
    if (closePos === -1) return false
    if (silent) {
      state.pos = markerType === 1 ? closePos + 1 : closePos + 2
      return true
    }

    const end = markerType === 1 ? closePos + 1 : closePos + 2
    const rawSegment = src.slice(start, end)
    const deleteMode = markerType === 1 ? !!opt.starCommentDelete : !!opt.percentCommentDelete
    if (!deleteMode) {
      const token = state.push('html_inline', '', 0)
      const escaped = escapeTextContent(rawSegment)
      if (markerType === 1) {
        token.content = '<span class="star-comment">' + escaped + '</span>'
      } else {
        const cls = opt.percentClassEscaped || DEFAULT_PERCENT_CLASS
        token.content = '<span class="' + cls + '">' + escaped + '</span>'
      }
    }

    state.pos = end
    return true
  }
}

const isStarCommentParagraph = (inlineTokens) => {
  if (!inlineTokens || !inlineTokens.length) return false
  if (inlineTokens.__starCommentParagraphCached !== undefined) {
    return inlineTokens.__starCommentParagraphCached
  }
  const firstToken = inlineTokens[0]
  let result = false
  if (firstToken && firstToken.type === 'text' && firstToken.content) {
    result = firstToken.content.charCodeAt(0) === STAR_CHAR_CODE
      && !isEscapedStar(firstToken.content, 0, firstToken)
  }
  inlineTokens.__starCommentParagraphCached = result
  return result
}

const isPercentCommentParagraph = (inlineTokens) => {
  if (!inlineTokens || !inlineTokens.length) return false
  if (inlineTokens.__percentCommentParagraphCached !== undefined) {
    return inlineTokens.__percentCommentParagraphCached
  }
  const firstToken = inlineTokens[0]
  let result = false
  if (firstToken && firstToken.type === 'text' && firstToken.content && firstToken.content.length >= 2) {
    result = firstToken.content[0] === PERCENT_CHAR
      && firstToken.content[1] === PERCENT_CHAR
      && !isEscapedPercent(firstToken.content, 0, firstToken)
  }
  inlineTokens.__percentCommentParagraphCached = result
  return result
}

const lineStartsWithStar = (line) => {
  if (!line) return false
  let idx = 0
  while (idx < line.length && (line[idx] === ' ' || line[idx] === '\t')) idx++
  if (idx >= line.length) return false
  if (line[idx] !== STAR_CHAR) return false
  return !isEscapedStar(line, idx)
}

const lineStartsWithPercent = (line) => {
  if (!line) return false
  let idx = 0
  while (idx < line.length && (line[idx] === ' ' || line[idx] === '\t')) idx++
  if (idx >= line.length - 1) return false
  if (line[idx] !== PERCENT_CHAR || line[idx + 1] !== PERCENT_CHAR) return false
  return !isEscapedPercent(line, idx)
}

const getStarCommentLineCache = (md, src) => {
  const cache = md.__starCommentLineCache
  if (cache && cache.src === src) return cache
  const lines = src.split(/\r?\n/)
  const nextCache = {
    src,
    lines,
    starFlags: new Array(lines.length),
    trimmedLines: new Array(lines.length),
  }
  md.__starCommentLineCache = nextCache
  return nextCache
}

const getPercentCommentLineCache = (md, src) => {
  const cache = md.__percentCommentLineCache
  if (cache && cache.src === src) return cache
  const lines = src.split(/\r?\n/)
  const nextCache = {
    src,
    lines,
    percentFlags: new Array(lines.length),
    trimmedLines: new Array(lines.length),
  }
  md.__percentCommentLineCache = nextCache
  return nextCache
}

const getCachedStarLineFlag = (cache, idx) => {
  let flag = cache.starFlags[idx]
  if (flag !== undefined) return flag
  flag = lineStartsWithStar(cache.lines[idx] || '')
  cache.starFlags[idx] = flag
  return flag
}

const getCachedPercentLineFlag = (cache, idx) => {
  let flag = cache.percentFlags[idx]
  if (flag !== undefined) return flag
  flag = lineStartsWithPercent(cache.lines[idx] || '')
  cache.percentFlags[idx] = flag
  return flag
}

const getCachedTrimmedLine = (cache, idx) => {
  let trimmed = cache.trimmedLines[idx]
  if (trimmed !== undefined) return trimmed
  trimmed = (cache.lines[idx] || '').trim()
  cache.trimmedLines[idx] = trimmed
  return trimmed
}

const hideTokenRange = (tokens, start, end) => {
  if (!tokens || start < 0 || end < start) return
  for (let i = start; i <= end && i < tokens.length; i++) {
    tokens[i].hidden = true
  }
}

const findListItemBounds = (tokens, inlineIdx) => {
  if (!tokens || inlineIdx <= 0) return null
  let openIdx = inlineIdx - 1
  while (openIdx >= 0 && tokens[openIdx].type !== 'list_item_open') {
    openIdx--
  }
  if (openIdx < 0) return null

  let depth = 0
  for (let i = openIdx + 1; i < tokens.length; i++) {
    const token = tokens[i]
    if (token.type === 'list_item_open') {
      depth++
      continue
    }
    if (token.type === 'list_item_close') {
      if (depth === 0) {
        return [openIdx, i]
      }
      depth--
    }
  }
  return null
}

const isIgnoredStarLineToken = (token) => {
  if (!token || !token.block || !token.map) return false
  if (token.type === 'code_block' || token.type === 'fence') return true
  if (token.tag && (token.tag === 'code' || token.tag === 'math')) return true
  if (token.type && token.type.indexOf('math') !== -1) return true
  return false
}

const isLineBreakToken = (token) => {
  if (!token) return false
  const type = token.type
  return type === 'softbreak' || type === 'hardbreak'
}

const findLastTextTokenIndex = (tokens, start, end, predicate = null) => {
  for (let i = end - 1; i >= start; i--) {
    const token = tokens[i]
    if (!token || token.type !== 'text' || token.content === '') continue
    if (predicate && !predicate(token, i)) continue
    return i
  }
  return -1
}

const findParagraphWrapBounds = (tokens) => {
  let start = -1
  let end = -1
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]
    if (!token || token.hidden || token.type !== 'text' || token.content === '') continue
    if (token.meta && token.meta.__insideRawHtmlInline) continue
    if (start === -1) start = i
    end = i
  }
  return [start, end]
}

const suppressTokenOutput = (token) => {
  if (!token) return
  token.hidden = true
  token.content = ''
  token.tag = ''
  token.nesting = 0
  if (token.type !== 'text') {
    token.type = 'text'
  }
}

const annotateStarLine = (tokens, start, end, breakIdx, opt) => {
  if (start >= end) return
  const firstToken = tokens[start]
  if (!firstToken || firstToken.type !== 'text') return
  let cursor = 0
  while (cursor < firstToken.content.length && (firstToken.content[cursor] === ' ' || firstToken.content[cursor] === '\t')) {
    cursor++
  }
  if (cursor >= firstToken.content.length) return
  if (firstToken.content[cursor] !== STAR_CHAR) return
  if (isEscapedStar(firstToken.content, cursor, firstToken)) return

  const endTextIdx = findLastTextTokenIndex(tokens, start, end, (token) => !(token.meta && token.meta.__insideRawHtmlInline))
  if (endTextIdx === -1) return

  firstToken.meta = firstToken.meta || {}
  firstToken.meta.__starLineGlobalStart = true
  for (let i = start; i < end; i++) {
    const token = tokens[i]
    if (!token) continue
    token.meta = token.meta || {}
    token.meta.__starLineGlobal = true
  }
  const endToken = tokens[endTextIdx]
  endToken.meta = endToken.meta || {}
  endToken.meta.__starLineGlobalEnd = true

  if (opt.starCommentDelete) {
    for (let i = start; i < end; i++) {
      suppressTokenOutput(tokens[i])
    }
    const beforeIdx = start - 1
    if (beforeIdx >= 0 && isLineBreakToken(tokens[beforeIdx])) {
      suppressTokenOutput(tokens[beforeIdx])
    } else if (breakIdx !== -1 && tokens[breakIdx]) {
      suppressTokenOutput(tokens[breakIdx])
    }
  }
}

const annotatePercentLine = (tokens, start, end, breakIdx, opt) => {
  if (start >= end) return
  const firstToken = tokens[start]
  if (!firstToken || firstToken.type !== 'text') return
  let firstContent = firstToken.content
  if (typeof firstContent !== 'string') {
    firstContent = firstContent == null ? '' : String(firstContent)
  }
  const normalized = normalizeEscapeSentinels(firstContent, firstToken)
  if (normalized !== firstContent) {
    firstToken.content = normalized
    firstContent = normalized
  }
  let cursor = 0
  while (cursor < firstContent.length && (firstContent[cursor] === ' ' || firstContent[cursor] === '\t')) {
    cursor++
  }
  if (cursor >= firstContent.length - 1) return
  if (firstContent[cursor] !== PERCENT_CHAR || firstContent[cursor + 1] !== PERCENT_CHAR) return
  if (isEscapedPercent(firstContent, cursor, firstToken)) return

  const endTextIdx = findLastTextTokenIndex(tokens, start, end, (token) => !(token.meta && token.meta.__insideRawHtmlInline))
  if (endTextIdx === -1) return

  firstToken.meta = firstToken.meta || {}
  firstToken.meta.__percentLineGlobalStart = true
  for (let i = start; i < end; i++) {
    const token = tokens[i]
    if (!token) continue
    token.meta = token.meta || {}
    token.meta.__percentLineGlobal = true
  }
  const endToken = tokens[endTextIdx]
  endToken.meta = endToken.meta || {}
  endToken.meta.__percentLineGlobalEnd = true

  const deleteMode = opt.percentCommentDelete
  if (deleteMode) {
    for (let i = start; i < end; i++) {
      suppressTokenOutput(tokens[i])
    }
    const beforeIdx = start - 1
    if (beforeIdx >= 0 && isLineBreakToken(tokens[beforeIdx])) {
      suppressTokenOutput(tokens[beforeIdx])
    } else if (breakIdx !== -1 && tokens[breakIdx]) {
      suppressTokenOutput(tokens[breakIdx])
    }
  }
}

const markStarCommentLineGlobal = (tokens, opt) => {
  if (tokens.__starCommentLineGlobalProcessed) return
  tokens.__starCommentLineGlobalProcessed = true
  const ignoredLines = tokens.__starCommentLineIgnoredLines
  const baseLine = tokens.__starCommentLineBaseLine
  let absoluteLine = typeof baseLine === 'number' ? baseLine : null
  const trackLines = !!ignoredLines && absoluteLine !== null

  let lineStart = 0
  while (lineStart < tokens.length) {
    let lineEnd = lineStart
    while (lineEnd < tokens.length && !isLineBreakToken(tokens[lineEnd])) {
      lineEnd++
    }
    const shouldSkip = trackLines && ignoredLines.has(absoluteLine)
    if (!shouldSkip) {
      const breakIdx = lineEnd < tokens.length ? lineEnd : -1
      annotateStarLine(tokens, lineStart, lineEnd, breakIdx, opt)
    }
    lineStart = lineEnd < tokens.length ? lineEnd + 1 : tokens.length
    if (absoluteLine !== null) {
      absoluteLine++
    }
  }
}

const markPercentCommentLineGlobal = (tokens, opt) => {
  if (tokens.__percentCommentLineGlobalProcessed) return
  tokens.__percentCommentLineGlobalProcessed = true
  const ignoredLines = tokens.__percentCommentLineIgnoredLines
  const baseLine = tokens.__percentCommentLineBaseLine
  let absoluteLine = typeof baseLine === 'number' ? baseLine : null
  const trackLines = !!ignoredLines && absoluteLine !== null

  let lineStart = 0
  while (lineStart < tokens.length) {
    let lineEnd = lineStart
    while (lineEnd < tokens.length && !isLineBreakToken(tokens[lineEnd])) {
      lineEnd++
    }
    const shouldSkip = trackLines && ignoredLines.has(absoluteLine)
    if (!shouldSkip) {
      const breakIdx = lineEnd < tokens.length ? lineEnd : -1
      annotatePercentLine(tokens, lineStart, lineEnd, breakIdx, opt)
    }
    lineStart = lineEnd < tokens.length ? lineEnd + 1 : tokens.length
    if (absoluteLine !== null) {
      absoluteLine++
    }
  }
}

const ensureStarCommentLineCore = (md) => {
  if (md.__starCommentLineCoreReady) return
  md.__starCommentLineCoreReady = true

  safeCoreRule(md, 'star_comment_line_marker', (state) => {
    if (!md.__starCommentLineGlobalEnabled) return
    if (!state.tokens || !state.tokens.length || !state.src) return
    if (state.src.indexOf(STAR_CHAR) === -1) return
    const cache = getStarCommentLineCache(md, state.src)
    let ignoredLines = null
    for (let i = 0; i < state.tokens.length; i++) {
      const token = state.tokens[i]
      if (!isIgnoredStarLineToken(token)) continue
      if (!ignoredLines) ignoredLines = new Set()
      for (let line = token.map[0]; line < token.map[1]; line++) {
        ignoredLines.add(line)
      }
    }
    for (let i = 0; i < state.tokens.length; i++) {
      const token = state.tokens[i]
      if (token.type !== 'inline' || !token.children || !token.children.length || !token.map) continue
      token.children.__starCommentLineIgnoredLines = ignoredLines
      token.children.__starCommentLineBaseLine = token.map[0]
      const blockEnd = token.map[1]
      let lineIdx = token.map[0]
      while (lineIdx < blockEnd) {
        if (!ignoredLines || !ignoredLines.has(lineIdx)) {
          if (getCachedStarLineFlag(cache, lineIdx)) {
            let markLine = true
            if (md.__starCommentLineGlobalEnabled) {
              let lookahead = lineIdx + 1
              while (lookahead < blockEnd) {
                if (ignoredLines && ignoredLines.has(lookahead)) {
                  lookahead++
                  continue
                }
                const trimmed = getCachedTrimmedLine(cache, lookahead)
                if (trimmed === '') {
                  lookahead++
                  continue
                }
                if (!getCachedStarLineFlag(cache, lookahead)) {
                  markLine = false
                  break
                }
                lookahead++
              }
            }
            if (markLine) {
              token.meta = token.meta || {}
              token.meta[STAR_COMMENT_LINE_META_KEY] = true
            }
            break
          }
          const trimmedLine = getCachedTrimmedLine(cache, lineIdx)
          if (trimmedLine !== '') {
            break
          }
        }
        lineIdx++
      }
    }

    if (md.__starCommentLineCache && md.__starCommentLineCache.src === state.src) {
      md.__starCommentLineCache = null
    }
  })
}

const ensurePercentCommentLineCore = (md) => {
  if (md.__percentCommentLineCoreReady) return
  md.__percentCommentLineCoreReady = true

  safeCoreRule(md, 'percent_comment_line_marker', (state) => {
    if (!md.__percentCommentLineGlobalEnabled) return
    if (!state.tokens || !state.tokens.length || !state.src) return
    if (state.src.indexOf(PERCENT_MARKER) === -1) return
    const cache = getPercentCommentLineCache(md, state.src)
    let ignoredLines = null
    for (let i = 0; i < state.tokens.length; i++) {
      const token = state.tokens[i]
      if (!isIgnoredStarLineToken(token)) continue
      if (!ignoredLines) ignoredLines = new Set()
      for (let line = token.map[0]; line < token.map[1]; line++) {
        ignoredLines.add(line)
      }
    }
    for (let i = 0; i < state.tokens.length; i++) {
      const token = state.tokens[i]
      if (token.type !== 'inline' || !token.children || !token.children.length || !token.map) continue
      token.children.__percentCommentLineIgnoredLines = ignoredLines
      token.children.__percentCommentLineBaseLine = token.map[0]
      const blockEnd = token.map[1]
      let lineIdx = token.map[0]
      while (lineIdx < blockEnd) {
        if (!ignoredLines || !ignoredLines.has(lineIdx)) {
          if (getCachedPercentLineFlag(cache, lineIdx)) {
            let markLine = true
            if (md.__percentCommentLineGlobalEnabled) {
              let lookahead = lineIdx + 1
              while (lookahead < blockEnd) {
                if (ignoredLines && ignoredLines.has(lookahead)) {
                  lookahead++
                  continue
                }
                const trimmed = getCachedTrimmedLine(cache, lookahead)
                if (trimmed === '') {
                  lookahead++
                  continue
                }
                if (!getCachedPercentLineFlag(cache, lookahead)) {
                  markLine = false
                  break
                }
                lookahead++
              }
            }
            if (markLine) {
              token.meta = token.meta || {}
              token.meta[PERCENT_COMMENT_LINE_META_KEY] = true
            }
            break
          }
          const trimmedLine = getCachedTrimmedLine(cache, lineIdx)
          if (trimmedLine !== '') {
            break
          }
        }
        lineIdx++
      }
    }

    if (md.__percentCommentLineCache && md.__percentCommentLineCache.src === state.src) {
      md.__percentCommentLineCache = null
    }
  })
}

const ensureStarCommentParagraphDeleteCore = (md) => {
  if (md.__starCommentParagraphDeleteCoreReady) return
  md.__starCommentParagraphDeleteCoreReady = true

  safeCoreRule(md, 'star_comment_paragraph_delete', (state) => {
    if (!md.__starCommentParagraphDeleteEnabled) return
    const tokens = state.tokens
    if (!tokens || !tokens.length) return
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i]
      if (token.hidden || token.type !== 'inline' || !token.children || !token.children.length) {
        continue
      }
      if (!isStarCommentParagraph(token.children)) continue
      const bounds = findListItemBounds(tokens, i)
      if (!bounds) continue
      hideTokenRange(tokens, bounds[0], bounds[1])
      i = bounds[1]
    }
  })
}

const ensurePercentCommentParagraphDeleteCore = (md) => {
  if (md.__percentCommentParagraphDeleteCoreReady) return
  md.__percentCommentParagraphDeleteCoreReady = true

  safeCoreRule(md, 'percent_comment_paragraph_delete', (state) => {
    if (!md.__percentCommentParagraphDeleteEnabled) return
    const tokens = state.tokens
    if (!tokens || !tokens.length) return
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i]
      if (token.hidden || token.type !== 'inline' || !token.children || !token.children.length) {
        continue
      }
      if (!isPercentCommentParagraph(token.children)) continue
      token.children.__percentCommentParagraphDelete = true
      const bounds = findListItemBounds(tokens, i)
      if (bounds) {
        hideTokenRange(tokens, bounds[0], bounds[1])
        i = bounds[1]
      }
    }
  })
}

const shouldHideParagraphWrapper = (inlineToken) => {
  if (!inlineToken || inlineToken.type !== 'inline') return false
  if (inlineToken.meta && (inlineToken.meta[STAR_COMMENT_LINE_META_KEY] || inlineToken.meta[PERCENT_COMMENT_LINE_META_KEY])) return true
  return !!(inlineToken.children && (inlineToken.children.__starCommentParagraphDelete || inlineToken.children.__percentCommentParagraphDelete))
}

const findParagraphCloseIndex = (tokens, openIdx) => {
  const directIdx = openIdx + 2
  if (directIdx < tokens.length && tokens[directIdx] && tokens[directIdx].type === 'paragraph_close') {
    return directIdx
  }
  for (let i = openIdx + 1; i < tokens.length; i++) {
    const token = tokens[i]
    if (!token) continue
    if (token.type === 'paragraph_close') return i
    if (token.type === 'paragraph_open') break
  }
  return -1
}

const addTokenClass = (token, className) => {
  if (!token || !className) return
  if (typeof token.attrJoin === 'function') {
    token.attrJoin('class', className)
    return
  }
  const attrs = token.attrs || (token.attrs = [])
  for (let i = 0; i < attrs.length; i++) {
    const pair = attrs[i]
    if (pair[0] === 'class') {
      if (pair[1]) {
        pair[1] += ' ' + className
      } else {
        pair[1] = className
      }
      return
    }
  }
  attrs.push(['class', className])
}

const applyParagraphCommentClasses = (md, tokens, idx) => {
  if (!md.__starCommentParagraphClass && !md.__percentCommentParagraphClass) {
    return
  }
  const inlineToken = tokens[idx + 1]
  if (!inlineToken || inlineToken.type !== 'inline' || !inlineToken.children || !inlineToken.children.length) {
    return
  }
  if (md.__starCommentParagraphClass && isStarCommentParagraph(inlineToken.children)) {
    addTokenClass(tokens[idx], md.__starCommentParagraphClass)
  }
  if (md.__percentCommentParagraphClass && isPercentCommentParagraph(inlineToken.children)) {
    addTokenClass(tokens[idx], md.__percentCommentParagraphClass)
  }
}

const ensureParagraphWrapperCore = (md) => {
  if (md.__paragraphWrapperCoreReady) return
  md.__paragraphWrapperCoreReady = true

  safeCoreRule(md, 'paragraph_wrapper_adjust', (state) => {
    if (!md.__paragraphWrapperAdjustEnabled) return
    const tokens = state.tokens
    if (!tokens || !tokens.length) return
    if (!state || !state.src || (state.src.indexOf(STAR_CHAR) === -1 && state.src.indexOf(PERCENT_MARKER) === -1)) {
      return
    }
    const needsClass = !!(md.__starCommentParagraphClass || md.__percentCommentParagraphClass)

    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i]
      if (!token || token.type !== 'paragraph_open') continue
      const inlineToken = tokens[i + 1]
      if (!inlineToken || inlineToken.type !== 'inline') continue

      if (shouldHideParagraphWrapper(inlineToken)) {
        suppressTokenOutput(token)
        const closeIdx = findParagraphCloseIndex(tokens, i)
        if (closeIdx !== -1 && tokens[closeIdx]) {
          suppressTokenOutput(tokens[closeIdx])
        }
        continue
      }

      if (needsClass) {
        applyParagraphCommentClasses(md, tokens, i)
      }
    }
  })
}

const ensureParagraphDeleteSupport = (md) => {
  if (md.__paragraphDeletePatched) return
  md.__paragraphDeletePatched = true
  ensureParagraphWrapperCore(md)
}

const escapeInlineHtml = (value, flags) => {
  const hasAmp = (flags & HTML_ENTITY_AMP) !== 0
  const hasLt = (flags & HTML_ENTITY_LT) !== 0
  const hasGt = (flags & HTML_ENTITY_GT) !== 0
  const hasQuot = (flags & HTML_ENTITY_QUOT) !== 0
  if (!hasAmp && !hasLt && !hasGt && !hasQuot) return value

  const hasTagQuote = value.indexOf('"') !== -1 || value.indexOf('\'') !== -1
  if (!hasAmp && !hasQuot && HTML_GT_NONTAG_REGEXP && (!hasGt || !hasTagQuote)) {
    let escaped = value
    if (hasLt) {
      escaped = escaped.replace(HTML_LT_NONTAG_REGEXP, '&lt;')
    }
    if (hasGt) {
      escaped = escaped.replace(HTML_GT_NONTAG_REGEXP, '&gt;')
    }
    if (hasLt) {
      escaped = escaped
        .replace(HTML_EMPTY_TAG_REGEXP, '&lt;$1&gt;')
        .replace(HTML_SLASHED_TAG_REGEXP, '&lt;$1&gt;')
    }
    return escaped
  }

  const parseTags = hasLt || hasGt || (hasAmp && value.indexOf('<') !== -1) || hasQuot
  if (!parseTags) {
    let escaped = value
    if (hasAmp) escaped = escaped.replace(HTML_AMP_REGEXP, '&amp;')
    if (hasQuot) escaped = escaped.replace(/"/g, '&quot;')
    return escaped
  }

  let rebuilt = ''
  let i = 0
  while (i < value.length) {
    const ch = value.charCodeAt(i)
    if (ch === 60) { // '<'
      const end = findHtmlTagEnd(value, i)
      if (end === -1) {
        rebuilt += hasLt ? '&lt;' : '<'
        i++
        continue
      }
      const tag = value.slice(i, end + 1)
      if (isEscapableHtmlTag(tag)) {
        rebuilt += tag
      } else if (hasLt) {
        let inner = tag.slice(1, -1)
        if (hasAmp && inner.indexOf('&') !== -1) {
          inner = inner.replace(HTML_AMP_REGEXP, '&amp;')
        }
        rebuilt += '&lt;' + inner + '&gt;'
      } else {
        rebuilt += tag
      }
      i = end + 1
      continue
    }
    if (ch === 62) { // '>'
      rebuilt += hasGt ? '&gt;' : '>'
      i++
      continue
    }
    if (ch === 38) { // '&'
      rebuilt += hasAmp ? '&amp;' : '&'
      i++
      continue
    }
    if (ch === 34) { // '"'
      rebuilt += hasQuot ? '&quot;' : '"'
      i++
      continue
    }
    rebuilt += value[i]
    i++
  }
  return rebuilt
}

const convertRubyKnown = (cont, hasRubyWrapper) => {
  RUBY_REGEXP.lastIndex = 0
  let replaced = false
  const converted = cont.replace(RUBY_REGEXP, (match, openTag, base, reading, closeTag) => {
    if (!base || !reading) return match
    if ((openTag && !closeTag) || (closeTag && !openTag)) return match
    replaced = true
    const rubyCont = base + '<rp>《</rp><rt>' + reading + '</rt><rp>》</rp>'
    return hasRubyWrapper ? rubyCont : '<ruby>' + rubyCont + '</ruby>'
  })

  return replaced ? converted : cont
}

const convertPercentCommentInlineSegment = (segment, opt, token) => {
  if (!segment || segment.indexOf(PERCENT_MARKER) === -1) return segment
  const deleteMode = opt.percentCommentDelete
  const cls = opt.percentClassEscaped || DEFAULT_PERCENT_CLASS
  const openTag = deleteMode ? '' : '<span class="' + cls + '">'
  const closeTag = '</span>'
  const meta = token && token.meta
  const forcedActive = meta && meta.__forceActivePercents
  const forcedEscaped = meta && meta.__forceEscapedPercents
  const forcedActiveLen = forcedActive ? forcedActive.length : 0
  const forcedEscapedLen = forcedEscaped ? forcedEscaped.length : 0
  let forcedActiveIdx = 0
  let forcedEscapedIdx = 0
  const hasBackslash = segment.indexOf('\\') !== -1

  if (!forcedActiveLen && !forcedEscapedLen && !hasBackslash) {
    let rebuilt = ''
    let cursor = 0
    let openIdx = -1
    let markerIdx = segment.indexOf(PERCENT_MARKER)
    let mutated = false

    while (markerIdx !== -1) {
      if (openIdx === -1) {
        openIdx = markerIdx
      } else {
        mutated = true
        rebuilt += segment.slice(cursor, openIdx)
        if (!deleteMode) {
          rebuilt += openTag + segment.slice(openIdx, markerIdx + 2) + closeTag
        }
        cursor = markerIdx + 2
        openIdx = -1
      }
      markerIdx = segment.indexOf(PERCENT_MARKER, markerIdx + 2)
    }

    if (!mutated) return segment
    if (openIdx !== -1) {
      rebuilt += segment.slice(cursor, openIdx)
      cursor = openIdx
    }
    if (cursor < segment.length) {
      rebuilt += segment.slice(cursor)
    }
    return rebuilt
  }

  let getEscapesBefore = null
  if (hasBackslash) {
    if (meta && meta.__backslashLookup && token && token.content === segment) {
      getEscapesBefore = meta.__backslashLookup
    } else {
      const lookup = createBackslashLookup(segment)
      getEscapesBefore = lookup ? (idx) => lookup(idx) : (idx) => countBackslashesBefore(segment, idx)
    }
  }
  const isForcedActive = (idx) => {
    if (!forcedActiveLen) return false
    while (forcedActiveIdx < forcedActiveLen && forcedActive[forcedActiveIdx] < idx) forcedActiveIdx++
    return forcedActiveIdx < forcedActiveLen && forcedActive[forcedActiveIdx] === idx
  }
  const isForcedEscaped = (idx) => {
    if (!forcedEscapedLen) return false
    while (forcedEscapedIdx < forcedEscapedLen && forcedEscaped[forcedEscapedIdx] < idx) forcedEscapedIdx++
    return forcedEscapedIdx < forcedEscapedLen && forcedEscaped[forcedEscapedIdx] === idx
  }
  const isEscaped = (idx) => {
    if (isForcedActive(idx)) return false
    if (isForcedEscaped(idx)) return true
    if (!getEscapesBefore) return false
    return (getEscapesBefore(idx) & 1) === 1
  }
  let rebuilt = ''
  let cursor = 0
  let openIdx = -1

  for (let i = 0; i < segment.length - 1; i++) {
    if (segment.charCodeAt(i) !== PERCENT_CHAR_CODE || segment.charCodeAt(i + 1) !== PERCENT_CHAR_CODE) continue
    if (isEscaped(i)) continue
    if (openIdx === -1) {
      openIdx = i
      i++
      continue
    }
    const startEscapes = getEscapesBefore ? getEscapesBefore(openIdx) : 0
    const keptStartEscapes = startEscapes ? '\\'.repeat(Math.floor(startEscapes / 2)) : ''
    rebuilt += segment.slice(cursor, openIdx - startEscapes) + keptStartEscapes
    if (!deleteMode) {
      rebuilt += openTag + segment.slice(openIdx, i + 2) + closeTag
    }
    cursor = i + 2
    openIdx = -1
    i++
  }

  if (openIdx !== -1) {
    rebuilt += segment.slice(cursor, openIdx)
    cursor = openIdx
  }
  if (cursor < segment.length) {
    rebuilt += segment.slice(cursor)
  }
  const hasForceActivePercent = forcedActive && forcedActive.length
  if (!hasForceActivePercent) {
    return collapseMarkerEscapes(rebuilt, PERCENT_MARKER)
  }
  return rebuilt
}

const convertStarCommentInlineSegment = (segment, opt, token) => {
  if (!segment || segment.indexOf(STAR_CHAR) === -1) return segment
  const deleteMode = opt.starCommentDelete
  const openTag = deleteMode ? '' : '<span class="star-comment">'
  const closeTag = '</span>'
  const meta = token && token.meta
  const forcedActive = meta && meta.__forceActiveStars
  const forcedEscaped = meta && meta.__forceEscapedStars
  const forcedActiveLen = forcedActive ? forcedActive.length : 0
  const forcedEscapedLen = forcedEscaped ? forcedEscaped.length : 0
  let forcedActiveIdx = 0
  let forcedEscapedIdx = 0

  const hasBackslash = segment.indexOf('\\') !== -1

  if (!forcedActiveLen && !forcedEscapedLen && !hasBackslash) {
    let rebuilt = ''
    let cursor = 0
    let openIdx = -1
    let markerIdx = segment.indexOf(STAR_CHAR)
    let mutated = false

    while (markerIdx !== -1) {
      if (openIdx === -1) {
        openIdx = markerIdx
      } else {
        mutated = true
        rebuilt += segment.slice(cursor, openIdx)
        if (!deleteMode) {
          rebuilt += openTag + segment.slice(openIdx, markerIdx + 1) + closeTag
        }
        cursor = markerIdx + 1
        openIdx = -1
      }
      markerIdx = segment.indexOf(STAR_CHAR, markerIdx + 1)
    }

    if (!mutated) return segment
    if (openIdx !== -1) {
      rebuilt += segment.slice(cursor, openIdx)
      cursor = openIdx
    }
    if (cursor < segment.length) {
      rebuilt += segment.slice(cursor)
    }
    return rebuilt
  }

  let getEscapesBefore = null
  if (hasBackslash) {
    if (meta && meta.__backslashLookup && token && token.content === segment) {
      getEscapesBefore = meta.__backslashLookup
    } else {
      const lookup = createBackslashLookup(segment)
      getEscapesBefore = lookup ? (idx) => lookup(idx) : (idx) => countBackslashesBefore(segment, idx)
    }
  }

  const isForcedActive = (idx) => {
    if (!forcedActiveLen) return false
    while (forcedActiveIdx < forcedActiveLen && forcedActive[forcedActiveIdx] < idx) forcedActiveIdx++
    return forcedActiveIdx < forcedActiveLen && forcedActive[forcedActiveIdx] === idx
  }
  const isForcedEscaped = (idx) => {
    if (!forcedEscapedLen) return false
    while (forcedEscapedIdx < forcedEscapedLen && forcedEscaped[forcedEscapedIdx] < idx) forcedEscapedIdx++
    return forcedEscapedIdx < forcedEscapedLen && forcedEscaped[forcedEscapedIdx] === idx
  }
  const isEscaped = (idx) => {
    if (isForcedActive(idx)) return false
    if (isForcedEscaped(idx)) return true
    if (!getEscapesBefore) return false
    return (getEscapesBefore(idx) & 1) === 1
  }

  let rebuilt = ''
  let cursor = 0
  let openIdx = -1
  for (let i = 0; i < segment.length; i++) {
    if (segment.charCodeAt(i) !== STAR_CHAR_CODE) continue
    if (isEscaped(i)) continue
    if (openIdx === -1) {
      openIdx = i
      continue
    }
    const startEscapes = getEscapesBefore ? getEscapesBefore(openIdx) : 0
    const keptStartEscapes = startEscapes ? '\\'.repeat(Math.floor(startEscapes / 2)) : ''
    rebuilt += segment.slice(cursor, openIdx - startEscapes) + keptStartEscapes
    if (!deleteMode) {
      rebuilt += openTag + segment.slice(openIdx, i + 1) + closeTag
    }
    cursor = i + 1
    openIdx = -1
  }
  if (openIdx !== -1) {
    rebuilt += segment.slice(cursor, openIdx)
    cursor = openIdx
  }
  if (cursor < segment.length) {
    rebuilt += segment.slice(cursor)
  }
  if (!forcedActiveLen) {
    return collapseMarkerEscapes(rebuilt, STAR_CHAR)
  }
  return rebuilt
}

const convertStarPercentInlineCombinedSegment = (segment, opt, token) => {
  if (!segment) return segment
  if (segment.indexOf(STAR_CHAR) === -1 || segment.indexOf(PERCENT_MARKER) === -1) return segment
  if (opt.starCommentDelete || opt.percentCommentDelete) return null

  const meta = token && token.meta
  const forcedActiveStars = meta && meta.__forceActiveStars
  const forcedEscapedStars = meta && meta.__forceEscapedStars
  const forcedActivePercents = meta && meta.__forceActivePercents
  const forcedEscapedPercents = meta && meta.__forceEscapedPercents
  const forcedActiveStarsLen = forcedActiveStars ? forcedActiveStars.length : 0
  const forcedActivePercentsLen = forcedActivePercents ? forcedActivePercents.length : 0
  const hasBackslash = segment.indexOf('\\') !== -1

  let getEscapesBefore = null
  if (hasBackslash) {
    if (meta && meta.__backslashLookup && token && token.content === segment) {
      getEscapesBefore = meta.__backslashLookup
    } else {
      const lookup = createBackslashLookup(segment)
      getEscapesBefore = lookup ? (idx) => lookup(idx) : (idx) => countBackslashesBefore(segment, idx)
    }
  }

  const isEscapedFactory = (forcedActive, forcedEscaped) => {
    let activeIdx = 0
    let escapedIdx = 0
    const activeLen = forcedActive ? forcedActive.length : 0
    const escapedLen = forcedEscaped ? forcedEscaped.length : 0

    return (idx) => {
      if (activeLen) {
        while (activeIdx < activeLen && forcedActive[activeIdx] < idx) activeIdx++
        if (activeIdx < activeLen && forcedActive[activeIdx] === idx) return false
      }
      if (escapedLen) {
        while (escapedIdx < escapedLen && forcedEscaped[escapedIdx] < idx) escapedIdx++
        if (escapedIdx < escapedLen && forcedEscaped[escapedIdx] === idx) return true
      }
      if (!getEscapesBefore) return false
      return (getEscapesBefore(idx) & 1) === 1
    }
  }

  const isEscapedStarIdx = isEscapedFactory(forcedActiveStars, forcedEscapedStars)
  const isEscapedPercentIdx = isEscapedFactory(forcedActivePercents, forcedEscapedPercents)

  const starRanges = []
  const percentRanges = []
  let starOpen = -1
  let percentOpen = -1
  for (let i = 0; i < segment.length; i++) {
    const code = segment.charCodeAt(i)
    if (code === STAR_CHAR_CODE) {
      if (!isEscapedStarIdx(i)) {
        if (starOpen === -1) {
          starOpen = i
        } else {
          starRanges.push([starOpen, i + 1])
          starOpen = -1
        }
      }
      continue
    }
    if (code === PERCENT_CHAR_CODE && i + 1 < segment.length && segment.charCodeAt(i + 1) === PERCENT_CHAR_CODE) {
      if (!isEscapedPercentIdx(i)) {
        if (percentOpen === -1) {
          percentOpen = i
        } else {
          percentRanges.push([percentOpen, i + 2])
          percentOpen = -1
        }
      }
      i++
    }
  }

  if (!starRanges.length && !percentRanges.length) {
    let normalized = segment
    if (!forcedActiveStarsLen) normalized = collapseMarkerEscapes(normalized, STAR_CHAR)
    if (!forcedActivePercentsLen) normalized = collapseMarkerEscapes(normalized, PERCENT_MARKER)
    return normalized
  }

  const openEvents = new Array(segment.length + 1)
  const closeEvents = new Array(segment.length + 1)
  for (let i = 0; i < starRanges.length; i++) {
    const range = starRanges[i]
    const start = range[0]
    const end = range[1]
    if (!openEvents[start]) openEvents[start] = []
    if (!closeEvents[end]) closeEvents[end] = []
    openEvents[start].push('<span class="star-comment">')
    closeEvents[end].push('</span>')
  }
  const percentOpenTag = '<span class="' + (opt.percentClassEscaped || DEFAULT_PERCENT_CLASS) + '">'
  for (let i = 0; i < percentRanges.length; i++) {
    const range = percentRanges[i]
    const start = range[0]
    const end = range[1]
    if (!openEvents[start]) openEvents[start] = []
    if (!closeEvents[end]) closeEvents[end] = []
    openEvents[start].push(percentOpenTag)
    closeEvents[end].push('</span>')
  }

  let rebuilt = ''
  for (let i = 0; i < segment.length; i++) {
    if (openEvents[i]) rebuilt += openEvents[i].join('')
    rebuilt += segment[i]
    const closeAt = closeEvents[i + 1]
    if (closeAt) rebuilt += closeAt.join('')
  }
  return rebuilt
}

const collectActiveStarIndexes = (text, token) => {
  if (!text || text.indexOf(STAR_CHAR) === -1) return []
  const active = []
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) !== STAR_CHAR_CODE) continue
    if (isEscapedStar(text, i, token)) continue
    active.push(i)
  }
  return active
}

const collectActivePercentIndexes = (text, token) => {
  if (!text || text.indexOf(PERCENT_MARKER) === -1) return []
  const active = []
  for (let i = 0; i < text.length - 1; i++) {
    if (text.charCodeAt(i) !== PERCENT_CHAR_CODE || text.charCodeAt(i + 1) !== PERCENT_CHAR_CODE) continue
    if (isEscapedPercent(text, i, token)) continue
    active.push(i)
    i++
  }
  return active
}

const normalizeEscapeSentinelsInChildren = (tokens) => {
  if (!tokens || !tokens.length) return
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]
    if (!token || token.hidden || token.type !== 'text') continue
    let content = token.content
    if (typeof content !== 'string') {
      content = content == null ? '' : String(content)
    }
    const normalized = normalizeEscapeSentinels(content, token)
    if (normalized !== content) {
      token.content = normalized
    }
  }
}

const applyCrossTokenMarkerSpans = (tokens, marker, openTag) => {
  if (!tokens || !tokens.length) return false
  if (!marker) return false

  const markerLen = marker === STAR_CHAR ? 1 : 2
  const isStar = markerLen === 1
  const resolvedOpenTag = openTag || (isStar
    ? '<span class="star-comment">'
    : '<span class="' + DEFAULT_PERCENT_CLASS + '">')
  const closeTag = '</span>'
  const collectIndexes = isStar ? collectActiveStarIndexes : collectActivePercentIndexes
  const isBarrierToken = (token) => !!(token && token.meta && token.meta.__insideRawHtmlInline)
  const closeByOpen = new Map()
  {
    const nestingStack = []
    for (let t = 0; t < tokens.length; t++) {
      const token = tokens[t]
      if (!token || token.nesting == null || token.nesting === 0) continue
      if (token.nesting > 0) {
        nestingStack.push(t)
      } else {
        const openIndex = nestingStack.length ? nestingStack.pop() : undefined
        if (openIndex !== undefined) {
          closeByOpen.set(openIndex, t)
        }
      }
    }
  }
  const crossingOpenIndexes = new Set()
  const sameStack = (a, b) => {
    if (a.length !== b.length) return false
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false
    }
    return true
  }
  const markCrossingContexts = (startStack, endStack) => {
    const startSet = new Set(startStack)
    const endSet = new Set(endStack)
    for (let i = 0; i < startStack.length; i++) {
      const idx = startStack[i]
      if (!endSet.has(idx)) crossingOpenIndexes.add(idx)
    }
    for (let i = 0; i < endStack.length; i++) {
      const idx = endStack[i]
      if (!startSet.has(idx)) crossingOpenIndexes.add(idx)
    }
  }
  let openMarker = null
  const ranges = []
  const activeNestingStack = []

  for (let t = 0; t < tokens.length; t++) {
    const token = tokens[t]
    if (!token) continue
    if (token.nesting < 0 && activeNestingStack.length) {
      activeNestingStack.pop()
    }
    if (!token.hidden && token.type === 'text' && typeof token.content === 'string') {
      if (isBarrierToken(token)) {
        openMarker = null
      } else {
        const indexes = collectIndexes(token.content, token)
        for (let i = 0; i < indexes.length; i++) {
          const idx = indexes[i]
          if (!openMarker) {
            openMarker = {
              tokenIndex: t,
              index: idx,
              stack: activeNestingStack.slice(),
            }
          } else {
            const endStack = activeNestingStack.slice()
            if (!sameStack(openMarker.stack, endStack)) {
              markCrossingContexts(openMarker.stack, endStack)
            }
            ranges.push({
              startToken: openMarker.tokenIndex,
              startIndex: openMarker.index,
              endToken: t,
              endIndex: idx,
            })
            openMarker = null
          }
        }
      }
    }
    if (token.nesting > 0) {
      activeNestingStack.push(t)
    }
  }

  if (!ranges.length) {
    // keep backslash parity behavior for escaped markers even when no pairs close.
    for (let t = 0; t < tokens.length; t++) {
      const token = tokens[t]
      if (!token || token.hidden || token.type !== 'text' || typeof token.content !== 'string') continue
      if (isBarrierToken(token)) continue
      const meta = token.meta
      const forcedActive = isStar
        ? (meta && meta.__forceActiveStars)
        : (meta && meta.__forceActivePercents)
      if (forcedActive && forcedActive.length) continue
      const collapsed = collapseMarkerEscapes(token.content, marker)
      if (collapsed !== token.content) {
        token.content = collapsed
      }
    }
    return false
  }

  const openAt = new Map()
  const closeAt = new Map()
  const setEvent = (map, tokenIndex, markerIndex) => {
    let tokenEvents = map.get(tokenIndex)
    if (!tokenEvents) {
      tokenEvents = Object.create(null)
      map.set(tokenIndex, tokenEvents)
    }
    tokenEvents[markerIndex] = (tokenEvents[markerIndex] || 0) + 1
  }
  for (let i = 0; i < ranges.length; i++) {
    const range = ranges[i]
    setEvent(openAt, range.startToken, range.startIndex)
    setEvent(closeAt, range.endToken, range.endIndex)
  }

  let changed = false
  for (let t = 0; t < tokens.length; t++) {
    const token = tokens[t]
    if (!token || token.hidden || token.type !== 'text' || typeof token.content !== 'string') continue
    if (isBarrierToken(token)) continue

    const text = token.content
    const tokenOpen = openAt.get(t)
    const tokenClose = closeAt.get(t)
    const canMaskSourceAngles = !(token.meta && token.meta.__crossTokenAnglesMasked)

    let rebuilt = text
    if (tokenOpen || tokenClose) {
      let out = ''
      if (isStar) {
        for (let i = 0; i < text.length; i++) {
          const openCount = tokenOpen && tokenOpen[i] ? tokenOpen[i] : 0
          const closeCount = tokenClose && tokenClose[i] ? tokenClose[i] : 0
          if (openCount) out += resolvedOpenTag.repeat(openCount)
          const ch = text.charCodeAt(i)
          if (canMaskSourceAngles && ch === 60) { // '<'
            out += RAW_HTML_LT_SENTINEL
          } else if (canMaskSourceAngles && ch === 62) { // '>'
            out += RAW_HTML_GT_SENTINEL
          } else {
            out += text[i]
          }
          if (closeCount) out += closeTag.repeat(closeCount)
        }
      } else {
        for (let i = 0; i < text.length; i++) {
          const isMarker = i + 1 < text.length
            && text.charCodeAt(i) === PERCENT_CHAR_CODE
            && text.charCodeAt(i + 1) === PERCENT_CHAR_CODE
          if (isMarker) {
            const openCount = tokenOpen && tokenOpen[i] ? tokenOpen[i] : 0
            const closeCount = tokenClose && tokenClose[i] ? tokenClose[i] : 0
            if (openCount) out += resolvedOpenTag.repeat(openCount)
            out += PERCENT_MARKER
            if (closeCount) out += closeTag.repeat(closeCount)
            i++
            continue
          }
          const ch = text.charCodeAt(i)
          if (canMaskSourceAngles && ch === 60) { // '<'
            out += RAW_HTML_LT_SENTINEL
          } else if (canMaskSourceAngles && ch === 62) { // '>'
            out += RAW_HTML_GT_SENTINEL
          } else {
            out += text[i]
          }
        }
      }
      rebuilt = out
      if (canMaskSourceAngles) {
        token.meta = token.meta || {}
        token.meta.__crossTokenAnglesMasked = true
      }
      changed = true
    }

    const meta = token.meta
    const forcedActive = isStar
      ? (meta && meta.__forceActiveStars)
      : (meta && meta.__forceActivePercents)
    if (!(forcedActive && forcedActive.length)) {
      rebuilt = collapseMarkerEscapes(rebuilt, marker)
    }
    if (rebuilt !== text) {
      token.meta = token.meta || {}
      token.meta.__crossTokenMarkerMutated = true
      token.content = rebuilt
      changed = true
    }
  }

  if (crossingOpenIndexes.size) {
    for (const openIndex of crossingOpenIndexes) {
      const openToken = tokens[openIndex]
      if (openToken && !openToken.hidden) {
        openToken.hidden = true
        changed = true
      }
      const closeIndex = closeByOpen.get(openIndex)
      if (closeIndex === undefined) continue
      const closeToken = tokens[closeIndex]
      if (closeToken && !closeToken.hidden) {
        closeToken.hidden = true
        changed = true
      }
    }
  }

  return changed
}

const createRuntimePlan = (opt) => {
  const rubyEnabled = !!opt.ruby
  const starEnabled = !!opt.starComment
  const percentEnabled = !!opt.percentComment
  const starDeleteEnabled = !!(starEnabled && opt.starCommentDelete)
  const starParagraphEnabled = !!(starEnabled && opt.starCommentParagraph)
  const starLineEnabled = !!(starEnabled && opt.starCommentLine)
  const starParagraphClass = starParagraphEnabled ? (opt.starCommentParagraphClass || '') : ''
  const starParagraphClassEnabled = !!starParagraphClass
  const percentDeleteEnabled = !!(percentEnabled && opt.percentCommentDelete)
  const percentParagraphEnabled = !!(percentEnabled && opt.percentCommentParagraph)
  const percentLineEnabled = !!(percentEnabled && opt.percentCommentLine)
  const percentParagraphClass = percentParagraphEnabled ? (opt.percentCommentParagraphClass || '') : ''
  const percentParagraphClassEnabled = !!percentParagraphClass
  const anyEnabled = rubyEnabled || starEnabled || percentEnabled
  const inlineProfileMask = (rubyEnabled ? 1 : 0)
    | (starEnabled ? 2 : 0)
    | (starDeleteEnabled ? 4 : 0)
    | (starParagraphEnabled ? 8 : 0)
    | (starLineEnabled ? 16 : 0)
    | (percentEnabled ? 32 : 0)
    | (percentDeleteEnabled ? 64 : 0)
    | (percentParagraphEnabled ? 128 : 0)
    | (percentLineEnabled ? 256 : 0)
    | (starParagraphClassEnabled ? 512 : 0)
    | (percentParagraphClassEnabled ? 1024 : 0)
  return {
    rubyEnabled,
    starEnabled,
    starDeleteEnabled,
    starParagraphEnabled,
    starLineEnabled,
    starParagraphClass,
    starParagraphClassEnabled,
    percentEnabled,
    percentDeleteEnabled,
    percentParagraphEnabled,
    percentLineEnabled,
    percentParagraphClass,
    percentParagraphClassEnabled,
    anyEnabled,
    inlineProfileMask,
  }
}

const compileInlineTokenRunner = (profile) => {
  const htmlEnabled = profile.htmlEnabled
  const rubyEnabled = profile.rubyEnabled
  const starEnabled = profile.starEnabled
  const starLineEnabled = profile.starLineEnabled
  const starParagraphEnabled = profile.starParagraphEnabled
  const starParagraphClassEnabled = profile.starParagraphClassEnabled
  const starDeleteEnabled = profile.starDeleteEnabled
  const percentEnabled = profile.percentEnabled
  const percentLineEnabled = profile.percentLineEnabled
  const percentParagraphEnabled = profile.percentParagraphEnabled
  const percentParagraphClassEnabled = profile.percentParagraphClassEnabled
  const percentDeleteEnabled = profile.percentDeleteEnabled
  const shouldNormalizeEscapes = starEnabled || percentEnabled
  const hasInlineMarkerConversion = htmlEnabled && (starEnabled || percentEnabled)

  return (state, opt) => {
    const tokens = state.tokens
    if (!tokens || !tokens.length) return

    for (let i = 0; i < tokens.length; i++) {
      const blockToken = tokens[i]
      if (!blockToken || blockToken.type !== 'inline' || !blockToken.children || !blockToken.children.length) {
        continue
      }
      const blockContent = blockToken.content || ''
      let blockHasStar = starEnabled && blockContent.indexOf(STAR_CHAR) !== -1
      let blockHasPercent = percentEnabled && blockContent.indexOf(PERCENT_MARKER) !== -1
      let blockHasRuby = rubyEnabled && blockContent.indexOf(RUBY_MARK_CHAR) !== -1
      if (!blockHasStar && !blockHasPercent && !blockHasRuby && !blockContent) {
        for (let j = 0; j < blockToken.children.length; j++) {
          const token = blockToken.children[j]
          if (!token || token.type !== 'text' || typeof token.content !== 'string') continue
          if (!blockHasStar && token.content.indexOf(STAR_CHAR) !== -1) blockHasStar = true
          if (!blockHasPercent && token.content.indexOf(PERCENT_MARKER) !== -1) blockHasPercent = true
          if (!blockHasRuby && token.content.indexOf(RUBY_MARK_CHAR) !== -1) blockHasRuby = true
          if (blockHasStar || blockHasPercent || blockHasRuby) break
        }
      }
      if (!blockHasStar && !blockHasPercent && !blockHasRuby) {
        continue
      }
      const children = blockToken.children
      if (children.__inlineRulerProcessed) continue
      children.__inlineRulerProcessed = true

      const isStarParagraph = starParagraphEnabled && isStarCommentParagraph(children)
      const isPercentParagraph = percentParagraphEnabled && isPercentCommentParagraph(children)

      if (isStarParagraph && starDeleteEnabled) {
        children.__starCommentParagraphDelete = true
        hideInlineTokensAfter(children, 0, '__starCommentDelete')
        continue
      }
      if (isPercentParagraph && percentDeleteEnabled) {
        children.__percentCommentParagraphDelete = true
        hideInlineTokensAfter(children, 0, '__percentCommentDelete')
        continue
      }

      if (htmlEnabled && hasInlineHtmlTokens(children)) {
        ensureInlineHtmlContext(children)
      }
      if (starLineEnabled && blockHasStar && !children.__starCommentLineGlobalProcessed) {
        markStarCommentLineGlobal(children, opt)
      }
      if (percentLineEnabled && blockHasPercent && !children.__percentCommentLineGlobalProcessed) {
        markPercentCommentLineGlobal(children, opt)
      }

      const useCrossTokenStarInline = htmlEnabled
        && starEnabled
        && !starLineEnabled
        && !starParagraphEnabled
        && !starDeleteEnabled
      const useCrossTokenPercentInline = htmlEnabled
        && percentEnabled
        && !percentLineEnabled
        && !percentParagraphEnabled
        && !percentDeleteEnabled
      if ((useCrossTokenStarInline || useCrossTokenPercentInline) && shouldNormalizeEscapes) {
        normalizeEscapeSentinelsInChildren(children)
      }
      if (useCrossTokenStarInline && blockHasStar) {
        applyCrossTokenMarkerSpans(children, STAR_CHAR, '<span class="star-comment">')
      }
      if (useCrossTokenPercentInline && blockHasPercent) {
        const percentOpenTag = '<span class="' + (opt.percentClassEscaped || DEFAULT_PERCENT_CLASS) + '">'
        applyCrossTokenMarkerSpans(children, PERCENT_MARKER, percentOpenTag)
      }

      const percentClass = opt.percentClassEscaped || DEFAULT_PERCENT_CLASS
      const wrapStarParagraphInline = isStarParagraph && !starParagraphClassEnabled
      const wrapPercentParagraphInline = isPercentParagraph && !percentParagraphClassEnabled
      const paragraphWrapBounds = (wrapStarParagraphInline || wrapPercentParagraphInline)
        ? findParagraphWrapBounds(children)
        : [-1, -1]
      const paragraphWrapStart = paragraphWrapBounds[0]
      const paragraphWrapEnd = paragraphWrapBounds[1]

      for (let j = 0; j < children.length; j++) {
        const token = children[j]
        if (!token || token.hidden) continue
        if (token.type === 'text') {
          let content = token.content
          if (typeof content !== 'string') {
            content = content == null ? '' : String(content)
          }
          if (htmlEnabled && token.meta && token.meta.__insideRawHtmlInline) {
            continue
          }
          if (shouldNormalizeEscapes) {
            const normalized = normalizeEscapeSentinels(content, token)
            if (normalized !== content) {
              token.content = normalized
              content = normalized
            }
          }
          const meta = token.meta
          const crossTokenMutated = !!(meta && meta.__crossTokenMarkerMutated)
          if (crossTokenMutated) {
            delete meta.__crossTokenMarkerMutated
          }
          const inStarLine = !!(starLineEnabled && meta && meta.__starLineGlobal)
          const inPercentLine = !!(percentLineEnabled && meta && meta.__percentLineGlobal)
          const needsWrap = wrapStarParagraphInline || wrapPercentParagraphInline || inStarLine || inPercentLine
          const hasRubyMarker = rubyEnabled && content.indexOf(RUBY_MARK_CHAR) !== -1
          const starHandledByCrossToken = useCrossTokenStarInline
          const percentHandledByCrossToken = useCrossTokenPercentInline
          let hasStarMarker = htmlEnabled && starEnabled && !starHandledByCrossToken && !inStarLine && content.indexOf(STAR_CHAR) !== -1
          let hasPercentMarker = htmlEnabled && percentEnabled && !percentHandledByCrossToken && !inPercentLine && content.indexOf(PERCENT_MARKER) !== -1
          if (!needsWrap && !hasRubyMarker && !hasStarMarker && !hasPercentMarker && !crossTokenMutated) {
            continue
          }

          const htmlFlags = getHtmlEntityFlags(content)
          const rawAnglesNeeded = (htmlFlags & (HTML_ENTITY_LT | HTML_ENTITY_GT)) !== 0
            && (!htmlEnabled || !crossTokenMutated)
          let rebuilt = content
          let mutated = crossTokenMutated
          let forceHtmlInline = false
          let rawAnglesMasked = !!(meta && meta.__crossTokenAnglesMasked)

          if (rawAnglesNeeded && !rawAnglesMasked) {
            const masked = maskRawHtmlAngles(rebuilt)
            if (masked !== rebuilt) {
              rebuilt = masked
              rawAnglesMasked = true
            }
          }

          const htmlFlagsForEscape = rawAnglesNeeded
            ? (htmlFlags & (HTML_ENTITY_AMP | HTML_ENTITY_QUOT))
            : htmlFlags
          const needsEscape = htmlFlagsForEscape !== 0

          if (hasRubyMarker) {
            if (!htmlEnabled && rawAnglesMasked) {
              const restoredRubyTags = restoreMaskedRubyTags(rebuilt)
              if (restoredRubyTags !== rebuilt) {
                rebuilt = restoredRubyTags
                mutated = true
                forceHtmlInline = true
              }
            }
            const hasRubyWrapper = htmlEnabled ? detectRubyWrapper(children, j) : false
            const converted = convertRubyKnown(rebuilt, hasRubyWrapper)
            if (converted !== rebuilt) {
              rebuilt = converted
              mutated = true
              if (hasInlineMarkerConversion) {
                hasStarMarker = starEnabled && !starHandledByCrossToken && !inStarLine && rebuilt.indexOf(STAR_CHAR) !== -1
                hasPercentMarker = percentEnabled && !percentHandledByCrossToken && !inPercentLine && rebuilt.indexOf(PERCENT_MARKER) !== -1
              }
            }
          }
          if (hasStarMarker || hasPercentMarker) {
            let combinedUsed = false
            if (!htmlEnabled && !needsWrap && hasStarMarker && hasPercentMarker) {
              const combined = convertStarPercentInlineCombinedSegment(rebuilt, opt, token)
              if (combined !== null) {
                combinedUsed = true
                if (combined !== rebuilt) {
                  rebuilt = combined
                  mutated = true
                }
              }
            }
            if (!combinedUsed) {
              if (hasStarMarker) {
                const converted = convertStarCommentInlineSegment(rebuilt, opt, token)
                if (converted !== rebuilt) {
                  rebuilt = converted
                  mutated = true
                }
              }
              if (hasPercentMarker) {
                const converted = convertPercentCommentInlineSegment(rebuilt, opt, token)
                if (converted !== rebuilt) {
                  rebuilt = converted
                  mutated = true
                }
              }
            }
          }

          let prefix = ''
          let suffix = ''
          if (wrapStarParagraphInline) {
            if (j === paragraphWrapStart) prefix += '<span class="star-comment">'
            if (j === paragraphWrapEnd) suffix = '</span>' + suffix
          }
          if (wrapPercentParagraphInline) {
            if (j === paragraphWrapStart) prefix += '<span class="' + percentClass + '">'
            if (j === paragraphWrapEnd) suffix = '</span>' + suffix
          }
          if (inStarLine && meta) {
            if (meta.__starLineGlobalStart) prefix += '<span class="star-comment">'
            if (meta.__starLineGlobalEnd) suffix = '</span>' + suffix
          }
          if (inPercentLine && meta) {
            if (meta.__percentLineGlobalStart) prefix += '<span class="' + percentClass + '">'
            if (meta.__percentLineGlobalEnd) suffix = '</span>' + suffix
          }
          if (prefix || suffix) {
            rebuilt = prefix + rebuilt + suffix
            mutated = true
          }
          if (needsEscape) {
            forceHtmlInline = true
            const escaped = escapeInlineHtml(rebuilt, htmlFlagsForEscape)
            if (escaped !== rebuilt) {
              rebuilt = escaped
              mutated = true
            }
          }
          if (rawAnglesMasked) {
            const restored = restoreRawHtmlAngles(rebuilt)
            if (restored !== rebuilt) {
              rebuilt = restored
              mutated = true
              forceHtmlInline = true
            }
            if (meta && meta.__crossTokenAnglesMasked) {
              delete meta.__crossTokenAnglesMasked
            }
          }
          if (mutated || forceHtmlInline) {
            token.type = 'html_inline'
            token.tag = ''
            token.nesting = 0
            token.content = rebuilt
          } else if (rebuilt !== token.content) {
            token.content = rebuilt
          }
          continue
        }
      }
    }
  }
}

const getCompiledInlineTokenRunner = (md, runtime, htmlEnabled) => {
  const cache = md.__inlineTokenRunnerCache || (md.__inlineTokenRunnerCache = [])
  const key = (runtime.inlineProfileMask << 1) | (htmlEnabled ? 1 : 0)
  let runner = cache[key]
  if (runner) return runner
  runner = compileInlineTokenRunner({
    htmlEnabled,
    rubyEnabled: runtime.rubyEnabled,
    starEnabled: runtime.starEnabled,
    starLineEnabled: runtime.starLineEnabled,
    starParagraphEnabled: runtime.starParagraphEnabled,
    starParagraphClassEnabled: runtime.starParagraphClassEnabled,
    starDeleteEnabled: runtime.starDeleteEnabled,
    percentEnabled: runtime.percentEnabled,
    percentLineEnabled: runtime.percentLineEnabled,
    percentParagraphEnabled: runtime.percentParagraphEnabled,
    percentParagraphClassEnabled: runtime.percentParagraphClassEnabled,
    percentDeleteEnabled: runtime.percentDeleteEnabled,
  })
  cache[key] = runner
  return runner
}

const convertInlineTokens = (md) => {
  return (state) => {
    const opt = md.__rendererInlineTextOptions
    const runtime = md.__rendererInlineTextRuntime
    if (!opt || !runtime || !runtime.anyEnabled) return
    const htmlEnabled = !!(state.md && state.md.options && state.md.options.html)
    const runner = getCompiledInlineTokenRunner(md, runtime, htmlEnabled)
    runner(state, opt, runtime)
  }
}

const normalizePluginOptions = (md, option = {}) => {
  const rawOption = option && typeof option === 'object' ? option : {}
  const escapeHtml = md && md.utils && typeof md.utils.escapeHtml === 'function'
    ? md.utils.escapeHtml
    : fallbackEscapeHtml
  const opt = {
    ruby: false,
    starComment: false,
    starCommentDelete: false,
    starCommentParagraph: false,
    starCommentLine: false,
    starCommentParagraphClass: false,
    percentComment: false,
    percentCommentDelete: false,
    percentCommentParagraph: false,
    percentCommentLine: false,
    percentCommentParagraphClass: false,
    percentClass: DEFAULT_PERCENT_CLASS,
    ...rawOption,
  }
  opt.escapeHtml = escapeHtml
  opt.starCommentParagraph = opt.starCommentParagraph && !opt.starCommentLine
  opt.percentCommentParagraph = opt.percentCommentParagraph && !opt.percentCommentLine
  const percentClass = normalizePercentClass(escapeHtml, opt.percentClass)
  opt.percentClass = percentClass.raw
  opt.percentClassEscaped = percentClass.escaped
  opt.starCommentParagraphClass = normalizeParagraphClass(opt.starCommentParagraphClass, DEFAULT_STAR_CLASS)
  opt.percentCommentParagraphClass = normalizeParagraphClass(opt.percentCommentParagraphClass, opt.percentClass)
  return opt
}

function rendererInlineText (md, option = {}) {
  const opt = normalizePluginOptions(md, option)
  md.__rendererInlineTextOptions = opt
  const runtime = createRuntimePlan(opt)
  md.__rendererInlineTextRuntime = runtime
  const rubyEnabled = runtime.rubyEnabled
  const starEnabled = runtime.starEnabled
  const starDeleteEnabled = runtime.starDeleteEnabled
  const starParagraphEnabled = runtime.starParagraphEnabled
  const starLineEnabled = runtime.starLineEnabled
  const starParagraphClass = runtime.starParagraphClass
  const starParagraphClassEnabled = runtime.starParagraphClassEnabled
  const percentEnabled = runtime.percentEnabled
  const percentDeleteEnabled = runtime.percentDeleteEnabled
  const percentParagraphEnabled = runtime.percentParagraphEnabled
  const percentLineEnabled = runtime.percentLineEnabled
  const percentParagraphClass = runtime.percentParagraphClass
  const percentParagraphClassEnabled = runtime.percentParagraphClassEnabled
  const anyEnabled = runtime.anyEnabled
  md.__escapeMetaEnabled = !!(starEnabled || percentEnabled)
  md.__starCommentLineGlobalEnabled = starLineEnabled
  md.__starCommentParagraphDeleteEnabled = !!(starParagraphEnabled && starDeleteEnabled)
  md.__percentCommentParagraphDeleteEnabled = !!(percentParagraphEnabled && percentDeleteEnabled)
  md.__percentCommentLineGlobalEnabled = percentLineEnabled
  md.__starCommentParagraphClass = starParagraphClass
  md.__percentCommentParagraphClass = percentParagraphClass
  md.__paragraphWrapperAdjustEnabled = !!(
    starLineEnabled
    || percentLineEnabled
    || (starParagraphEnabled && starDeleteEnabled)
    || (percentParagraphEnabled && percentDeleteEnabled)
    || starParagraphClassEnabled
    || percentParagraphClassEnabled
  )
  if (!anyEnabled) return

  patchCoreRulerOrderGuard(md)

  if (starLineEnabled) {
    ensureStarCommentLineCore(md)
  }
  if (percentLineEnabled) {
    ensurePercentCommentLineCore(md)
  }
  if (starParagraphEnabled && starDeleteEnabled) {
    ensureParagraphDeleteSupport(md)
    ensureStarCommentParagraphDeleteCore(md)
  }
  if (starLineEnabled && starDeleteEnabled) {
    ensureParagraphDeleteSupport(md)
  }
  if (percentParagraphEnabled && percentDeleteEnabled) {
    ensureParagraphDeleteSupport(md)
    ensurePercentCommentParagraphDeleteCore(md)
  }
  if (percentLineEnabled && percentDeleteEnabled) {
    ensureParagraphDeleteSupport(md)
  }
  if (starParagraphClassEnabled || percentParagraphClassEnabled) {
    ensureParagraphDeleteSupport(md)
  }

  if ((starEnabled || percentEnabled) && !md.__escapeMetaReady) {
    md.__escapeMetaReady = true
    md.inline.ruler.before('escape', 'star_percent_escape_meta', applyEscapeMetaInlineRule)
  }
  if ((starEnabled || percentEnabled) && !md.__commentPreparseReady) {
    md.__commentPreparseReady = true
    md.inline.ruler.before('text', 'star_percent_comment_preparse', createCommentPreparseInlineRule(md))
  }

  if (!md.__inlineRulerConvertReady) {
    md.__inlineRulerConvertReady = true
    safeCoreRule(md, 'inline_ruler_convert', convertInlineTokens(md))
  }
}

export default rendererInlineText
