import type { TerminalQuickCommand } from '../../../../shared/types'
import { getTerminalQuickCommandScope } from '../../../../shared/terminal-quick-commands'

const INDICATOR_GAP_PX = 4

export type QuickCommandDragRect = {
  commandId: string
  scopeKey: string
  index: number // index in the measured visible list
  top: number // pixels from top of scroll container content area (includes scrollTop)
  bottom: number
}

// Scope key format matches data-quick-command-scope-key attribute on rows.
// Global commands use '__global__'; repo-scoped use the repo ID.
export function getCommandScopeKey(command: TerminalQuickCommand): string {
  const scope = getTerminalQuickCommandScope(command)
  return scope.type === 'global' ? '__global__' : scope.repoId
}

export function measureQuickCommandRects(container: HTMLElement): QuickCommandDragRect[] {
  const containerRect = container.getBoundingClientRect()
  const rects: QuickCommandDragRect[] = []
  container.querySelectorAll<HTMLElement>('[data-quick-command-id]').forEach((el) => {
    const commandId = el.getAttribute('data-quick-command-id')
    const scopeKey = el.getAttribute('data-quick-command-scope-key')
    const rawIndex = el.getAttribute('data-quick-command-visible-index')
    // Why: use the explicit visibleIndex attribute rather than DOM enumeration
    // order. When commands are rendered in scope sections, DOM order differs
    // from visibleCommands order — the attribute keeps the mapping correct.
    const index = rawIndex !== null ? Number(rawIndex) : -1
    if (!commandId || !scopeKey || !Number.isFinite(index) || index < 0) {
      return
    }
    const rect = el.getBoundingClientRect()
    // top is relative to the container's scroll content area
    const top = rect.top - containerRect.top + container.scrollTop
    rects.push({ commandId, scopeKey, index, top, bottom: top + rect.height })
  })
  // Sort by visual top position so drop-preview iteration is in DOM order
  rects.sort((a, b) => a.top - b.top)
  return rects
}

export function computeQuickCommandDropPreview(
  pointerY: number,
  containerRect: DOMRect,
  scrollTop: number,
  rects: QuickCommandDragRect[],
  draggedScopeKey: string,
  showAll: boolean
): { dropIndex: number; dropIndicatorY: number } | null {
  if (rects.length === 0) {
    return null
  }
  const localY = pointerY - containerRect.top + scrollTop

  if (showAll) {
    // Scope-constrained: the indicator only appears at slots between same-scope
    // commands. This prevents placing a command between items of a different scope,
    // since cross-scope ordering doesn't affect the Quick Commands menu display.
    const sameScope = rects.filter((r) => r.scopeKey === draggedScopeKey)
    if (sameScope.length === 0) {
      return null
    }

    // Find which slot among same-scope items the pointer is closest to
    // (slot 0 = before first, slot n = after last)
    let slot = sameScope.length
    for (let i = 0; i < sameScope.length; i++) {
      const mid = (sameScope[i]!.top + sameScope[i]!.bottom) / 2
      if (localY < mid) {
        slot = i
        break
      }
    }

    let dropIndex: number
    let indicatorY: number
    if (slot === 0) {
      dropIndex = sameScope[0]!.index
      indicatorY = sameScope[0]!.top - INDICATOR_GAP_PX
    } else if (slot >= sameScope.length) {
      dropIndex = sameScope.at(-1)!.index + 1
      indicatorY = sameScope.at(-1)!.bottom + INDICATOR_GAP_PX
    } else {
      dropIndex = sameScope[slot]!.index
      // Center the indicator in the gap between the two same-scope items
      indicatorY = (sameScope[slot - 1]!.bottom + sameScope[slot]!.top) / 2
    }

    return { dropIndex, dropIndicatorY: Math.max(scrollTop, indicatorY) }
  }

  // Filtered (single-scope) view: free drop at any position
  let dropIndex = rects.length
  for (let i = 0; i < rects.length; i++) {
    const mid = (rects[i]!.top + rects[i]!.bottom) / 2
    if (localY < mid) {
      dropIndex = i
      break
    }
  }
  const indicatorY =
    dropIndex < rects.length
      ? rects[dropIndex]!.top - INDICATOR_GAP_PX
      : rects.at(-1)!.bottom + INDICATOR_GAP_PX

  return { dropIndex, dropIndicatorY: Math.max(scrollTop, indicatorY) }
}
