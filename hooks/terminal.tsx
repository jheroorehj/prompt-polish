// The pane as the terminal draws it, and as every surface that draws from a
// grid of cells does (the VS Code extension, the mobile app): a settings box
// framed in the accent, blocks of color for the button that matters, toggles
// in words. It is made of the View core.ts reads, and its controls call the
// Act core.ts holds; there is no state or engine call in this file.
import type { Elements, RenderElement } from 'claude-code'

import type { LogLine, Menu } from '../types'
import { TITLE } from './core'
import { EFFORTS, fmtClock } from './polish'
import { LOG } from './view'
import type { Act, Layout, Marks, Phase, View } from './view'

/** The elements a surface drawn from cells has. */
type Table = Pick<Elements['terminal'], 'Box' | 'Button' | 'Text'>

const LOG_ROWS = 8

// Theme keys, so the pane follows the person's theme.
const C = {
  main: 'claude',
  polished: 'suggestion',
  ok: 'success',
  warn: 'error',
  dim: 'inactive',
  faint: 'subtle',
  // The words on an accent block.
  onMain: 'inverseText',
} as const

// OpenAI's brand green, for a pane polishing a prompt a GPT model will read.
const GPT_GREEN = '#10A37F'

// The key of each button, by the button's own key. A button drawn as a block
// of color shows the key it has, so it has one only while the keys are listed.
const HOTKEYS: Record<string, string> = {
  polish: 'p',
  apply: 'y',
  refresh: 'r',
  discard: 'x',
  restore: 'u',
  older: 'b',
  newer: 'n',
  cancel: 'c',
  auto: 'a',
  target: 't',
  polisher: 'm',
  log: 'l',
  keys: 'k',
}

const KEYS = [
  ['p', 'Prompt Polish'],
  ['y', 'Apply Polish'],
  ['r', 'Retry Polish'],
  ['x', 'Keep Original'],
  ['u', 'Undo Apply'],
  ['b', 'Older Version'],
  ['n', 'Newer Version'],
  ['c', 'Stop'],
  ['a', 'AUTO'],
  ['t', 'Session Model'],
  ['m', 'Polish Model'],
  ['1-9', 'Pick from an open list'],
  ['l', 'History'],
  ['k', 'Keys'],
  ['Tab', 'Next button'],
  ['Enter', 'Press'],
] as const

export const terminalPane = (
  { Box, Button, Text }: Table,
  view: View,
  act: Act,
  layout: Layout,
  marks: Marks,
): RenderElement => {
  const { isKeysShown } = view
  const preview = view.preview
  const draft = view.draft
  const lines = view.lines
  const isRunning = view.isRunning
  const isGpt = view.isGpt
  const open = view.menu
  // The pane wears the colors of the family the prompt is for: Claude's
  // from the theme, or one green on every box for a GPT model.
  const P = isGpt
    ? { main: GPT_GREEN, polished: GPT_GREEN, box: GPT_GREEN, rest: GPT_GREEN }
    : { main: C.main, polished: C.polished, box: C.faint, rest: C.dim }
  const W = Math.max(40, layout.columns)
  const picked = { polishModel: view.model, effort: view.effort }
  const offered = view.models
  const made = { length: view.versions }
  const shownAt = view.version
  const isOn = view.isOn

  // A pick list of the pane's own: every row a Button, so a click picks as
  // Enter under the focus does. A bracketed Button keeps its key and draws
  // none: the keys are listed under the Keys toggle, for who wants them.
  // The button that matters now is a block of the pane's accent with its
  // words inside, as the buttons of charmbracelet/lipgloss and gum are; the
  // rest are their words alone, a space each side, with no block behind. A click presses it, and Tab then Enter;
  // its key shows before it, and works, only while the keys are listed.
  const chip = (
    key: string,
    label: string,
    isMain: boolean,
    onPress: () => void,
    isFirst = false,
  ) => (
    <Button
      key={key}
      plain
      {...(isKeysShown && HOTKEYS[key] !== undefined
        ? { hotkey: HOTKEYS[key] }
        : {})}
      {...(isFirst ? ({ autoFocus: true } as const) : {})}
      onPress={onPress}
    >
      {isMain ? (
        <Text backgroundColor={P.main} color={C.onMain} bold>
          {` ${label} `}
        </Text>
      ) : (
        <Text>{` ${label} `}</Text>
      )}
    </Button>
  )

  // A pick list of the pane's own, as gum's choose draws one: a row to an
  // option, the one in use behind a cursor and before a tick. Every row is
  // a Button, so a click picks as Enter under the focus does.
  type Pick = 'target' | 'model' | 'effort'

  // The rows alone. `from` is how many rows the frame holds before these,
  // so the digits of two lists in one frame run on rather than clash.
  const pickRows = (
    kind: Pick,
    rows: readonly { value: string; label: string }[],
    current: string,
    from = 0,
  ) =>
    rows.map((row, i) => (
      <Button
        key={`${kind}-${row.value}`}
        plain
        {...(isKeysShown && from + i < 9
          ? { hotkey: String(from + i + 1) }
          : {})}
        onPress={() => act[kind](row.value)}
      >
        {row.value === current ? (
          <Text color={P.main} bold>{`> ${row.label} ✓`}</Text>
        ) : (
          <Text>{`  ${row.label}`}</Text>
        )}
      </Button>
    ))

  const optionsOf = (
    kind: Pick,
    rows: readonly { value: string; label: string }[],
    current: string,
  ) => (
    <Box
      key={`${kind}-list`}
      flexDirection="column"
      borderStyle="round"
      borderColor={P.box}
      borderDimColor={isGpt}
      paddingX={1}
    >
      {pickRows(kind, rows, current)}
    </Box>
  )

  const mark = (kind: Menu) => (open === kind ? '▴' : '▾')
  const plain = (values: readonly string[]) =>
    values.map(value => ({ value, label: value }))

  // What Enter does under each setting of AUTO, said alike; up only for a
  // few seconds after a switch, in a frame right under the line the switch
  // is on, as an open pick list is.
  const hint = view.hint

  // What the prompt is for: the switch, and the model that will read it.
  const pickers = (
    <Box flexDirection="column">
      <Box columnGap={2} flexWrap="wrap">
        {chip('auto', `AUTO ${isOn ? 'ON' : 'OFF'}`, isOn, act.auto)}
        {chip(
          'target',
          `Session Model : ${view.targetLabel} ${mark('target')}`,
          false,
          () => act.menu('target'),
        )}
      </Box>
      {hint !== null && (
        <Box
          key="hint"
          borderStyle="round"
          borderColor={P.box}
          borderDimColor={isGpt}
          paddingX={1}
        >
          <Text color={P.main} wrap="wrap">
            {hint}
          </Text>
        </Box>
      )}
      {open === 'target' && optionsOf('target', view.targets, view.choice)}
    </Box>
  )

  // How hard, as a stepped slider: a track with a tick to a level and the
  // levels named under their ticks. The ticks up to the level in use are
  // lit, and its own is the knob. A click on a tick or on a name moves the
  // knob there; so does Enter under the focus, and a name's digit while the
  // keys are listed.
  const STEP = 8
  const at = EFFORTS.indexOf(picked.effort)
  // Each name is centered under its tick. The track starts far enough in
  // for the first name's left half, and a name starts half its length left
  // of its tick; the room between two names is plain space, not button.
  const INSET = Math.floor((EFFORTS[0]?.length ?? 0) / 2)
  const nameStarts = EFFORTS.map(
    (level, i) => INSET + i * STEP - Math.floor(level.length / 2),
  )
  const slider = (
    <Box key="effort-slider" flexDirection="column">
      <Box key="effort-track">
        <Text>{' '.repeat(INSET)}</Text>
        {EFFORTS.map((level, i) => {
          const isLast = i === EFFORTS.length - 1

          // The tick alone is the button, so the focus and the pointer
          // light the tick and never the line; the line is one plain color.
          return (
            <Box>
              <Button
                key={`effort-tick-${level}`}
                plain
                onPress={() => act.effort(level)}
              >
                <Text color={i <= at ? P.main : C.faint} bold={i === at}>
                  {i < at ? '•' : i === at ? '●' : '○'}
                </Text>
              </Button>
              {!isLast && <Text color={C.faint}>{'─'.repeat(STEP - 1)}</Text>}
            </Box>
          )
        })}
      </Box>
      <Box key="effort-names">
        {EFFORTS.map((level, i) => {
          const before = EFFORTS[i - 1]
          const gap =
            (nameStarts[i] ?? 0) -
            (before === undefined ? 0 : (nameStarts[i - 1] ?? 0) + before.length)

          return (
            <Box>
              <Text>{' '.repeat(Math.max(0, gap))}</Text>
              <Button
                key={`effort-${level}`}
                plain
                {...(isKeysShown && offered.length + i < 9
                  ? { hotkey: String(offered.length + i + 1) }
                  : {})}
                onPress={() => act.effort(level)}
              >
                {i === at ? (
                  <Text color={P.main} bold>
                    {level}
                  </Text>
                ) : (
                  <Text dimColor>{level}</Text>
                )}
              </Button>
            </Box>
          )
        })}
      </Box>
    </Box>
  )

  // Who polishes, and how hard: one button on the settings box's second
  // line, saying both. Its list is one frame as wide as the box holding the
  // models and the effort slider side by side, and it stays up after a pick,
  // so both can be set; `done`, under it at the right, folds it, as the button does.
  const tuning = (
    <Box key="tuning" flexDirection="column">
      <Box columnGap={2} flexWrap="wrap">
        {chip(
          'polisher',
          `Polish Model : ${picked.polishModel} (${picked.effort}) ${mark('polisher')}`,
          false,
          () => act.menu('polisher'),
        )}
      </Box>
      {open === 'polisher' && (
        <Box
          key="polisher-list"
          flexDirection="column"
          borderStyle="round"
          borderColor={P.box}
          borderDimColor={isGpt}
          paddingX={1}
        >
          {/* The models at the frame's left end and the slider at its
              right. Too narrow for both, the slider goes under the models,
              a line left empty between them. */}
          <Box
            key="polisher-body"
            justifyContent="space-between"
            columnGap={2}
            rowGap={1}
            flexWrap="wrap"
          >
            <Box key="model-list" flexDirection="column">
              <Text dimColor>Polish Model</Text>
              {pickRows('model', plain(offered), picked.polishModel)}
            </Box>
            <Box key="effort-list" flexDirection="column">
              <Text dimColor>Effort</Text>
              {slider}
            </Box>
          </Box>
        </Box>
      )}
      {/* `done`: under the list's frame and inside the settings box, at
          the right end, as Stop is under the loading mark's. */}
      {open === 'polisher' && (
        <Box key="polisher-foot" justifyContent="flex-end">
          {chip('polisher-done', 'done', false, act.done)}
        </Box>
      )}
    </Box>
  )

  // The loading mark: up for as long as a polish runs, whoever began it,
  // at the foot of the settings box, in place of the settings' buttons, in
  // a frame of its own. Its bar is as long as that frame's inside: the
  // pane's width less the frame, and less the settings box where it has one.
  const loaderW = Math.max(
    8,
    W - 4 - (!layout.isDocked && preview === null ? 0 : 4),
  )
  const loader = isRunning ? (
    <Box
      key="loader"
      flexDirection="column"
      borderStyle="round"
      borderColor={P.box}
      borderDimColor={isGpt}
      paddingX={1}
    >
      <Box columnGap={1}>
        {marks.spinner !== undefined ? (
          marks.spinner(view.since, view.now, P.main)
        ) : (
          <Text color={P.main} bold>
            ●
          </Text>
        )}
        <Text color={P.main} bold>
          Polishing prompt
        </Text>
        <Text dimColor wrap="truncate">
          {`${picked.polishModel} · effort ${picked.effort}`}
        </Text>
      </Box>
      {marks.bar?.(loaderW, P.main, C.faint)}
    </Box>
  ) : null

  // Stop: under the mark's frame and inside the settings box, the box's
  // last line, at its right end.
  const stopRow = isRunning ? (
    <Box key="loader-foot" justifyContent="flex-end">
      {chip('cancel', 'Stop', false, act.stop, true)}
    </Box>
  ) : null

  const phase: {
    kind: Phase
    glyph: string
    text: string
    color: string
  } = isRunning
    ? { kind: 'busy', glyph: '●', text: 'Polishing', color: P.main }
    : preview !== null
      ? { kind: 'review', glyph: '◆', text: 'Review', color: P.polished }
      : { kind: 'idle', glyph: '●', text: 'Ready', color: C.dim }

  // The state: a mark that moves where the surface can animate, still elsewhere.
  const phaseColor = phase.kind === 'idle' ? C.ok : phase.color
  const status = (
    <Box columnGap={1} flexShrink={0}>
      {marks.pulse !== undefined ? (
        marks.pulse(phase.kind, phaseColor)
      ) : (
        <Text color={phaseColor}>{phase.glyph}</Text>
      )}
      <Text color={phase.color} bold={phase.kind !== 'idle'}>
        {phase.text}
      </Text>
    </Box>
  )

  const actions =
    preview !== null ? (
      <Box columnGap={2} flexWrap="wrap">
        {chip('apply', 'Apply Polish', true, act.apply, true)}
        {chip('refresh', 'Retry Polish', false, act.retry)}
        {chip('discard', 'Keep Original', false, act.keep)}
      </Box>
    ) : (
      <Box key="primary" columnGap={2} flexWrap="wrap">
        {chip('polish', 'Prompt Polish', true, act.polish)}
        {draft !== null && chip('restore', 'Undo Apply', false, act.undo)}
      </Box>
    )

  // The versions a retry has made of the draft on preview, paged through as
  // assistant-ui's BranchPicker pages a message's branches: the one before,
  // which of how many is on show, the one after. With one version there is
  // nothing to page, and at either end the arrow is no button.
  const arrow = (key: 'older' | 'newer', glyph: string, by: -1 | 1) =>
    shownAt + by < 0 || shownAt + by >= made.length ? (
      <Text color={C.faint}>{` ${glyph} `}</Text>
    ) : (
      chip(key, glyph, false, () => act.step(by))
    )
  const pager =
    preview !== null && made.length > 1 ? (
      <Box key="versions" flexShrink={0}>
        {arrow('older', '‹', -1)}
        <Text dimColor>{`${shownAt + 1} / ${made.length}`}</Text>
        {arrow('newer', '›', 1)}
      </Box>
    ) : null

  // The pane's working row: what to do now, and at its far end the pager of
  // what a retry made. While a polish runs there is only Stop to do, which
  // stands with the loading mark, so the row is gone, pager and all.
  const actionRow = (
    <Box
      key="action-row"
      paddingX={1}
      columnGap={2}
      flexWrap="wrap"
      alignItems="flex-start"
      {...(pager === null ? {} : ({ justifyContent: 'space-between' } as const))}
      width={W}
    >
      {actions}
      {pager}
    </Box>
  )

  const rowOf = (line: LogLine) => (
    <Box>
      <Box width={9} flexShrink={0}>
        <Text color={C.faint}>{fmtClock(line.at)}</Text>
      </Box>
      <Box width={10} flexShrink={0}>
        <Text color={LOG[line.kind].color} bold wrap="truncate">
          {LOG[line.kind].label}
        </Text>
      </Box>
      <Text wrap="truncate">{line.text}</Text>
    </Box>
  )

  // The foot, a line clear of the working panels: the keys' toggle, and under it
  // the record's, which is the pane's last row. Each list opens right above
  // its own toggle, so the two rows keep their order and the last its place.
  const latest = lines.at(-1)
  // The toggle's mark: up while folded, the way its list opens; down while open.
  const fold = (isOpen: boolean) => (isOpen ? '▾' : '▴')

  const logPanel = (
    <Box key="foot" flexDirection="column" marginTop={1} width={W}>
      {isKeysShown && (
        <Box
          key="keys-list"
          flexDirection="column"
          borderStyle="round"
          borderColor={P.box}
          borderDimColor={isGpt}
          paddingX={1}
          width={W}
        >
          <Text color={C.faint} wrap="wrap">
            Keys work while this list is open. Click the pane or press ctrl+x
            tab first.
          </Text>
          <Box columnGap={3} flexWrap="wrap">
            {KEYS.map(([key, what]) => (
              <Text>
                <Text color={P.main} bold>
                  {key}
                </Text>
                <Text dimColor>{` ${what}`}</Text>
              </Text>
            ))}
          </Box>
        </Box>
      )}
      <Box key="keys-row" paddingX={1}>
        {chip('keys', `Keys ${fold(isKeysShown)}`, false, act.keys)}
      </Box>
      {view.isLogShown && (
        <Box
          key="log-list"
          flexDirection="column"
          borderStyle="round"
          borderColor={P.box}
          borderDimColor={isGpt}
          paddingX={1}
          width={W}
        >
          {lines.length === 0 && <Text color={C.faint}>No history yet</Text>}
          {lines.slice(-LOG_ROWS).map(rowOf)}
        </Box>
      )}
      <Box key="log-row" paddingX={1} columnGap={1}>
        <Box flexShrink={0}>
          {chip(
            'log',
            `History ${lines.length} ${fold(view.isLogShown)}`,
            false,
            act.log,
          )}
        </Box>
        {!view.isLogShown && latest !== undefined && (
          <Text dimColor wrap="truncate">
            {`${fmtClock(latest.at)} ${LOG[latest.kind].label} · ${latest.text}`}
          </Text>
        )}
      </Box>
    </Box>
  )

  const clickNote = layout.isFullscreen
    ? null
    : 'No mouse clicks on this screen (fullscreen only)'

  // Inline above the prompt with nothing to review, the pane is a summary.
  if (!layout.isDocked && preview === null) {
    return (
      <Box key="pane" flexDirection="column" width={W}>
        <Box columnGap={1}>
          <Text color={P.main} bold>
            {TITLE}
          </Text>
          {status}
        </Box>
        {!isRunning && actionRow}
        {isRunning ? loader : pickers}
        {stopRow}
        {!isRunning && tuning}
        {clickNote !== null && (
          <Text color={C.faint} wrap="truncate">
            {clickNote}
          </Text>
        )}
        {logPanel}
      </Box>
    )
  }

  const settingsPanel = (
    <Box
      key="settings"
      flexDirection="column"
      borderStyle="round"
      borderColor={P.main}
      paddingX={1}
      width={W}
    >
      <Box justifyContent="space-between">
        <Button key="guide" plain onPress={act.guide}>
          <Text color={P.main} bold>
            Reference : {view.guide} Guide
          </Text>
        </Button>
        {status}
      </Box>
      {view.isGuideShown && (
        <Box
          key="about"
          borderStyle="round"
          borderColor={P.box}
          borderDimColor={isGpt}
          paddingX={1}
        >
          <Text dimColor wrap="wrap">
            {view.about}
          </Text>
        </Box>
      )}
      <Box key="divider">
        <Text color={P.box} dimColor={isGpt}>
          {'─'.repeat(Math.max(1, W - 4))}
        </Text>
      </Box>
      {isRunning ? loader : pickers}
      {stopRow}
      {!isRunning && tuning}
    </Box>
  )

  const textPanel = (
    key: string,
    title: string,
    text: string,
    color: string,
    border: string,
    isDim: boolean,
    w: number,
  ) => (
    <Box
      key={key}
      flexDirection="column"
      borderStyle="round"
      borderColor={border}
      borderDimColor={isDim}
      paddingX={1}
      width={w}
    >
      <Box justifyContent="space-between">
        <Text color={color} bold>
          {title}
        </Text>
        <Text dimColor>{`${text.trim().length} chars`}</Text>
      </Box>
      <Text dimColor={isDim} wrap="wrap">
        {text.trim()}
      </Text>
    </Box>
  )

  const isWide = W >= 110
  const half = Math.floor((W - 2) / 2)
  const review =
    preview === null ? null : isWide ? (
      <Box key="review" columnGap={2}>
        {textPanel('original', 'Original Prompt', draft ?? '', C.dim, P.rest, true, half)}
        {textPanel('polished', 'Polished Prompt', preview, P.polished, P.polished, false, half)}
      </Box>
    ) : (
      <Box key="review" flexDirection="column">
        {textPanel('original', 'Original Prompt', draft ?? '', C.dim, P.rest, true, W)}
        {textPanel('polished', 'Polished Prompt', preview, P.polished, P.polished, false, W)}
      </Box>
    )

  // Docked, the pane is as tall as its room, so the foot sits on its last row.
  return (
    <Box
      key="pane"
      flexDirection="column"
      width={W}
      {...(layout.isDocked ? { minHeight: Math.max(1, layout.bodyRows) } : {})}
    >
      {settingsPanel}
      {review}
      {!isRunning && actionRow}
      {clickNote !== null && (
        <Box paddingX={1}>
          <Text color={C.faint} wrap="truncate">
            {clickNote}
          </Text>
        </Box>
      )}
      {layout.isDocked && <Box key="spacer" flexGrow={1} />}
      {logPanel}
    </Box>
  )
}
