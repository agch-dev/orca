import { GripVertical, Pencil, Trash2 } from 'lucide-react'
import type {
  Repo,
  TerminalQuickCommand,
  TerminalQuickCommandScope
} from '../../../../shared/types'
import {
  getTerminalQuickCommandBody,
  getTerminalQuickCommandScope,
  isTerminalAgentQuickCommand
} from '../../../../shared/terminal-quick-commands'
import { AgentIcon, getAgentLabel } from '@/lib/agent-catalog'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { RepoBadgeMark } from '../repo/RepoBadgeLabel'
import { getQuickCommandRepoLabel } from './QuickCommandsScopeFilter'
import type { QuickCommandDragState } from './quick-command-drag'

function getScopeLabel(
  scope: TerminalQuickCommandScope,
  repoById: Map<string, Pick<Repo, 'displayName' | 'path' | 'badgeColor'>>
): string {
  if (scope.type === 'global') {
    return 'Global'
  }
  const repo = repoById.get(scope.repoId)
  return repo ? getQuickCommandRepoLabel(repo) : 'Missing project'
}

type ScopeSection = {
  scopeKey: string
  scope: TerminalQuickCommandScope
  items: { command: TerminalQuickCommand; visibleIndex: number }[]
}

function buildScopeSections(visibleCommands: TerminalQuickCommand[]): {
  sections: ScopeSection[]
  hasMixedScopes: boolean
} {
  const sectionMap = new Map<string, ScopeSection>()
  const sections: ScopeSection[] = []

  for (let i = 0; i < visibleCommands.length; i++) {
    const command = visibleCommands[i]!
    const scope = getTerminalQuickCommandScope(command)
    const key = scope.type === 'global' ? '__global__' : scope.repoId
    if (!sectionMap.has(key)) {
      const section: ScopeSection = { scopeKey: key, scope, items: [] }
      sections.push(section)
      sectionMap.set(key, section)
    }
    sectionMap.get(key)!.items.push({ command, visibleIndex: i })
  }

  // Global commands always lead — consistent with the scope filter dropdown order
  // and easier to reach when many project sections push it down.
  sections.sort((a, b) => {
    const aRank = a.scopeKey === '__global__' ? 0 : 1
    const bRank = b.scopeKey === '__global__' ? 0 : 1
    return aRank - bRank
  })

  return { sections, hasMixedScopes: sections.length > 1 }
}

function QuickCommandRow({
  command,
  visibleIndex,
  repoById,
  isDragging,
  onEdit,
  onRemove,
  onHandlePointerDown
}: {
  command: TerminalQuickCommand
  // Index of this command in the visibleCommands array. Used by the drag hook
  // to map DOM positions back to the correct visibleCommands indices when
  // sections reorder commands in the DOM relative to their stored order.
  visibleIndex: number
  repoById: Map<string, Pick<Repo, 'displayName' | 'path' | 'badgeColor'>>
  isDragging: boolean
  onEdit: (command: TerminalQuickCommand) => void
  onRemove: (command: TerminalQuickCommand) => void
  onHandlePointerDown?: (event: React.PointerEvent<HTMLElement>, commandId: string) => void
}): React.JSX.Element {
  const scope = getTerminalQuickCommandScope(command)
  // Scope key format must match getCommandScopeKey in quick-command-drag.ts
  const scopeKey = scope.type === 'global' ? '__global__' : scope.repoId
  return (
    <div
      className={cn(
        'group flex items-center gap-2 rounded-md border border-border/60 bg-background px-3 py-2 shadow-xs',
        isDragging && 'opacity-50'
      )}
      data-quick-command-id={command.id}
      data-quick-command-scope-key={scopeKey}
      data-quick-command-visible-index={visibleIndex}
    >
      {onHandlePointerDown != null ? (
        <div
          role="button"
          aria-label={translate(
            'auto.components.settings.QuickCommandsList.dragHandle',
            'Drag to reorder'
          )}
          tabIndex={0}
          className="shrink-0 cursor-grab touch-none text-muted-foreground/40 opacity-0 transition-opacity group-hover:opacity-100"
          onPointerDown={(e) => onHandlePointerDown(e, command.id)}
        >
          <GripVertical size={16} />
        </div>
      ) : null}
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <div className="truncate text-sm font-medium">
            {command.label ||
              translate('auto.components.settings.QuickCommandsPane.2bb9e38e93', 'Untitled')}
          </div>
          <Badge variant="outline" className="max-w-44 gap-1.5">
            {scope.type === 'repo' ? (
              <>
                <RepoBadgeMark color={repoById.get(scope.repoId)?.badgeColor} />
                <span className="truncate">{getScopeLabel(scope, repoById)}</span>
              </>
            ) : (
              <span className="truncate">{getScopeLabel(scope, repoById)}</span>
            )}
          </Badge>
        </div>
        <div className="flex min-w-0 items-center gap-1.5 text-xs text-foreground/80">
          {isTerminalAgentQuickCommand(command) ? (
            <span className="shrink-0 text-muted-foreground">
              <AgentIcon agent={command.agent} size={12} />
            </span>
          ) : null}
          <span className={cn('truncate', isTerminalAgentQuickCommand(command) ? '' : 'font-mono')}>
            {isTerminalAgentQuickCommand(command)
              ? `${getAgentLabel(command.agent)}: ${getTerminalQuickCommandBody(command)}`
              : getTerminalQuickCommandBody(command) ||
                translate(
                  'auto.components.settings.QuickCommandsPane.0252ddd578',
                  'No command text'
                )}
          </span>
        </div>
      </div>
      <div className="shrink-0 text-[11px] font-medium text-foreground/75">
        {isTerminalAgentQuickCommand(command)
          ? translate('auto.components.settings.QuickCommandsPane.4ccc63da87', 'Agent')
          : command.appendEnter
            ? translate('auto.components.settings.QuickCommandsPane.9b3e338d62', 'Enter')
            : translate('auto.components.settings.QuickCommandsPane.9fcfc29519', 'Insert')}
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={translate(
          'auto.components.settings.QuickCommandsPane.7d90fd5299',
          'Edit {{value0}}',
          {
            value0: command.label || 'quick command'
          }
        )}
        onClick={() => onEdit(command)}
      >
        <Pencil />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={translate(
          'auto.components.settings.QuickCommandsPane.8764c6e9e4',
          'Remove {{value0}}',
          {
            value0: command.label || 'quick command'
          }
        )}
        onClick={() => onRemove(command)}
        className="text-muted-foreground hover:text-destructive"
      >
        <Trash2 />
      </Button>
    </div>
  )
}

function ScopeHeader({
  section,
  repoById,
  isFirst
}: {
  section: ScopeSection
  repoById: Map<string, Pick<Repo, 'displayName' | 'path' | 'badgeColor'>>
  isFirst: boolean
}): React.JSX.Element {
  const label = getScopeLabel(section.scope, repoById)
  const badgeColor =
    section.scope.type === 'repo' ? repoById.get(section.scope.repoId)?.badgeColor : undefined
  return (
    <div
      className={cn(
        'flex items-center gap-1.5 px-1 pb-1 text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-foreground',
        isFirst ? 'pt-1' : 'pt-5'
      )}
    >
      {badgeColor != null ? <RepoBadgeMark color={badgeColor} /> : null}
      {label}
    </div>
  )
}

export function QuickCommandsList({
  commands,
  visibleCommands,
  repoById,
  dragState,
  scrollContainerRef,
  onEdit,
  onRemove,
  onHandlePointerDown
}: {
  commands: TerminalQuickCommand[]
  visibleCommands: TerminalQuickCommand[]
  repoById: Map<string, Pick<Repo, 'displayName' | 'path' | 'badgeColor'>>
  dragState: QuickCommandDragState
  scrollContainerRef: React.RefObject<HTMLDivElement | null>
  onEdit: (command: TerminalQuickCommand) => void
  onRemove: (command: TerminalQuickCommand) => void
  onHandlePointerDown?: (event: React.PointerEvent<HTMLElement>, commandId: string) => void
}): React.JSX.Element {
  const { sections, hasMixedScopes } = buildScopeSections(visibleCommands)

  return (
    <div className="overflow-hidden rounded-lg border border-border/50 bg-muted/20">
      {visibleCommands.length === 0 ? (
        <div className="px-3 py-6 text-sm text-muted-foreground">
          {commands.length === 0
            ? translate(
                'auto.components.settings.QuickCommandsPane.38d61927e6',
                'No quick commands saved.'
              )
            : translate(
                'auto.components.settings.QuickCommandsPane.3eb9897ab0',
                'No commands in the selected scopes.'
              )}
        </div>
      ) : (
        <div
          ref={scrollContainerRef}
          className="relative max-h-[60vh] overflow-y-auto p-2 scrollbar-sleek"
        >
          {hasMixedScopes ? (
            // Grouped view: section headers with commands per scope.
            // Commands within a section keep their visibleCommands order; sections
            // are ordered by first appearance in the stored array.
            sections.map((section, idx) => (
              <div key={section.scopeKey} className="space-y-2">
                <ScopeHeader section={section} repoById={repoById} isFirst={idx === 0} />
                {section.items.map(({ command, visibleIndex }) => (
                  <QuickCommandRow
                    key={command.id}
                    command={command}
                    visibleIndex={visibleIndex}
                    repoById={repoById}
                    isDragging={dragState.draggingId === command.id}
                    onEdit={onEdit}
                    onRemove={onRemove}
                    onHandlePointerDown={onHandlePointerDown}
                  />
                ))}
              </div>
            ))
          ) : (
            // Single-scope view: flat list with no section headers
            <div className="space-y-2">
              {visibleCommands.map((command, visibleIndex) => (
                <QuickCommandRow
                  key={command.id}
                  command={command}
                  visibleIndex={visibleIndex}
                  repoById={repoById}
                  isDragging={dragState.draggingId === command.id}
                  onEdit={onEdit}
                  onRemove={onRemove}
                  onHandlePointerDown={onHandlePointerDown}
                />
              ))}
            </div>
          )}
          {dragState.dropIndicatorY !== null ? (
            <div
              aria-hidden
              className="pointer-events-none absolute left-2 right-2 border-t border-dashed border-muted-foreground/70"
              style={{ top: dragState.dropIndicatorY }}
            />
          ) : null}
        </div>
      )}
    </div>
  )
}
