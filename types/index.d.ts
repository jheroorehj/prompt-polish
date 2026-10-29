export type Target = 'opus-5.5' | 'sonnet-5.5' | 'gpt-6-astra' | 'gpt-5.6'

export type TargetChoice = 'auto' | Target

export type LogKind = 'polish' | 'refresh' | 'apply' | 'keep' | 'fail'

/** One row of the pane's record: when, what was done, and a word on it. */
export type LogLine = { at: number; kind: LogKind; text: string }

/** The pane's pick lists: the model the prompt is for, and who polishes it (the model and its effort, together); and the terminal pane's window menu. */
export type Menu = 'target' | 'polisher' | 'effort' | 'window'

/** Where the terminal draws Prompt Polish: the pane (`full`), one line right above the prompt, or one in the line under it. */
export type PaneSize = 'full' | 'compact' | 'minimized'

/**
 * What one polish is given besides the draft and the guide, as read when the
 * polish began: kept for its retries, which send it again unchanged.
 */
export type Held = {
  /** The map of the project's files, its CLAUDE.md and its manifests; '' with no project to read. */
  project: string
  /** The start of each file the draft or the last answer names; '' when they name none. */
  files: string
  /** The last thing the agent said in the session; '' before it has said anything. */
  answer: string
}

/** One earlier session of this project that Claude Code kept, as the pane lists it. */
export type SessionRow = {
  id: string
  /** When its file was last written, in ms. */
  at: number
  title: string
  /** Its last prompt, cut and masked. */
  last: string
  /** How many files its recent part changed. */
  files: number
  /** Whether a handoff document is kept for it. */
  hasHandoff: boolean
}

/** The list of earlier sessions in the pane: open or not, which range, and what was picked. */
export type SessionsState = {
  isOpen: boolean
  range: 'day' | 'week'
  /** Null until read. */
  rows: SessionRow[] | null
  isLoading: boolean
  /** The row opened for a closer look. */
  picked: string | null
  /** What a hand-over gives: notes made of the session, or its handoff document. */
  kind: 'notes' | 'handoff'
  /** The sessions handed over to the session now open. */
  done: string[]
}

declare module 'claude-code' {
  interface PluginState {
    'prompt-polish': {
      isAuto: boolean
      /** Whether this person turned the session trail on (kept in the store as well). */
      isTrailing: boolean
      /** What `/polish carry use` armed to add to the next prompt. */
      carryArmed: 'trail' | 'handoff' | null
      /** The handoff skill the person started, and whether its turn has begun. */
      handoffRun: { command: string; purpose: string; isStarted: boolean; startedAt: number } | null
      /** The earlier sessions the pane lists, and what the person picked in the list. */
      sessions: SessionsState
      /** The session in which the full-context question was asked, so it is asked once. */
      measureAsked: string | null
      target: TargetChoice
      isBusy: boolean
      /** When the polish now running began, for the pane's loading mark. */
      busySince: number | null
      /** The pick list open in the pane. */
      menu: Menu | null
      /** The draft the proposal was made from; after Apply, what Undo puts back. */
      original: string | null
      /** The polished prompt on preview, not yet in the prompt box. */
      proposal: string | null
      /** Every polish made of the draft on preview, oldest first: a retry adds one. */
      versions: string[]
      /** Which of `versions` is on preview. */
      version: number
      /** What the polish on preview was given; a retry reads it, Apply drops it. */
      held: Held | null
      /** Whether the draft in the box has had its preview, so auto mode lets it go. */
      isReviewed: boolean
      /** Whether auto mode has a prompt held in the hook, waiting for the person's answer. */
      isAnswering: boolean
      log: LogLine[]
      /** Whether the pane shows the record in full, not its latest row alone. */
      isLogOpen: boolean
      /** Whether the pane says, under its heading, what the guide in use is. */
      isGuideOpen: boolean
      /** Whether the pane lists its keys; open, the buttons show them and take them. */
      isKeysOpen: boolean
      /** Whether the desktop's pane shows its settings, folded to one line otherwise. */
      isSetupOpen: boolean
      /** Whether the desktop's review shows the original under the polish. */
      isOriginalOpen: boolean
      /** Whether the band above the prompt box is open (false: minimized to the chip in the prompt's footer), where the desktop draws it. */
      isBandOpen: boolean
      /** Where the terminal draws Prompt Polish: the pane, above the prompt, or under it. */
      paneSize: PaneSize
      /** Until when the pane says what AUTO now does; null once that has passed. */
      hintUntil: number | null
      /**
       * Whether the desktop's controls are drawn with their buttons alone, no
       * catcher over them: switched by `/polish plain`, or by a catcher that failed.
       */
      isPlain: boolean
      /** The models the pane offers for polishing, as listed when the session started. */
      models: string[]
      /** The polishing model and effort picked in the pane; null follows the mod's options. */
      model: string | null
      effort: string | null
    }
  }
}
