// The mod's entry: it hands each event to core.ts, which holds the pane's
// logic, and draws the pane with the frontend of the surface that asks, off
// the same View. The Claude desktop app has desktop.tsx; every other surface,
// the terminal and those that draw from a grid of cells like it (the VS Code
// extension, the mobile app), has terminal.tsx.
//
// A surface module is named here, by `module`, because the engine reads the
// paths of the modules from this file: a frontend is handed the elements.
import type { EngineInterface, Register } from 'claude-code'

import {
  actsOf,
  isBandOn,
  onClose,
  onCommand,
  onFault,
  onStart,
  onSubmit,
  viewOf,
} from './core'
import { desktopBand } from './band'
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
  on('command.run', { command: ['polish', 'p_polish'] }, async ($, e) => ({
    text: (await onCommand($, e.args, options)).text,
  }))

  on('prompt.submit', async ($, e, next) => {
    const held = await onSubmit($, e, options)

    return held ?? next(e)
  }).catch(($, e, next) => next(e))

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
    if (e.surface !== 'desktop' || !(await isBandOn($, options))) {
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
}
