const STAR_CHAR = '★'
const ESCAPED_STAR_SEQ = '\\' + STAR_CHAR
const STAR_PLACEHOLDER_CLOSE = '</span star-comment>'
const STAR_COMMENT_LINE_META_KEY = 'starCommentLineDelete'
const STAR_CHAR_CODE = STAR_CHAR.charCodeAt(0)
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
const STAR_PAIR_REGEXP = /(?<!(?:^|[^\\])\\)★(?!<\/span star-comment>).*?(?<![^\\]\\)★/g
const STAR_PLACEHOLDER_CLOSE_REGEXP = /<\/span star-comment>/g
const ESCAPED_STAR_REGEXP = /(?<![\\])\\★/g
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

const hideInlineTokensAfter = (tokens, startIdx) => {
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
      token.meta.__starCommentDelete = true
    }
    pointer++
  }
}

const isEscapedStar = (text, index) => {
  let backslashCount = 0
  let cursor = index - 1
  while (cursor >= 0 && text.charCodeAt(cursor) === 92) {
    backslashCount++
    cursor--
  }
  return (backslashCount & 1) === 1
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
      && !isEscapedStar(firstToken.content, 0)
  }
  inlineTokens.__starCommentParagraphCached = result
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

const getCachedStarLineFlag = (cache, idx) => {
  let flag = cache.starFlags[idx]
  if (flag !== undefined) return flag
  flag = lineStartsWithStar(cache.lines[idx] || '')
  cache.starFlags[idx] = flag
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

const findUsableStar = (text, start = 0) => {
  let position = text.indexOf(STAR_CHAR, start)
  while (position !== -1) {
    const nextIdx = position + 1
    const isPlaceholder = nextIdx < text.length
      && text.charCodeAt(nextIdx) === 60
      && text.startsWith(STAR_PLACEHOLDER_CLOSE, nextIdx)
    if (!isPlaceholder && !isEscapedStar(text, position)) {
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
  const text = token.content
  let position = text.indexOf(STAR_CHAR, start)
  while (position !== -1) {
    const nextIdx = position + 1
    const isPlaceholder = nextIdx < text.length
      && text.charCodeAt(nextIdx) === 60
      && text.startsWith(STAR_PLACEHOLDER_CLOSE, nextIdx)
    if (!isStarIndexReserved(token, position)
      && !isPlaceholder
      && !isEscapedStar(text, position)) {
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
  if (isEscapedStar(firstToken.content, cursor)) return

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

const ensureStarCommentLineCore = (md) => {
  if (md.__starCommentLineCoreReady) return
  md.__starCommentLineCoreReady = true

  md.core.ruler.after('inline', 'star_comment_line_marker', (state) => {
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
  })
}

const ensureStarCommentParagraphDeleteCore = (md) => {
  if (md.__starCommentParagraphDeleteCoreReady) return
  md.__starCommentParagraphDeleteCoreReady = true

  md.core.ruler.after('inline', 'star_comment_paragraph_delete', (state) => {
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

const shouldSkipParagraphByStarLine = (tokens, idx, direction) => {
  const inlineToken = direction === 'open'
    ? tokens[idx + 1]
    : tokens[idx - 1]
  if (!inlineToken || inlineToken.type !== 'inline') return false
  if (inlineToken.meta && inlineToken.meta[STAR_COMMENT_LINE_META_KEY]) return true
  return !!(inlineToken.children && inlineToken.children.__starCommentParagraphDelete)
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

const applyStrayStar = (segment, tokens, idx, opt, htmlEnabled) => {
  const strayIndex = findUsableStar(segment)
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
  if (!hasStar && !hasPlaceholder) {
    return applyRubySegment(cont, rubyActive, rubyWrapperCache)
  }
  const needsEscapedStarReplace = cont.indexOf(ESCAPED_STAR_SEQ) !== -1

  STAR_PAIR_REGEXP.lastIndex = 0
  let rebuilt = ''
  let cursor = 0
  let needsPlaceholderReplace = hasPlaceholder
  let starMatch

  while ((starMatch = STAR_PAIR_REGEXP.exec(cont)) !== null) {
    const segment = applyRubySegment(
      cont.slice(cursor, starMatch.index),
      rubyActive,
      rubyWrapperCache,
    )
    rebuilt += applyStrayStar(segment, tokens, idx, opt, htmlEnabled)
    if (!opt.starCommentDelete) {
      const starBody = starMatch[0]
      rebuilt += '<span class="star-comment">' + starBody + STAR_PLACEHOLDER_CLOSE
      needsPlaceholderReplace = true
    }
    cursor = starMatch.index + starMatch[0].length
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
  if (needsEscapedStarReplace) {
    rebuilt = rebuilt.replace(ESCAPED_STAR_REGEXP, STAR_CHAR)
  }
  return rebuilt
}

const convertStarCommentHtmlSegment = (segment, opt) => {
  if (!segment || segment.indexOf(STAR_CHAR) === -1) return segment
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
    rebuilt += segment.slice(cursor, openIdx)
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
  return rebuilt
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
  if (!needsRuby && !needsStar) return value
  let converted = value
  if (needsRuby) {
    converted = convertRubyHtmlContent(converted, needsRuby)
  }
  if (needsStar) {
    converted = convertStarCommentHtmlContent(converted, opt, needsStar)
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

const convertInlineText = (tokens, idx, options, opt, rubyEnabled, starEnabled, starInlineOnly) => {
  let cont = tokens[idx].content
  if (typeof cont !== 'string') {
    cont = cont == null ? '' : String(cont)
  }
  if (!rubyEnabled && !starEnabled) {
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

  if (starEnabled && starInlineOnly) {
    const hasStar = cont.indexOf(STAR_CHAR) !== -1
    const hasPlaceholder = cont.indexOf(STAR_PLACEHOLDER_CLOSE) !== -1
    if (!hasStar && !hasPlaceholder) {
      if (rubyEnabled && rubyActive) {
        cont = convertRubyKnown(cont, rubyWrapperCache)
      }
      if (HTML_ENTITIES_REGEXP.test(cont)) {
        cont = escapeInlineHtml(cont)
      }
      return cont
    }
  }

  if (starEnabled && htmlEnabled && !opt.insideHtml) {
    ensureInlineHtmlContext(tokens)
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
    insideHtml: false,
    ...option,
  }
  if (option && option.html) {
    opt.insideHtml = true
  }
  opt.starCommentParagraph = opt.starCommentParagraph && !opt.starCommentLine

  if (opt.starCommentLine) {
    ensureStarCommentLineCore(md)
  }
  if ((opt.starCommentParagraph || opt.starCommentLine) && opt.starCommentDelete) {
    ensureStarCommentLineDeleteSupport(md)
  }
  if (opt.starCommentParagraph && opt.starCommentDelete) {
    ensureStarCommentParagraphDeleteCore(md)
  }
  md.__starCommentLineGlobalEnabled = !!opt.starCommentLine
  md.__starCommentParagraphDeleteEnabled = !!(opt.starCommentParagraph && opt.starCommentDelete)

  const rubyEnabled = !!opt.ruby
  const starEnabled = !!opt.starComment
  const starInlineOnly = starEnabled && !opt.starCommentLine && !opt.starCommentParagraph

  const shouldConvertInsideHtml = opt.insideHtml && (opt.starComment || opt.ruby)
  if (shouldConvertInsideHtml) {
    const defaultHtmlInline = md.renderer.rules.html_inline
      || ((tokens, idx) => tokens[idx].content)
    const defaultHtmlBlock = md.renderer.rules.html_block
      || ((tokens, idx) => tokens[idx].content)

    md.renderer.rules.html_inline = createHtmlTokenWrapper(defaultHtmlInline, opt)
    md.renderer.rules.html_block = createHtmlTokenWrapper(defaultHtmlBlock, opt)
  }

  md.renderer.rules.text = (tokens, idx, options) => {
    return convertInlineText(tokens, idx, options, opt, rubyEnabled, starEnabled, starInlineOnly)
  }
}

export default rendererInlineText
