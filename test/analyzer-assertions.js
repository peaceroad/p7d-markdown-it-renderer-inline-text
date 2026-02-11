import assert from 'assert'
import {
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
} from '../src/analyzer.js'

export const runAnalyzerAssertions = ({ mdit, mdRendererInlineText }) => {
  {
    const normalized = normalizeOptions({
      starComment: true,
      starCommentLine: true,
      starCommentParagraph: true,
      percentComment: true,
      percentCommentLine: false,
      percentCommentParagraph: true,
      percentClass: '  note  ',
      percentCommentParagraphClass: '  ',
    })
    assert.strictEqual(normalized.starCommentParagraph, false)
    assert.strictEqual(normalized.percentCommentParagraph, true)
    assert.strictEqual(normalized.percentClass, 'note')
    assert.strictEqual(normalized.percentCommentParagraphClass, 'note')
  }

  {
    const runtime = createRuntimePlan({
      starComment: true,
      starCommentLine: false,
      starCommentParagraph: false,
      percentComment: true,
      percentCommentLine: true,
      ruby: true,
    })
    assert.strictEqual(runtime.starInlineEnabled, true)
    assert.strictEqual(runtime.percentInlineEnabled, false)
    assert.strictEqual(runtime.rubyEnabled, true)
  }

  {
    assert.strictEqual(isEscapedStar('\\★x', 1), true)
    assert.strictEqual(isEscapedStar('\\\\★x', 2), false)
    assert.strictEqual(isEscapedPercent('\\%%x', 1), true)
    assert.strictEqual(isEscapedPercent('\\\\%%x', 2), false)
    assert.strictEqual(lineStartsWithStar('  ★注記'), true)
    assert.strictEqual(lineStartsWithStar('  \\★注記'), false)
    assert.strictEqual(lineStartsWithPercent('  %%note'), true)
    assert.strictEqual(lineStartsWithPercent('  \\%%note'), false)
  }

  {
    const runtime = createRuntimePlan({
      ruby: true,
      starComment: true,
      percentComment: true,
    })
    const ranges = scanInlineRanges('前★A%%B★後 漢字《そと》', runtime)
    assert.deepStrictEqual(
      ranges.map((r) => [r.type, r.text]),
      [
        ['star', '★A%%B★'],
        ['ruby', '漢字《そと》'],
      ],
    )
  }

  {
    const runtime = createRuntimePlan({
      starComment: true,
      percentComment: true,
      ruby: false,
    })
    const ranges = scanInlineRanges('前\\\\★A★後\\%%B\\%%中%%C%%終', runtime)
    assert.deepStrictEqual(
      ranges.map((r) => [r.type, r.text]),
      [
        ['star', '★A★'],
        ['percent', '%%C%%'],
      ],
    )
  }

  {
    const runtime = createRuntimePlan({
      ruby: true,
      starComment: false,
      percentComment: true,
    })
    const ranges = scanInlineRanges('前★A★後%%B%%後', runtime)
    assert.deepStrictEqual(
      ranges.map((r) => [r.type, r.text]),
      [['percent', '%%B%%']],
    )
  }

  {
    const runtime = createRuntimePlan({ ruby: true })
    const full = scanInlineRanges('<RUBY>寿司《すし》</RUBY>', runtime)
    assert.deepStrictEqual(
      full.map((r) => [r.type, r.text]),
      [['ruby', '<RUBY>寿司《すし》</RUBY>']],
    )

    const unclosed = scanInlineRanges('<RUBY>寿司《すし》', runtime)
    assert.deepStrictEqual(
      unclosed.map((r) => [r.type, r.text]),
      [['ruby', '寿司《すし》']],
    )
  }

  {
    const runtime = createRuntimePlan({
      starComment: true,
      starCommentParagraph: true,
      percentComment: true,
    })
    const analyzed = analyzeLines(
      ['★段落コメントです。', '続きです。', '', '通常です。'],
      runtime,
    )
    assert.strictEqual(analyzed.lines[0].paragraphType, 'star')
    assert.strictEqual(analyzed.lines[1].paragraphType, 'star')
    assert.strictEqual(analyzed.lines[3].paragraphType, null)
  }

  {
    const runtime = createRuntimePlan({
      starComment: true,
      starCommentLine: true,
      percentComment: true,
      percentCommentLine: true,
    })
    const first = analyzeLines(['  ★行コメント', '  %%line'], runtime)
    assert.strictEqual(first.lines[0].lineModeRange.type, 'star')
    assert.strictEqual(first.lines[1].lineModeRange.type, 'percent')
    const second = analyzeLines(['  ★行コメント', '  %%line'], runtime, first.state)
    assert.ok(second.stats.cacheHits >= 2)
  }

  {
    const runtimeA = createRuntimePlan({ starComment: true, percentComment: true })
    const runtimeB = createRuntimePlan({ starComment: true, percentComment: false })
    const base = analyzeLineWindow(['前★注記★後', '通常行'], runtimeA, 0, 2, null, { cacheLimit: 16 })
    const next = analyzeLineWindow(['前★注記★後'], runtimeB, 0, 1, base.state, { cacheLimit: 16 })
    assert.strictEqual(next.state.inlineProfileMask, runtimeB.inlineProfileMask)
    assert.strictEqual(next.state.lineCache.size, 1)
    assert.strictEqual(next.stats.cacheHits, 0)
  }

  {
    const runtime = createRuntimePlan({
      starComment: true,
      starCommentLine: true,
      starCommentParagraph: true,
      percentComment: true,
      percentCommentLine: true,
      percentCommentParagraph: true,
    })
    const ranges = scanInlineRanges('前★星★後%%注%%', runtime)
    assert.deepStrictEqual(ranges, [])
  }

  {
    const runtime = createRuntimePlan({})
    const analyzed = analyzeLines([], runtime)
    assert.deepStrictEqual(analyzed.lines, [])
    assert.strictEqual(analyzed.stats.lineCount, 0)
    assert.strictEqual(analyzed.stats.analyzedCount, 0)
  }

  {
    assert.deepStrictEqual(normalizeLineWindow(10, 3, 7), { fromLine: 3, toLine: 7 })
    assert.deepStrictEqual(normalizeLineWindow(10, -2, 20), { fromLine: 0, toLine: 10 })
    assert.deepStrictEqual(normalizeLineWindow(0, 1, 2), { fromLine: 0, toLine: 0 })
  }

  {
    const lines = ['一行目', '二行目', '', '三行目', '四行目']
    assert.deepStrictEqual(
      expandToParagraphBoundaries(lines, 1, 2),
      { fromLine: 0, toLine: 2 },
    )
    assert.deepStrictEqual(
      expandToParagraphBoundaries(lines, 3, 4),
      { fromLine: 3, toLine: 5 },
    )
  }

  {
    assert.strictEqual(shouldFullAnalyze(0, 1000), false)
    assert.strictEqual(shouldFullAnalyze(50, 1000), true) // 5%
    assert.strictEqual(shouldFullAnalyze(80, 10000), false) // 0.8%
    assert.strictEqual(shouldFullAnalyze(120, 10000), true) // over default line threshold
    assert.strictEqual(shouldFullAnalyze(50, 10000, { thresholdRatio: 0.004 }), true)
  }

  {
    const runtime = createRuntimePlan({
      starComment: true,
      starCommentParagraph: true,
      percentComment: true,
      percentCommentLine: true,
      ruby: true,
    })
    const lines = [
      '',
      '★段落コメントです。',
      '続きです。',
      '',
      '%%line note',
      '通常文です。',
    ]
    const window = analyzeLineWindow(lines, runtime, 2, 3)
    assert.deepStrictEqual(
      [window.stats.analyzedFrom, window.stats.analyzedTo],
      [1, 3],
    )
    assert.strictEqual(window.lines.length, 2)
    assert.strictEqual(window.lines[0].index, 1)
    assert.strictEqual(window.lines[0].paragraphType, 'star')
    assert.strictEqual(window.lines[1].paragraphType, 'star')

    const window2 = analyzeLineWindow(lines, runtime, 2, 3, window.state)
    assert.ok(window2.stats.cacheHits >= 2)
  }

  // Parity check in guaranteed scope: plain inline marker text (no markdown syntax intersections).
  {
    const runtime = createRuntimePlan({
      starComment: true,
      percentComment: true,
      ruby: true,
    })
    const input = '前★星★後%%注%%後 漢字《かんじ》'
    const ranges = scanInlineRanges(input, runtime)
    const md = mdit().use(mdRendererInlineText, {
      starComment: true,
      percentComment: true,
      ruby: true,
    })
    const html = md.render(input)
    assert.ok(html.includes('<span class="star-comment">★星★</span>'))
    assert.ok(html.includes('<span class="percent-comment">%%注%%</span>'))
    assert.ok(html.includes('<ruby>漢字<rp>《</rp><rt>かんじ</rt><rp>》</rp></ruby>'))
    assert.deepStrictEqual(
      ranges.map((r) => r.type),
      ['star', 'percent', 'ruby'],
    )
  }
}
