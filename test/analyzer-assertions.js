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
      figureReference: true,
      figureReferenceTag: ' B ',
      figureReferenceClass: ' figure-number ',
    })
    assert.strictEqual(normalized.starCommentParagraph, false)
    assert.strictEqual(normalized.percentCommentParagraph, true)
    assert.strictEqual(normalized.percentClass, 'note')
    assert.strictEqual(normalized.percentCommentParagraphClass, 'note')
    assert.strictEqual(normalized.figureReference, true)
    assert.strictEqual(normalized.figureReferenceTag, 'b')
    assert.strictEqual(normalized.figureReferenceClass, 'figure-number')
  }

  {
    const runtime = createRuntimePlan({
      starComment: true,
      starCommentLine: false,
      starCommentParagraph: false,
      percentComment: true,
      percentCommentLine: true,
      ruby: true,
      figureReference: true,
    })
    assert.strictEqual(runtime.starInlineEnabled, true)
    assert.strictEqual(runtime.percentInlineEnabled, false)
    assert.strictEqual(runtime.rubyEnabled, true)
    assert.strictEqual(runtime.figureReferenceEnabled, true)
    assert.strictEqual(runtime.figureReferenceTag, 'span')
    assert.strictEqual(runtime.figureReferenceClass, 'f-ref')
  }

  {
    assert.throws(
      () => normalizeOptions({ figureReferenceTag: 'script' }),
      /figureReferenceTag must be one of: span, b, i/,
    )
  }

  // Public callers cannot bypass option precedence with the internal hint key.
  {
    const runtime = createRuntimePlan({
      __isNormalized: true,
      starComment: true,
      starCommentLine: true,
      starCommentParagraph: true,
    })
    assert.strictEqual(runtime.starLineEnabled, true)
    assert.strictEqual(runtime.starParagraphEnabled, false)
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
    const runtime = createRuntimePlan({ figureReference: true })
    const ranges = scanInlineRanges(
      '前（図1）（図１）（図A）（図Ａ）（図1.1）（図A.1）（図1-1）（図A-1）'
        + ' (Figure 1)（Figure A.1）(Figure.1)(Figure.A-1)'
        + '（Figure.A.1）(Fig 1)(Fig.1)(Fig. A-1)（Fig.A.1）後',
      runtime,
    )
    assert.deepStrictEqual(
      ranges.map((r) => [r.type, r.text]),
      [
        ['figure-reference', '（図1）'],
        ['figure-reference', '（図１）'],
        ['figure-reference', '（図A）'],
        ['figure-reference', '（図Ａ）'],
        ['figure-reference', '（図1.1）'],
        ['figure-reference', '（図A.1）'],
        ['figure-reference', '（図1-1）'],
        ['figure-reference', '（図A-1）'],
        ['figure-reference', '(Figure 1)'],
        ['figure-reference', '（Figure A.1）'],
        ['figure-reference', '(Figure.1)'],
        ['figure-reference', '(Figure.A-1)'],
        ['figure-reference', '（Figure.A.1）'],
        ['figure-reference', '(Fig 1)'],
        ['figure-reference', '(Fig.1)'],
        ['figure-reference', '(Fig. A-1)'],
        ['figure-reference', '（Fig.A.1）'],
      ],
    )
    assert.deepStrictEqual(
      scanInlineRanges(
        '（図１．１）（図Ａ－１）（Figure．1）(Figure.A－1)（図1：1）(fig. 1)(FIG.1)',
        runtime,
      ),
      [],
    )
  }

  {
    const runtime = createRuntimePlan({
      figureReference: true,
      starComment: true,
      percentComment: true,
      ruby: true,
    })
    const ranges = scanInlineRanges(
      '★（図1）★ （図2） %%（Figure A）%% (Figure 3) 漢字《かんじ》',
      runtime,
    )
    assert.deepStrictEqual(
      ranges.map((r) => [r.type, r.text]),
      [
        ['star', '★（図1）★'],
        ['figure-reference', '（図2）'],
        ['percent', '%%（Figure A）%%'],
        ['figure-reference', '(Figure 3)'],
        ['ruby', '漢字《かんじ》'],
      ],
    )
    assert.deepStrictEqual(
      scanInlineRanges('\\(Figure 1) (Figure 2)', runtime).map((r) => r.text),
      ['(Figure 2)'],
    )
    assert.deepStrictEqual(scanInlineRanges('\\（図1）', runtime), [])
    assert.deepStrictEqual(
      scanInlineRanges('\\\\（図1）', runtime).map((r) => r.text),
      ['（図1）'],
    )
    assert.deepStrictEqual(
      scanInlineRanges('★未完 （図1） %%未完 (Figure A)', runtime).map((r) => r.text),
      ['（図1）', '(Figure A)'],
    )
  }

  // Both short direct scans and longer typed lookups preserve escape parity.
  {
    const runtime = createRuntimePlan({ starComment: true })
    const longPrefix = 'x'.repeat(300)
    const even = scanInlineRanges(`${longPrefix}\\\\★A★`, runtime)
    const odd = scanInlineRanges(`${longPrefix}\\★A★`, runtime)
    assert.deepStrictEqual(even.map((r) => r.text), ['★A★'])
    assert.deepStrictEqual(odd, [])
  }

  {
    const runtime = createRuntimePlan({
      ruby: true,
      starComment: true,
    })
    const ranges = scanInlineRanges('漢字《A★B★》', runtime)
    assert.deepStrictEqual(
      ranges.map((r) => [r.type, r.text]),
      [['star', '★B★']],
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
      percentComment: true,
    })
    const ranges = scanInlineRanges('%%a\\%%%b%%', runtime)
    assert.deepStrictEqual(
      ranges.map((r) => [r.type, r.start, r.end, r.text]),
      [['percent', 0, 7, '%%a\\%%%']],
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
    const runtimeWithoutFigure = createRuntimePlan({ ruby: true })
    const runtimeWithFigure = createRuntimePlan({ ruby: true, figureReference: true })
    assert.notStrictEqual(
      runtimeWithoutFigure.inlineProfileMask,
      runtimeWithFigure.inlineProfileMask,
    )
    const first = analyzeLines(['（図A.1）'], runtimeWithFigure)
    const next = analyzeLines(['（図A.1）'], runtimeWithoutFigure, first.state)
    assert.strictEqual(next.stats.cacheHits, 0)
    assert.deepStrictEqual(next.lines[0].inlineRanges, [])
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
    const runtime = createRuntimePlan({})
    const analyzed = analyzeLines(['前★注記★後', '  %%line'], runtime)
    assert.deepStrictEqual(
      analyzed.lines.map((line) => ({
        index: line.index,
        text: line.text,
        inlineRanges: line.inlineRanges,
        lineModeRange: line.lineModeRange,
        paragraphType: line.paragraphType,
      })),
      [
        { index: 0, text: '前★注記★後', inlineRanges: [], lineModeRange: null, paragraphType: null },
        { index: 1, text: '  %%line', inlineRanges: [], lineModeRange: null, paragraphType: null },
      ],
    )
    assert.strictEqual(analyzed.stats.analyzedCount, 2)
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

  // Partial windows still inherit the type from the actual paragraph start.
  {
    const runtime = createRuntimePlan({
      starComment: true,
      starCommentParagraph: true,
    })
    const lines = ['★段落コメントです。', '続きです。', '', '通常です。']
    const partial = analyzeLineWindow(lines, runtime, 1, 2, null, {
      expandToParagraphBoundaries: false,
    })
    assert.strictEqual(partial.lines.length, 1)
    assert.strictEqual(partial.lines[0].index, 1)
    assert.strictEqual(partial.lines[0].paragraphType, 'star')

    const withContext = analyzeLineWindow(lines, runtime, 3, 4, null, {
      contextLines: 2,
    })
    assert.strictEqual(withContext.lines[0].index, 1)
    assert.strictEqual(withContext.lines[0].paragraphType, 'star')
  }

  {
    const runtime = createRuntimePlan({})
    const lines = ['前★注記★後', '', '%%line']
    const window = analyzeLineWindow(lines, runtime, 1, 2)
    assert.deepStrictEqual(
      window.lines.map((line) => ({
        index: line.index,
        text: line.text,
        inlineRanges: line.inlineRanges,
        lineModeRange: line.lineModeRange,
        paragraphType: line.paragraphType,
      })),
      [
        { index: 0, text: '前★注記★後', inlineRanges: [], lineModeRange: null, paragraphType: null },
        { index: 1, text: '', inlineRanges: [], lineModeRange: null, paragraphType: null },
        { index: 2, text: '%%line', inlineRanges: [], lineModeRange: null, paragraphType: null },
      ],
    )
    assert.deepStrictEqual(
      [window.stats.analyzedFrom, window.stats.analyzedTo, window.stats.analyzedCount],
      [0, 3, 3],
    )
  }

  // Parity check in guaranteed scope: plain inline marker text (no markdown syntax intersections).
  {
    const runtime = createRuntimePlan({
      starComment: true,
      percentComment: true,
      ruby: true,
      figureReference: true,
    })
    const input = '前★星★後%%注%%後 漢字《かんじ》 （図A.1）'
    const ranges = scanInlineRanges(input, runtime)
    const md = mdit().use(mdRendererInlineText, {
      starComment: true,
      percentComment: true,
      ruby: true,
      figureReference: true,
    })
    const html = md.render(input)
    assert.ok(html.includes('<span class="star-comment">★星★</span>'))
    assert.ok(html.includes('<span class="percent-comment">%%注%%</span>'))
    assert.ok(html.includes('<ruby>漢字<rp>《</rp><rt>かんじ</rt><rp>》</rp></ruby>'))
    assert.ok(html.includes('（<span class="f-ref">図A.1</span>）'))
    assert.deepStrictEqual(
      ranges.map((r) => r.type),
      ['star', 'percent', 'ruby', 'figure-reference'],
    )
  }
}
