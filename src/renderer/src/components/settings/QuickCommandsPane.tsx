import { useCallback, useMemo, useRef, useState } from 'react'
import { Plus } from 'lucide-react'
import type { GlobalSettings, TerminalQuickCommand } from '../../../../shared/types'
import { getTerminalQuickCommandScope } from '../../../../shared/terminal-quick-commands'
import {
  createTerminalQuickCommandDraft,
  TerminalQuickCommandDialog
} from '@/components/terminal-quick-commands/TerminalQuickCommandDialog'
import { useAppStore } from '../../store'
import { Button } from '../ui/button'
import { Label } from '../ui/label'
import { useConfirmationDialog } from '@/components/confirmation-dialog'
import { getSettingOwnershipSummary } from './setting-ownership'
import { translate } from '@/i18n/i18n'
import { QuickCommandsList } from './QuickCommandsList'
import { GLOBAL_SCOPE_KEY, QuickCommandsScopeFilter } from './QuickCommandsScopeFilter'
import { useQuickCommandDrag } from './quick-command-drag'

type QuickCommandsPaneProps = {
  settings: GlobalSettings
  updateSettings: (updates: Partial<GlobalSettings>) => void
  addCommandIntentSignal?: number
}

type EditorState =
  | {
      mode: 'add'
      command: TerminalQuickCommand
    }
  | {
      mode: 'edit'
      command: TerminalQuickCommand
    }
  | null

export function shouldOpenQuickCommandAddIntent(
  addCommandIntentSignal: number | undefined,
  consumedAddIntentSignal: number
): boolean {
  return Boolean(addCommandIntentSignal && consumedAddIntentSignal !== addCommandIntentSignal)
}

export function QuickCommandsPane({
  settings,
  updateSettings,
  addCommandIntentSignal
}: QuickCommandsPaneProps): React.JSX.Element {
  const repos = useAppStore((s) => s.repos)
  const activeRepoId = useAppStore((s) => s.activeRepoId)
  const commands = settings.terminalQuickCommands ?? []
  const ownership = getSettingOwnershipSummary('terminalQuickCommands')
  const confirm = useConfirmationDialog()

  const [editor, setEditor] = useState<EditorState>(null)
  const consumedAddIntentSignalRef = useRef(0)
  // Why: `null` means "show all" (sticky-all), independent of the current repo
  // list — mirrors the tasks-page repo combobox so newly added repos appear
  // automatically rather than being silently excluded.
  const [scopeSelection, setScopeSelection] = useState<ReadonlySet<string> | null>(null)
  const [scopePopoverOpen, setScopePopoverOpen] = useState(false)

  const repoById = useMemo(() => new Map(repos.map((repo) => [repo.id, repo])), [repos])

  const allScopeKeys = useMemo(
    () => new Set<string>([GLOBAL_SCOPE_KEY, ...repos.map((r) => r.id)]),
    [repos]
  )
  const effectiveSelection: ReadonlySet<string> = scopeSelection ?? allScopeKeys
  const showAll = scopeSelection === null

  const visibleCommands = commands.filter((command) => {
    const scope = getTerminalQuickCommandScope(command)
    if (showAll) {
      return true
    }
    if (scope.type === 'global') {
      return effectiveSelection.has(GLOBAL_SCOPE_KEY)
    }
    return effectiveSelection.has(scope.repoId)
  })

  const scrollContainerRef = useRef<HTMLDivElement | null>(null)

  // hasMixedScopes: visibleCommands spans more than one scope — activates
  // scope-constrained drag and section headers in the list.
  // canReorder: in mixed-scope view, drag is scope-constrained, so handles only
  // appear when at least one scope has multiple commands to reorder.
  const { hasMixedScopes, canReorder } = useMemo(() => {
    const counts = new Map<string, number>()
    for (const c of visibleCommands) {
      const scope = getTerminalQuickCommandScope(c)
      const key = scope.type === 'global' ? '__global__' : scope.repoId
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
    const hasMixed = counts.size > 1
    const canR = hasMixed ? [...counts.values()].some((n) => n > 1) : visibleCommands.length > 1
    return { hasMixedScopes: hasMixed, canReorder: canR }
  }, [visibleCommands])

  const reorderCommand = useCallback(
    (reordered: TerminalQuickCommand[]): void => {
      // Why: re-read from the store at commit time so concurrent edits don't
      // reset commands that changed while dragging. Rebuild from latest store
      // objects by ID so field edits made during a drag are not overwritten.
      const latest = useAppStore.getState().settings?.terminalQuickCommands ?? []
      const latestById = new Map(latest.map((c) => [c.id, c]))
      const reorderedIds = new Set(reordered.map((c) => c.id))
      const reorderedFiltered = reordered
        .map((c) => latestById.get(c.id))
        .filter((c): c is TerminalQuickCommand => c !== undefined)
      if (reorderedFiltered.length === 0) {
        return
      }
      // Append any commands added during the drag that were not in the reordered set
      const addedDuringDrag = latest.filter((c) => !reorderedIds.has(c.id))
      updateSettings({ terminalQuickCommands: [...reorderedFiltered, ...addedDuringDrag] })
    },
    [updateSettings]
  )

  const { state: dragState, onHandlePointerDown } = useQuickCommandDrag({
    commands,
    visibleCommands,
    // showAll drives scope-constrained drag: apply constraints whenever
    // multiple scopes are visible (not just when the filter is cleared).
    showAll: hasMixedScopes,
    getScrollContainer: useCallback(() => scrollContainerRef.current, []),
    onReorder: reorderCommand
  })

  const createDraftForCurrentFilter = useCallback((): TerminalQuickCommand => {
    // Why: when the user has narrowed to a single repo scope, the natural
    // intent for "Add Command" is to create one in that repo. When the filter
    // is narrowed to Global-only, honor that. Otherwise prefer the active
    // workspace repo; fall back to global when there's no active repo.
    if (!showAll) {
      const selectedRepoIds = [...effectiveSelection].filter((key) => key !== GLOBAL_SCOPE_KEY)
      if (selectedRepoIds.length === 1 && !effectiveSelection.has(GLOBAL_SCOPE_KEY)) {
        return createTerminalQuickCommandDraft({ type: 'repo', repoId: selectedRepoIds[0] })
      }
      if (selectedRepoIds.length === 0 && effectiveSelection.has(GLOBAL_SCOPE_KEY)) {
        return createTerminalQuickCommandDraft({ type: 'global' })
      }
    }
    if (activeRepoId && repoById.has(activeRepoId)) {
      return createTerminalQuickCommandDraft({ type: 'repo', repoId: activeRepoId })
    }
    return createTerminalQuickCommandDraft({ type: 'global' })
  }, [activeRepoId, effectiveSelection, repoById, showAll])

  const intentSignal = addCommandIntentSignal
  if (
    typeof intentSignal === 'number' &&
    shouldOpenQuickCommandAddIntent(intentSignal, consumedAddIntentSignalRef.current)
  ) {
    // Why: Settings deep-links use this one-shot signal to open the add dialog;
    // consume it before paint so the pane never flashes without the editor.
    consumedAddIntentSignalRef.current = intentSignal
    setEditor({ mode: 'add', command: createDraftForCurrentFilter() })
  }

  const toggleScope = (key: string): void => {
    const current = new Set(effectiveSelection)
    if (current.has(key)) {
      // Why: forbid the empty selection — every command would disappear and
      // there'd be no signal that the filter caused it.
      if (current.size <= 1) {
        return
      }
      current.delete(key)
    } else {
      current.add(key)
    }
    setScopeSelection(current.size === allScopeKeys.size ? null : current)
  }

  const handleSelectAll = (): void => {
    if (showAll) {
      // Why: tasks-page parity — clicking "All" while everything is selected
      // collapses to a single scope rather than emitting an empty set.
      setScopeSelection(new Set([GLOBAL_SCOPE_KEY]))
      return
    }
    setScopeSelection(null)
  }

  const saveCommand = (next: TerminalQuickCommand): void => {
    // Why: re-read from the store so save lands on the latest list when
    // multiple edit dialogs fire in quick succession.
    const latest = useAppStore.getState().settings?.terminalQuickCommands ?? []
    const isEdit = latest.some((command) => command.id === next.id)
    const nextList = isEdit
      ? latest.map((command) => (command.id === next.id ? next : command))
      : [...latest, next]
    useAppStore.getState().recordFeatureInteraction('quick-commands')
    updateSettings({ terminalQuickCommands: nextList })
  }

  const removeCommand = async (command: TerminalQuickCommand): Promise<void> => {
    const confirmed = await confirm({
      title: translate(
        'auto.components.settings.QuickCommandsPane.3edf3deaf8',
        'Delete "{{value0}}"?',
        { value0: command.label || 'Untitled' }
      ),
      description: translate(
        'auto.components.settings.QuickCommandsPane.3d9dc558e8',
        'This quick command will be removed from your saved list.'
      ),
      confirmLabel: translate('auto.components.settings.QuickCommandsPane.ec1ed99e70', 'Delete'),
      confirmVariant: 'destructive'
    })
    if (!confirmed) {
      return
    }
    // Why: re-read latest list from the store at delete time — the await above
    // can span other settings changes, and a stale closure would resurrect
    // commands that were removed concurrently.
    const latest = useAppStore.getState().settings?.terminalQuickCommands ?? []
    updateSettings({
      terminalQuickCommands: latest.filter((c) => c.id !== command.id)
    })
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 py-2">
        <div className="space-y-1">
          <Label>
            {translate('auto.components.settings.QuickCommandsPane.f91b649324', 'Saved Commands')}
          </Label>
          <p className="text-xs text-muted-foreground">{ownership.description}</p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setEditor({ mode: 'add', command: createDraftForCurrentFilter() })}
        >
          <Plus />
          {translate('auto.components.settings.QuickCommandsPane.5aacc8f7dc', 'Add Command')}
        </Button>
      </div>

      <QuickCommandsScopeFilter
        repos={repos}
        effectiveSelection={effectiveSelection}
        showAll={showAll}
        scopePopoverOpen={scopePopoverOpen}
        setScopePopoverOpen={setScopePopoverOpen}
        handleSelectAll={handleSelectAll}
        toggleScope={toggleScope}
      />

      <QuickCommandsList
        commands={commands}
        visibleCommands={visibleCommands}
        repoById={repoById}
        dragState={dragState}
        scrollContainerRef={scrollContainerRef}
        onEdit={(command) => setEditor({ mode: 'edit', command })}
        onRemove={(command) => void removeCommand(command)}
        onHandlePointerDown={canReorder ? onHandlePointerDown : undefined}
      />

      {editor !== null ? (
        <TerminalQuickCommandDialog
          open
          mode={editor.mode}
          command={editor.command}
          repos={repos}
          onOpenChange={(open) => !open && setEditor(null)}
          onSave={saveCommand}
        />
      ) : null}
    </div>
  )
}
