// What a frontend is given. The pane has one body of logic (core.ts) and a
// frontend for each kind of surface (terminal.tsx, desktop.tsx); the logic
// reads the state into a View, the frontend draws it, and the frontend's
// controls call back into Act. A frontend never reads state or calls the
// engine: what it shows is the View, and what it does is Act.
import type { ModelEffort, RenderElement } from 'claude-code'

import type { LogKind, LogLine, Menu, SessionsState, TargetChoice } from '../types'

export type Phase = 'idle' | 'review' | 'busy'

/** What each row of the record is called, and the theme color of its mark. */
export const LOG: Record<LogKind, { label: string; color: string }> = {
  polish: { label: 'Polished', color: 'suggestion' },
  refresh: { label: 'Retried', color: 'suggestion' },
  apply: { label: 'Applied', color: 'success' },
  keep: { label: 'Kept', color: 'inactive' },
  fail: { label: 'Failed', color: 'error' },
}

/** The earlier sessions as the pane draws them: the list, the time it is told against, and the sessions handed over to this one. */
export type SessionsView = Omit<SessionsState, 'done'> & {
  /** The sessions handed over to the one now open, each with the title it was listed by. */
  done: { id: string; title: string }[]
  now: number
}

/** The pane as the state stands: plain data, drawn the same way each time. */
export type View = {
  phase: Phase
  /** AUTO: Enter polishes first and asks you before sending. */
  isOn: boolean
  /** TRAIL: the person's own switch for keeping the session trail. */
  isTrailing: boolean
  /** The earlier sessions of this project, to pick one up from. */
  sessions: SessionsView
  isRunning: boolean
  /** Whether a prompt is held in auto mode and a question about its polish waits for an answer. */
  isAnswering: boolean
  /** Whether the prompt is for a GPT model, which the pane wears the green of. */
  isGpt: boolean
  /** The guide in use, and the line that says what it is. */
  guide: string
  about: string
  isGuideShown: boolean
  /** The model the prompt is for: the pick, its words, and every choice. */
  choice: TargetChoice
  targetLabel: string
  targets: readonly { value: string; label: string }[]
  /** Who polishes: the models offered, the one picked, and how hard. */
  models: readonly string[]
  model: string
  effort: ModelEffort
  /** The pick list that is open. */
  menu: Menu | null
  /** The draft on preview, the polish of it on show, and which of how many. */
  draft: string | null
  preview: string | null
  version: number
  versions: number
  /** The record, oldest first. */
  lines: readonly LogLine[]
  isLogShown: boolean
  isKeysShown: boolean
  /** The desktop folds its settings into a line, and the original into a toggle. */
  isSetupShown: boolean
  isOriginalShown: boolean
  /** What Enter does under AUTO, for the few seconds after a switch; else null. */
  hint: string | null
  /** When the polish now running began, and the time as it was read. */
  since: number
  now: number
  /** Whether a surface that can draw a catcher over a control is to go without. */
  isPlain: boolean
}

/** What each control of the pane does. */
export type Act = {
  guide: () => void
  auto: () => void
  trail: () => void
  /** Opens or folds the list of earlier sessions. */
  sessions: () => void
  /** Opens the pane beside the conversation with the list of earlier sessions open. */
  sessionsPanel: () => void
  /** The list over the last day, or up to a week. */
  sessionsRange: (range: 'day' | 'week') => void
  /** Opens a session of the list for a closer look, or folds it. */
  sessionPick: (id: string) => void
  /** What a hand-over gives: notes made of the session, or its handoff document. */
  sessionKind: (kind: 'notes' | 'handoff') => void
  /** Hands the opened session over to this one. */
  sessionTake: () => void
  menu: (which: Menu) => void
  done: () => void
  target: (value: string) => void
  model: (value: string) => void
  effort: (value: string) => void
  polish: () => void
  apply: () => void
  retry: () => void
  keep: () => void
  undo: () => void
  stop: () => void
  step: (by: -1 | 1) => void
  log: () => void
  keys: () => void
  setup: () => void
  original: () => void
  /** Opens the pane beside the conversation, to read a polish in full. */
  panel: () => void
  /** The same, with the record open. */
  history: () => void
  /** Opens the desktop's band, or minimizes it to the chip in the prompt's footer. */
  band: (isOpen: boolean) => void
}

/** The room the surface gives the pane. */
export type Layout = {
  columns: number
  isDocked: boolean
  bodyRows: number
  isFullscreen: boolean
}

/**
 * The surface modules the pane may draw, each there only where the surface
 * runs one. A `module` is written in the hooks module (register.tsx), which is
 * where the engine reads the paths of the modules from, so a frontend is
 * handed the elements and draws them where it wants them.
 */
export type Marks = {
  /** The state's mark: moves with the phase. */
  pulse?: (phase: Phase, color: string) => RenderElement
  /** The loading mark and the time a polish has run. */
  spinner?: (since: number, now: number, color: string) => RenderElement
  /** The loading line, `width` cells long. */
  bar?: (width: number, color: string, dim: string) => RenderElement
  /** A catcher over the control keyed `key`, `rows` rows of it at most. */
  catcher?: (key: string, rows: number) => RenderElement
}
