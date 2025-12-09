const STAR_CHAR = '★'
const STAR_PLACEHOLDER_CLOSE = '</span star-comment>'
const STAR_COMMENT_LINE_META_KEY = 'starCommentLineDelete'
const STAR_CHAR_CODE = STAR_CHAR.charCodeAt(0)
const LINE_BREAK_TOKENS = new Set(['softbreak', 'hardbreak'])
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
const identity = (value) => value

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

const hideInlineHtmlAfter = (tokens, startIdx) => {
  let pointer = startIdx
  while (pointer < tokens.length) {
    const token = tokens[pointer]
    if (token.type !== 'html_inline') break
    token.content = ''
    token.hidden = true
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
    if (!text.startsWith(STAR_PLACEHOLDER_CLOSE, position + 1)
      && !isEscapedStar(text, position)) {
      return position
    }
    position = text.indexOf(STAR_CHAR, position + 1)
  }
  return -1
}

const scrubToken = (token) => {
  if (!token) return
  token.content = ''
  token.hidden = true
}

const escapeInlineHtml = (value) => {
  return value
    .replace(HTML_AMP_REGEXP, '&amp;')
    .replace(HTML_LT_NONTAG_REGEXP, '&lt;')
    .replace(HTML_GT_NONTAG_REGEXP, '&gt;')
    .replace(HTML_EMPTY_TAG_REGEXP, '&lt;$1&gt;')
    .replace(HTML_SLASHED_TAG_REGEXP, '&lt;$1&gt;')
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
  return LINE_BREAK_TOKENS.has(token.type)
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
    const srcLines = state.src.split(/\r?\n/)
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
          const lineText = srcLines[lineIdx] || ''
          if (lineStartsWithStar(lineText)) {
            let markLine = true
            if (md.__starCommentLineGlobalEnabled) {
              let lookahead = lineIdx + 1
              while (lookahead < blockEnd) {
                if (ignoredLines && ignoredLines.has(lookahead)) {
                  lookahead++
                  continue
                }
                const lookLineText = srcLines[lookahead] || ''
                const trimmed = lookLineText.trim()
                if (trimmed === '') {
                  lookahead++
                  continue
                }
                if (!lineStartsWithStar(lookLineText)) {
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
          const trimmedLine = lineText.trim()
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

const applyStrayStar = (segment, tokens, idx, opt) => {
  const strayIndex = findUsableStar(segment)
  if (strayIndex === -1) return segment
  const hasNextStarPos = hasNextStar(tokens, idx, opt)
  if (hasNextStarPos === -1) return segment
  const starBeforeCont = segment.slice(0, strayIndex)
  const starAfterCont = segment.slice(strayIndex + 1)
  return opt.starCommentDelete
    ? starBeforeCont
    : starBeforeCont + '<span class="star-comment">★' + starAfterCont
}

const convertRuby = (cont, tokens, idx, options, cachedWrapper) => {
  if (!RUBY_TRIGGER_REGEXP.test(cont)) return cont

  let hasRubyTag = cachedWrapper
  if (hasRubyTag === undefined) {
    hasRubyTag = options.html ? detectRubyWrapper(tokens, idx) : false
  }

  RUBY_REGEXP.lastIndex = 0
  let replaced = false
  const converted = cont.replace(RUBY_REGEXP, (match, openTag, base, reading, closeTag) => {
    if (!base || !reading) return match
    if ((openTag && !closeTag) || (closeTag && !openTag)) return match
    replaced = true
    const rubyCont = base + '<rp>《</rp><rt>' + reading + '</rt><rp>》</rp>'
    return hasRubyTag ? rubyCont : '<ruby>' + rubyCont + '</ruby>'
  })

  return replaced ? converted : cont
}

const convertStarComment = (cont, tokens, idx, options, opt, rubyConvert) => {
  const convertSegment = rubyConvert || identity
  const isParagraphStar = opt.starCommentParagraph && isStarCommentParagraph(tokens)
  const currentToken = tokens[idx]
  const insideInlineHtml = options && options.html && !opt.starCommentHtml
    && currentToken
    && currentToken.meta
    && currentToken.meta.__insideHtmlInline

  if (insideInlineHtml && !isParagraphStar) {
    return rubyConvert ? rubyConvert(cont) : cont
  }

  if (opt.starCommentLine) {
    markStarCommentLineGlobal(tokens, opt)
    const meta = currentToken && currentToken.meta
    if (meta && meta.__starLineGlobal) {
      if (opt.starCommentDelete) {
        return ''
      }
      let processed = convertSegment(cont)
      if (meta.__starLineGlobalStart) {
        processed = '<span class="star-comment">' + processed
      }
      if (meta.__starLineGlobalEnd) {
        processed += '</span>'
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
        hideInlineHtmlAfter(tokens, idx + 1)
        return ''
      } else {
        cont = '<span class="star-comment">' + convertSegment(cont)
        if (tokens.length === 1) cont += '</span>'
      }
      return cont
    }

    if (opt.starCommentDelete) {
      hideInlineHtmlAfter(tokens, idx + 1)
      return ''
    }

    const processed = convertSegment(cont)
    if (idx === tokens.length - 1) return processed + '</span>'
    return processed
  }

  const hasStar = cont.indexOf('★') !== -1
  const hasPlaceholder = cont.indexOf(STAR_PLACEHOLDER_CLOSE) !== -1
  if (!hasStar && !hasPlaceholder) return convertSegment(cont)

  STAR_PAIR_REGEXP.lastIndex = 0
  let rebuilt = ''
  let cursor = 0
  let starMatch

  while ((starMatch = STAR_PAIR_REGEXP.exec(cont)) !== null) {
    const segment = convertSegment(cont.slice(cursor, starMatch.index))
    rebuilt += applyStrayStar(segment, tokens, idx, opt)
    if (!opt.starCommentDelete) {
      const starBody = starMatch[0]
      rebuilt += '<span class="star-comment">' + starBody + STAR_PLACEHOLDER_CLOSE
    }
    cursor = starMatch.index + starMatch[0].length
  }

  rebuilt += applyStrayStar(convertSegment(cont.slice(cursor)), tokens, idx, opt)

  return rebuilt
    .replace(STAR_PLACEHOLDER_CLOSE_REGEXP, '</span>')
    .replace(ESCAPED_STAR_REGEXP, '★')
}

const convertStarCommentHtmlSegment = (segment, opt) => {
  if (!segment || segment.indexOf(STAR_CHAR) === -1) return segment
  let rebuilt = ''
  let cursor = 0

  while (cursor < segment.length) {
    const start = findUsableStar(segment, cursor)
    if (start === -1) {
      rebuilt += segment.slice(cursor)
      break
    }
    const end = findUsableStar(segment, start + 1)
    if (end === -1) {
      rebuilt += segment.slice(cursor)
      break
    }
    rebuilt += segment.slice(cursor, start)
    if (!opt.starCommentDelete) {
      rebuilt += '<span class="star-comment">' + segment.slice(start, end + 1) + '</span>'
    }
    cursor = end + 1
  }
  return rebuilt
}

const convertStarCommentHtmlContent = (value, opt) => {
  if (!value || value.indexOf(STAR_CHAR) === -1) return value
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

const createStarCommentHtmlWrapper = (defaultRenderer, opt) => {
  return (tokens, idx, options, env, self) => {
    const token = tokens[idx]
    const original = token && token.content ? token.content : ''
    if (!original || original.indexOf(STAR_CHAR) === -1) {
      return defaultRenderer(tokens, idx, options, env, self)
    }
    const converted = convertStarCommentHtmlContent(original, opt)
    if (converted === original) {
      return defaultRenderer(tokens, idx, options, env, self)
    }
    token.content = converted
    const rendered = defaultRenderer(tokens, idx, options, env, self)
    token.content = original
    return rendered
  }
}

const hasNextStar = (tokens, idx, opt) => {
  let hasNextStarPos = -1
  let i = idx + 1
  while (i < tokens.length) {
    const token = tokens[i]
    if (!token) {
      i++
      continue
    }
    const starIdx = findUsableStar(token.content)
    if (starIdx === -1) {
      i++
      continue
    }
    if (opt.starCommentDelete) {
      token.content = token.content.slice(starIdx + 1)
    } else {
      token.content = token.content.slice(0, starIdx + 1)
        + STAR_PLACEHOLDER_CLOSE
        + token.content.slice(starIdx + 1)
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

const convertInlineText = (tokens, idx, options, opt) => {
  let cont = tokens[idx].content
  const rubyEnabled = !!opt.ruby
  const starEnabled = !!opt.starComment
  let rubyWrapperCache
  const rubyConvert = rubyEnabled
    ? (value) => convertRuby(value, tokens, idx, options, rubyWrapperCache)
    : null

  if (rubyEnabled && options.html) {
    rubyWrapperCache = detectRubyWrapper(tokens, idx)
  }

  if (starEnabled && options.html && !opt.starCommentHtml) {
    ensureInlineHtmlContext(tokens)
  }

  if (starEnabled) {
    cont = convertStarComment(cont, tokens, idx, options, opt, rubyConvert)
  } else if (rubyConvert) {
    cont = rubyConvert(cont)
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
    starCommentHtml: false,
    ...option,
  }

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

  if (opt.starComment && opt.starCommentHtml) {
    const defaultHtmlInline = md.renderer.rules.html_inline
      || ((tokens, idx) => tokens[idx].content)
    const defaultHtmlBlock = md.renderer.rules.html_block
      || ((tokens, idx) => tokens[idx].content)

    md.renderer.rules.html_inline = createStarCommentHtmlWrapper(defaultHtmlInline, opt)
    md.renderer.rules.html_block = createStarCommentHtmlWrapper(defaultHtmlBlock, opt)
  }

  md.renderer.rules.text = (tokens, idx, options) => {
    return convertInlineText(tokens, idx, options, opt)
  }
}

export default rendererInlineText