export type Target = 'opus-5.5' | 'sonnet-5.5' | 'gpt-6-astra' | 'gpt-5.6'

export type TargetChoice = 'auto' | Target

export type LogKind = 'polish' | 'refresh' | 'apply' | 'keep' | 'fail'

/** One row of the pane's record: when, what was done, and a word on it. */
export type LogLine = { at: number; kind: LogKind; text: string }

/** The pane's pick lists: the model the prompt is for, and who polishes it (the model and its effort, together). */
export type Menu = 'target' | 'polisher' | 'effort'

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

declare module 'claude-code' {
  interface PluginState {
    'prompt-polish': {
      isAuto: boolean
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
      /** Whether the band above the prompt box is up, where the desktop draws it. */
      isBandOpen: boolean
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
