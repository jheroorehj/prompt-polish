// The pane as a band right above the prompt box, in the Claude desktop app.
//
// The app gives this band about eleven lines and scrolls what is past them
// with the scroll bar hidden, so the band is built to stay inside that, in
// every state, and its places do not move:
//
//   head      the name at the left, which minimizes the band; AUTO and the state at the top right
//   settings  the session model, the polish model and the effort, as selects
//   stage     one place, of one height, for what is going on: the loading mark
//             while a polish runs, the start of the polish in review, with
//             its versions in its head
//   foot      what to do now at the left (Prompt Polish, the three answers, or
//             Stop), at the right Full view and History
//
// A list a select opens takes the place of the stage and the foot while it is
// open, so the band is no taller for it. While a polish runs the settings are
// said where the selects were, so the band is as high in review as it was then. The polish is read in full in the
// pane beside the conversation, which opens for the review and has the room:
// the band is for deciding, the pane for reading.
//
// The band can be minimized: its name is the button, with a chevron after it.
// Minimized, it is not drawn above the prompt box at all (the app frames
// whatever is drawn there in a box of its own, however small the thing), and a
// chip in the prompt's footer opens it again (`bandChip`). The person's last
// choice is kept for the next session (core.ts).
//
// It is made of the View core.ts reads and the controls of kit.tsx, as the
// pane is (desktop.tsx), and its controls call the same Act. The band is every
// mod's, so what the others draw there (`theirs`) is kept under this one.
import type { RenderElement } from 'claude-code'

import { kitOf } from './kit'
import type { Table } from './kit'
import { EFFORTS } from './polish'
import type { Act, Layout, Marks, View } from './view'

// The stage is this many lines high, whatever is in it.
const STAGE = 4.5
// The polish in review is cut to this many lines.
const SNIPPET_LINES = 2
// More chips than this make a tray taller than the band has room for.
const MAX_CHIPS = 15

export const desktopBand = (
  table: Table,
  view: View,
  act: Act,
  layout: Layout,
  marks: Marks,
  theirs: unknown,
): RenderElement => {
  const { Box, Button, Text } = table
  const k = kitOf(table, view, act, marks)
  const isListed = !view.isRunning && view.menu !== null

  // The name is the way to minimize the band: a chevron after it, and a click
  // anywhere on the two. Under a catcher its words are there out of sight, for
  // the keys and for what reads the tree; with no catcher the button says them.
  const name = k.control(
    'minimize-box',
    'minimize',
    [
      k.title,
      k.icon('down', 'Minimize'),
      k.isCaught ? (
        <Box key="minimize-words" width={0} overflow="hidden">
          <Button key="minimize" plain onPress={() => act.band(false)}>
            Minimize
          </Button>
        </Box>
      ) : (
        <Button key="minimize" plain onPress={() => act.band(false)}>
          Minimize ▾
        </Button>
      ),
    ],
    { columnGap: 1, paddingY: 0.5 },
  )

  // A pick folds its list, as a select's does.
  const chooseModel = (value: string) => {
    act.model(value)
    act.done()
  }
  const chooseEffort = (value: string) => {
    act.effort(value)
    act.done()
  }

  // The name at the left. At the right AUTO, and the state, which moves while
  // a polish runs: the state is always the last thing on the line.
  const head = (
    <Box
      key="band-head"
      alignItems="center"
      justifyContent="space-between"
      columnGap={2}
    >
      {name}
      <Box alignItems="center" columnGap={2} flexWrap="wrap">
        {!view.isRunning && k.toggle('auto', 'AUTO', view.isOn, act.auto)}
        {!view.isRunning &&
          k.toggle('trail', 'TRAIL', view.isTrailing, act.trail)}
        {k.status}
      </Box>
    </Box>
  )

  // Three selects fill the line, and wrap whole to the next when it is narrow.
  // While a polish runs they say what runs, in the same place and as high.
  const settings = (
    <Box
      key="band-settings"
      columnGap={1}
      rowGap={1}
      flexWrap="wrap"
      alignItems="center"
    >
      {view.isRunning && k.readout('target-now', 'Session', view.targetLabel)}
      {view.isRunning && k.readout('polisher-now', 'Polish', view.model)}
      {view.isRunning && k.readout('effort-now', 'Effort', view.effort)}
      {!view.isRunning && k.select(
        'target',
        view.targetLabel,
        view.menu === 'target',
        () => act.menu('target'),
        'Session',
      )}
      {!view.isRunning && k.select(
        'polisher',
        view.model,
        view.menu === 'polisher',
        () => act.menu('polisher'),
        'Polish',
      )}
      {!view.isRunning && k.select(
        'effort',
        view.effort,
        view.menu === 'effort',
        () => act.menu('effort'),
        'Effort',
      )}
    </Box>
  )

  // The models a tray has room for. A person with more picks one by name.
  const models = view.models.slice(0, MAX_CHIPS)
  const unlisted = view.models.length - models.length

  // The list of the one that is open, under the settings; a pick folds it.
  const list = !isListed ? null : view.menu === 'target' ? (
    <Box key="band-list" flexDirection="column" rowGap={1} alignItems="stretch">
      {k.options('target', view.targets, view.choice, act.target)}
      <Box key="guide-part" flexDirection="column" alignItems="stretch">
        {k.row('guide', `${view.guide} guide`, act.guide, {
          before: 'book',
          isOpen: view.isGuideShown,
        })}
        {view.isGuideShown && (
          <Box key="about">
            <Text dimColor wrap="wrap">
              {view.about}
            </Text>
          </Box>
        )}
      </Box>
    </Box>
  ) : view.menu === 'polisher' ? (
    <Box key="band-list" flexDirection="column" rowGap={0.5} alignItems="stretch">
      {k.options(
        'model',
        models.map(value => ({ value, label: value })),
        view.model,
        chooseModel,
      )}
      {unlisted > 0 && (
        <Box key="unlisted">
          <Text color="subtle" wrap="truncate">
            {`${unlisted} more: /polish model <name> picks any`}
          </Text>
        </Box>
      )}
    </Box>
  ) : (
    <Box key="band-list" flexDirection="column" alignItems="stretch">
      {k.options(
        'effort',
        EFFORTS.map(value => ({ value, label: value })),
        view.effort,
        chooseEffort,
      )}
    </Box>
  )

  // The one place for what is going on, and one height for it: the loading
  // mark while a polish runs, and in review the start of the polish; a retry
  // runs over a polish on show, which the mark takes the place of.
  const stage =
    isListed ||
    (!view.isRunning && view.preview === null && !view.isAnswering) ? null : (
      <Box
        key="band-stage"
        flexDirection="column"
        minHeight={STAGE}
        alignItems="stretch"
      >
        {view.isRunning
          ? k.working
          : view.isAnswering
            ? k.waiting
            : view.preview !== null &&
              k.snippet(
                'polished',
                view.preview,
                SNIPPET_LINES,
                Math.floor(layout.columns * SNIPPET_LINES * 0.8),
                k.pager,
              )}
      </Box>
    )

  // What to do now, at the left: the button that makes a polish, the three
  // answers to a polish on show, or Stop. At the right the way to read the
  // polish in full, and the record, which the pane lists. The row is always
  // there, and so is each end of it.
  const left = view.isRunning ? (
    k.stop
  ) : view.isAnswering ? null : view.preview !== null ? (
    <Box alignItems="center" columnGap={1} rowGap={1} flexWrap="wrap">
      {k.button('apply', 'Apply Polish', act.apply, {
        variant: 'primary',
        before: 'check',
        isFirst: true,
      })}
      {k.button('refresh', 'Retry Polish', act.retry, {
        variant: 'secondary',
        before: 'retry',
      })}
      {k.button('discard', 'Keep Original', act.keep, {
        variant: 'secondary',
        before: 'close',
      })}
    </Box>
  ) : (
    <Box alignItems="center" columnGap={1} rowGap={1} flexWrap="wrap">
      {k.button('polish', 'Prompt Polish', act.polish, {
        variant: 'primary',
        before: 'wand',
      })}
      {view.draft !== null &&
        k.button('restore', 'Undo Apply', act.undo, {
          variant: 'secondary',
          before: 'undo',
        })}
    </Box>
  )
  const foot = isListed ? null : (
    <Box
      key="action-row"
      alignItems="center"
      justifyContent="space-between"
      columnGap={2}
      rowGap={1}
      flexWrap="wrap"
    >
      {left}
      <Box alignItems="center" columnGap={1} flexShrink={0}>
        {view.preview !== null &&
          !view.isRunning &&
          k.button('panel', 'Full view', act.panel, { variant: 'secondary' })}
        {!view.isRunning &&
          view.preview === null &&
          k.button('sessions', 'Earlier sessions', act.sessionsPanel, {
            variant: 'secondary',
          })}
        {k.button(
          'log',
          view.lines.length === 0 ? 'History' : `History ${view.lines.length}`,
          act.history,
          { variant: 'secondary' },
        )}
      </Box>
    </Box>
  )

  return (
    <Box key="band" flexDirection="column" rowGap={1} alignItems="stretch">
      {k.card(
        'band-card',
        <Box flexDirection="column" rowGap={1} alignItems="stretch">
          {head}
          {settings}
          {list}
          {stage}
          {foot}
        </Box>,
      )}
      {theirs as RenderElement}
    </Box>
  )
}

/**
 * The band when it is minimized: one chip in the prompt's footer, among the
 * labels the engine draws there (`modes`, kept). The app draws that site as one
 * line of words and small buttons, and no drawings, so the state is a word on
 * the button and a colored dot after it. Pressing the button opens the band.
 */
export const bandChip = (
  table: Table,
  view: View,
  act: Act,
  modes: readonly string[],
): RenderElement => {
  const { Box, Button, Text } = table
  const word =
    view.phase === 'busy'
      ? 'Polishing…'
      : view.phase === 'review'
        ? 'Review'
        : 'Prompt Polish'
  const dot =
    view.phase === 'busy' ? 'claude' : view.phase === 'review' ? 'suggestion' : 'success'

  return (
    <Box key="band-chip" alignItems="center" columnGap={1}>
      <Button key="expand" plain onPress={() => act.band(true)}>
        {word}
      </Button>
      <Box key="state">
        <Text color={dot}>●</Text>
      </Box>
      {modes.length > 0 && (
        <Box key="modes">
          <Text dimColor>{modes.join(' & ')}</Text>
        </Box>
      )}
    </Box>
  )
}
