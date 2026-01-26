const STAR_CHAR = '★'
const STAR_PLACEHOLDER_CLOSE = '</span star-comment>'
const STAR_COMMENT_LINE_META_KEY = 'starCommentLineDelete'
const STAR_CHAR_CODE = STAR_CHAR.charCodeAt(0)
const PERCENT_CHAR = '%'
const PERCENT_CHAR_CODE = PERCENT_CHAR.charCodeAt(0)
const ESCAPED_STAR_SENTINEL = '\u0001'
const ACTIVE_STAR_SENTINEL = '\u0002'
const ESCAPED_PERCENT_SENTINEL = '\u0003'
const ACTIVE_PERCENT_SENTINEL = '\u0004'
const PERCENT_COMMENT_LINE_META_KEY = 'percentCommentLineDelete'
const INLINE_HTML_SPLIT_REGEXP = /(<[^>]+>)/g
const INLINE_HTML_TAG_REGEXP = /^<\s*(\/)?\s*([A-Za-z][\w:-]*)/i
const INLINE_HTML_SELF_CLOSE_REGEXP = /\/>\s*$/
// HTML void tags that never push onto the inline stack while scanning HTML spans
const INLINE_HTML_VOID_TAGS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link',
  'meta', 'param', 'source', 'track', 'wbr',
])

const RUBY_REGEXP_CONTENT = '(<ruby>)?([\\p{sc=Han}0-9A-Za-z.\\-_]+)《([^》]+?)》(<\\/ruby>)?'
const RUBY_REGEXP = new RegExp(RUBY_REGEXP_CONTENT, 'ug')
const RUBY_TRIGGER_REGEXP = /《/
const STAR_PLACEHOLDER_CLOSE_REGEXP = /<\/span star-comment>/g
const HTML_ENTITIES_REGEXP = /[<&>]/
const HTML_AMP_REGEXP = /&/g
const HTML_LT_NONTAG_REGEXP = /<(?!\/?[\w\s="/.':;#-\/\?]+>)/g
const HTML_GT_NONTAG_REGEXP = /(?<!<\/?[\w\s="/.':;#-\/\?]+)>(?![^<]*>)/g
const HTML_EMPTY_TAG_REGEXP = /<(\/?)>/g
const HTML_SLASHED_TAG_REGEXP = /<([^>]+?\/[^>]+?)>/g

const detectRubyWrapper = (tokens, idx) => {
  if (!tokens[idx - 1] || !tokens[idx + 1]) return false
  return tokens[idx - 1].type === 'html_inline'
    && tokens[idx - 1].content === '<ruby>'
    && tokens[idx + 1].type === 'html_inline'
    && tokens[idx + 1].content === '</ruby>'
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

const ensureInlineHtmlContext = (tokens) => {
  if (!tokens || tokens.__inlineHtmlContextReady) return
  tokens.__inlineHtmlContextReady = true
  const stack = []
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]
    if (!token) continue
    if (token.type === 'html_inline') {
      const raw = token.content || ''
      if (!raw || raw[0] !== '<' || raw[1] === '!') continue
      const tagMatch = raw.match(INLINE_HTML_TAG_REGEXP)
      if (!tagMatch) continue
      const isClosing = !!tagMatch[1]
      const tagName = tagMatch[2] ? tagMatch[2].toLowerCase() : ''
      if (!tagName) continue
      const isVoid = INLINE_HTML_VOID_TAGS.has(tagName)
      let isSelfClosing = false
      if (!isClosing && !isVoid) {
        isSelfClosing = INLINE_HTML_SELF_CLOSE_REGEXP.test(raw)
      }
      if (isClosing) {
        if (stack.length && stack[stack.length - 1] === tagName) {
          stack.pop()
        } else {
          const idx = stack.lastIndexOf(tagName)
          if (idx !== -1) {
            stack.splice(idx, 1)
          } else if (stack.length) {
            stack.pop()
          }
        }
      } else if (!isVoid && !isSelfClosing) {
        stack.push(tagName)
      }
    } else if (token.type === 'text' && stack.length) {
      token.meta = token.meta || {}
      token.meta.__insideHtmlInline = true
    }
  }
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
  if (token) {
    token.meta = token.meta || {}
    if (token.meta.__sentinelNormalized) return text
    token.meta.__sentinelNormalized = true
  }
  const hasSentinel = text.indexOf(ESCAPED_STAR_SENTINEL) !== -1
    || text.indexOf(ACTIVE_STAR_SENTINEL) !== -1
    || text.indexOf(ESCAPED_PERCENT_SENTINEL) !== -1
    || text.indexOf(ACTIVE_PERCENT_SENTINEL) !== -1
  if (!hasSentinel) return text

  token.meta = token.meta || {}
  const activeStars = token.meta.__forceActiveStars || (token.meta.__forceActiveStars = [])
  const escapedStars = token.meta.__forceEscapedStars || (token.meta.__forceEscapedStars = [])
  const activePercents = token.meta.__forceActivePercents || (token.meta.__forceActivePercents = [])
  const escapedPercents = token.meta.__forceEscapedPercents || (token.meta.__forceEscapedPercents = [])

  let rebuilt = ''
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (ch === ESCAPED_STAR_SENTINEL || ch === ACTIVE_STAR_SENTINEL) {
      const next = text[i + 1]
      if (next === STAR_CHAR) {
        const idx = rebuilt.length
        if (ch === ESCAPED_STAR_SENTINEL) {
          escapedStars.push(idx)
        } else {
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
          escapedPercents.push(idx)
        } else {
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
  if (!value || value.indexOf('\\') === -1 || !marker) return value
  const markerLen = marker.length
  let rebuilt = ''
  let i = 0

  while (i < value.length) {
    const isMarker = markerLen === 1
      ? value[i] === marker
      : value.startsWith(marker, i)
    if (isMarker) {
      let backslashCount = 0
      let cursor = i - 1
      while (cursor >= 0 && value.charCodeAt(cursor) === 92) {
        backslashCount++
        cursor--
      }
      if (backslashCount) {
        rebuilt = rebuilt.slice(0, rebuilt.length - backslashCount)
        const keepCount = backslashCount >> 1
        if (keepCount > 0) rebuilt += '\\'.repeat(keepCount)
      }
      rebuilt += marker
      i += markerLen
      continue
    }
    rebuilt += value[i]
    i++
  }

  return rebuilt
}

const applyEscapeMetaInlineRule = (state, silent) => {
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
      token.content = keepStr + sentinel + PERCENT_CHAR + PERCENT_CHAR
    }
  }

  state.pos = isStar ? pos + 1 : pos + 2
  return true
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

const findUsableStar = (text, start = 0, token) => {
  let position = text.indexOf(STAR_CHAR, start)
  while (position !== -1) {
    const nextIdx = position + 1
    const isPlaceholder = nextIdx < text.length
      && text.charCodeAt(nextIdx) === 60
      && text.startsWith(STAR_PLACEHOLDER_CLOSE, nextIdx)
    if (!isPlaceholder && !isEscapedStar(text, position, token)) {
      return position
    }
    position = text.indexOf(STAR_CHAR, position + 1)
  }
  return -1
}

const isStarIndexReserved = (token, starIdx) => {
  const meta = token && token.meta
  const reserved = meta && meta.__starCommentReservedIdxs
  return !!(reserved && reserved.indexOf(starIdx) !== -1)
}

const reserveStarIndex = (token, starIdx) => {
  if (!token) return
  token.meta = token.meta || {}
  const reserved = token.meta.__starCommentReservedIdxs
  if (reserved) {
    if (reserved.indexOf(starIdx) === -1) {
      reserved.push(starIdx)
    }
  } else {
    token.meta.__starCommentReservedIdxs = [starIdx]
  }
}

const findUsableStarInToken = (token, start = 0) => {
  if (!token || typeof token.content !== 'string') return -1
  const text = normalizeEscapeSentinels(token.content, token)
  if (text !== token.content) {
    token.content = text
  }
  let position = text.indexOf(STAR_CHAR, start)
  while (position !== -1) {
    const nextIdx = position + 1
    const isPlaceholder = nextIdx < text.length
      && text.charCodeAt(nextIdx) === 60
      && text.startsWith(STAR_PLACEHOLDER_CLOSE, nextIdx)
    if (!isStarIndexReserved(token, position)
      && !isPlaceholder
      && !isEscapedStar(text, position, token)) {
      return position
    }
    position = text.indexOf(STAR_CHAR, position + 1)
  }
  return -1
}

const injectStarClosePlaceholders = (value, indices) => {
  if (!indices || !indices.length) return value
  let rebuilt = value
  for (let i = indices.length - 1; i >= 0; i--) {
    const idx = indices[i]
    if (idx < 0 || idx >= value.length) continue
    rebuilt = rebuilt.slice(0, idx + 1)
      + STAR_PLACEHOLDER_CLOSE
      + rebuilt.slice(idx + 1)
  }
  return rebuilt
}

const scrubToken = (token) => {
  if (!token) return
  token.hidden = true
  token.content = ''
  token.tag = ''
  token.nesting = 0
  if (token.type !== 'text') {
    token.type = 'text'
  }
  token.meta = token.meta || {}
  token.meta.__starCommentDelete = true
}

const escapeInlineHtml = (value) => {
  let escaped = value
  const hasAmp = escaped.indexOf('&') !== -1
  const hasLt = escaped.indexOf('<') !== -1
  const hasGt = escaped.indexOf('>') !== -1
  if (hasAmp) {
    escaped = escaped.replace(HTML_AMP_REGEXP, '&amp;')
  }
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

const findLastTextTokenIndex = (tokens, start, end) => {
  for (let i = end - 1; i >= start; i--) {
    if (tokens[i] && tokens[i].type === 'text' && tokens[i].content !== '') {
      return i
    }
  }
  return -1
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

  const endTextIdx = findLastTextTokenIndex(tokens, start, end)
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
  let cursor = 0
  while (cursor < firstToken.content.length && (firstToken.content[cursor] === ' ' || firstToken.content[cursor] === '\t')) {
    cursor++
  }
  if (cursor >= firstToken.content.length - 1) return
  if (firstToken.content[cursor] !== PERCENT_CHAR || firstToken.content[cursor + 1] !== PERCENT_CHAR) return
  if (isEscapedPercent(firstToken.content, cursor)) return

  const endTextIdx = findLastTextTokenIndex(tokens, start, end)
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

  const deleteMode = opt.percentCommentDelete || opt.starCommentDelete
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

const hasPercentCommentLineCandidate = (tokens) => {
  if (!tokens || !tokens.length || tokens.__percentCommentLineGlobalProcessed) return false
  if (tokens.__percentCommentLineCandidate !== undefined) {
    return tokens.__percentCommentLineCandidate
  }
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]
    if (token && typeof token.content === 'string' && token.content.indexOf(PERCENT_CHAR + PERCENT_CHAR) !== -1) {
      tokens.__percentCommentLineCandidate = true
      return true
    }
  }
  tokens.__percentCommentLineCandidate = false
  return false
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

    // Drop per-source cache after this render pass to avoid holding onto large
    // source strings across renders while keeping same-run reuse intact.
    if (md.__starCommentLineCache && md.__starCommentLineCache.src === state.src) {
      md.__starCommentLineCache = null
    }
  })
}

const ensurePercentCommentLineCore = (md) => {
  if (md.__percentCommentLineCoreReady) return
  md.__percentCommentLineCoreReady = true

  safeCoreRule(md, 'percent_comment_line_marker', (state) => {
    if (!state.tokens || !state.tokens.length || !state.src) return
    if (state.src.indexOf(PERCENT_CHAR + PERCENT_CHAR) === -1) return
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

    // Release per-source cache after use; recreated on the next render.
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

const shouldSkipParagraphByStarLine = (tokens, idx, direction) => {
  const inlineToken = direction === 'open'
    ? tokens[idx + 1]
    : tokens[idx - 1]
  if (!inlineToken || inlineToken.type !== 'inline') return false
  if (inlineToken.meta && (inlineToken.meta[STAR_COMMENT_LINE_META_KEY] || inlineToken.meta[PERCENT_COMMENT_LINE_META_KEY])) return true
  return !!(inlineToken.children && (inlineToken.children.__starCommentParagraphDelete || inlineToken.children.__percentCommentParagraphDelete))
}

const patchParagraphRulesForStarLine = (md) => {
  if (md.__starCommentLineParagraphPatched) return
  md.__starCommentLineParagraphPatched = true

  const defaultParagraphOpen = md.renderer.rules.paragraph_open
    || ((tokens, idx, options, env, self) => self.renderToken(tokens, idx, options))
  const defaultParagraphClose = md.renderer.rules.paragraph_close
    || ((tokens, idx, options, env, self) => self.renderToken(tokens, idx, options))

  md.renderer.rules.paragraph_open = (tokens, idx, options, env, self) => {
    if (shouldSkipParagraphByStarLine(tokens, idx, 'open')) {
      return ''
    }
    return defaultParagraphOpen(tokens, idx, options, env, self)
  }

  md.renderer.rules.paragraph_close = (tokens, idx, options, env, self) => {
    if (shouldSkipParagraphByStarLine(tokens, idx, 'close')) {
      return ''
    }
    return defaultParagraphClose(tokens, idx, options, env, self)
  }
}

const ensureStarCommentLineDeleteSupport = (md) => {
  if (md.__starCommentLineDeleteSupport) return
  md.__starCommentLineDeleteSupport = true
  ensureStarCommentLineCore(md)
  patchParagraphRulesForStarLine(md)
}

const ensureParagraphDeleteSupport = (md) => {
  if (md.__paragraphDeletePatched) return
  md.__paragraphDeletePatched = true
  patchParagraphRulesForStarLine(md)
}

const applyStrayStar = (segment, tokens, idx, opt, htmlEnabled) => {
  const currentToken = tokens[idx]
  const strayIndex = findUsableStar(segment, 0, currentToken)
  if (strayIndex === -1) return segment
  const hasNextStarPos = hasNextStar(tokens, idx, opt, htmlEnabled)
  if (hasNextStarPos === -1) return segment
  const starBeforeCont = segment.slice(0, strayIndex)
  const starAfterCont = segment.slice(strayIndex + 1)
  return opt.starCommentDelete
    ? starBeforeCont
    : starBeforeCont + '<span class="star-comment">★' + starAfterCont
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

const applyRubySegment = (value, rubyActive, hasRubyWrapper) => {
  if (!rubyActive) return value
  return convertRubyKnown(value, hasRubyWrapper)
}

const hasStarCommentLineCandidate = (tokens) => {
  if (!tokens || !tokens.length || tokens.__starCommentLineGlobalProcessed) return false
  if (tokens.__starCommentLineCandidate !== undefined) {
    return tokens.__starCommentLineCandidate
  }
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]
    if (token && typeof token.content === 'string' && token.content.indexOf(STAR_CHAR) !== -1) {
      tokens.__starCommentLineCandidate = true
      return true
    }
  }
  tokens.__starCommentLineCandidate = false
  return false
}

const convertStarComment = (cont, tokens, idx, htmlEnabled, opt, rubyActive, rubyWrapperCache) => {
  const isParagraphStar = opt.starCommentParagraph && isStarCommentParagraph(tokens)
  const currentToken = tokens[idx]
  const insideInlineHtml = htmlEnabled && !opt.insideHtml
    && currentToken
    && currentToken.meta
    && currentToken.meta.__insideHtmlInline
  let meta = currentToken && currentToken.meta
  const hasInjectedClose = !!(meta && meta.__starCommentInjectedCloseAt && meta.__starCommentInjectedCloseAt.length)
  if (meta && meta.__starCommentDelete) {
    return ''
  }
  if (meta && typeof meta.__starCommentDeleteFrom === 'number') {
    cont = cont.slice(meta.__starCommentDeleteFrom)
  }
  if (hasInjectedClose) {
    cont = injectStarClosePlaceholders(cont, meta.__starCommentInjectedCloseAt)
  }

  if (insideInlineHtml && !isParagraphStar) {
    let processed = applyRubySegment(cont, rubyActive, rubyWrapperCache)
    if (hasInjectedClose) {
      processed = processed.replace(STAR_PLACEHOLDER_CLOSE_REGEXP, '</span>')
    }
    return processed
  }

  if (opt.starCommentLine) {
    if (!tokens.__starCommentLineGlobalProcessed && hasStarCommentLineCandidate(tokens)) {
      markStarCommentLineGlobal(tokens, opt)
    }
    meta = currentToken && currentToken.meta
    if (meta && meta.__starLineGlobal) {
      if (opt.starCommentDelete) {
        return ''
      }
      let processed = applyRubySegment(cont, rubyActive, rubyWrapperCache)
      if (meta.__starLineGlobalStart) {
        processed = '<span class="star-comment">' + processed
      }
      if (meta.__starLineGlobalEnd) {
        processed += '</span>'
      }
      if (hasInjectedClose) {
        processed = processed.replace(STAR_PLACEHOLDER_CLOSE_REGEXP, '</span>')
      }
      return processed
    }
  }

  if (isParagraphStar) {
    if (opt.starCommentDelete) {
      tokens.__starCommentParagraphDelete = true
    }
    if (idx === 0) {
      if (opt.starCommentDelete) {
        hideInlineTokensAfter(tokens, idx + 1)
        return ''
      } else {
        cont = '<span class="star-comment">' + applyRubySegment(cont, rubyActive, rubyWrapperCache)
        if (tokens.length === 1) cont += '</span>'
      }
      if (hasInjectedClose) {
        cont = cont.replace(STAR_PLACEHOLDER_CLOSE_REGEXP, '</span>')
      }
      return cont
    }

    if (opt.starCommentDelete) {
      hideInlineTokensAfter(tokens, idx + 1)
      return ''
    }

    let processed = applyRubySegment(cont, rubyActive, rubyWrapperCache)
    if (hasInjectedClose) {
      processed = processed.replace(STAR_PLACEHOLDER_CLOSE_REGEXP, '</span>')
    }
    if (idx === tokens.length - 1) return processed + '</span>'
    return processed
  }

  const hasStar = cont.indexOf(STAR_CHAR) !== -1
  const hasPlaceholder = hasInjectedClose || cont.indexOf(STAR_PLACEHOLDER_CLOSE) !== -1
  const backslashLookup = meta && meta.__backslashLookup
    ? meta.__backslashLookup
    : (cont.indexOf('\\') !== -1 ? createBackslashLookup(cont) : null)
  if (meta && backslashLookup && !meta.__backslashLookup) {
    meta.__backslashLookup = backslashLookup
  }
  if (!hasStar && !hasPlaceholder) {
    return applyRubySegment(cont, rubyActive, rubyWrapperCache)
  }
  let rebuilt = ''
  let cursor = 0
  let needsPlaceholderReplace = hasPlaceholder
  const unescapedStars = []
  const injectedClose = meta && meta.__starCommentInjectedCloseAt
  for (let i = 0; i < cont.length; i++) {
    if (cont.charCodeAt(i) !== STAR_CHAR_CODE) continue
    if (isStarIndexReserved(currentToken, i)) continue
    if (injectedClose && injectedClose.indexOf(i) !== -1) continue
    if (!isEscapedStar(cont, i, currentToken)) {
      unescapedStars.push(i)
    }
  }

  for (let i = 0; i + 1 < unescapedStars.length; i += 2) {
    const startIdx = unescapedStars[i]
    const endIdx = unescapedStars[i + 1]
    const shouldKeepEscapes = meta
      && meta.__forceActiveStars
      && meta.__forceActiveStars.indexOf(startIdx) !== -1
    const startEscapes = shouldKeepEscapes
      ? 0
      : getBackslashCountBefore(cont, startIdx, meta)
    const segmentBefore = applyRubySegment(
      cont.slice(cursor, startIdx - startEscapes),
      rubyActive,
      rubyWrapperCache,
    )
    const keptStartEscapes = startEscapes ? '\\'.repeat(Math.floor(startEscapes / 2)) : ''
    rebuilt += applyStrayStar(segmentBefore + keptStartEscapes, tokens, idx, opt, htmlEnabled)
    if (!opt.starCommentDelete) {
      const starBody = cont.slice(startIdx, endIdx + 1)
      rebuilt += '<span class="star-comment">' + starBody + STAR_PLACEHOLDER_CLOSE
      needsPlaceholderReplace = true
    }
    cursor = endIdx + 1
  }

  rebuilt += applyStrayStar(
    applyRubySegment(cont.slice(cursor), rubyActive, rubyWrapperCache),
    tokens,
    idx,
    opt,
    htmlEnabled,
  )

  if (needsPlaceholderReplace) {
    rebuilt = rebuilt.replace(STAR_PLACEHOLDER_CLOSE_REGEXP, '</span>')
  }
  const hasForceActiveStar = meta && meta.__forceActiveStars && meta.__forceActiveStars.length
  if (!hasForceActiveStar) {
    rebuilt = collapseMarkerEscapes(rebuilt, STAR_CHAR)
  }
  return rebuilt
}

const convertPercentLineIfNeeded = (cont, tokens, idx, htmlEnabled, opt, needsPercent, insideInlineHtml) => {
  if (!opt.percentCommentLine) return { cont, handled: false }
  if (!tokens.__percentCommentLineGlobalProcessed && hasPercentCommentLineCandidate(tokens)) {
    markPercentCommentLineGlobal(tokens, opt)
  }
  const meta = tokens[idx] && tokens[idx].meta
  if (!meta || !meta.__percentLineGlobal) return { cont, handled: false }

  if (insideInlineHtml && !opt.insideHtml) {
    return { cont, handled: true }
  }

  if (opt.percentCommentDelete || opt.starCommentDelete) {
    return { cont: '', handled: true }
  }

  let processed = cont
  if (needsPercent) {
    processed = convertPercentComment(processed, opt, tokens[idx])
  }
  const cls = opt.percentClass || 'percent-comment'
  if (meta.__percentLineGlobalStart) {
    processed = '<span class="' + cls + '">' + processed
  }
  if (meta.__percentLineGlobalEnd) {
    processed += '</span>'
  }
  return { cont: processed, handled: true }
}

const convertPercentComment = (cont, opt, token) => {
  if (!cont || cont.indexOf(PERCENT_CHAR + PERCENT_CHAR) === -1) return cont
  const deleteMode = opt.percentCommentDelete || opt.starCommentDelete
  const meta = token && token.meta
  const backslashLookup = meta && meta.__backslashLookup
    ? meta.__backslashLookup
    : (cont.indexOf('\\') !== -1 ? createBackslashLookup(cont) : null)
  if (meta && backslashLookup && !meta.__backslashLookup) {
    meta.__backslashLookup = backslashLookup
  }
  const percentMarkers = []
  for (let i = 0; i < cont.length - 1; i++) {
    if (cont[i] !== PERCENT_CHAR || cont[i + 1] !== PERCENT_CHAR) continue
    if (!isEscapedPercent(cont, i, token)) {
      percentMarkers.push(i)
    }
    i++
  }

  let rebuilt = ''
  let cursor = 0
  for (let i = 0; i + 1 < percentMarkers.length; i += 2) {
    const startIdx = percentMarkers[i]
    const endIdx = percentMarkers[i + 1]
    const shouldKeepEscapes = token
      && token.meta
      && token.meta.__forceActivePercents
      && token.meta.__forceActivePercents.indexOf(startIdx) !== -1
    const startEscapes = shouldKeepEscapes
      ? 0
      : getBackslashCountBefore(cont, startIdx, meta)
    const keptStartEscapes = startEscapes ? '\\'.repeat(Math.floor(startEscapes / 2)) : ''
    rebuilt += cont.slice(cursor, startIdx - startEscapes) + keptStartEscapes
    if (!deleteMode) {
      const cls = opt.percentClass || 'percent-comment'
      rebuilt += '<span class="' + cls + '">' + cont.slice(startIdx, endIdx + 2) + '</span>'
    }
    cursor = endIdx + 2
  }

  rebuilt += cont.slice(cursor)
  const hasForceActivePercent = meta && meta.__forceActivePercents && meta.__forceActivePercents.length
  if (!hasForceActivePercent) {
    rebuilt = collapseMarkerEscapes(rebuilt, PERCENT_CHAR + PERCENT_CHAR)
  }
  return rebuilt
}

const convertStarCommentHtmlSegment = (segment, opt) => {
  if (!segment || segment.indexOf(STAR_CHAR) === -1) return segment
  const backslashLookup = segment.indexOf('\\') !== -1 ? createBackslashLookup(segment) : null
  const getEscapesBefore = backslashLookup
    ? (idx) => backslashLookup(idx)
    : (idx) => countBackslashesBefore(segment, idx)
  let rebuilt = ''
  let cursor = 0
  let openIdx = -1

  for (let i = 0; i < segment.length; i++) {
    if (segment.charCodeAt(i) !== STAR_CHAR_CODE) continue
    if (segment.startsWith(STAR_PLACEHOLDER_CLOSE, i + 1)) continue
    if (isEscapedStar(segment, i)) continue
    if (openIdx === -1) {
      openIdx = i
      continue
    }
    const startEscapes = getEscapesBefore(openIdx)
    const keptStartEscapes = startEscapes ? '\\'.repeat(startEscapes / 2) : ''
    rebuilt += segment.slice(cursor, openIdx - startEscapes) + keptStartEscapes
    if (!opt.starCommentDelete) {
      rebuilt += '<span class="star-comment">' + segment.slice(openIdx, i + 1) + '</span>'
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
  return collapseMarkerEscapes(rebuilt, STAR_CHAR)
}

const convertStarCommentHtmlContent = (value, opt, hasStar) => {
  if (!value || !hasStar) return value
  if (value.indexOf('<') === -1) {
    return convertStarCommentHtmlSegment(value, opt)
  }
  let cursor = 0
  let rebuilt = ''
  INLINE_HTML_SPLIT_REGEXP.lastIndex = 0
  let match
  while ((match = INLINE_HTML_SPLIT_REGEXP.exec(value)) !== null) {
    if (match.index > cursor) {
      rebuilt += convertStarCommentHtmlSegment(value.slice(cursor, match.index), opt)
    }
    rebuilt += match[0]
    cursor = match.index + match[0].length
  }
  if (cursor < value.length) {
    rebuilt += convertStarCommentHtmlSegment(value.slice(cursor), opt)
  }
  return rebuilt
}

const convertPercentCommentHtmlSegment = (segment, opt) => {
  if (!segment || segment.indexOf(PERCENT_CHAR + PERCENT_CHAR) === -1) return segment
  const deleteMode = opt.percentCommentDelete || opt.starCommentDelete
  const cls = opt.percentClass || 'percent-comment'
  const backslashLookup = segment.indexOf('\\') !== -1 ? createBackslashLookup(segment) : null
  const getEscapesBefore = backslashLookup
    ? (idx) => backslashLookup(idx)
    : (idx) => countBackslashesBefore(segment, idx)
  let rebuilt = ''
  let cursor = 0
  let openIdx = -1

  for (let i = 0; i < segment.length - 1; i++) {
    if (segment[i] !== PERCENT_CHAR || segment[i + 1] !== PERCENT_CHAR) continue
    if (isEscapedPercent(segment, i)) continue
    if (openIdx === -1) {
      openIdx = i
      i++
      continue
    }
    const startEscapes = getEscapesBefore(openIdx)
    const keptStartEscapes = startEscapes ? '\\'.repeat(startEscapes / 2) : ''
    rebuilt += segment.slice(cursor, openIdx - startEscapes) + keptStartEscapes
    if (!deleteMode) {
      rebuilt += '<span class="' + cls + '">' + segment.slice(openIdx, i + 2) + '</span>'
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
  return collapseMarkerEscapes(rebuilt, PERCENT_CHAR + PERCENT_CHAR)
}

const convertPercentCommentHtmlContent = (value, opt) => {
  if (!value || value.indexOf(PERCENT_CHAR + PERCENT_CHAR) === -1) return value
  if (value.indexOf('<') === -1) {
    return convertPercentCommentHtmlSegment(value, opt)
  }
  let cursor = 0
  let rebuilt = ''
  INLINE_HTML_SPLIT_REGEXP.lastIndex = 0
  let match
  while ((match = INLINE_HTML_SPLIT_REGEXP.exec(value)) !== null) {
    if (match.index > cursor) {
      rebuilt += convertPercentCommentHtmlSegment(value.slice(cursor, match.index), opt)
    }
    rebuilt += match[0]
    cursor = match.index + match[0].length
  }
  if (cursor < value.length) {
    rebuilt += convertPercentCommentHtmlSegment(value.slice(cursor), opt)
  }
  return rebuilt
}

const convertRubyHtmlContent = (value, hasRubyTrigger) => {
  if (!value || !hasRubyTrigger) return value
  RUBY_REGEXP.lastIndex = 0
  let replaced = false
  const converted = value.replace(RUBY_REGEXP, (match, openTag, base, reading, closeTag) => {
    if (!base || !reading) return match
    if ((openTag && !closeTag) || (closeTag && !openTag)) return match
    replaced = true
    const rubyCont = base + '<rp>《</rp><rt>' + reading + '</rt><rp>》</rp>'
    const opener = openTag || '<ruby>'
    const closer = closeTag || '</ruby>'
    return opener + rubyCont + closer
  })
  return replaced ? converted : value
}

const convertHtmlTokenContent = (value, opt) => {
  if (!value) return value
  const needsRuby = opt.ruby && RUBY_TRIGGER_REGEXP.test(value)
  const needsStar = opt.starComment && value.indexOf(STAR_CHAR) !== -1
  const needsPercent = opt.percentComment && value.indexOf(PERCENT_CHAR + PERCENT_CHAR) !== -1
  if (!needsRuby && !needsStar && !needsPercent) return value
  let converted = value
  if (needsRuby) {
    converted = convertRubyHtmlContent(converted, needsRuby)
  }
  if (needsStar) {
    converted = convertStarCommentHtmlContent(converted, opt, needsStar)
  }
  if (needsPercent) {
    converted = convertPercentCommentHtmlContent(converted, opt)
  }
  return converted
}

const createHtmlTokenWrapper = (defaultRenderer, opt) => {
  return (tokens, idx, options, env, self) => {
    const token = tokens[idx]
    const original = token && token.content ? token.content : ''
    if (!original) {
      return defaultRenderer(tokens, idx, options, env, self)
    }
    const converted = convertHtmlTokenContent(original, opt)
    if (converted === original) {
      return defaultRenderer(tokens, idx, options, env, self)
    }
    token.content = converted
    const rendered = defaultRenderer(tokens, idx, options, env, self)
    token.content = original
    return rendered
  }
}

const hasNextStar = (tokens, idx, opt, htmlEnabled) => {
  let hasNextStarPos = -1
  let i = idx + 1
  while (i < tokens.length) {
    const token = tokens[i]
    if (!token || token.type !== 'text' || typeof token.content !== 'string') {
      i++
      continue
    }
    if (htmlEnabled && !opt.insideHtml && token.meta && token.meta.__insideHtmlInline) {
      i++
      continue
    }
    const starIdx = findUsableStarInToken(token)
    if (starIdx === -1) {
      i++
      continue
    }
    reserveStarIndex(token, starIdx)
    const meta = token.meta
    if (opt.starCommentDelete) {
      meta.__starCommentDeleteFrom = starIdx + 1
    } else if (meta.__starCommentInjectedCloseAt) {
      meta.__starCommentInjectedCloseAt.push(starIdx)
    } else {
      meta.__starCommentInjectedCloseAt = [starIdx]
    }
    hasNextStarPos = i
    break
  }

  if (hasNextStarPos !== -1 && opt.starCommentDelete) {
    for (let j = idx + 1; j < hasNextStarPos; j++) {
      scrubToken(tokens[j])
    }
  }
  return hasNextStarPos
}

const convertInlineText = (tokens, idx, options, opt, rubyEnabled, starEnabled, starInlineOnly, percentEnabled) => {
  let cont = tokens[idx].content
  if (typeof cont !== 'string') {
    cont = cont == null ? '' : String(cont)
  }
  cont = normalizeEscapeSentinels(cont, tokens[idx])
  if (!rubyEnabled && !starEnabled && !percentEnabled) {
    if (HTML_ENTITIES_REGEXP.test(cont)) {
      return escapeInlineHtml(cont)
    }
    return cont
  }
  const htmlEnabled = !!(options && options.html)
  const rubyActive = rubyEnabled && RUBY_TRIGGER_REGEXP.test(cont)
  const rubyWrapperCache = rubyActive && htmlEnabled
    ? detectRubyWrapper(tokens, idx)
    : false
  const needsPercent = percentEnabled && cont.indexOf(PERCENT_CHAR + PERCENT_CHAR) !== -1

  if ((starEnabled || percentEnabled) && htmlEnabled && !opt.insideHtml) {
    ensureInlineHtmlContext(tokens)
  }

  const insideInlineHtml = htmlEnabled && !opt.insideHtml
    && tokens[idx]
    && tokens[idx].meta
    && tokens[idx].meta.__insideHtmlInline

  const isPercentParagraph = opt.percentCommentParagraph && isPercentCommentParagraph(tokens)
  const percentParagraphDelete = isPercentParagraph && (opt.percentCommentDelete || opt.starCommentDelete)
  if (percentParagraphDelete) {
    tokens.__percentCommentParagraphDelete = true
    if (idx === 0) {
      hideInlineTokensAfter(tokens, idx + 1, '__percentCommentDelete')
      return ''
    }
    return ''
  }

  if (starEnabled && starInlineOnly) {
    const hasStar = cont.indexOf(STAR_CHAR) !== -1
    const hasPlaceholder = cont.indexOf(STAR_PLACEHOLDER_CLOSE) !== -1
    if (!hasStar && !hasPlaceholder) {
      if (rubyEnabled && rubyActive) {
        cont = convertRubyKnown(cont, rubyWrapperCache)
      }
      if (needsPercent && !(insideInlineHtml && !opt.insideHtml)) {
        cont = convertPercentComment(cont, opt, tokens[idx])
      }
      if (HTML_ENTITIES_REGEXP.test(cont)) {
        cont = escapeInlineHtml(cont)
      }
      return cont
    }
  }

  if (starEnabled) {
    cont = convertStarComment(
      cont,
      tokens,
      idx,
      htmlEnabled,
      opt,
      rubyActive,
      rubyWrapperCache,
    )
  } else if (rubyEnabled) {
    if (rubyActive) {
      cont = convertRubyKnown(cont, rubyWrapperCache)
    }
  }

  const percentLineResult = convertPercentLineIfNeeded(cont, tokens, idx, htmlEnabled, opt, needsPercent, insideInlineHtml)
  cont = percentLineResult.cont
  if (percentLineResult.handled) {
    if (HTML_ENTITIES_REGEXP.test(cont)) {
      cont = escapeInlineHtml(cont)
    }
    return cont
  }

  if (needsPercent && !(insideInlineHtml && !opt.insideHtml)) {
    cont = convertPercentComment(cont, opt, tokens[idx])
  }

  if (isPercentParagraph && !percentParagraphDelete) {
    const cls = opt.percentClass || 'percent-comment'
    if (idx === 0) {
      cont = '<span class="' + cls + '">' + cont
    }
    if (idx === tokens.length - 1) {
      cont = cont + '</span>'
    }
  }

  if (HTML_ENTITIES_REGEXP.test(cont)) {
    cont = escapeInlineHtml(cont)
  }
  return cont
}

function rendererInlineText (md, option = {}) {
  const opt = {
    ruby: false,
    starComment: false,
    starCommentDelete: false,
    starCommentParagraph: false,
    starCommentLine: false,
    percentComment: false,
    percentCommentDelete: false,
    percentCommentParagraph: false,
    percentCommentLine: false,
    percentClass: 'percent-comment',
    insideHtml: false,
    ...option,
  }
  if (option && option.html) {
    opt.insideHtml = true
  }
  opt.starCommentParagraph = opt.starCommentParagraph && !opt.starCommentLine
  opt.percentCommentParagraph = opt.percentCommentParagraph && !opt.percentCommentLine

  if (opt.starCommentLine) {
    ensureStarCommentLineCore(md)
  }
  if (opt.percentCommentLine) {
    ensurePercentCommentLineCore(md)
  }
  if ((opt.starCommentParagraph || opt.starCommentLine) && opt.starCommentDelete) {
    ensureStarCommentLineDeleteSupport(md)
  }
  if (opt.starCommentParagraph && opt.starCommentDelete) {
    ensureStarCommentParagraphDeleteCore(md)
  }
  const percentDeleteFlag = opt.percentCommentDelete || opt.starCommentDelete
  if (opt.percentCommentParagraph && percentDeleteFlag) {
    ensureParagraphDeleteSupport(md)
    ensurePercentCommentParagraphDeleteCore(md)
  }
  if (opt.percentCommentLine && percentDeleteFlag) {
    ensureParagraphDeleteSupport(md)
  }
  md.__starCommentLineGlobalEnabled = !!opt.starCommentLine
  md.__starCommentParagraphDeleteEnabled = !!(opt.starCommentParagraph && opt.starCommentDelete)
  md.__percentCommentParagraphDeleteEnabled = !!(opt.percentCommentParagraph && percentDeleteFlag)
  md.__percentCommentLineGlobalEnabled = !!opt.percentCommentLine

  const rubyEnabled = !!opt.ruby
  const starEnabled = !!opt.starComment
  const percentEnabled = !!opt.percentComment
  const starInlineOnly = starEnabled && !opt.starCommentLine && !opt.starCommentParagraph

  const shouldConvertInsideHtml = opt.insideHtml && (opt.starComment || opt.ruby || opt.percentComment)
  if (opt.starComment || opt.percentComment) {
    if (!md.__escapeMetaReady) {
      md.__escapeMetaReady = true
      md.inline.ruler.before('escape', 'star_percent_escape_meta', applyEscapeMetaInlineRule)
    }
  }
  if (shouldConvertInsideHtml) {
    const defaultHtmlInline = md.renderer.rules.html_inline
      || ((tokens, idx) => tokens[idx].content)
    const defaultHtmlBlock = md.renderer.rules.html_block
      || ((tokens, idx) => tokens[idx].content)

    md.renderer.rules.html_inline = createHtmlTokenWrapper(defaultHtmlInline, opt)
    md.renderer.rules.html_block = createHtmlTokenWrapper(defaultHtmlBlock, opt)
  }

  md.renderer.rules.text = (tokens, idx, options) => {
    return convertInlineText(tokens, idx, options, opt, rubyEnabled, starEnabled, starInlineOnly, percentEnabled)
  }
}

export default rendererInlineText
