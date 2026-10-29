// The mod's entry: it hands each event to core.ts, which holds the pane's
// logic, and draws the pane with the frontend of the surface that asks, off
// the same View. The Claude desktop app has desktop.tsx; every other surface,
// the terminal and those that draw from a grid of cells like it (the VS Code
// extension, the mobile app), has terminal.tsx.
//
// A surface module is named here, by `module`, because the engine reads the
// paths of the modules from this file: a frontend is handed the elements.
import type { EngineInterface, Register, RenderElement } from 'claude-code'

import {
  actsOf,
  bandOf,
  onClose,
  onCommand,
  onFault,
  onStart,
  onSubmit,
  paneSizeOf,
  viewOf,
} from './core'
import {
  onCarried,
  onCarryOver,
  onMeasure,
  onSent,
  onSkill,
  onTurnEnd,
} from './carry'
import { bandChip, desktopBand } from './band'
import { desktopPane, onControl } from './desktop'
import { terminalPane } from './terminal'
import type { Layout, Marks } from './view'

// The pane's id, written out in this file as well as in core.ts: the matchers
// below are read from here, and `claude plugin validate` reads a literal.
const PANE = 'prompt-polish'

/**
 * The surface modules the pane or the band may draw, where the surface runs
 * them: the terminal and the desktop do. The other surfaces hold the element
 * in their tables too, and draw an empty box for it.
 */
function marksOf(
  surface: string,
  table: ReturnType<EngineInterface['ui']['resolve']>,
): Marks {
  if (!(surface === 'terminal' || surface === 'desktop') || !('Client' in table)) {
    return {}
  }

  return {
    pulse: (phase, color) => (
      <table.Client
        key="pulse"
        module="./pulse.tsx"
        props={{ kind: phase, color }}
      />
    ),
    spinner: (since, now, color) => (
      <table.Client
        key="spinner"
        module="./spinner.tsx"
        props={{ since, now, color }}
      />
    ),
    ...(surface === 'terminal'
      ? {
          bar: (width: number, color: string, dim: string) => (
            <table.Client
              key="bar"
              module="./bar.tsx"
              width={width}
              height={1}
              props={{ width, color, dim }}
            />
          ),
        }
      : {
          catcher: (key: string, rows: number) => (
            <table.Box position="absolute" top={0} bottom={0} left={0} right={0}>
              <table.Client
                key={`hit-${key}`}
                module="./hit.tsx"
                props={{ press: key, rows }}
                width="100%"
                height="100%"
              />
            </table.Box>
          ),
        }),
  }
}

export const register: Register = (on, options) => {
  on('session.start', async ($, e, next) => {
    await onStart($, options)

    return next(e)
  })

  // The command answers itself: core.ts says what, and this is the answer.
  on('command.run', { command: ['polish', 'p_polish'] }, async ($, e) => {
    try {
      return { text: (await onCommand($, e.args, options)).text }
    } catch (error) {
      // A store or a file that cannot be written is told, not left as no answer.
      return { text: `Prompt Polish could not do that: ${String(error).slice(0, 200)}` }
    }
  })

  // A prompt goes on as written, as polished, or not at all: its text is what
  // the hook answers `next` with. A hook that fails lets it go as written.
  on('prompt.submit', async ($, e, next) => {
    // The first prompt of a session: asked whether to pick up where the last
    // one stopped, before the polish, which is about this prompt alone.
    const carry = await onCarryOver($, e).catch(() => undefined)
    const answer = await onSubmit($, e, options)

    if (answer !== undefined && 'drop' in answer) {
      return answer
    }

    const sent = answer === undefined ? e : { ...e, text: answer.text }

    // The earlier trail is spent before this prompt is kept in the new one.
    const notes = await onCarried($, carry).catch(() => [])

    // The trail is the person's own, and off until they turn it on; a failure
    // to keep it never holds the prompt.
    await onSent($, sent).catch(() => undefined)

    return next(
      notes.length === 0
        ? sent
        : { ...sent, context: [...(sent.context ?? []), ...notes] },
    )
  }).catch(($, e, next) => next(e))

  // The handoff skill's prompt was expanded: the turn that follows is its.
  on('skill.prompt', async ($, e, next) => {
    await onSkill($, e.skill)

    return next(e)
  })

  // The context passed the threshold: a handoff document is offered, never
  // written unasked. The asking is detached from this hook.
  on('session.measure', async ($, e, next) => {
    await onMeasure($, e.context.percent, e.changed)

    return next(e)
  })

  // A turn of the main conversation ended: the trail, if on, takes what it
  // did. The work goes on after the hook, which only observes.
  on('turn.complete', ($, e, next) => {
    if (e.agentId === undefined) {
      void onTurnEnd($, e.answer, e.isAborted).catch(() => undefined)
    }

    return next(e)
  })

  // The person closing the pane over a preview is "keep my draft".
  on('ui.close', { id: PANE }, async ($, e, next) => {
    await onClose($, e.origin, options)

    return next(e)
  })

  // A catcher that failed would lie dead over its control. The engine draws
  // the pane again after a fault: without catchers, on its buttons alone.
  on('ui.fault', async ($, e, next) => {
    await onFault($, e.module)

    return next(e)
  })

  // A click a catcher took over one of the desktop's controls, posted by key.
  on('ui.message', async ($, e, next) => {
    await onControl($, e, options)

    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const table = $.ui.resolve(e)
    const view = await viewOf($, options)
    const layout: Layout = {
      columns: e.props.bodyColumns,
      isDocked: e.props.placement === 'dock',
      bodyRows: e.props.scroll.bodyRows,
      isFullscreen: e.viewport?.isFullscreen === true,
    }
    const marks = marksOf(e.surface, table)
    const act = actsOf($, options)

    return e.surface === 'desktop'
      ? desktopPane(table, view, act, layout, marks)
      : terminalPane(table, view, act, layout, marks)
  })

  // The band right above the prompt box is every mod's: the desktop draws it
  // there when the person's option says so, and what the others draw stays.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    // The terminal's Compact: one line here, under a survey's turn, and with
    // what the others draw kept under it.
    if (e.surface === 'terminal') {
      if (e.props.hasSurvey || (await paneSizeOf($)) !== 'compact') {
        return next(e)
      }

      const table = $.ui.resolve(e)
      const theirs = await next(e)
      const line = terminalPane(
        table,
        await viewOf($, options),
        actsOf($, options),
        {
          columns: e.props.bodyColumns,
          isDocked: false,
          bodyRows: e.props.scroll.bodyRows,
          isFullscreen: e.viewport?.isFullscreen === true,
        },
        marksOf(e.surface, table),
        'above',
      )
      const { Box } = table
      // With no survey up the engine's own drawing here is empty, yet still
      // takes a row: only what another mod drew is kept under the line.
      const isEngine =
        typeof theirs === 'object' &&
        theirs !== null &&
        'type' in theirs &&
        theirs.type === 'engine'

      return isEngine ? (
        line
      ) : (
        <Box key="prompt-polish-above" flexDirection="column">
          {line}
          {theirs as RenderElement}
        </Box>
      )
    }

    if (e.surface !== 'desktop' || (await bandOf($, options)) !== 'open') {
      return next(e)
    }

    const table = $.ui.resolve(e)
    const view = await viewOf($, options)
    const layout: Layout = {
      columns: e.props.bodyColumns,
      isDocked: false,
      bodyRows: e.props.scroll.bodyRows,
      isFullscreen: false,
    }
    const theirs = await next(e)

    return desktopBand(
      table,
      view,
      actsOf($, options),
      layout,
      marksOf(e.surface, table),
      theirs,
    )
  })

  // Minimized, the band is not drawn above the prompt box: a chip in the
  // prompt's footer, among the labels the engine draws there, opens it again.
  on('ui.render', { component: 'SessionMode' }, async ($, e, next) => {
    // The terminal's Minimize: the name in the footer, before the engine's labels.
    if (e.surface === 'terminal') {
      if ((await paneSizeOf($)) !== 'minimized') {
        return next(e)
      }

      const table = $.ui.resolve(e)
      const { Box, Text } = table

      return (
        <Box key="prompt-polish-footer" columnGap={1}>
          {terminalPane(
            table,
            await viewOf($, options),
            actsOf($, options),
            { columns: 0, isDocked: false, bodyRows: 0, isFullscreen: false },
            {},
            'footer',
          )}
          {e.props.modes.length > 0 && (
            <Text dimColor>{e.props.modes.join(' & ')}</Text>
          )}
        </Box>
      )
    }

    if (e.surface !== 'desktop' || (await bandOf($, options)) !== 'minimized') {
      return next(e)
    }

    return bandChip(
      $.ui.resolve(e),
      await viewOf($, options),
      actsOf($, options),
      e.props.modes,
    )
  })
}
