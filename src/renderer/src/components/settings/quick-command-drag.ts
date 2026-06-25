import { useCallback, useEffect, useRef, useState } from 'react'
import type { TerminalQuickCommand } from '../../../../shared/types'
import { commitQuickCommandReorder } from './quick-command-drag-commit'
import {
  type QuickCommandDragRect,
  getCommandScopeKey,
  measureQuickCommandRects,
  computeQuickCommandDropPreview
} from './quick-command-drag-geometry'

// Why pointer events instead of HTML5 DnD: HTML5 drag ghost images are broken
// in Electron and drag events behave inconsistently over SSH. Pointer events
// give us full control over the drag visual and drop target computation.

const QUICK_COMMAND_DRAG_THRESHOLD_PX = 4

export type QuickCommandDragState = {
  draggingId: string | null
  dropIndex: number | null
  dropIndicatorY: number | null
}

type QuickCommandDragSession = {
  pointerId: number
  handleEl: HTMLElement
  startX: number
  startY: number
  latestPointerY: number
  promoted: boolean
  commandId: string
  scopeKey: string
  rects: QuickCommandDragRect[]
}

export type QuickCommandDragController = {
  state: QuickCommandDragState
  onHandlePointerDown: (event: React.PointerEvent<HTMLElement>, commandId: string) => void
}

const INITIAL_DRAG_STATE: QuickCommandDragState = {
  draggingId: null,
  dropIndex: null,
  dropIndicatorY: null
}

export function useQuickCommandDrag({
  commands,
  visibleCommands,
  showAll,
  getScrollContainer,
  onReorder
}: {
  commands: TerminalQuickCommand[]
  visibleCommands: TerminalQuickCommand[]
  showAll: boolean
  getScrollContainer: () => HTMLElement | null
  onReorder: (reordered: TerminalQuickCommand[]) => void
}): QuickCommandDragController {
  const [state, setState] = useState<QuickCommandDragState>(INITIAL_DRAG_STATE)
  const [sessionArmed, setSessionArmed] = useState(false)

  const dragSessionRef = useRef<QuickCommandDragSession | null>(null)
  const clickSwallowTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Stored so the effect cleanup can removeEventListener if the timeout is cleared early
  const swallowClickRef = useRef<((e: MouseEvent) => void) | null>(null)
  // Keep latest dropIndex in a ref so endDrag can read it without stale closure.
  // Updated synchronously in onPointerMove (not via state) to avoid reading a
  // stale render-cycle value when pointerup fires right after a setState.
  const latestDropIndexRef = useRef<number | null>(null)
  latestDropIndexRef.current = state.dropIndex

  // Stable refs so event listeners don't need to be recreated when these change
  const commandsRef = useRef(commands)
  commandsRef.current = commands
  const visibleCommandsRef = useRef(visibleCommands)
  visibleCommandsRef.current = visibleCommands
  const showAllRef = useRef(showAll)
  showAllRef.current = showAll
  const onReorderRef = useRef(onReorder)
  onReorderRef.current = onReorder
  const getScrollContainerRef = useRef(getScrollContainer)
  getScrollContainerRef.current = getScrollContainer

  const computeDrop = useCallback(
    (pointerY: number): { dropIndex: number; dropIndicatorY: number } | null => {
      const session = dragSessionRef.current
      const container = getScrollContainerRef.current()
      if (!session || !container) {
        return null
      }
      const containerRect = container.getBoundingClientRect()
      return computeQuickCommandDropPreview(
        pointerY,
        containerRect,
        container.scrollTop,
        session.rects,
        session.scopeKey,
        showAllRef.current
      )
    },
    []
  )

  const endDrag = useCallback((commit: boolean) => {
    const session = dragSessionRef.current
    if (!session) {
      setState(INITIAL_DRAG_STATE)
      setSessionArmed(false)
      return
    }
    try {
      session.handleEl.releasePointerCapture(session.pointerId)
    } catch {
      // Capture may already be released (pointercancel, element unmounted)
    }
    if (session.promoted) {
      // Swallow the click that fires after pointerup on the handle to prevent
      // accidentally opening the edit dialog when the user finishes dragging.
      const handleEl = session.handleEl
      const swallow = (e: MouseEvent): void => {
        swallowClickRef.current = null
        const target = e.target as Node | null
        if (target && handleEl.contains(target)) {
          e.stopPropagation()
          e.preventDefault()
        }
        window.removeEventListener('click', swallow, true)
      }
      swallowClickRef.current = swallow
      window.addEventListener('click', swallow, true)
      clickSwallowTimeoutRef.current = setTimeout(() => {
        window.removeEventListener('click', swallow, true)
        swallowClickRef.current = null
        clickSwallowTimeoutRef.current = null
      }, 0)
    }
    const dropIndex =
      commit && session.promoted && latestDropIndexRef.current !== null
        ? latestDropIndexRef.current
        : null
    dragSessionRef.current = null
    setState(INITIAL_DRAG_STATE)
    setSessionArmed(false)
    if (dropIndex === null) {
      return
    }

    const reordered = commitQuickCommandReorder({
      commands: commandsRef.current,
      visibleCommands: visibleCommandsRef.current,
      draggedId: session.commandId,
      dropIndex
    })
    if (reordered !== null) {
      onReorderRef.current(reordered)
    }
  }, [])

  useEffect(() => {
    if (!sessionArmed) {
      return
    }

    const onPointerMove = (e: PointerEvent): void => {
      const session = dragSessionRef.current
      if (!session || e.pointerId !== session.pointerId) {
        return
      }
      session.latestPointerY = e.clientY

      if (!session.promoted) {
        const dx = e.clientX - session.startX
        const dy = e.clientY - session.startY
        if (dx * dx + dy * dy < QUICK_COMMAND_DRAG_THRESHOLD_PX * QUICK_COMMAND_DRAG_THRESHOLD_PX) {
          return
        }
        session.promoted = true
        // Why: setPointerCapture may throw if the handle element was unmounted
        // between pointerdown and the first move. Check isConnected first.
        if (session.handleEl.isConnected) {
          try {
            session.handleEl.setPointerCapture(session.pointerId)
          } catch {
            // Ignore; global listeners still handle the drag.
          }
        }
        latestDropIndexRef.current = null
        setState({ draggingId: session.commandId, dropIndex: null, dropIndicatorY: null })
      }

      const container = getScrollContainerRef.current()
      if (container) {
        session.rects = measureQuickCommandRects(container)
      }
      const drop = computeDrop(e.clientY)
      if (drop) {
        // Update synchronously so endDrag reads the latest index even if the
        // state update hasn't flushed to a render yet.
        latestDropIndexRef.current = drop.dropIndex
        setState((prev) =>
          prev.dropIndex === drop.dropIndex && prev.dropIndicatorY === drop.dropIndicatorY
            ? prev
            : { draggingId: session.commandId, ...drop }
        )
      } else {
        latestDropIndexRef.current = null
      }
    }

    const onPointerUp = (e: PointerEvent): void => {
      const session = dragSessionRef.current
      if (!session || e.pointerId !== session.pointerId) {
        return
      }
      endDrag(true)
    }

    const onPointerCancel = (e: PointerEvent): void => {
      const session = dragSessionRef.current
      if (!session || e.pointerId !== session.pointerId) {
        return
      }
      endDrag(false)
    }

    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        endDrag(false)
      }
    }

    const onBlur = (): void => endDrag(false)

    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    window.addEventListener('pointercancel', onPointerCancel)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('pointercancel', onPointerCancel)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('blur', onBlur)
      if (clickSwallowTimeoutRef.current !== null) {
        clearTimeout(clickSwallowTimeoutRef.current)
        clickSwallowTimeoutRef.current = null
      }
      // Remove the swallow listener if the timeout was cleared before it fired
      if (swallowClickRef.current !== null) {
        window.removeEventListener('click', swallowClickRef.current, true)
        swallowClickRef.current = null
      }
    }
  }, [computeDrop, endDrag, sessionArmed])

  // Apply grabbing cursor and disable text selection while dragging
  useEffect(() => {
    if (state.draggingId === null) {
      return
    }
    const body = document.body
    const prevCursor = body.style.cursor
    const prevUserSelect = body.style.userSelect
    body.style.cursor = 'grabbing'
    body.style.userSelect = 'none'
    return () => {
      body.style.cursor = prevCursor
      body.style.userSelect = prevUserSelect
    }
  }, [state.draggingId])

  const onHandlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLElement>, commandId: string) => {
      // Only handle primary button (left click / single touch)
      if (event.button !== 0 || !event.isPrimary) {
        return
      }
      const command = visibleCommandsRef.current.find((c) => c.id === commandId)
      if (!command) {
        return
      }
      const session: QuickCommandDragSession = {
        pointerId: event.pointerId,
        handleEl: event.currentTarget as HTMLElement,
        startX: event.clientX,
        startY: event.clientY,
        latestPointerY: event.clientY,
        promoted: false,
        commandId,
        scopeKey: getCommandScopeKey(command),
        rects: []
      }
      dragSessionRef.current = session
      setSessionArmed(true)
    },
    []
  )

  return { state, onHandlePointerDown }
}
