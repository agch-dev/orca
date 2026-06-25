import type { TerminalQuickCommand } from '../../../../shared/types'

/**
 * Returns a new commands array with the dragged command moved to dropIndex
 * within the visible set, mapped back to the full commands array.
 *
 * Returns null when the drop is a no-op (same position) or the dragged
 * command is not found.
 *
 * dropIndex is the insertion index within visibleCommands (0 = before first).
 */
export function commitQuickCommandReorder({
  commands,
  visibleCommands,
  draggedId,
  dropIndex
}: {
  commands: readonly TerminalQuickCommand[]
  visibleCommands: readonly TerminalQuickCommand[]
  draggedId: string
  dropIndex: number
}): TerminalQuickCommand[] | null {
  const sourceIndex = visibleCommands.findIndex((c) => c.id === draggedId)
  if (sourceIndex === -1) {
    return null
  }

  // No-op: the command would land in the same position
  if (dropIndex === sourceIndex || dropIndex === sourceIndex + 1) {
    return null
  }

  // Build reordered visible list
  const newVisible = visibleCommands.slice()
  newVisible.splice(sourceIndex, 1)
  // Adjust for the removed element shifting indices
  const adjustedDrop = dropIndex > sourceIndex ? dropIndex - 1 : dropIndex
  newVisible.splice(adjustedDrop, 0, visibleCommands[sourceIndex]!)

  // If all commands are visible (showAll or single-scope with no hidden items),
  // the reordered visible list is the full result.
  if (visibleCommands.length === commands.length) {
    return newVisible
  }

  // Filtered view: slot the new visible order back into the full commands array
  // at the same positions originally occupied by the visible commands.
  const visiblePositions: number[] = []
  for (let i = 0; i < commands.length; i++) {
    if (visibleCommands.some((v) => v.id === commands[i]!.id)) {
      visiblePositions.push(i)
    }
  }

  const result = commands.slice()
  for (let j = 0; j < visiblePositions.length; j++) {
    result[visiblePositions[j]!] = newVisible[j]!
  }
  return result
}
