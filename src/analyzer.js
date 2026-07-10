import {
  STAR_CHAR_CODE,
  PERCENT_CHAR_CODE,
  RUBY_MARK_CHAR,
  normalizeOptions,
  createRuntimePlan,
  toText,
  createBackslashLookup,
  createRubyRegExp,
  lineStartsWithStar,
  lineStartsWithPercent,
  isEscapedStar,
  isEscapedPercent,
  trimLineStartIndex,
} from './shared-runtime.js'

const DEFAULT_CACHE_SIZE_LIMIT = 4096
const DEFAULT_FULL_ANALYZE_THRESHOLD_LINES = 100
const DEFAULT_FULL_ANALYZE_THRESHOLD_RATIO = 0.02
const NEVER_ESCAPED = () => false
const DEFAULT_RUNTIME = createRuntimePlan({})
const RUBY_REGEXP = createRubyRegExp()

const clampInt = (value, min, max, fallback) => {
  if (value == null) return fallback
  const num = Number(value)
  if (!Number.isFinite(num)) return fallback
  const int = Math.trunc(num)
  if (int < min) return min
  if (int > max) return max
  return int
}

const isBlankLine = (line) => line.trim() === ''

const resolvePositiveInt = (value, fallback) => {
  if (value == null) return fallback
  const num = Number(value)
  if (!Number.isFinite(num)) return fallback
  const int = Math.trunc(num)
  return int > 0 ? int : fallback
}

const resolvePositiveNumber = (value, fallback) => {
  if (value == null) return fallback
  const num = Number(value)
  return Number.isFinite(num) && num > 0 ? num : fallback
}

const resolveCacheLimit = (option) => {
  return resolvePositiveInt(option && option.cacheLimit, DEFAULT_CACHE_SIZE_LIMIT)
}

const getReusableLineCache = (prevState, inlineProfileMask) => {
  if (
    prevState
    && prevState.inlineProfileMask === inlineProfileMask
    && prevState.lineCache instanceof Map
  ) {
    return prevState.lineCache
  }
  return new Map()
}

const setCacheEntry = (lineCache, key, value, cacheLimit) => {
  lineCache.delete(key)
  lineCache.set(key, value)
  while (lineCache.size > cacheLimit) {
    const oldestKey = lineCache.keys().next().value
    if (oldestKey === undefined) break
    lineCache.delete(oldestKey)
  }
}

const createEmptyAnalyzeResult = (inlineProfileMask) => {
  return {
    lines: [],
    state: {
      lineCache: new Map(),
      inlineProfileMask,
    },
    stats: {
      cacheHits: 0,
      lineCount: 0,
      analyzedCount: 0,
      analyzedFrom: 0,
      analyzedTo: 0,
    },
  }
}

const createDisabledAnalyzeLines = (srcLines, inlineProfileMask, from = 0, to = srcLines.length) => {
  const lineCount = srcLines.length
  const start = Math.max(0, from)
  const end = Math.max(start, Math.min(lineCount, to))
  const resultCount = end - start
  const results = new Array(resultCount)
  for (let i = start; i < end; i++) {
    const text = toText(srcLines[i])
    results[i - start] = {
      index: i,
      text,
      inlineRanges: [],
      lineModeRange: null,
      paragraphType: null,
    }
  }
  return {
    lines: results,
    state: {
      lineCache: new Map(),
      inlineProfileMask,
    },
    stats: {
      cacheHits: 0,
      lineCount,
      analyzedCount: resultCount,
      analyzedFrom: start,
      analyzedTo: end,
    },
  }
}

const findNextInlineMarker = (text, from, allowStar, allowPercent, isEscapedAt) => {
  if (!allowStar && !allowPercent) return null
  if (allowStar && !allowPercent) {
    let i = text.indexOf('★', from)
    while (i !== -1) {
      if (!isEscapedAt(i)) return { type: 'star', start: i, length: 1 }
      i = text.indexOf('★', i + 1)
    }
    return null
  }
  if (!allowStar && allowPercent) {
    let i = text.indexOf('%%', from)
    while (i !== -1) {
      if (!isEscapedAt(i)) return { type: 'percent', start: i, length: 2 }
      i = text.indexOf('%%', i + 1)
    }
    return null
  }
  for (let i = from; i < text.length; i++) {
    if (allowStar && text.charCodeAt(i) === STAR_CHAR_CODE && !isEscapedAt(i)) {
      return { type: 'star', start: i, length: 1 }
    }
    if (
      allowPercent
      && i + 1 < text.length
      && text.charCodeAt(i) === PERCENT_CHAR_CODE
      && text.charCodeAt(i + 1) === PERCENT_CHAR_CODE
      && !isEscapedAt(i)
    ) {
      return { type: 'percent', start: i, length: 2 }
    }
  }
  return null
}

const findMarkerClose = (text, markerType, from, isEscapedAt) => {
  if (markerType === 'star') {
    let i = text.indexOf('★', from)
    while (i !== -1) {
      if (!isEscapedAt(i)) return i
      i = text.indexOf('★', i + 1)
    }
    return -1
  }
  let i = text.indexOf('%%', from)
  while (i !== -1) {
    if (!isEscapedAt(i)) return i
    i = text.indexOf('%%', i + 1)
  }
  return -1
}

const scanRubyRangesInSegment = (text, start, end, out) => {
  if (start >= end) return
  const rubyMarkPos = text.indexOf(RUBY_MARK_CHAR, start)
  if (rubyMarkPos === -1 || rubyMarkPos >= end) return
  RUBY_REGEXP.lastIndex = start
  let match
  while ((match = RUBY_REGEXP.exec(text)) !== null) {
    const full = match[0]
    const wrappedBase = match[1]
    const wrappedReading = match[2]
    const plainBase = match[3]
    const plainReading = match[4]
    const base = wrappedBase || plainBase
    const reading = wrappedReading || plainReading
    if (!base || !reading) continue
    const absStart = match.index
    if (absStart >= end) break
    const absEnd = absStart + full.length
    if (absEnd > end) continue
    out.push({
      type: 'ruby',
      start: absStart,
      end: absEnd,
      text: full,
    })
  }
}

const scanInlineRanges = (text, runtime) => {
  const src = toText(text)
  const activeRuntime = runtime || DEFAULT_RUNTIME
  if (!src) return []
  if (!activeRuntime.anyEnabled) return []
  const allowStar = !!activeRuntime.starInlineEnabled
  const allowPercent = !!activeRuntime.percentInlineEnabled
  const allowRuby = !!activeRuntime.rubyEnabled
  if (!allowStar && !allowPercent && !allowRuby) return []
  const hasStar = allowStar && src.indexOf('★') !== -1
  const hasPercent = allowPercent && src.indexOf('%%') !== -1
  const hasRuby = allowRuby && src.indexOf(RUBY_MARK_CHAR) !== -1
  if (!hasStar && !hasPercent && !hasRuby) return []
  if (!hasStar && !hasPercent) {
    const rubyOnlyRanges = []
    scanRubyRangesInSegment(src, 0, src.length, rubyOnlyRanges)
    return rubyOnlyRanges
  }

  const markerRanges = []
  const backslashLookup = createBackslashLookup(src)
  const isEscapedAt = backslashLookup
    ? (idx) => (backslashLookup(idx) & 1) === 1
    : NEVER_ESCAPED

  let cursor = 0
  while (cursor < src.length) {
    const marker = findNextInlineMarker(src, cursor, hasStar, hasPercent, isEscapedAt)
    if (!marker) break
    const closePos = findMarkerClose(src, marker.type, marker.start + marker.length, isEscapedAt)
    if (closePos === -1) {
      cursor = marker.start + marker.length
      continue
    }
    const end = closePos + marker.length
    const range = {
      type: marker.type,
      start: marker.start,
      end,
      text: src.slice(marker.start, end),
    }
    markerRanges.push(range)
    cursor = end
  }

  let rubyRanges = null
  if (hasRuby) {
    const scannedRubyRanges = []
    scanRubyRangesInSegment(src, 0, src.length, scannedRubyRanges)
    if (!scannedRubyRanges.length) {
      rubyRanges = scannedRubyRanges
    } else if (!markerRanges.length) {
      rubyRanges = scannedRubyRanges
    } else {
      rubyRanges = []
      let markerIdx = 0
      for (let i = 0; i < scannedRubyRanges.length; i++) {
        const rubyRange = scannedRubyRanges[i]
        while (markerIdx < markerRanges.length && markerRanges[markerIdx].end <= rubyRange.start) {
          markerIdx++
        }
        if (
          markerIdx < markerRanges.length
          && markerRanges[markerIdx].start < rubyRange.end
        ) {
          continue
        }
        rubyRanges.push(rubyRange)
      }
    }
  }

  if (!rubyRanges || !rubyRanges.length) return markerRanges
  if (!markerRanges.length) return rubyRanges

  let i = 0
  let j = 0
  const merged = []
  while (i < markerRanges.length && j < rubyRanges.length) {
    const a = markerRanges[i]
    const b = rubyRanges[j]
    if (a.start < b.start || (a.start === b.start && a.end <= b.end)) {
      merged.push(a)
      i++
    } else {
      merged.push(b)
      j++
    }
  }
  while (i < markerRanges.length) {
    merged.push(markerRanges[i])
    i++
  }
  while (j < rubyRanges.length) {
    merged.push(rubyRanges[j])
    j++
  }
  return merged
}

const getParagraphType = (line, runtime) => {
  if (!runtime) return null
  if (runtime.starParagraphEnabled && lineStartsWithStar(line)) return 'star'
  if (runtime.percentParagraphEnabled && lineStartsWithPercent(line)) return 'percent'
  return null
}

const analyzeLineFast = (line, runtime) => {
  const src = toText(line)
  const inlineRanges = scanInlineRanges(src, runtime)
  let lineModeRange = null
  if (runtime && src && (runtime.starLineEnabled || runtime.percentLineEnabled)) {
    const lineStart = trimLineStartIndex(src)
    if (lineStart < src.length) {
      const firstCode = src.charCodeAt(lineStart)
      if (runtime.starLineEnabled && firstCode === STAR_CHAR_CODE) {
        lineModeRange = { type: 'star', start: lineStart, end: src.length, text: src.slice(lineStart) }
      } else if (
        runtime.percentLineEnabled
        && firstCode === PERCENT_CHAR_CODE
        && lineStart + 1 < src.length
        && src.charCodeAt(lineStart + 1) === PERCENT_CHAR_CODE
      ) {
        lineModeRange = { type: 'percent', start: lineStart, end: src.length, text: src.slice(lineStart) }
      }
    }
  }
  return { inlineRanges, lineModeRange }
}

const fillParagraphTypes = (allLines, windowLines, blankFlags, runtime, from, to, paragraphTypes) => {
  let blockStart = from
  while (blockStart < to) {
    while (blockStart < to && blankFlags[blockStart - from]) blockStart++
    if (blockStart >= to) break

    let blockEnd = blockStart + 1
    while (blockEnd < to && !blankFlags[blockEnd - from]) blockEnd++

    // A window may start in the middle of a paragraph when boundary expansion
    // is disabled or when context lines reach into the preceding paragraph.
    // Resolve the actual first line before classifying the visible slice.
    let paragraphStart = blockStart
    if (blockStart === from) {
      while (paragraphStart > 0 && !isBlankLine(toText(allLines[paragraphStart - 1]))) {
        paragraphStart--
      }
    }
    const firstLine = paragraphStart < from
      ? toText(allLines[paragraphStart])
      : windowLines[paragraphStart - from]
    const paragraphType = getParagraphType(firstLine, runtime)
    if (paragraphType) {
      for (let i = blockStart; i < blockEnd; i++) {
        paragraphTypes[i - from] = paragraphType
      }
    }
    blockStart = blockEnd
  }
}

const normalizeLineWindow = (lineCount, fromLine, toLine) => {
  if (lineCount <= 0) return { fromLine: 0, toLine: 0 }
  const from = clampInt(fromLine, 0, lineCount, 0)
  const to = clampInt(toLine, 0, lineCount, lineCount)
  if (to < from) return { fromLine: to, toLine: to }
  return { fromLine: from, toLine: to }
}

const expandToParagraphBoundaries = (lines, fromLine, toLine) => {
  const srcLines = Array.isArray(lines) ? lines : []
  const lineCount = srcLines.length
  if (!lineCount) return { fromLine: 0, toLine: 0 }
  const normalized = normalizeLineWindow(lineCount, fromLine, toLine)
  let from = normalized.fromLine
  let to = normalized.toLine

  while (from > 0 && !isBlankLine(toText(srcLines[from - 1]))) from--
  while (to < lineCount && !isBlankLine(toText(srcLines[to]))) to++
  return { fromLine: from, toLine: to }
}

const shouldFullAnalyze = (changeCount, totalLines, option) => {
  const cfg = option || {}
  const changed = Math.max(0, Math.trunc(Number(changeCount) || 0))
  const total = Math.max(0, Math.trunc(Number(totalLines) || 0))
  if (!changed || !total) return false

  const thresholdLines = resolvePositiveInt(cfg.thresholdLines, DEFAULT_FULL_ANALYZE_THRESHOLD_LINES)
  const thresholdRatio = resolvePositiveNumber(cfg.thresholdRatio, DEFAULT_FULL_ANALYZE_THRESHOLD_RATIO)

  if (changed >= thresholdLines) return true
  return (changed / total) >= thresholdRatio
}

const analyzeLines = (lines, runtime, prevState = null) => {
  const activeRuntime = runtime || DEFAULT_RUNTIME
  const srcLines = Array.isArray(lines) ? lines.map(toText) : []
  const lineCount = srcLines.length
  if (!lineCount) return createEmptyAnalyzeResult(activeRuntime.inlineProfileMask)
  if (!activeRuntime.anyEnabled) {
    return createDisabledAnalyzeLines(srcLines, activeRuntime.inlineProfileMask)
  }
  const cacheLimit = DEFAULT_CACHE_SIZE_LIMIT
  const lineCache = getReusableLineCache(prevState, activeRuntime.inlineProfileMask)
  const results = new Array(lineCount)
  const paragraphTypes = new Array(lineCount)
  const blankFlags = new Array(lineCount)
  let cacheHits = 0

  for (let i = 0; i < lineCount; i++) {
    blankFlags[i] = isBlankLine(srcLines[i])
  }

  // Paragraph detection: first non-empty line in each blank-line separated block.
  fillParagraphTypes(srcLines, srcLines, blankFlags, activeRuntime, 0, lineCount, paragraphTypes)

  for (let i = 0; i < lineCount; i++) {
    const line = srcLines[i]
    const key = line
    let base = lineCache.get(key)
    if (base) cacheHits++
    if (!base) {
      base = analyzeLineFast(line, activeRuntime)
    }
    setCacheEntry(lineCache, key, base, cacheLimit)
    results[i] = {
      index: i,
      text: line,
      inlineRanges: base.inlineRanges,
      lineModeRange: base.lineModeRange,
      paragraphType: paragraphTypes[i] || null,
    }
  }

  return {
    lines: results,
    state: {
      lineCache,
      inlineProfileMask: activeRuntime.inlineProfileMask,
    },
    stats: {
      cacheHits,
      lineCount,
      analyzedCount: lineCount,
      analyzedFrom: 0,
      analyzedTo: lineCount,
    },
  }
}

const analyzeLineWindow = (lines, runtime, fromLine, toLine, prevState = null, option) => {
  const activeRuntime = runtime || DEFAULT_RUNTIME
  const srcLines = Array.isArray(lines) ? lines : []
  if (!srcLines.length) return createEmptyAnalyzeResult(activeRuntime.inlineProfileMask)
  const lineCount = srcLines.length
  const initialWindow = normalizeLineWindow(lineCount, fromLine, toLine)
  const expandedWindow = option && option.expandToParagraphBoundaries === false
    ? initialWindow
    : expandToParagraphBoundaries(srcLines, initialWindow.fromLine, initialWindow.toLine)
  const contextLines = clampInt(option && option.contextLines, 0, lineCount, 0)
  const from = Math.max(0, expandedWindow.fromLine - contextLines)
  const to = Math.min(lineCount, expandedWindow.toLine + contextLines)
  if (!activeRuntime.anyEnabled) {
    return createDisabledAnalyzeLines(srcLines, activeRuntime.inlineProfileMask, from, to)
  }

  const cacheLimit = resolveCacheLimit(option)
  const lineCache = getReusableLineCache(prevState, activeRuntime.inlineProfileMask)
  const windowLength = Math.max(0, to - from)
  const results = new Array(windowLength)
  const paragraphTypes = new Array(windowLength)
  const windowLines = new Array(windowLength)
  const blankFlags = new Array(windowLength)
  let cacheHits = 0

  for (let i = 0; i < windowLength; i++) {
    const line = toText(srcLines[from + i])
    windowLines[i] = line
    blankFlags[i] = isBlankLine(line)
  }

  fillParagraphTypes(srcLines, windowLines, blankFlags, activeRuntime, from, to, paragraphTypes)

  for (let i = from; i < to; i++) {
    const line = windowLines[i - from]
    const key = line
    let base = lineCache.get(key)
    if (base) cacheHits++
    if (!base) {
      base = analyzeLineFast(line, activeRuntime)
    }
    setCacheEntry(lineCache, key, base, cacheLimit)
    results[i - from] = {
      index: i,
      text: line,
      inlineRanges: base.inlineRanges,
      lineModeRange: base.lineModeRange,
      paragraphType: paragraphTypes[i - from] || null,
    }
  }

  return {
    lines: results,
    state: {
      lineCache,
      inlineProfileMask: activeRuntime.inlineProfileMask,
    },
    stats: {
      cacheHits,
      lineCount,
      analyzedCount: Math.max(0, to - from),
      analyzedFrom: from,
      analyzedTo: to,
    },
  }
}

export {
  normalizeOptions,
  createRuntimePlan,
  lineStartsWithStar,
  lineStartsWithPercent,
  isEscapedStar,
  isEscapedPercent,
  normalizeLineWindow,
  expandToParagraphBoundaries,
  shouldFullAnalyze,
  scanInlineRanges,
  analyzeLines,
  analyzeLineWindow,
}

export default {
  normalizeOptions,
  createRuntimePlan,
  lineStartsWithStar,
  lineStartsWithPercent,
  isEscapedStar,
  isEscapedPercent,
  normalizeLineWindow,
  expandToParagraphBoundaries,
  shouldFullAnalyze,
  scanInlineRanges,
  analyzeLines,
  analyzeLineWindow,
}
