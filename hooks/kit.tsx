// The controls of the Claude desktop app's pane and band, one kit: the pane
// (desktop.tsx) and the band above the prompt box (band.tsx) are laid out from
// these and from nothing else, so a control is the same wherever it stands.
//
// The rule: every thing to click is a rounded box with a resting edge or fill,
// never a bare word. The button to press is washed in the accent and framed in
// it; a quiet button is framed in the app's line; a select is a framed field
// with a chevron; a switch is a pill; the efforts are a segmented row; a row
// that opens something is a row with a chevron at its end.
//
// What the app draws, and so what this leans on: a box's background and
// border, a text's color and weight, a drawing beside a button (never in one),
// and a button's words alone, in the app's own color. A drawing with nothing
// for `alt` is left out, so each says what it is.
//
// A button there is as large as its words and no larger, and is named by a
// handle a redraw replaces, so a click that redraws the pane is lost on it
// (hit.tsx says how). So each control is a box with room about its words, and
// where the app runs surface modules, a catcher lies over the whole of it: a
// click on the icon, the chevron or the room is a click on the control. The
// button stays under the catcher for Tab and Enter.
import type { Elements } from 'claude-code'

import type { LogLine } from '../types'
import { TITLE } from './core'
import {
  iconOf,
  RING,
  ringOf,
  stepOf,
  SWITCH_HEIGHT,
  SWITCH_WIDTH,
  switchOf,
  TRACK_HEIGHT,
  trackOf,
} from './icons'
import type { IconName, StepState } from './icons'
import { EFFORTS, fmtClock } from './polish'
import { LOG } from './view'
import type { Act, Marks, View } from './view'

/** The elements the app has for a tree it lays out. */
export type Table = Pick<Elements['desktop'], 'Box' | 'Button' | 'Svg' | 'Text'>

// The app's own backgrounds and lines, by the theme keys it maps to them: a
// card a step above the pane, a list a step above a card, a hairline, and a
// firmer line for the edge of a control.
export const CARD = 'userMessageBackground'
export const LIST = 'userMessageBackgroundHover'
export const LINE = 'promptBorderShimmer'
export const STRONG = 'promptBorder'
// The wash behind the polished prompt, and the color of its frame and name.
export const WASH = 'selectionBg'
export const BLUE = 'suggestion'
export const FAINT = 'subtle'

// A drawing takes no color from the theme, so the accent is written out: the
// clay of a Claude model, or the green of a GPT one; and a gray that stands
// on a dark page and on a light one. A tint is the accent a fifth as strong.
export const CLAY = '#D97757'
export const GREEN = '#10A37F'
export const QUIET = '#8C8C8C'
const tintOf = (accent: string): string => `${accent}33`

const ICON = 14
// A hairline: a twentieth of a row.
const HAIR = 0.05
// How wide the loading track asks to be: wider than any pane, so the app
// draws it as wide as the room it stands in.
const TRACK_WIDTH = 2400
const LOG_ROWS = 8

// The efforts as the segments say them, where the segments are narrow.
const EFFORT_WORD: Record<string, string> = { medium: 'med' }

/** Which of the four steps of a draft the pane is at: draft, polish, review, apply. */
export const stepOfView = (view: View): 1 | 2 | 3 | 4 =>
  view.isRunning ? 2 : view.preview !== null ? 3 : view.draft !== null ? 4 : 1

export const kitOf = (
  { Box, Button, Svg, Text }: Table,
  view: View,
  act: Act,
  marks: Marks,
) => {
  const accent = view.isGpt ? GREEN : CLAY
  // The theme's own clay where it has it, for the frame and the name.
  const edge = view.isGpt ? GREEN : 'claude'
  const polished = view.isGpt ? GREEN : BLUE
  // The accent a fifth as strong, behind what is in use and what is to press;
  // and the app's own wash behind the polish on show.
  const tint = tintOf(accent)
  const polishedWash = view.isGpt ? tintOf(GREEN) : WASH
  const catcher = view.isPlain ? undefined : marks.catcher
  // Under a catcher a chevron is a drawing, and a click on it the catcher's.
  // With none it is the end of its button's words, so the click is the button's.
  const isCaught = catcher !== undefined

  const icon = (name: IconName, says: string, color = QUIET) => (
    <Svg source={iconOf(name, color)} alt={says} width={ICON} height={ICON} />
  )

  // One thing to click: the box `box`, what is drawn in it (its button among
  // that), and over the whole of it the catcher of the button keyed `key`.
  // The box's padding is room the catcher takes clicks in.
  const control = (
    box: string,
    key: string,
    children: JSX.Children,
    more: object = {},
    rows = 2,
  ) => (
    <Box key={box} alignItems="center" {...more}>
      {children}
      {catcher?.(key, rows)}
    </Box>
  )

  // The button to press is washed and framed in the accent, a quiet one is
  // framed in the app's line; both a framed box with the same room about it.
  const button = (
    key: string,
    label: string,
    onPress: () => void,
    drawn: {
      variant: 'primary' | 'secondary'
      before?: IconName
      isFirst?: boolean
      isGrown?: boolean
    },
  ) => {
    const isPrimary = drawn.variant === 'primary'

    return control(
      `${key}-box`,
      key,
      [
        drawn.before !== undefined &&
          icon(drawn.before, label, isPrimary ? accent : QUIET),
        <Button
          key={key}
          plain
          {...(drawn.isFirst === true ? ({ autoFocus: true } as const) : {})}
          onPress={onPress}
        >
          {label}
        </Button>,
      ],
      {
        justifyContent: 'center',
        columnGap: 1,
        borderStyle: 'round',
        borderColor: isPrimary ? edge : STRONG,
        paddingX: isPrimary ? 2 : 1.5,
        paddingY: 0.5,
        overflow: 'hidden',
        ...(isPrimary ? { backgroundColor: tint } : {}),
        ...(drawn.isGrown === true ? { flexGrow: 1 } : {}),
      },
    )
  }

  // A framed field that shows a value and opens a list: the value, and at the
  // far end the chevron, which points the way the list opens.
  const select = (
    key: string,
    label: string,
    isOpen: boolean,
    onPress: () => void,
    before?: string,
  ) =>
    control(
      `${key}-box`,
      key,
      [
        before !== undefined && (
          <Text key={`${key}-before`} dimColor>
            {before}
          </Text>
        ),
        <Button key={key} plain onPress={onPress}>
          {isCaught ? label : `${label} ${isOpen ? '▴' : '▾'}`}
        </Button>,
        isCaught && <Box key={`${key}-fill`} flexGrow={1} />,
        isCaught && icon(isOpen ? 'up' : 'down', isOpen ? 'Collapse' : 'Expand'),
      ],
      {
        columnGap: 1,
        borderStyle: 'round',
        borderColor: STRONG,
        paddingX: 1.5,
        paddingY: 0.5,
        flexGrow: 1,
        flexShrink: 0,
        overflow: 'hidden',
      },
    )

  // A framed field that only says its value, in the place a select stands,
  // while the selects cannot be used: the band is as high as it was.
  const readout = (key: string, label: string, value: string) => (
    <Box
      key={key}
      alignItems="center"
      columnGap={1}
      borderStyle="round"
      borderColor={LINE}
      paddingX={1.5}
      paddingY={0.5}
      flexGrow={1}
      flexShrink={0}
      overflow="hidden"
    >
      <Text dimColor>{label}</Text>
      <Text color={FAINT}>{value}</Text>
    </Box>
  )

  // A row that opens something: its words, and at the far end a chevron that
  // points right while it is shut and down while it is open. What it holds
  // when it is shut may be said after the words, and is the one thing that
  // gives way: the words' box hides what does not fit (a flex item is as wide
  // as its content until it hides its overflow), the name and the mark keep
  // their room, and the hint is cut with an ellipsis.
  const row = (
    key: string,
    label: string,
    onPress: () => void,
    drawn: { before?: IconName; isOpen: boolean; hint?: string },
  ) =>
    control(
      `${key}-box`,
      key,
      [
        <Box
          key={`${key}-words`}
          alignItems="center"
          columnGap={1}
          flexShrink={1}
          overflow="hidden"
        >
          {drawn.before !== undefined && (
            <Box flexShrink={0}>{icon(drawn.before, label)}</Box>
          )}
          <Box flexShrink={0}>
            <Button key={key} plain onPress={onPress}>
              {isCaught ? label : `${label} ${drawn.isOpen ? '▾' : '▸'}`}
            </Button>
          </Box>
          {drawn.hint !== undefined && (
            <Box flexShrink={1} overflow="hidden">
              <Text color={FAINT} wrap="truncate">
                {drawn.hint}
              </Text>
            </Box>
          )}
        </Box>,
        isCaught && icon(drawn.isOpen ? 'down' : 'right', drawn.isOpen ? 'Collapse' : 'Expand'),
      ],
      { justifyContent: 'space-between', columnGap: 1, paddingY: 0.5 },
    )

  // A switch: its name before it, and the pill at the far end. The whole row
  // is the control, as a settings row is.
  const toggle = (
    key: string,
    label: string,
    isOn: boolean,
    onPress: () => void,
    before?: IconName,
  ) =>
    control(
      `${key}-box`,
      key,
      [
        <Box key={`${key}-words`} alignItems="center" columnGap={1}>
          {before !== undefined && icon(before, label)}
          <Button key={key} plain onPress={onPress}>
            {isCaught ? label : `${label} ${isOn ? 'On' : 'Off'}`}
          </Button>
        </Box>,
        <Svg
          key={`${key}-pill`}
          source={switchOf(isOn)}
          alt={`${label} ${isOn ? 'on' : 'off'}`}
          width={SWITCH_WIDTH}
          height={SWITCH_HEIGHT}
        />,
      ],
      { justifyContent: 'space-between', columnGap: 2, paddingY: 0.5 },
    )

  // The efforts as a row of segments in one frame, a fifth each; the one in
  // use is washed. Any of its words, or the room about them, picks it.
  const segments = (current: string) => (
    <Box
      key="effort-segments"
      borderStyle="round"
      borderColor={STRONG}
      paddingX={0}
      paddingY={0}
      overflow="hidden"
      alignItems="stretch"
    >
      {EFFORTS.flatMap((level, i) => [
        i > 0 && (
          <Box key={`effort-${level}-line`} width={0.1} backgroundColor={LINE} />
        ),
        control(
          `effort-${level}-box`,
          `effort-${level}`,
          <Button key={`effort-${level}`} plain onPress={() => act.effort(level)}>
            {EFFORT_WORD[level] ?? level}
          </Button>,
          {
            width: `${100 / EFFORTS.length}%`,
            justifyContent: 'center',
            paddingY: 0.5,
            ...(level === current ? { backgroundColor: tint } : {}),
          },
          2,
        ),
      ])}
    </Box>
  )

  // A pick list: choice chips that wrap in a tray, as many to a line as the
  // room holds, so a long list stays low. The one in use is washed, framed in
  // the accent and ticked. Any part of a chip is the option's to click.
  const options = (
    kind: 'target' | 'model' | 'effort',
    rows: readonly { value: string; label: string }[],
    current: string,
    pick: (value: string) => void,
  ) => (
    <Box
      key={`${kind}-list`}
      columnGap={1}
      rowGap={1}
      flexWrap="wrap"
      alignItems="center"
      borderStyle="round"
      borderColor={LINE}
      backgroundColor={LIST}
      padding={1}
    >
      {rows.map(option => {
        const isCurrent = option.value === current

        return control(
          `${kind}-${option.value}-row`,
          `${kind}-${option.value}`,
          [
            <Button
              key={`${kind}-${option.value}`}
              plain
              onPress={() => pick(option.value)}
            >
              {option.label}
            </Button>,
            isCurrent && (
              <Text key="in-use" color={edge} bold>
                ✓
              </Text>
            ),
          ],
          {
            columnGap: 1,
            borderStyle: 'round',
            borderColor: isCurrent ? edge : STRONG,
            paddingX: 1.5,
            paddingY: 0.25,
            flexShrink: 0,
            ...(isCurrent ? { backgroundColor: tint } : {}),
          },
        )
      })}
    </Box>
  )

  const card = (key: string, children: JSX.Children, more: object = {}) => (
    <Box
      key={key}
      flexDirection="column"
      borderStyle="round"
      borderColor={LINE}
      backgroundColor={CARD}
      rowGap={1}
      alignItems="stretch"
      {...more}
    >
      {children}
    </Box>
  )

  // The state: its mark, and its word. A polish that runs has a ring that turns;
  // a pane that waits for the person's answer has a mark that moves slowly;
  // one at rest has a dot, and a dot does not move.
  const hue =
    view.phase === 'busy' ? edge : view.phase === 'review' ? polished : 'success'
  const status = (
    <Box key="status" alignItems="center" columnGap={1} flexShrink={0}>
      {view.phase === 'busy' ? (
        <Svg
          key="ring"
          source={ringOf(accent)}
          alt="Polishing"
          width={RING}
          height={RING}
          isInteractive
        />
      ) : view.phase === 'review' && marks.pulse !== undefined ? (
        marks.pulse(view.phase, hue)
      ) : (
        <Text color={hue}>●</Text>
      )}
      <Text {...(view.phase === 'idle' ? { dimColor: true } : { color: hue })}>
        {view.phase === 'busy'
          ? 'Polishing'
          : view.phase === 'review'
            ? 'Review'
            : 'Ready'}
      </Text>
    </Box>
  )

  const title = (
    <Box key="title" alignItems="center" columnGap={1}>
      {icon('wand', TITLE, accent)}
      <Text bold color={edge}>
        {TITLE}
      </Text>
    </Box>
  )

  // The draft's progress: four steps on one line, each a mark over its name,
  // joined by a hairline that runs through the marks.
  const stepper = () => {
    const at = stepOfView(view)

    return (
      <Box key="stepper" alignItems="flex-start">
        {['Draft', 'Polish', 'Review', 'Apply'].map((name, i) => {
          const state: StepState =
            i + 1 < at ? 'done' : i + 1 === at ? 'now' : 'todo'

          return (
            <Box
              key={`step-${i + 1}`}
              flexDirection="column"
              width="25%"
              alignItems="stretch"
            >
              <Box alignItems="center">
                <Box
                  flexGrow={1}
                  height={HAIR}
                  {...(i > 0 ? { backgroundColor: STRONG } : {})}
                />
                <Svg
                  source={stepOf(state, i + 1, accent)}
                  alt={`${name}: ${state === 'done' ? 'done' : state === 'now' ? 'now' : 'next'}`}
                  width={18}
                  height={18}
                />
                <Box
                  flexGrow={1}
                  height={HAIR}
                  {...(i < 3 ? { backgroundColor: STRONG } : {})}
                />
              </Box>
              <Box justifyContent="center">
                <Text {...(state === 'now' ? { bold: true } : { dimColor: true })}>
                  {name}
                </Text>
              </Box>
            </Box>
          )
        })}
      </Box>
    )
  }

  // While a polish runs: its mark and time, what runs, and who runs it, over
  // a dotted track a lit stretch runs along; and under them, the way to stop.
  const working = (
    <Box
      key="working"
      flexDirection="column"
      borderStyle="round"
      borderColor={LINE}
      rowGap={1}
    >
      <Box alignItems="center" columnGap={1} flexWrap="wrap">
        {marks.spinner?.(view.since, view.now, edge)}
        <Text color={edge} bold>
          Polishing prompt
        </Text>
        <Text dimColor>{`${view.model} · effort ${view.effort}`}</Text>
      </Box>
      <Svg
        source={trackOf(accent, QUIET)}
        alt="Polishing"
        width={TRACK_WIDTH}
        height={TRACK_HEIGHT}
        isInteractive
      />
    </Box>
  )
  const stop = button('cancel', 'Stop', act.stop, {
    variant: 'secondary',
    before: 'stop',
    isFirst: true,
  })
  const loader = (
    <Box key="loader" flexDirection="column" rowGap={1} alignItems="stretch">
      {working}
      <Box key="loader-foot" justifyContent="flex-end">
        {stop}
      </Box>
    </Box>
  )

  // The versions a retry has made of the draft, paged through as
  // assistant-ui's BranchPicker pages a message's branches. With one version
  // there is nothing to page, and at either end the arrow is no button. While
  // a retry runs it is gone with the working row.
  const arrow = (key: 'older' | 'newer', glyph: string, by: -1 | 1) => {
    const next = view.version + by

    return next < 0 || next >= view.versions ? (
      <Box paddingX={1} paddingY={0.25}>
        <Text color={FAINT}>{glyph}</Text>
      </Box>
    ) : (
      control(
        `${key}-box`,
        key,
        <Button key={key} plain onPress={() => act.step(by)}>
          {glyph}
        </Button>,
        {
          borderStyle: 'round',
          borderColor: STRONG,
          paddingX: 1,
          paddingY: 0.25,
        },
      )
    )
  }
  const pager =
    view.versions > 1 && !view.isRunning ? (
      <Box key="versions" alignItems="center" columnGap={1} flexShrink={0}>
        {arrow('older', '‹', -1)}
        <Text dimColor>{`Version ${view.version + 1} of ${view.versions}`}</Text>
        {arrow('newer', '›', 1)}
      </Box>
    ) : null

  const chars = (text: string) => `${text.trim().length} chars`

  // A prompt's words in a box of their own: the polish washed and framed in
  // the color of its name, the draft quiet.
  const words = (
    key: string,
    text: string,
    isPolished: boolean,
    title = isPolished ? 'Polished' : 'Original',
  ) => (
    <Box
      key={key}
      flexDirection="column"
      borderStyle="round"
      borderColor={isPolished ? polished : LINE}
      backgroundColor={isPolished ? polishedWash : LIST}
      rowGap={0.5}
    >
      <Box justifyContent="space-between" alignItems="center" columnGap={2}>
        <Text bold {...(isPolished ? { color: polished } : { dimColor: true })}>
          {title}
        </Text>
        <Text color={FAINT}>{chars(text)}</Text>
      </Box>
      <Text dimColor={!isPolished} wrap="wrap">
        {text.trim()}
      </Text>
    </Box>
  )

  // The polish in a box a few lines high, for where the room is short: its
  // name and length, and the start of it, cut to `lines` lines. The rest is
  // read in the pane, which has the room.
  const snippet = (
    key: string,
    text: string,
    lines: number,
    limit: number,
    beside: JSX.Children = null,
  ) => {
    const words = text.trim().replace(/\s+/g, ' ')

    return (
      <Box
        key={key}
        flexDirection="column"
        borderStyle="round"
        borderColor={polished}
        backgroundColor={polishedWash}
        rowGap={0.5}
      >
        <Box justifyContent="space-between" alignItems="center" columnGap={2}>
          <Text bold color={polished}>
            Polished
          </Text>
          <Box alignItems="center" columnGap={2}>
            {beside}
            <Text color={FAINT}>{chars(text)}</Text>
          </Box>
        </Box>
        <Box height={lines} overflow="hidden">
          <Text wrap="wrap">
            {words.length > limit ? `${words.slice(0, limit).trimEnd()}…` : words}
          </Text>
        </Box>
      </Box>
    )
  }

  // One row of the record: a dot in the color of what was done, when, what,
  // and a word on it.
  const entry = (line: LogLine) => (
    <Box alignItems="center" columnGap={1} overflow="hidden">
      <Text color={LOG[line.kind].color}>●</Text>
      <Text color={FAINT}>{fmtClock(line.at)}</Text>
      <Text>{LOG[line.kind].label}</Text>
      <Box flexShrink={1} overflow="hidden">
        <Text dimColor wrap="truncate">
          {line.text}
        </Text>
      </Box>
    </Box>
  )
  const latest = view.lines.at(-1)

  // The record's rows, when it is open.
  const logList = view.isLogShown ? (
    <Box key="log-list" flexDirection="column" backgroundColor={LIST} padding={0.5}>
      {view.lines.length === 0 && <Text color={FAINT}>No history yet</Text>}
      {view.lines.slice(-LOG_ROWS).map(entry)}
    </Box>
  ) : null

  // The record: a row that opens it, with the latest line after the words
  // while it is shut, and the rows of it over.
  const history = (
    <Box key="history" flexDirection="column" rowGap={0.5} alignItems="stretch">
      {logList}
      {row('log', `History ${view.lines.length}`, act.log, {
        isOpen: view.isLogShown,
        ...(!view.isLogShown && latest !== undefined
          ? {
              hint: `${fmtClock(latest.at)} ${LOG[latest.kind].label} · ${latest.text}`,
            }
          : {}),
      })}
    </Box>
  )

  return {
    accent,
    edge,
    polished,
    tint,
    polishedWash,
    isCaught,
    icon,
    control,
    button,
    select,
    readout,
    row,
    toggle,
    segments,
    options,
    card,
    status,
    title,
    stepper,
    working,
    stop,
    loader,
    pager,
    chars,
    words,
    snippet,
    logList,
    history,
  }
}
