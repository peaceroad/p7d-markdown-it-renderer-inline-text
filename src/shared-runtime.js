export const STAR_CHAR = '★'
export const STAR_CHAR_CODE = STAR_CHAR.charCodeAt(0)
export const PERCENT_CHAR = '%'
export const PERCENT_CHAR_CODE = PERCENT_CHAR.charCodeAt(0)
export const PERCENT_MARKER = PERCENT_CHAR + PERCENT_CHAR
export const RUBY_MARK_CHAR = '《'
export const DEFAULT_STAR_CLASS = 'star-comment'
export const DEFAULT_PERCENT_CLASS = 'percent-comment'
export const DEFAULT_FIGURE_REFERENCE_CLASS = 'f-ref'
export const DEFAULT_FIGURE_REFERENCE_TAG = 'span'
const FIGURE_REFERENCE_TAGS = new Set(['span', 'b', 'i'])
const RUBY_BASE_CONTENT = '[\\p{sc=Han}0-9A-Za-z.\\-_]+'
const RUBY_BASE_FALLBACK_CONTENT = '[\\u3400-\\u4DBF\\u4E00-\\u9FFF\\uF900-\\uFAFF0-9A-Za-z.\\-_]+'
const RUBY_REGEXP_CONTENT = '(?:<ruby>(' + RUBY_BASE_CONTENT + ')《([^》]+?)》<\\/ruby>|(' + RUBY_BASE_CONTENT + ')《([^》]+?)》)'
const RUBY_REGEXP_FALLBACK_CONTENT = '(?:<ruby>(' + RUBY_BASE_FALLBACK_CONTENT + ')《([^》]+?)》<\\/ruby>|(' + RUBY_BASE_FALLBACK_CONTENT + ')《([^》]+?)》)'
const BACKSLASH_TABLE_MIN_LENGTH = 256
const NORMALIZED_OPTIONS = Symbol('normalizedOptions')

export const toText = (value) => {
  if (typeof value === 'string') return value
  if (value == null) return ''
  return String(value)
}

const normalizeClassString = (value, fallbackClass) => {
  if (typeof value !== 'string') return fallbackClass
  const trimmed = value.trim()
  return trimmed || fallbackClass
}

const normalizeFigureReferenceTag = (value) => {
  if (value == null) return DEFAULT_FIGURE_REFERENCE_TAG
  if (typeof value !== 'string') {
    throw new TypeError('figureReferenceTag must be one of: span, b, i')
  }
  const normalized = value.trim().toLowerCase()
  if (!FIGURE_REFERENCE_TAGS.has(normalized)) {
    throw new TypeError('figureReferenceTag must be one of: span, b, i')
  }
  return normalized
}

const isFigureReferenceNumberCode = (code) => {
  return (code >= 48 && code <= 57) || (code >= 0xFF10 && code <= 0xFF19)
}

const isFigureReferenceUpperCode = (code) => {
  return (code >= 65 && code <= 90) || (code >= 0xFF21 && code <= 0xFF3A)
}

const isFigureReferenceSpaceCode = (code) => {
  return code === 32 || code === 9 || code === 0x3000
}

const consumeFigureReferenceSpaces = (text, pos, max) => {
  while (pos < max && isFigureReferenceSpaceCode(text.charCodeAt(pos))) pos++
  return pos
}

const consumeFigureReferenceComponent = (text, pos, max) => {
  const code = pos < max ? text.charCodeAt(pos) : -1
  if (isFigureReferenceUpperCode(code)) return pos + 1
  if (!isFigureReferenceNumberCode(code)) return -1
  pos++
  while (pos < max && isFigureReferenceNumberCode(text.charCodeAt(pos))) pos++
  return pos
}

export const hasFigureReferenceCandidate = (text) => {
  if (typeof text !== 'string') return false
  let pos = text.indexOf('図', 1)
  while (pos !== -1) {
    const openCode = text.charCodeAt(pos - 1)
    if (openCode === 40 || openCode === 0xFF08) return true
    pos = text.indexOf('図', pos + 1)
  }
  // `Fig` is also the common prefix of `Figure`, so one scan covers both.
  pos = text.indexOf('Fig', 1)
  while (pos !== -1) {
    const openCode = text.charCodeAt(pos - 1)
    if (openCode === 40 || openCode === 0xFF08) return true
    pos = text.indexOf('Fig', pos + 1)
  }
  return false
}

export const hasFigureReferenceLabelCandidate = (text) => {
  return typeof text === 'string'
    && (text.indexOf('図') !== -1 || text.indexOf('Fig') !== -1)
}

export const parseFigureReferenceLabelAt = (text, start, max) => {
  if (typeof text !== 'string' || start < 0 || start >= text.length) return null
  const limit = Math.min(text.length, Number.isInteger(max) ? max : text.length)
  let pos = start
  if (text.charCodeAt(pos) === 0x56F3) { // 図
    pos++
  } else {
    let abbreviated = false
    if (pos + 6 <= limit && text.startsWith('Figure', pos)) {
      pos += 6
    } else if (pos + 3 <= limit && text.startsWith('Fig', pos)) {
      pos += 3
      abbreviated = true
    } else {
      return null
    }
    const delimiterCode = pos < limit ? text.charCodeAt(pos) : -1
    if (delimiterCode === 46) {
      pos++
      if (abbreviated) pos = consumeFigureReferenceSpaces(text, pos, limit)
    } else {
      const afterSpaces = consumeFigureReferenceSpaces(text, pos, limit)
      if (afterSpaces === pos) return null
      pos = afterSpaces
    }
  }

  pos = consumeFigureReferenceComponent(text, pos, limit)
  if (pos === -1) return null
  while (pos < limit) {
    const separatorCode = text.charCodeAt(pos)
    if (separatorCode !== 45 && separatorCode !== 46) break
    pos = consumeFigureReferenceComponent(text, pos + 1, limit)
    if (pos === -1) return null
  }
  return { start, end: pos }
}

export const parseFigureReferenceAt = (text, start, max) => {
  if (typeof text !== 'string' || start < 0 || start >= text.length) return null
  const limit = Math.min(text.length, Number.isInteger(max) ? max : text.length)
  const openCode = text.charCodeAt(start)
  const closeCode = openCode === 40 ? 41 : (openCode === 0xFF08 ? 0xFF09 : -1)
  if (closeCode === -1 || start + 3 >= limit) return null

  const contentStart = start + 1
  const label = parseFigureReferenceLabelAt(text, contentStart, limit)
  if (!label) return null
  const pos = label.end
  if (pos >= limit || text.charCodeAt(pos) !== closeCode) return null
  return {
    start,
    end: pos + 1,
    contentStart,
    contentEnd: pos,
  }
}

export const normalizeParagraphClass = (value, fallbackClass) => {
  if (value === false || value == null) return ''
  if (value === true) return fallbackClass
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed || fallbackClass
  }
  return ''
}

export const countBackslashesBefore = (text, index) => {
  if (!text || index <= 0) return 0
  let backslashCount = 0
  let cursor = index - 1
  while (cursor >= 0 && text.charCodeAt(cursor) === 92) {
    backslashCount++
    cursor--
  }
  return backslashCount
}

export const createBackslashLookup = (text) => {
  if (!text || text.indexOf('\\') === -1) return null
  if (text.length < BACKSLASH_TABLE_MIN_LENGTH) {
    return (idx) => countBackslashesBefore(text, idx)
  }
  const run = text.length > 0xFFFF
    ? new Uint32Array(text.length + 1)
    : new Uint16Array(text.length + 1)
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

export const createRubyRegExp = () => {
  try {
    return new RegExp(RUBY_REGEXP_CONTENT, 'ugi')
  } catch (err) {
    return new RegExp(RUBY_REGEXP_FALLBACK_CONTENT, 'gi')
  }
}

export const isEscapedStar = (text, index) => {
  const src = toText(text)
  return (countBackslashesBefore(src, index) & 1) === 1
}

export const isEscapedPercent = (text, index) => {
  return isEscapedStar(text, index)
}

export const trimLineStartIndex = (line) => {
  let idx = 0
  while (idx < line.length && (line[idx] === ' ' || line[idx] === '\t')) idx++
  return idx
}

export const lineStartsWithStar = (line) => {
  const src = toText(line)
  if (!src) return false
  const idx = trimLineStartIndex(src)
  if (idx >= src.length) return false
  return src.charCodeAt(idx) === STAR_CHAR_CODE
}

export const lineStartsWithPercent = (line) => {
  const src = toText(line)
  if (!src) return false
  const idx = trimLineStartIndex(src)
  if (idx >= src.length - 1) return false
  return src.charCodeAt(idx) === PERCENT_CHAR_CODE && src.charCodeAt(idx + 1) === PERCENT_CHAR_CODE
}

export const normalizeOptions = (option = {}) => {
  const rawOption = option && typeof option === 'object' ? option : {}
  const hasFigureReferenceAuto = Object.prototype.hasOwnProperty.call(rawOption, 'figureReferenceAuto')
  const hasFigureReferenceManual = Object.prototype.hasOwnProperty.call(rawOption, 'figureReferenceManual')
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
    figureReference: false,
    figureReferenceAuto: false,
    figureReferenceManual: false,
    figureReferenceTag: DEFAULT_FIGURE_REFERENCE_TAG,
    figureReferenceManualTagFromMarker: false,
    figureReferenceClass: DEFAULT_FIGURE_REFERENCE_CLASS,
    ...rawOption,
  }
  opt.starComment = !!opt.starComment
  opt.percentComment = !!opt.percentComment
  opt.ruby = !!opt.ruby
  opt.starCommentDelete = !!(opt.starComment && opt.starCommentDelete)
  opt.percentCommentDelete = !!(opt.percentComment && opt.percentCommentDelete)
  opt.starCommentLine = !!(opt.starComment && opt.starCommentLine)
  opt.percentCommentLine = !!(opt.percentComment && opt.percentCommentLine)
  opt.starCommentParagraph = !!(opt.starComment && opt.starCommentParagraph && !opt.starCommentLine)
  opt.percentCommentParagraph = !!(opt.percentComment && opt.percentCommentParagraph && !opt.percentCommentLine)
  opt.percentClass = normalizeClassString(opt.percentClass, DEFAULT_PERCENT_CLASS)
  opt.starCommentParagraphClass = normalizeParagraphClass(opt.starCommentParagraphClass, DEFAULT_STAR_CLASS)
  opt.percentCommentParagraphClass = normalizeParagraphClass(opt.percentCommentParagraphClass, opt.percentClass)
  const figureReferenceDefault = !!opt.figureReference
  opt.figureReferenceAuto = !!(hasFigureReferenceAuto ? opt.figureReferenceAuto : figureReferenceDefault)
  opt.figureReferenceManual = !!(hasFigureReferenceManual ? opt.figureReferenceManual : figureReferenceDefault)
  opt.figureReference = figureReferenceDefault
  opt.figureReferenceTag = normalizeFigureReferenceTag(opt.figureReferenceTag)
  opt.figureReferenceManualTagFromMarker = !!opt.figureReferenceManualTagFromMarker
  opt.figureReferenceClass = normalizeClassString(opt.figureReferenceClass, DEFAULT_FIGURE_REFERENCE_CLASS)
  opt.__isNormalized = true
  Object.defineProperty(opt, NORMALIZED_OPTIONS, { value: true })
  return opt
}

export const createRuntimePlan = (option = {}) => {
  // `createRuntimePlan` is public through the analyzer subpath. Do not trust the
  // string-keyed internal hint on caller-owned objects. The module-private
  // symbol keeps normalized options idempotent without exposing a bypass.
  const opt = option && option[NORMALIZED_OPTIONS] ? option : normalizeOptions(option)
  const rubyEnabled = !!opt.ruby
  const starEnabled = !!opt.starComment
  const percentEnabled = !!opt.percentComment
  const starDeleteEnabled = !!opt.starCommentDelete
  const starParagraphEnabled = !!opt.starCommentParagraph
  const starLineEnabled = !!opt.starCommentLine
  const starInlineEnabled = !!(starEnabled && !starParagraphEnabled && !starLineEnabled)
  const starParagraphClass = starParagraphEnabled ? (opt.starCommentParagraphClass || '') : ''
  const starParagraphClassEnabled = !!starParagraphClass
  const percentDeleteEnabled = !!opt.percentCommentDelete
  const percentParagraphEnabled = !!opt.percentCommentParagraph
  const percentLineEnabled = !!opt.percentCommentLine
  const percentInlineEnabled = !!(percentEnabled && !percentParagraphEnabled && !percentLineEnabled)
  const percentParagraphClass = percentParagraphEnabled ? (opt.percentCommentParagraphClass || '') : ''
  const percentParagraphClassEnabled = !!percentParagraphClass
  const figureReferenceAutoEnabled = !!opt.figureReferenceAuto
  const figureReferenceManualEnabled = !!opt.figureReferenceManual
  const figureReferenceTag = opt.figureReferenceTag
  const figureReferenceManualTagFromMarker = !!opt.figureReferenceManualTagFromMarker
  const figureReferenceClass = opt.figureReferenceClass
  const anyEnabled = rubyEnabled || starEnabled || percentEnabled
    || figureReferenceAutoEnabled || figureReferenceManualEnabled
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
    | (figureReferenceAutoEnabled ? 2048 : 0)
    | (figureReferenceManualEnabled ? 4096 : 0)
  return {
    rubyEnabled,
    starEnabled,
    starDeleteEnabled,
    starParagraphEnabled,
    starLineEnabled,
    starInlineEnabled,
    starParagraphClass,
    starParagraphClassEnabled,
    percentEnabled,
    percentDeleteEnabled,
    percentParagraphEnabled,
    percentLineEnabled,
    percentInlineEnabled,
    percentParagraphClass,
    percentParagraphClassEnabled,
    figureReferenceAutoEnabled,
    figureReferenceManualEnabled,
    figureReferenceTag,
    figureReferenceManualTagFromMarker,
    figureReferenceClass,
    anyEnabled,
    inlineProfileMask,
  }
}
