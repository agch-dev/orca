import { describe, expect, it } from 'vitest'
import type { QuickCommandDragRect } from './quick-command-drag-geometry'
import { computeQuickCommandDropPreview, getCommandScopeKey } from './quick-command-drag-geometry'
import type { TerminalCommandQuickCommand } from '../../../../shared/types'

const INDICATOR_GAP_PX = 4

function makeRect(
  commandId: string,
  scopeKey: string,
  index: number,
  top: number,
  height = 40
): QuickCommandDragRect {
  return { commandId, scopeKey, index, top, bottom: top + height }
}

// computeQuickCommandDropPreview only reads containerRect.top
function containerRect(top = 0): DOMRect {
  return { top } as DOMRect
}

function makeCommand(id: string, scope: 'global' | string = 'global'): TerminalCommandQuickCommand {
  return {
    id,
    label: id,
    scope: scope === 'global' ? { type: 'global' } : { type: 'repo', repoId: scope },
    action: 'terminal-command',
    command: `echo ${id}`,
    appendEnter: true
  }
}

describe('getCommandScopeKey', () => {
  it('returns __global__ for global commands', () => {
    expect(getCommandScopeKey(makeCommand('a', 'global'))).toBe('__global__')
  })

  it('returns the repoId for repo-scoped commands', () => {
    expect(getCommandScopeKey(makeCommand('a', 'repo-xyz'))).toBe('repo-xyz')
  })
})

describe('computeQuickCommandDropPreview', () => {
  describe('empty rects', () => {
    it('returns null when rects is empty', () => {
      expect(
        computeQuickCommandDropPreview(50, containerRect(), 0, [], '__global__', false)
      ).toBeNull()
    })
  })

  describe('free-drop mode (showAll=false)', () => {
    // One rect: top=10, bottom=50, mid=30
    const rect = makeRect('a', '__global__', 0, 10, 40)

    it('places drop before the first item when pointer is above midpoint', () => {
      // localY = 25 - 0 + 0 = 25 < 30
      const result = computeQuickCommandDropPreview(
        25,
        containerRect(0),
        0,
        [rect],
        '__global__',
        false
      )
      expect(result).toEqual({ dropIndex: 0, dropIndicatorY: 10 - INDICATOR_GAP_PX })
    })

    it('places drop after the last item when pointer is below midpoint', () => {
      // localY = 35 - 0 + 0 = 35 >= 30
      const result = computeQuickCommandDropPreview(
        35,
        containerRect(0),
        0,
        [rect],
        '__global__',
        false
      )
      expect(result).toEqual({ dropIndex: 1, dropIndicatorY: 50 + INDICATOR_GAP_PX })
    })

    it('places drop between two items based on midpoint of the lower item', () => {
      // rectA: top=10, bottom=50, mid=30
      // rectB: top=60, bottom=100, mid=80
      const rectA = makeRect('a', '__global__', 0, 10, 40)
      const rectB = makeRect('b', '__global__', 1, 60, 40)
      // localY = 45: 45 >= 30 (not before A), 45 < 80 (before B) → dropIndex=1
      const result = computeQuickCommandDropPreview(
        45,
        containerRect(0),
        0,
        [rectA, rectB],
        '__global__',
        false
      )
      expect(result).toEqual({ dropIndex: 1, dropIndicatorY: 60 - INDICATOR_GAP_PX })
    })

    it('places drop after all items when pointer is past the last midpoint', () => {
      const rectA = makeRect('a', '__global__', 0, 10, 40)
      const rectB = makeRect('b', '__global__', 1, 60, 40)
      // localY = 90 >= 80
      const result = computeQuickCommandDropPreview(
        90,
        containerRect(0),
        0,
        [rectA, rectB],
        '__global__',
        false
      )
      expect(result).toEqual({ dropIndex: 2, dropIndicatorY: 100 + INDICATOR_GAP_PX })
    })

    it('accounts for containerRect.top offset when computing localY', () => {
      // containerRect.top = 100: localY = 130 - 100 + 0 = 30, exactly at mid → not < 30 → after
      const result = computeQuickCommandDropPreview(
        130,
        containerRect(100),
        0,
        [rect],
        '__global__',
        false
      )
      expect(result).toEqual({ dropIndex: 1, dropIndicatorY: 50 + INDICATOR_GAP_PX })
    })

    it('accounts for scrollTop offset when computing localY', () => {
      // Rect at scrolled position: top=110, bottom=150, mid=130 (includes scrollTop=100)
      const scrolledRect = makeRect('a', '__global__', 0, 110, 40)
      // pointerY=15, scrollTop=100, containerRect.top=0 → localY = 15 + 100 = 115 < 130 → before
      const result = computeQuickCommandDropPreview(
        15,
        containerRect(0),
        100,
        [scrolledRect],
        '__global__',
        false
      )
      expect(result).toEqual({ dropIndex: 0, dropIndicatorY: 110 - INDICATOR_GAP_PX })
    })

    it('clamps dropIndicatorY to scrollTop when the indicator would appear above the scroll viewport', () => {
      // Rect right at scroll edge: top=100, bottom=140, mid=120
      // indicatorY = 100 - 4 = 96 < scrollTop=100 → clamped to 100
      const scrolledRect = makeRect('a', '__global__', 0, 100, 40)
      const result = computeQuickCommandDropPreview(
        15,
        containerRect(0),
        100,
        [scrolledRect],
        '__global__',
        false
      )
      expect(result?.dropIndicatorY).toBe(100)
    })
  })

  describe('scope-constrained mode (showAll=true)', () => {
    // Mixed layout: global at 0, two repo1 items at 1 and 2
    // rects (already in scroll-relative coordinates):
    //   global: top=10, bottom=50, index=0
    //   repo1 first: top=60, bottom=100, index=1, mid=80
    //   repo1 second: top=110, bottom=150, index=2, mid=130
    const globalRect = makeRect('g', '__global__', 0, 10, 40)
    const repo1A = makeRect('r1a', 'repo1', 1, 60, 40)
    const repo1B = makeRect('r1b', 'repo1', 2, 110, 40)
    const rects = [globalRect, repo1A, repo1B]

    it('returns null when no rects match the dragged scope', () => {
      const result = computeQuickCommandDropPreview(80, containerRect(0), 0, rects, 'repo2', true)
      expect(result).toBeNull()
    })

    it('places drop before the first same-scope item when pointer is above its midpoint', () => {
      // localY = 40 < mid(repo1A)=80 → slot=0 → dropIndex=repo1A.index=1
      const result = computeQuickCommandDropPreview(40, containerRect(0), 0, rects, 'repo1', true)
      expect(result).toEqual({ dropIndex: 1, dropIndicatorY: 60 - INDICATOR_GAP_PX })
    })

    it('places drop between same-scope items when pointer is between their midpoints', () => {
      // localY = 90: 90 >= 80, 90 < 130 → slot=1 → dropIndex=repo1B.index=2
      // indicatorY = (repo1A.bottom + repo1B.top) / 2 = (100 + 110) / 2 = 105
      const result = computeQuickCommandDropPreview(90, containerRect(0), 0, rects, 'repo1', true)
      expect(result).toEqual({ dropIndex: 2, dropIndicatorY: 105 })
    })

    it('places drop after the last same-scope item when pointer is past its midpoint', () => {
      // localY = 140 >= 130 → slot=2=sameScope.length → dropIndex=repo1B.index+1=3
      const result = computeQuickCommandDropPreview(140, containerRect(0), 0, rects, 'repo1', true)
      expect(result).toEqual({ dropIndex: 3, dropIndicatorY: 150 + INDICATOR_GAP_PX })
    })

    it('ignores rects from other scopes when computing drop slot', () => {
      // Drag a global item; sameScope = [globalRect] only
      // localY = 30 < mid(globalRect)=30 → not < 30 → slot=1=sameScope.length → after global
      const result = computeQuickCommandDropPreview(
        30,
        containerRect(0),
        0,
        rects,
        '__global__',
        true
      )
      expect(result).toEqual({ dropIndex: 1, dropIndicatorY: 50 + INDICATOR_GAP_PX })
    })

    it('clamps dropIndicatorY to scrollTop in scope-constrained mode', () => {
      // Rect at scroll edge: top=100, bottom=140, index=0
      const edgeRect = makeRect('r', 'repo1', 0, 100, 40)
      // localY = 10 + 100 = 110 < (100+140)/2=120 → slot=0 → indicatorY = 100 - 4 = 96 → clamped
      const result = computeQuickCommandDropPreview(
        10,
        containerRect(0),
        100,
        [edgeRect],
        'repo1',
        true
      )
      expect(result?.dropIndicatorY).toBe(100)
    })
  })
})
