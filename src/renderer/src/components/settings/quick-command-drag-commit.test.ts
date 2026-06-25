import { describe, expect, it } from 'vitest'
import type { TerminalCommandQuickCommand } from '../../../../shared/types'
import { commitQuickCommandReorder } from './quick-command-drag-commit'

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

describe('commitQuickCommandReorder', () => {
  describe('no-op cases (returns null)', () => {
    it('returns null when dropped at the source position', () => {
      const commands = [makeCommand('a'), makeCommand('b'), makeCommand('c')]
      expect(
        commitQuickCommandReorder({
          commands,
          visibleCommands: commands,
          draggedId: 'b',
          dropIndex: 1
        })
      ).toBeNull()
    })

    it('returns null when dropped immediately after the source (same visual position)', () => {
      const commands = [makeCommand('a'), makeCommand('b'), makeCommand('c')]
      expect(
        commitQuickCommandReorder({
          commands,
          visibleCommands: commands,
          draggedId: 'b',
          dropIndex: 2
        })
      ).toBeNull()
    })

    it('returns null when the dragged id is not found', () => {
      const commands = [makeCommand('a'), makeCommand('b')]
      expect(
        commitQuickCommandReorder({
          commands,
          visibleCommands: commands,
          draggedId: 'missing',
          dropIndex: 0
        })
      ).toBeNull()
    })
  })

  describe('all-commands view (visibleCommands === commands)', () => {
    it('moves an item to the beginning', () => {
      const commands = [makeCommand('a'), makeCommand('b'), makeCommand('c')]
      const result = commitQuickCommandReorder({
        commands,
        visibleCommands: commands,
        draggedId: 'c',
        dropIndex: 0
      })
      expect(result?.map((c) => c.id)).toEqual(['c', 'a', 'b'])
    })

    it('moves an item to the end', () => {
      const commands = [makeCommand('a'), makeCommand('b'), makeCommand('c')]
      const result = commitQuickCommandReorder({
        commands,
        visibleCommands: commands,
        draggedId: 'a',
        dropIndex: 3
      })
      expect(result?.map((c) => c.id)).toEqual(['b', 'c', 'a'])
    })

    it('moves an item forward in the list', () => {
      const commands = [makeCommand('a'), makeCommand('b'), makeCommand('c'), makeCommand('d')]
      const result = commitQuickCommandReorder({
        commands,
        visibleCommands: commands,
        draggedId: 'a',
        dropIndex: 3
      })
      expect(result?.map((c) => c.id)).toEqual(['b', 'c', 'a', 'd'])
    })

    it('moves an item backward in the list', () => {
      const commands = [makeCommand('a'), makeCommand('b'), makeCommand('c'), makeCommand('d')]
      const result = commitQuickCommandReorder({
        commands,
        visibleCommands: commands,
        draggedId: 'd',
        dropIndex: 1
      })
      expect(result?.map((c) => c.id)).toEqual(['a', 'd', 'b', 'c'])
    })
  })

  describe('filtered view (visibleCommands is a subset of commands)', () => {
    it('reorders within the visible subset while preserving hidden commands at their positions', () => {
      // commands: [globalA, repo1B, repo1C, globalD]
      // visible (repo1 only): [repo1B, repo1C]
      const globalA = makeCommand('globalA', 'global')
      const repo1B = makeCommand('repo1B', 'repo1')
      const repo1C = makeCommand('repo1C', 'repo1')
      const globalD = makeCommand('globalD', 'global')
      const commands = [globalA, repo1B, repo1C, globalD]
      const visibleCommands = [repo1B, repo1C]

      // Move repo1C before repo1B (dropIndex 0)
      const result = commitQuickCommandReorder({
        commands,
        visibleCommands,
        draggedId: 'repo1C',
        dropIndex: 0
      })
      // Result should preserve globalA and globalD at their positions (0 and 3),
      // and swap repo1B and repo1C at positions 1 and 2.
      expect(result?.map((c) => c.id)).toEqual(['globalA', 'repo1C', 'repo1B', 'globalD'])
    })

    it('reorders within global filter without affecting repo commands', () => {
      const repo1A = makeCommand('repo1A', 'repo1')
      const globalB = makeCommand('globalB', 'global')
      const repo1C = makeCommand('repo1C', 'repo1')
      const globalD = makeCommand('globalD', 'global')
      const commands = [repo1A, globalB, repo1C, globalD]
      const visibleCommands = [globalB, globalD]

      // Move globalD before globalB (dropIndex 0)
      const result = commitQuickCommandReorder({
        commands,
        visibleCommands,
        draggedId: 'globalD',
        dropIndex: 0
      })
      expect(result?.map((c) => c.id)).toEqual(['repo1A', 'globalD', 'repo1C', 'globalB'])
    })

    it('is a no-op when moving to the same position in the filtered view', () => {
      const globalA = makeCommand('globalA', 'global')
      const repo1B = makeCommand('repo1B', 'repo1')
      const repo1C = makeCommand('repo1C', 'repo1')
      const commands = [globalA, repo1B, repo1C]
      const visibleCommands = [repo1B, repo1C]

      expect(
        commitQuickCommandReorder({
          commands,
          visibleCommands,
          draggedId: 'repo1B',
          dropIndex: 0
        })
      ).toBeNull()
    })
  })
})
