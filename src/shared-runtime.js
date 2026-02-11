export const STAR_CHAR = '★'
export const STAR_CHAR_CODE = STAR_CHAR.charCodeAt(0)
export const PERCENT_CHAR = '%'
export const PERCENT_CHAR_CODE = PERCENT_CHAR.charCodeAt(0)
export const PERCENT_MARKER = PERCENT_CHAR + PERCENT_CHAR
export const RUBY_MARK_CHAR = '《'
export const DEFAULT_STAR_CLASS = 'star-comment'
export const DEFAULT_PERCENT_CLASS = 'percent-comment'

const toText = (value) => {
  if (typeof value === 'string') return value
  if (value == null) return ''
  return String(value)
}

const normalizeClassString = (value, fallbackClass) => {
  if (typeof value !== 'string') return fallbackClass
  const trimmed = value.trim()
  return trimmed || fallbackClass
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

const countBackslashesBefore = (text, index) => {
  if (!text || index <= 0) return 0
  let backslashCount = 0
  let cursor = index - 1
  while (cursor >= 0 && text.charCodeAt(cursor) === 92) {
    backslashCount++
    cursor--
  }
  return backslashCount
}

export const isEscapedStar = (text, index) => {
  const src = toText(text)
  return (countBackslashesBefore(src, index) & 1) === 1
}

export const isEscapedPercent = (text, index) => {
  return isEscapedStar(text, index)
}

const trimLineStartIndex = (line) => {
  let idx = 0
  while (idx < line.length && (line[idx] === ' ' || line[idx] === '\t')) idx++
  return idx
}

export const lineStartsWithStar = (line) => {
  const src = toText(line)
  if (!src) return false
  const idx = trimLineStartIndex(src)
  if (idx >= src.length) return false
  if (src.charCodeAt(idx) !== STAR_CHAR_CODE) return false
  return (countBackslashesBefore(src, idx) & 1) === 0
}

export const lineStartsWithPercent = (line) => {
  const src = toText(line)
  if (!src) return false
  const idx = trimLineStartIndex(src)
  if (idx >= src.length - 1) return false
  if (src.charCodeAt(idx) !== PERCENT_CHAR_CODE || src.charCodeAt(idx + 1) !== PERCENT_CHAR_CODE) {
    return false
  }
  return (countBackslashesBefore(src, idx) & 1) === 0
}

export const normalizeOptions = (option = {}) => {
  const rawOption = option && typeof option === 'object' ? option : {}
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
  opt.__isNormalized = true
  return opt
}

export const createRuntimePlan = (option = {}) => {
  const opt = option && option.__isNormalized ? option : normalizeOptions(option)
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
    anyEnabled,
    inlineProfileMask,
  }
}
