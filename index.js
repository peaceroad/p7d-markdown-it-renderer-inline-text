const STAR_CHAR = '★'
const STAR_CHAR_CODE = STAR_CHAR.charCodeAt(0)
const STAR_COMMENT_LINE_META_KEY = 'starCommentLineDelete'
const PERCENT_CHAR = '%'
const PERCENT_CHAR_CODE = PERCENT_CHAR.charCodeAt(0)
const PERCENT_MARKER = PERCENT_CHAR + PERCENT_CHAR
const ESCAPED_STAR_SENTINEL = '\u0001'
const ACTIVE_STAR_SENTINEL = '\u0002'
const ESCAPED_PERCENT_SENTINEL = '\u0003'
const ACTIVE_PERCENT_SENTINEL = '\u0004'
const PERCENT_COMMENT_LINE_META_KEY = 'percentCommentLineDelete'
const INLINE_HTML_TAG_REGEXP = /^<\s*(\/)?\s*([A-Za-z][\w:-]*)/i
const INLINE_HTML_SELF_CLOSE_REGEXP = /\/>\s*$/
const INLINE_HTML_VOID_TAGS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link',
  'meta', 'param', 'source', 'track', 'wbr',
])
const RUBY_REGEXP_CONTENT = '(<ruby>)?([\\p{sc=Han}0-9A-Za-z.\\-_]+)《([^》]+?)》(<\\/ruby>)?'
const RUBY_REGEXP = new RegExp(RUBY_REGEXP_CONTENT, 'ug')
const HTML_AMP_REGEXP = /&/g
const HTML_LT_NONTAG_REGEXP = /<(?!\/?[\w\s="/.':;#-\/\?]+>)/g
const HTML_GT_NONTAG_REGEXP = /(?<!<\/?[\w\s="/.':;#-\/\?]+)>(?![^<]*>)/g
const HTML_EMPTY_TAG_REGEXP = /<(\/?)>/g
const HTML_SLASHED_TAG_REGEXP = /<([^>]+?\/[^>]+?)>/g

const HTML_ENTITY_AMP = 1
const HTML_ENTITY_LT = 2
const HTML_ENTITY_GT = 4

const getHtmlEntityFlags = (value) => {
  if (!value) return 0
  let flags = 0
  if (value.indexOf('&') !== -1) flags |= HTML_ENTITY_AMP
  if (value.indexOf('<') !== -1) flags |= HTML_ENTITY_LT
  if (value.indexOf('>') !== -1) flags |= HTML_ENTITY_GT
  return flags
}

const detectRubyWrapper = (tokens, idx) => {
  if (!tokens[idx - 1] || !tokens[idx + 1]) return false
  return tokens[idx - 1].type === 'html_inline'
    && tokens[idx - 1].content === '<ruby>'
    && tokens[idx + 1].type === 'html_inline'
    && tokens[idx + 1].content === '</ruby>'
}

const walkHtmlSegments = (value, onText, onTag) => {
  let start = 0
  let i = 0
  while (i < value.length) {
    if (value.charCodeAt(i) !== 60) { // '<'
      i++
      continue
    }
    if (i > start) {
      onText(value.slice(start, i))
    }
    let j = i + 1
    let quote = 0
    while (j < value.length) {
      const ch = value.charCodeAt(j)
      if (quote) {
        if (ch === quote) quote = 0
      } else if (ch === 34 || ch === 39) { // " or '
        quote = ch
      } else if (ch === 62) { // '>'
        break
      }
      j++
    }
    if (j >= value.length) {
      onText(value.slice(i))
      return
    }
    onTag(value.slice(i, j + 1))
    i = j + 1
    start = i
  }
  if (start < value.length) {
    onText(value.slice(start))
  }
}

const walkHtmlSegmentsWithStack = (value, onText, onTag) => {
  const stack = []
  let rubyDepth = 0
  let start = 0
  let i = 0
  while (i < value.length) {
    if (value.charCodeAt(i) !== 60) { // '<'
      i++
      continue
    }
    if (i > start) {
      onText(value.slice(start, i), rubyDepth > 0)
    }
    let j = i + 1
    let quote = 0
    while (j < value.length) {
      const ch = value.charCodeAt(j)
      if (quote) {
        if (ch === quote) quote = 0
      } else if (ch === 34 || ch === 39) { // " or '
        quote = ch
      } else if (ch === 62) { // '>'
        break
      }
      j++
    }
    if (j >= value.length) {
      onText(value.slice(i), rubyDepth > 0)
      return
    }
    const tag = value.slice(i, j + 1)
    onTag(tag)

    const tagMatch = tag.match(INLINE_HTML_TAG_REGEXP)
    if (tagMatch) {
      const isClosing = !!tagMatch[1]
      const tagName = tagMatch[2] ? tagMatch[2].toLowerCase() : ''
      if (tagName) {
        const isVoid = INLINE_HTML_VOID_TAGS.has(tagName)
        let isSelfClosing = false
        if (!isClosing && !isVoid) {
          isSelfClosing = INLINE_HTML_SELF_CLOSE_REGEXP.test(tag)
        }
        if (isClosing) {
          if (stack.length && stack[stack.length - 1] === tagName) {
            const popped = stack.pop()
            if (popped === 'ruby') rubyDepth--
          } else {
            const idx = stack.lastIndexOf(tagName)
            if (idx !== -1) {
              const removed = stack.splice(idx, 1)[0]
              if (removed === 'ruby') rubyDepth--
            } else if (stack.length) {
              const popped = stack.pop()
              if (popped === 'ruby') rubyDepth--
            }
          }
        } else if (!isVoid && !isSelfClosing) {
          stack.push(tagName)
          if (tagName === 'ruby') rubyDepth++
        }
      }
    }

    i = j + 1
    start = i
  }
  if (start < value.length) {
    onText(value.slice(start), rubyDepth > 0)
  }
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

const ensureInlineRulerLast = (md) => {
  if (!md || !md.core || !md.core.ruler || !md.core.ruler.__rules__) return
  const rules = md.core.ruler.__rules__
  const idx = rules.findIndex((rule) => rule.name === 'inline_ruler_convert')
  if (idx === -1 || idx === rules.length - 1) return
  const [rule] = rules.splice(idx, 1)
  rules.push(rule)
}

const patchInlineRulerOrder = (md) => {
  if (!md || !md.core || !md.core.ruler) return
  if (md.__inlineRulerOrderPatched) return
  md.__inlineRulerOrderPatched = true
  const ruler = md.core.ruler
  const originalPush = ruler.push.bind(ruler)
  const originalAfter = ruler.after.bind(ruler)
  const originalBefore = ruler.before.bind(ruler)
  ruler.push = (name, fn, options) => {
    const result = originalPush(name, fn, options)
    ensureInlineRulerLast(md)
    return result
  }
  ruler.after = (afterName, name, fn, options) => {
    const result = originalAfter(afterName, name, fn, options)
    ensureInlineRulerLast(md)
    return result
  }
  ruler.before = (beforeName, name, fn, options) => {
    const result = originalBefore(beforeName, name, fn, options)
    ensureInlineRulerLast(md)
    return result
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

const hasPercentCommentLineCandidate = (tokens) => {
  if (!tokens || !tokens.length || tokens.__percentCommentLineGlobalProcessed) return false
  if (tokens.__percentCommentLineCandidate !== undefined) {
    return tokens.__percentCommentLineCandidate
  }
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]
    if (token && typeof token.content === 'string' && token.content.indexOf(PERCENT_MARKER) !== -1) {
      tokens.__percentCommentLineCandidate = true
      return true
    }
  }
  tokens.__percentCommentLineCandidate = false
  return false
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

const addStarInsertion = (token, key, idx) => {
  if (!token) return
  token.meta = token.meta || {}
  if (token.meta[key]) {
    token.meta[key].push(idx)
  } else {
    token.meta[key] = [idx]
  }
}

const addStarDeleteRange = (token, start, end) => {
  if (!token) return
  token.meta = token.meta || {}
  const ranges = token.meta.__starDeleteRanges
  if (ranges) {
    ranges.push([start, end])
  } else {
    token.meta.__starDeleteRanges = [[start, end]]
  }
}

const addStarDeleteOpen = (token, start) => {
  if (!token) return
  token.meta = token.meta || {}
  const opens = token.meta.__starDeleteOpens
  if (opens) {
    opens.push(start)
  } else {
    token.meta.__starDeleteOpens = [start]
  }
}

const addStarDeleteFrom = (token, start) => {
  if (!token) return
  token.meta = token.meta || {}
  const list = token.meta.__starDeleteFroms
  if (list) {
    list.push(start)
  } else {
    token.meta.__starDeleteFroms = [start]
  }
}

const addStarDeleteTo = (token, end) => {
  if (!token) return
  token.meta = token.meta || {}
  const list = token.meta.__starDeleteTos
  if (list) {
    list.push(end)
  } else {
    token.meta.__starDeleteTos = [end]
  }
}

const ensureStarPairInfo = (tokens, opt, htmlEnabled) => {
  if (!tokens || tokens.__starPairInfoReady) return
  tokens.__starPairInfoReady = true
  const positions = []

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]
    if (!token || token.hidden || token.type !== 'text') continue
    if (opt.starCommentLine && token.meta && token.meta.__starLineGlobal) {
      continue
    }
    if (htmlEnabled && !opt.insideHtml && token.meta && token.meta.__insideHtmlInline) {
      continue
    }
    let content = token.content
    if (typeof content !== 'string') {
      content = content == null ? '' : String(content)
    }
    const normalized = normalizeEscapeSentinels(content, token)
    if (normalized !== content) {
      token.content = normalized
      content = normalized
    }
    if (content.indexOf(STAR_CHAR) === -1) continue
    const meta = token.meta || (token.meta = {})
    if (!meta.__backslashLookup && content.indexOf('\\') !== -1) {
      meta.__backslashLookup = createBackslashLookup(content)
    }
    let pos = content.indexOf(STAR_CHAR)
    while (pos !== -1) {
      if (!isEscapedStar(content, pos, token)) {
        positions.push([i, pos])
      }
      pos = content.indexOf(STAR_CHAR, pos + 1)
    }
  }

  if (positions.length < 2) return
  for (let i = 0; i + 1 < positions.length; i += 2) {
    const open = positions[i]
    const close = positions[i + 1]
    if (opt.starCommentDelete) {
      addStarDeleteOpen(tokens[open[0]], open[1])
      if (open[0] === close[0]) {
        addStarDeleteRange(tokens[open[0]], open[1], close[1])
      } else {
        addStarDeleteFrom(tokens[open[0]], open[1])
        addStarDeleteTo(tokens[close[0]], close[1])
        for (let j = open[0] + 1; j < close[0]; j++) {
          scrubToken(tokens[j])
        }
      }
    } else {
      addStarInsertion(tokens[open[0]], '__starOpenPositions', open[1])
      addStarInsertion(tokens[close[0]], '__starClosePositions', close[1])
    }
  }
}

const applyStarInsertionsWithRuby = (value, token, rubyActive, hasRubyWrapper, starOpen) => {
  const meta = token && token.meta
  const openList = meta && meta.__starOpenPositions ? meta.__starOpenPositions : []
  const closeList = meta && meta.__starClosePositions ? meta.__starClosePositions : []
  if (!openList.length && !closeList.length && !starOpen) {
    return { value, changed: false, starOpen: false }
  }

  const forcedActive = meta && meta.__forceActiveStars
  const forcedLen = forcedActive ? forcedActive.length : 0
  let forcedIdx = 0
  let openIdx = 0
  let closeIdx = 0
  let cursor = 0
  let rebuilt = ''
  let inside = !!starOpen

  while (openIdx < openList.length || closeIdx < closeList.length) {
    const nextOpen = openIdx < openList.length ? openList[openIdx] : Infinity
    const nextClose = closeIdx < closeList.length ? closeList[closeIdx] : Infinity

    if (inside) {
      if (nextClose === Infinity) break
      rebuilt += value.slice(cursor, nextClose + 1)
      rebuilt += '</span>'
      cursor = nextClose + 1
      closeIdx++
      inside = false
      continue
    }

    if (nextOpen === Infinity) break
    let shouldKeepEscapes = false
    if (forcedLen) {
      while (forcedIdx < forcedLen && forcedActive[forcedIdx] < nextOpen) forcedIdx++
      shouldKeepEscapes = forcedIdx < forcedLen && forcedActive[forcedIdx] === nextOpen
    }
    const startEscapes = shouldKeepEscapes ? 0 : getBackslashCountBefore(value, nextOpen, meta)
    let segment = value.slice(cursor, nextOpen - startEscapes)
    if (rubyActive && segment.indexOf('《') !== -1) {
      segment = convertRubyKnown(segment, hasRubyWrapper)
    }
    rebuilt += segment
    if (startEscapes) {
      const keptStartEscapes = Math.floor(startEscapes / 2)
      if (keptStartEscapes > 0) rebuilt += '\\'.repeat(keptStartEscapes)
    }
    rebuilt += '<span class="star-comment">'
    cursor = nextOpen
    openIdx++
    inside = true
  }

  if (cursor < value.length) {
    let tail = value.slice(cursor)
    if (!inside && rubyActive && tail.indexOf('《') !== -1) {
      tail = convertRubyKnown(tail, hasRubyWrapper)
    }
    rebuilt += tail
  }

  return { value: rebuilt, changed: true, starOpen: inside }
}

const applyStarDeletes = (value, token) => {
  const meta = token && token.meta
  const ranges = meta && meta.__starDeleteRanges ? meta.__starDeleteRanges : null
  const froms = meta && meta.__starDeleteFroms ? meta.__starDeleteFroms : null
  const tos = meta && meta.__starDeleteTos ? meta.__starDeleteTos : null
  const opens = meta && meta.__starDeleteOpens ? meta.__starDeleteOpens : null
  const forcedActive = meta && meta.__forceActiveStars ? meta.__forceActiveStars : null
  if (!ranges && !froms && !tos) return { value, changed: false }

  const limit = value.length
  const collected = []
  if (ranges) {
    for (const range of ranges) {
      if (!range || range.length < 2) continue
      const start = Math.max(0, range[0])
      const end = Math.min(limit - 1, range[1])
      if (start <= end) collected.push([start, end])
    }
  }
  if (froms) {
    for (const start of froms) {
      const from = Math.max(0, start)
      if (from < limit) collected.push([from, limit - 1])
    }
  }
  if (tos) {
    for (const end of tos) {
      const to = Math.min(limit - 1, end)
      if (to >= 0) collected.push([0, to])
    }
  }
  if (!collected.length) return { value, changed: false }

  let merged = collected
  if (collected.length > 1) {
    collected.sort((a, b) => a[0] - b[0])
    merged = []
    for (const range of collected) {
      if (!merged.length) {
        merged.push([range[0], range[1]])
        continue
      }
      const last = merged[merged.length - 1]
      if (range[0] <= last[1] + 1) {
        if (range[1] > last[1]) last[1] = range[1]
      } else {
        merged.push([range[0], range[1]])
      }
    }
  }

  const openLen = opens ? opens.length : 0
  let openIdx = 0
  const forcedLen = forcedActive ? forcedActive.length : 0
  let forcedIdx = 0
  let rebuilt = ''
  let cursor = 0
  for (const range of merged) {
    const start = range[0]
    const end = range[1]
    if (start > cursor) {
      let segment = value.slice(cursor, start)
      let isOpenStart = false
      if (openLen) {
        while (openIdx < openLen && opens[openIdx] < start) openIdx++
        isOpenStart = openIdx < openLen && opens[openIdx] === start
      }
      let isForcedActive = false
      if (forcedLen) {
        while (forcedIdx < forcedLen && forcedActive[forcedIdx] < start) forcedIdx++
        isForcedActive = forcedIdx < forcedLen && forcedActive[forcedIdx] === start
      }
      if (isOpenStart && !isForcedActive) {
        const startEscapes = getBackslashCountBefore(value, start, meta)
        if (startEscapes) {
          segment = segment.slice(0, segment.length - startEscapes)
          const keptStartEscapes = Math.floor(startEscapes / 2)
          if (keptStartEscapes > 0) segment += '\\'.repeat(keptStartEscapes)
        }
      }
      rebuilt += segment
    }
    cursor = end + 1
  }
  if (cursor < value.length) {
    rebuilt += value.slice(cursor)
  }
  return { value: rebuilt, changed: true }
}

const escapeInlineHtml = (value, flags) => {
  let escaped = value
  const hasAmp = (flags & HTML_ENTITY_AMP) !== 0
  const hasLt = (flags & HTML_ENTITY_LT) !== 0
  const hasGt = (flags & HTML_ENTITY_GT) !== 0
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
  const deleteMode = opt.percentCommentDelete || opt.starCommentDelete
  const cls = opt.percentClass || 'percent-comment'
  const meta = token && token.meta
  const forcedActive = meta && meta.__forceActivePercents
  const forcedEscaped = meta && meta.__forceEscapedPercents
  const forcedActiveLen = forcedActive ? forcedActive.length : 0
  const forcedEscapedLen = forcedEscaped ? forcedEscaped.length : 0
  let forcedActiveIdx = 0
  let forcedEscapedIdx = 0
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
    if (segment[i] !== PERCENT_CHAR || segment[i + 1] !== PERCENT_CHAR) continue
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
  const hasForceActivePercent = forcedActive && forcedActive.length
  if (!hasForceActivePercent) {
    return collapseMarkerEscapes(rebuilt, PERCENT_MARKER)
  }
  return rebuilt
}

const convertStarCommentHtmlSegment = (segment, opt) => {
  if (!segment || segment.indexOf(STAR_CHAR) === -1) return segment
  const hasBackslash = segment.indexOf('\\') !== -1
  let getEscapesBefore = null
  if (hasBackslash) {
    const lookup = createBackslashLookup(segment)
    getEscapesBefore = lookup ? (idx) => lookup(idx) : (idx) => countBackslashesBefore(segment, idx)
  }
  let rebuilt = ''
  let cursor = 0
  let openIdx = -1

  for (let i = 0; i < segment.length; i++) {
    if (segment.charCodeAt(i) !== STAR_CHAR_CODE) continue
    if (getEscapesBefore && ((getEscapesBefore(i) & 1) === 1)) continue
    if (openIdx === -1) {
      openIdx = i
      continue
    }
    const startEscapes = getEscapesBefore ? getEscapesBefore(openIdx) : 0
    const keptStartEscapes = startEscapes ? '\\'.repeat(Math.floor(startEscapes / 2)) : ''
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
  let rebuilt = ''
  walkHtmlSegments(
    value,
    (segment) => { rebuilt += convertStarCommentHtmlSegment(segment, opt) },
    (tag) => { rebuilt += tag },
  )
  return rebuilt
}

const convertPercentCommentHtmlSegment = (segment, opt) => {
  return convertPercentCommentInlineSegment(segment, opt, null)
}

const convertPercentCommentHtmlContent = (value, opt) => {
  if (!value || value.indexOf(PERCENT_MARKER) === -1) return value
  if (value.indexOf('<') === -1) {
    return convertPercentCommentHtmlSegment(value, opt)
  }
  let rebuilt = ''
  walkHtmlSegments(
    value,
    (segment) => { rebuilt += convertPercentCommentHtmlSegment(segment, opt) },
    (tag) => { rebuilt += tag },
  )
  return rebuilt
}

const convertRubyHtmlContent = (value, hasRubyTrigger) => {
  if (!value || !hasRubyTrigger) return value
  let rebuilt = ''
  walkHtmlSegmentsWithStack(
    value,
    (segment, insideRuby) => {
      if (!segment || segment.indexOf('《') === -1) {
        rebuilt += segment
        return
      }
      rebuilt += convertRubyKnown(segment, insideRuby)
    },
    (tag) => { rebuilt += tag },
  )
  return rebuilt
}

const convertHtmlTokenContent = (value, opt) => {
  if (!value) return value
  const needsRuby = opt.ruby && value.indexOf('《') !== -1
  const needsStar = opt.starComment && value.indexOf(STAR_CHAR) !== -1
  const needsPercent = opt.percentComment && value.indexOf(PERCENT_MARKER) !== -1
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

const convertInlineTokens = (opt, rubyEnabled, starEnabled, percentEnabled) => {
  return (state) => {
    const tokens = state.tokens
    if (!tokens || !tokens.length) return
    const htmlEnabled = !!(state.md && state.md.options && state.md.options.html)

    if (opt.insideHtml && htmlEnabled && (rubyEnabled || starEnabled || percentEnabled)) {
      for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i]
        if (!token || (token.type !== 'html_block' && token.type !== 'html_inline')) continue
        const original = token.content || ''
        if (!original) continue
        const converted = convertHtmlTokenContent(original, opt)
        if (converted !== original) {
          token.content = converted
        }
      }
    }

    for (let i = 0; i < tokens.length; i++) {
      const blockToken = tokens[i]
      if (!blockToken || blockToken.type !== 'inline' || !blockToken.children || !blockToken.children.length) {
        continue
      }
      const blockContent = blockToken.content || ''
      let blockHasStar = starEnabled && blockContent.indexOf(STAR_CHAR) !== -1
      let blockHasPercent = percentEnabled && blockContent.indexOf(PERCENT_MARKER) !== -1
      let blockHasRuby = rubyEnabled && blockContent.indexOf('《') !== -1
      if (!blockHasStar && !blockHasPercent && !blockHasRuby && !blockContent) {
        for (let j = 0; j < blockToken.children.length; j++) {
          const token = blockToken.children[j]
          if (!token || token.type !== 'text' || typeof token.content !== 'string') continue
          if (!blockHasStar && token.content.indexOf(STAR_CHAR) !== -1) blockHasStar = true
          if (!blockHasPercent && token.content.indexOf(PERCENT_MARKER) !== -1) blockHasPercent = true
          if (!blockHasRuby && token.content.indexOf('《') !== -1) blockHasRuby = true
          if (blockHasStar || blockHasPercent || blockHasRuby) break
        }
      }
      if (!blockHasStar && !blockHasPercent && !blockHasRuby) {
        continue
      }
      const children = blockToken.children
      if (children.__inlineRulerProcessed) continue
      children.__inlineRulerProcessed = true

      const isStarParagraph = opt.starCommentParagraph && isStarCommentParagraph(children)
      const isPercentParagraph = opt.percentCommentParagraph && isPercentCommentParagraph(children)
      const percentDeleteMode = opt.percentCommentDelete || opt.starCommentDelete
      const starInlineEnabled = starEnabled && !isStarParagraph

      if (isStarParagraph && opt.starCommentDelete) {
        children.__starCommentParagraphDelete = true
        hideInlineTokensAfter(children, 0, '__starCommentDelete')
        continue
      }
      if (isPercentParagraph && percentDeleteMode) {
        children.__percentCommentParagraphDelete = true
        hideInlineTokensAfter(children, 0, '__percentCommentDelete')
        continue
      }

      if (opt.starCommentLine && !children.__starCommentLineGlobalProcessed && hasStarCommentLineCandidate(children)) {
        markStarCommentLineGlobal(children, opt)
      }
      if (opt.percentCommentLine && !children.__percentCommentLineGlobalProcessed && hasPercentCommentLineCandidate(children)) {
        markPercentCommentLineGlobal(children, opt)
      }
      if ((blockHasStar || blockHasPercent) && htmlEnabled && !opt.insideHtml) {
        ensureInlineHtmlContext(children)
      }
      if (starInlineEnabled && blockHasStar) {
        ensureStarPairInfo(children, opt, htmlEnabled)
      }

      let starInlineOpen = false
      const percentClass = opt.percentClass || 'percent-comment'
      const shouldNormalizeEscapes = starEnabled || percentEnabled

      for (let j = 0; j < children.length; j++) {
        const token = children[j]
        if (!token || token.hidden) continue
        if (token.type === 'text') {
          if (htmlEnabled && !opt.insideHtml && token.meta && token.meta.__insideHtmlInline) {
            continue
          }
          let content = token.content
          if (typeof content !== 'string') {
            content = content == null ? '' : String(content)
          }
          if (shouldNormalizeEscapes) {
            const normalized = normalizeEscapeSentinels(content, token)
            if (normalized !== content) {
              token.content = normalized
              content = normalized
            }
          }
          let meta = token.meta
          const inStarLine = !!(opt.starCommentLine && meta && meta.__starLineGlobal)
          const inPercentLine = !!(opt.percentCommentLine && meta && meta.__percentLineGlobal)
          const needsWrap = isStarParagraph || isPercentParagraph || inStarLine || inPercentLine
          const hasStarChar = starEnabled && content.indexOf(STAR_CHAR) !== -1
          const hasPercentMarker = percentEnabled && content.indexOf(PERCENT_MARKER) !== -1
          const hasRubyMarker = rubyEnabled && content.indexOf('《') !== -1
          const needsStarOps = starInlineEnabled && !inStarLine
            && (starInlineOpen
              || (meta && (meta.__starOpenPositions || meta.__starClosePositions))
              || hasStarChar)
          const needsPercentOps = percentEnabled && !inPercentLine && hasPercentMarker
          const needsRubyOps = rubyEnabled && hasRubyMarker
          const htmlFlags = getHtmlEntityFlags(content)
          const needsEscape = htmlFlags !== 0
          if (!needsWrap && !needsStarOps && !needsPercentOps && !needsRubyOps && !needsEscape) {
            continue
          }
          if (!meta && (needsStarOps || needsPercentOps)) {
            meta = token.meta = {}
          }
          if (meta && (needsStarOps || needsPercentOps) && !meta.__backslashLookup && content.indexOf('\\') !== -1) {
            meta.__backslashLookup = createBackslashLookup(content)
          }
          let rebuilt = content
          let mutated = false
          let forceHtmlInline = false
          let rubyHandled = false

          if (starInlineEnabled && !inStarLine) {
            if (opt.starCommentDelete) {
              if (hasStarChar) {
                const deleted = applyStarDeletes(rebuilt, token)
                if (deleted.changed) {
                  rebuilt = deleted.value
                  mutated = true
                }
              }
            } else {
              const hasStarOps = !!(meta && (meta.__starOpenPositions || meta.__starClosePositions))
              if (starInlineOpen || hasStarOps) {
                const rubyActive = rubyEnabled && hasRubyMarker
                const hasRubyWrapper = rubyActive && htmlEnabled ? detectRubyWrapper(children, j) : false
                const injected = applyStarInsertionsWithRuby(rebuilt, token, rubyActive, hasRubyWrapper, starInlineOpen)
                if (injected.changed) {
                  rebuilt = injected.value
                  mutated = true
                }
                starInlineOpen = injected.starOpen
                rubyHandled = rubyActive
              }
            }
          }

          if (rubyEnabled && !rubyHandled && hasRubyMarker) {
            const hasRubyWrapper = htmlEnabled ? detectRubyWrapper(children, j) : false
            const converted = convertRubyKnown(rebuilt, hasRubyWrapper)
            if (converted !== rebuilt) {
              rebuilt = converted
              mutated = true
            }
          }

          if (starInlineEnabled && !inStarLine && hasStarChar) {
            const hasForceActiveStar = meta && meta.__forceActiveStars && meta.__forceActiveStars.length
            if (!hasForceActiveStar) {
              const collapsed = collapseMarkerEscapes(rebuilt, STAR_CHAR)
              if (collapsed !== rebuilt) {
                rebuilt = collapsed
                mutated = true
              }
            }
          }
          if (percentEnabled && hasPercentMarker) {
            const converted = convertPercentCommentInlineSegment(rebuilt, opt, token)
            if (converted !== rebuilt) {
              rebuilt = converted
              mutated = true
            }
          }
          let prefix = ''
          let suffix = ''
          if (isStarParagraph) {
            if (j === 0) prefix += '<span class="star-comment">'
            if (j === children.length - 1) suffix = '</span>' + suffix
          }
          if (isPercentParagraph) {
            const cls = percentClass
            if (j === 0) prefix += '<span class="' + cls + '">'
            if (j === children.length - 1) suffix = '</span>' + suffix
          }
          if (inStarLine) {
            if (meta.__starLineGlobalStart) prefix += '<span class="star-comment">'
            if (meta.__starLineGlobalEnd) suffix = '</span>' + suffix
          }
          if (inPercentLine) {
            const cls = percentClass
            if (meta.__percentLineGlobalStart) prefix += '<span class="' + cls + '">'
            if (meta.__percentLineGlobalEnd) suffix = '</span>' + suffix
          }
          if (prefix || suffix) {
            rebuilt = prefix + rebuilt + suffix
            mutated = true
          }
          if (needsEscape) {
            forceHtmlInline = true
            const escaped = escapeInlineHtml(rebuilt, htmlFlags)
            if (escaped !== rebuilt) {
              rebuilt = escaped
              mutated = true
            }
          }
          if (mutated || forceHtmlInline) {
            token.type = 'html_inline'
            token.tag = ''
            token.nesting = 0
            token.content = rebuilt
          } else {
            if (rebuilt !== token.content) {
              token.content = rebuilt
            }
          }
          continue
        }
        if (opt.insideHtml && (token.type === 'html_inline' || token.type === 'html_block')) {
          const original = token.content || ''
          if (original) {
            const converted = convertHtmlTokenContent(original, opt)
            if (converted !== original) {
              token.content = converted
            }
          }
        }
      }
    }
  }
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

  const rubyEnabled = !!opt.ruby
  const starEnabled = !!opt.starComment
  const percentEnabled = !!opt.percentComment
  if (!rubyEnabled && !starEnabled && !percentEnabled) return

  patchInlineRulerOrder(md)

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

  if ((starEnabled || percentEnabled) && !md.__escapeMetaReady) {
    md.__escapeMetaReady = true
    md.inline.ruler.before('escape', 'star_percent_escape_meta', applyEscapeMetaInlineRule)
  }

  if (!md.__inlineRulerConvertReady) {
    md.__inlineRulerConvertReady = true
    safeCoreRule(md, 'inline_ruler_convert', convertInlineTokens(opt, rubyEnabled, starEnabled, percentEnabled))
  }
}

export default rendererInlineText
