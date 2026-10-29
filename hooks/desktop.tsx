// The pane as the Claude desktop app draws it beside the conversation: a
// narrow panel of cards, as the app's own session panel is. The progress of
// the draft is four steps on a line; the polished prompt is the card that
// matters in review; the settings fold into a row until asked for; the
// original sits under a toggle. It is made of the View core.ts reads and the
// controls of kit.tsx, and its controls call the Act core.ts holds: no state,
// no engine call here but in `pressed`, which answers a click the catchers
// post, from this pane and from the band (band.tsx).
import type { EngineInterface, PluginOptions, RenderElement } from 'claude-code'

import { actsOf, PANE, viewOf } from './core'
import { FAINT, kitOf } from './kit'
import type { Table } from './kit'
import { agoOf } from './sessions'
import type { Act, Layout, Marks, View } from './view'

export const desktopPane = (
  table: Table,
  view: View,
  act: Act,
  layout: Layout,
  marks: Marks,
): RenderElement => {
  const { Box, Button, Text } = table
  const k = kitOf(table, view, act, marks)
  // AUTO leads: it is the one thing in the line that changes what Enter does,
  // and a narrow pane cuts the line at its end.
  const summary = `AUTO ${view.isOn ? 'on' : 'off'} · ${view.guide} · ${view.model} (${view.effort})`

  // One setting: its name over its control.
  const field = (name: string, children: JSX.Children) => (
    <Box
      key={`field-${name}`}
      flexDirection="column"
      rowGap={0.5}
      alignItems="stretch"
    >
      <Text dimColor>{name}</Text>
      {children}
    </Box>
  )

  // The head, the steps, and what to do now: the one button that makes a
  // polish, or the loading mark while it runs. In review the card under
  // holds the answers.
  const statusCard = k.card(
    'status-card',
    <Box flexDirection="column" rowGap={1.5} alignItems="stretch">
      <Box
        key="head"
        alignItems="center"
        justifyContent="space-between"
        columnGap={2}
      >
        {k.title}
        {k.status}
      </Box>
      {k.stepper()}
      {view.isRunning && k.loader}
      {view.isAnswering && !view.isRunning && k.waiting}
      {!view.isRunning && !view.isAnswering && view.preview === null && (
        <Box
          key="action-row"
          flexDirection="column"
          rowGap={1}
          alignItems="stretch"
        >
          {k.button('polish', 'Prompt Polish', act.polish, {
            variant: 'primary',
            before: 'wand',
            isGrown: true,
          })}
          {view.draft !== null &&
            k.button('restore', 'Undo Apply', act.undo, {
              variant: 'secondary',
              before: 'undo',
            })}
        </Box>
      )}
    </Box>,
  )

  // The polish on show, with its versions, the draft it was made from under a
  // toggle, and the answers: apply it, make another, or keep the draft. A
  // retry runs over it, and it stays.
  const reviewCard =
    view.preview === null
      ? null
      : k.card(
          'review-card',
          <Box flexDirection="column" rowGap={1} alignItems="stretch">
            {k.pager !== null && (
              <Box key="pager-row" justifyContent="flex-end">
                {k.pager}
              </Box>
            )}
            {k.words('polished', view.preview, true, 'Polished prompt')}
            {k.row(
              'original-toggle',
              view.isOriginalShown
                ? 'Hide original'
                : `Show original · ${k.chars(view.draft ?? '')}`,
              act.original,
              { isOpen: view.isOriginalShown },
            )}
            {view.isOriginalShown &&
              k.words('original', view.draft ?? '', false, 'Original prompt')}
            {!view.isRunning && (
              <Box
                key="action-row"
                flexDirection="column"
                rowGap={1}
                alignItems="stretch"
              >
                {k.button('apply', 'Apply Polish', act.apply, {
                  variant: 'primary',
                  before: 'check',
                  isFirst: true,
                  isGrown: true,
                })}
                <Box columnGap={1} rowGap={1} flexWrap="wrap">
                  {k.button('refresh', 'Retry Polish', act.retry, {
                    variant: 'secondary',
                    before: 'retry',
                    isGrown: true,
                  })}
                  {k.button('discard', 'Keep Original', act.keep, {
                    variant: 'secondary',
                    before: 'close',
                    isGrown: true,
                  })}
                </Box>
              </Box>
            )}
          </Box>,
        )

  // The settings, folded to a row that says them in a line and opens them: the
  // switch, who the prompt is for, who polishes and how hard, and the guide.
  const settingsCard = view.isRunning
    ? null
    : k.card(
        'settings-card',
        <Box flexDirection="column" rowGap={1} alignItems="stretch">
          {k.row('setup', 'Settings', act.setup, {
            isOpen: view.isSetupShown,
            ...(view.isSetupShown ? {} : { hint: summary }),
          })}
          {view.isSetupShown && (
            <Box
              key="settings"
              flexDirection="column"
              rowGap={1.5}
              alignItems="stretch"
            >
              <Box key="auto-part" flexDirection="column" alignItems="stretch">
                {k.toggle('auto', 'AUTO', view.isOn, act.auto)}
                <Text color={FAINT} wrap="wrap">
                  {view.isOn
                    ? 'Enter polishes first and asks you before sending.'
                    : 'Enter sends right away, with no polish.'}
                </Text>
              </Box>
              <Box key="trail-part" flexDirection="column" alignItems="stretch">
                {k.toggle('trail', 'TRAIL', view.isTrailing, act.trail)}
                <Text color={FAINT} wrap="wrap">
                  {view.isTrailing
                    ? 'Keeps your recent prompts on this computer, so a new session can pick up from them. It asks first.'
                    : 'Off. Turn it on to let a new session pick up from this one.'}
                </Text>
              </Box>
              {field(
                'Session model',
                <Box flexDirection="column" rowGap={0.5} alignItems="stretch">
                  {k.select('target', view.targetLabel, view.menu === 'target', () =>
                    act.menu('target'),
                  )}
                  {view.menu === 'target' &&
                    k.options('target', view.targets, view.choice, act.target)}
                </Box>,
              )}
              {field(
                'Polish model',
                <Box flexDirection="column" rowGap={0.5} alignItems="stretch">
                  {k.select('polisher', view.model, view.menu === 'polisher', () =>
                    act.menu('polisher'),
                  )}
                  {view.menu === 'polisher' &&
                    k.options(
                      'model',
                      view.models.map(value => ({ value, label: value })),
                      view.model,
                      value => {
                        act.model(value)
                        act.done()
                      },
                    )}
                </Box>,
              )}
              {field('Effort', k.segments(view.effort))}
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
          )}
        </Box>,
      )

  // The earlier sessions of this project, to pick one up from: a row that opens
  // the list, the last day or up to a week, and a session opened for a closer
  // look with a button to hand it over to this one.
  const sx = view.sessions
  // Not while a polish runs or waits on an answer: the card is for picking up
  // an earlier session, and it would only crowd the choice at hand.
  const sessionsCard =
    view.isRunning || view.isAnswering || view.preview !== null
    ? null
    : k.card(
        'sessions-card',
        <Box flexDirection="column" rowGap={1} alignItems="stretch">
          {k.row('sessions', 'Pick up an earlier session', act.sessions, {
            isOpen: sx.isOpen,
            ...(!sx.isOpen && sx.done.length > 0
              ? { hint: `✓ ${sx.done.length} handed over` }
              : {}),
          })}
          {sx.isOpen && (
            <Box
              key="sessions-body"
              flexDirection="column"
              rowGap={1}
              alignItems="stretch"
            >
              {sx.done.length > 0 && (
                <Text key="sessions-done" color="success" wrap="wrap">
                  {`✓ Handed over ${sx.done
                    .map(entry => `“${entry.title.length > 28 ? `${entry.title.slice(0, 28)}…` : entry.title}”`)
                    .join(', ')}. The model reads it with your next prompt.`}
                </Text>
              )}
              {k.segmented(
                'range',
                [
                  { value: 'day', label: 'Last 24 hours' },
                  { value: 'week', label: 'Up to 7 days' },
                ],
                sx.range,
                value => act.sessionsRange(value === 'week' ? 'week' : 'day'),
              )}
              {sx.isLoading && (
                <Text key="sessions-loading" color={FAINT}>
                  Reading the sessions…
                </Text>
              )}
              {!sx.isLoading && sx.rows !== null && sx.rows.length === 0 && (
                <Text key="sessions-none" color={FAINT} wrap="wrap">
                  {sx.range === 'day'
                    ? 'No earlier session in the last 24 hours. Try up to 7 days.'
                    : 'No earlier session in the last 7 days.'}
                </Text>
              )}
              {!sx.isLoading &&
                (sx.rows ?? []).map(row => {
                  const isPicked = sx.picked === row.id
                  const isDone = sx.done.some(entry => entry.id === row.id)
                  const counts = [
                    row.files > 0
                      ? `${row.files} ${row.files === 1 ? 'file' : 'files'}`
                      : '',
                    row.hasHandoff ? 'handoff' : '',
                  ]
                    .filter(part => part !== '')
                    .join(' · ')

                  return (
                    <Box
                      key={`session-${row.id}-item`}
                      flexDirection="column"
                      rowGap={0.5}
                      alignItems="stretch"
                    >
                      {k.control(
                        `session-${row.id}-box`,
                        `session-${row.id}`,
                        // Two lines, so that sessions of one title can be told apart
                        // without opening each: the title, and under it when it was,
                        // what it changed and what was last asked.
                        <Box
                          key="lines"
                          flexDirection="column"
                          flexGrow={1}
                          flexShrink={1}
                          overflow="hidden"
                          alignItems="stretch"
                        >
                          <Box key="title" overflow="hidden">
                            <Button
                              key={`session-${row.id}`}
                              plain
                              onPress={() => act.sessionPick(row.id)}
                            >
                              {`${isPicked ? '▾' : '▸'} ${row.title}${isDone ? ' ✓' : ''}`}
                            </Button>
                          </Box>
                          <Box key="detail" paddingLeft={2} overflow="hidden">
                            <Text color={FAINT} wrap="truncate">
                              {[
                                agoOf(sx.now, row.at),
                                counts,
                                // Opened, the whole of it is said just below.
                                !isPicked && row.last !== '' && row.last !== row.title
                                  ? row.last
                                  : '',
                              ]
                                .filter(part => part !== '')
                                .join(' · ')}
                            </Text>
                          </Box>
                        </Box>,
                        { paddingY: 0.5 },
                        3,
                      )}
                      {isPicked && (
                        <Box
                          key={`session-${row.id}-detail`}
                          flexDirection="column"
                          rowGap={1}
                          alignItems="stretch"
                          paddingLeft={2}
                        >
                          {row.last !== '' && (
                            <Text color={FAINT} wrap="wrap">
                              {`Last prompt: ${row.last}`}
                            </Text>
                          )}
                          {row.hasHandoff &&
                            k.segmented(
                              'kind',
                              [
                                { value: 'notes', label: 'Notes' },
                                { value: 'handoff', label: 'Handoff document' },
                              ],
                              sx.kind,
                              value => act.sessionKind(value === 'handoff' ? 'handoff' : 'notes'),
                            )}
                          <Box key="take-row">
                            {k.button(
                              'session-take',
                              isDone ? 'Hand over again' : 'Hand over to this session',
                              act.sessionTake,
                              { variant: 'primary' },
                            )}
                          </Box>
                          <Text key="take-note" color={FAINT} wrap="wrap">
                            The model reads it with your next prompt. Keys and personal details are masked.
                          </Text>
                        </Box>
                      )}
                    </Box>
                  )
                })}
            </Box>
          )}
        </Box>,
      )

  return (
    <Box
      key="pane"
      flexDirection="column"
      rowGap={1}
      alignItems="stretch"
      {...(layout.isDocked ? { minHeight: Math.max(1, layout.bodyRows) } : {})}
    >
      {statusCard}
      {reviewCard}
      {settingsCard}
      {sessionsCard}
      {layout.isDocked && <Box key="spacer" flexGrow={1} />}
      {k.card('history-card', k.history)}
    </Box>
  )
}

/** The key a catcher posted (hit.tsx), when the post is one. */
function pressOf(data: unknown): string | undefined {
  return typeof data === 'object' &&
    data !== null &&
    'press' in data &&
    typeof data.press === 'string'
    ? data.press
    : undefined
}

/**
 * Does what the control keyed `key` does, when the pane or band as it stands
 * draws that control. A catcher's post is input from the app, and may name a
 * control a redraw has taken away since the click began. The band keeps its
 * settings in view; the pane folds them under its Settings row.
 */
async function pressed(
  $: EngineInterface,
  options: PluginOptions,
  key: string,
  isBand: boolean,
): Promise<void> {
  const view = await viewOf($, options)
  const act = actsOf($, options)

  // Drawn in every state: the record. The band has no list of it: it opens the pane.
  if (key === 'log') {
    return isBand ? act.history() : act.log()
  }

  // The band's own two, drawn in every state: minimizing it, and opening it again.
  if (isBand && (key === 'minimize' || key === 'expand')) {
    return act.band(key === 'expand')
  }

  // While a polish runs the settings and the working row are gone, and so is the list of sessions.
  if (!view.isRunning && key === 'sessions') {
    return isBand ? act.sessionsPanel() : act.sessions()
  }

  if (!isBand && !view.isRunning && view.sessions.isOpen) {
    const sx = view.sessions

    if (key === 'range-day' || key === 'range-week') {
      return act.sessionsRange(key === 'range-day' ? 'day' : 'week')
    }

    if (key === 'session-take') {
      return sx.picked === null ? undefined : act.sessionTake()
    }

    if (key === 'kind-notes' || key === 'kind-handoff') {
      return sx.picked === null ? undefined : act.sessionKind(key === 'kind-notes' ? 'notes' : 'handoff')
    }

    if (key.startsWith('session-')) {
      const id = key.slice('session-'.length)

      return sx.rows?.some(row => row.id === id) === true ? act.sessionPick(id) : undefined
    }
  }

  // While a polish runs the settings and the working row are gone.
  if (view.isRunning) {
    return key === 'cancel' ? act.stop() : undefined
  }

  if (key === 'setup') {
    return isBand ? undefined : act.setup()
  }

  // The band's way to read the polish in full.
  if (key === 'panel') {
    return isBand && view.preview !== null ? act.panel() : undefined
  }

  // The settings the pane has once opened, and the band always has.
  const hasSettings = isBand || view.isSetupShown

  if (hasSettings) {
    if (key === 'auto') {
      return act.auto()
    }

    if (key === 'trail') {
      return act.trail()
    }

    if (key === 'target' || key === 'polisher' || (isBand && key === 'effort')) {
      return act.menu(key)
    }

    if (view.menu === 'target' && key.startsWith('target-')) {
      return act.target(key.slice('target-'.length))
    }

    // The band has the guide under the list of the session models.
    if (key === 'guide' && (!isBand || view.menu === 'target')) {
      return act.guide()
    }

    // The pane has the efforts always in view, as segments; the band has them
    // in a list of their own, which a pick folds.
    if (key.startsWith('effort-') && (!isBand || view.menu === 'effort')) {
      act.effort(key.slice('effort-'.length))

      return isBand ? act.done() : undefined
    }

    // A model picked folds its list.
    if (view.menu === 'polisher' && key.startsWith('model-')) {
      const name = key.slice('model-'.length)

      if (view.models.includes(name)) {
        act.model(name)

        return act.done()
      }
    }
  }

  if (view.preview === null) {
    return key === 'polish'
      ? act.polish()
      : key === 'restore'
        ? act.undo()
        : undefined
  }

  switch (key) {
    case 'apply':
      return act.apply()
    case 'refresh':
      return act.retry()
    case 'discard':
      return act.keep()
    case 'older':
      return act.step(-1)
    case 'newer':
      return act.step(1)
    case 'original-toggle':
      return isBand ? undefined : act.original()
    default:
      return undefined
  }
}

/** A click a catcher took over one of the controls, posted by key. */
export async function onControl(
  $: EngineInterface,
  e: { requestId: string; module: string; data: unknown },
  options: PluginOptions,
): Promise<void> {
  const key = e.module.endsWith('hit.tsx') ? pressOf(e.data) : undefined

  if (key !== undefined) {
    await pressed($, options, key, e.requestId !== PANE)
  }
}
