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
import type { Act, Layout, Marks, View } from './view'

export const desktopPane = (
  table: Table,
  view: View,
  act: Act,
  layout: Layout,
  marks: Marks,
): RenderElement => {
  const { Box, Text } = table
  const k = kitOf(table, view, act, marks)
  const summary = `${view.guide} · ${view.model} (${view.effort}) · AUTO ${view.isOn ? 'on' : 'off'}`

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
      {!view.isRunning && view.preview === null && (
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
                    ? 'Enter polishes first and shows you before sending.'
                    : 'Enter sends right away, with no polish.'}
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
