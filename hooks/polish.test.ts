import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

import { GUIDES } from './guides'
import { easyOf } from './polish'
import { answerOf, isReadable, mapOf, mentionedIn, pathsOf } from './project'

const DRAFT = '로그인 버그 좀 고쳐줄 수 있어? think step by step'
const POLISHED = '로그인 버그를 고쳐줘. 완료 기준: 로그인 테스트 통과.'
const AGAIN = '로그인 버그를 고치고, 로그인 테스트가 통과하면 보고해줘.'
const USER = { kind: 'composer' } as const
const ROOT = '/repo'

type World = {
  clock: ReturnType<typeof mock.clock>
  delay: number
  statuses: (string | undefined)[]
  models: string[]
  efforts: string[]
  isOpen: boolean
  opens: number
  commands: string[]
  isAsked: boolean
  box: string
  systems: string[]
  prompts: string[]
  reply: string | null
  /** The project on disk: each file's path under the root, and its text. */
  files: Record<string, string>
  /** How many times the project's files were listed. */
  lists: number
  /** The surfaces the session draws on. */
  surfaces: ('terminal' | 'desktop')[]
  /** The prompts that went to the session. */
  sent: string[]
}

/**
 * The engine beneath the mod: a prompt box, a session model and a polishing
 * model answering `reply` (null: an API error), in memory.
 */
const world = (on: On, model = 'claude-opus-5-5'): World => {
  const state: World = {
    clock: mock.clock(on),
    delay: 0,
    statuses: [],
    isOpen: false,
    opens: 0,
    commands: [],
    models: [],
    efforts: [],
    isAsked: false,
    box: '',
    systems: [],
    prompts: [],
    reply: POLISHED,
    files: {
      'CLAUDE.md': '커밋 메시지는 영어로 쓴다.',
      'package.json': '{ "name": "shop", "dependencies": { "next": "15" } }',
      'auth/login.ts': 'export const login = () => refresh()',
      'auth/session.ts': 'export const refresh = () => {}',
      '.env': 'TOKEN=hunter2',
    },
    lists: 0,
    surfaces: ['terminal'],
    sent: [],
  }

  mock.store(on)
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.surfaces', () => ({ value: state.surfaces }))
  on('session.model', () => ({ value: model }))
  on('session.messages', () => ({
    value: [
      { role: 'user', text: 'auth/login.ts를 살펴봐줘', toolUses: [] },
      { role: 'assistant', text: '', toolUses: [] },
      { role: 'assistant', text: '세션 토큰 갱신에 문제가 있습니다.', toolUses: [] },
    ],
  }))
  on('session.root', () => ({ value: ROOT }))
  on('process.run', () => {
    state.lists += 1

    return {
      value: {
        exitCode: 0,
        stdout: Object.keys(state.files).join('\n'),
        stderr: '',
        isStdoutTruncated: false,
        isStderrTruncated: false,
      },
    }
  })
  on('fs.read', (_, e) => {
    // The engine hands over the path as the host spells it.
    const path = e.path.replaceAll('\\', '/')
    const text = state.files[path.slice(path.indexOf(`${ROOT}/`) + ROOT.length + 1)]

    if (text === undefined) {
      throw new Error(`ENOENT: ${e.path}`)
    }

    return { value: text }
  })
  on('fs.list', () => ({ value: [] }))
  on('ui.open', (_, e) => {
    state.isOpen = true
    state.opens += 1
    state.isAsked = e.focus === true

    return { value: { isPlaced: true } }
  })
  on('ui.close', () => {
    state.isOpen = false

    return { value: undefined }
  })
  on('config.list', () => ({
    value: [
      {
        key: 'model',
        label: 'Model',
        kind: 'choice',
        value: 'opus',
        options: ['opus', 'sonnet', 'haiku'],
        provider: { plugin: 'engine', tier: 'core' },
        isLocked: false,
      },
    ],
  }))
  on('ui.toast', () => ({ value: undefined }))
  // What Claude Code draws in the band when no mod does: a reference to its own.
  on('ui.render', (_, e) => (e.component === 'AbovePrompt' ? { type: 'engine', ref: 1 } : undefined))
  on('ui.status', (_, e) => {
    state.statuses.push(e.text)

    return { value: undefined }
  })
  on('ui.panes', () => ({
    value: state.isOpen
      ? [
          {
            id: 'prompt-polish',
            title: 'Prompt Polish',
            isShown: true,
            isFocused: false,
            isPlaced: true,
          },
        ]
      : [],
  }))
  on('command.register', (_, e) => {
    state.commands.push(e.name)

    return { value: { command: e.name } }
  })
  on('prompt.read', () => ({
    value: { text: state.box, cursor: state.box.length },
  }))
  on('prompt.fill', (_, e) => {
    state.box = e.text

    return { isFilled: true }
  })
  on('prompt.submit', (_, e) => {
    state.sent.push(e.text)
    state.box = ''

    return { text: e.text }
  })
  on('model.complete', async (_, e) => {
    state.systems.push(e.system ?? '')
    state.models.push(e.model)
    state.efforts.push(e.effort ?? '')
    state.prompts.push(e.prompt)

    if (state.delay > 0) {
      await state.clock.sleep(state.delay)
    }

    const usage = {
      input_tokens: 0,
      output_tokens: 0,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
    }

    return {
      value:
        state.reply === null
          ? {
              isAnswered: false,
              reason: 'api-error',
              status: 500,
              error: 'server_error',
              usage,
            }
          : { isAnswered: true, text: state.reply, usage },
    }
  })

  return state
}

const PANE = {
  plugin: 'prompt-polish',
  component: 'Pane',
  requestId: 'prompt-polish',
  props: {
    title: 'Prompt Polish',
    isFocused: true,
    bodyColumns: 66,
    scroll: { offset: 0, bodyRows: 30 },
    view: {},
  },
} as const

const DOCKED = {
  ...PANE,
  surface: 'terminal',
  props: { ...PANE.props, placement: 'dock' },
} as const

type Tree = { type?: string; props?: Record<string, unknown>; children?: Tree[] }

/** The keys of a drawn tree, in the order drawn. */
const keysIn = (node: Tree | undefined): string[] =>
  node === undefined
    ? []
    : [
        ...(typeof node.props?.key === 'string' ? [node.props.key] : []),
        ...(node.children ?? []).flatMap(keysIn),
      ]

/**
 * The keys of a drawn tree less those of its catchers: the surface modules
 * laid over the desktop's controls where a surface runs them.
 */
const ownKeysIn = (node: Tree | undefined): string[] =>
  keysIn(node).filter(key => !key.startsWith('hit-'))

/** The color block a button is drawn as: the Text inside it. */
const blockOf = (button: unknown): Tree | undefined =>
  ((button as Tree | undefined)?.children ?? [])[0]

type Finder = {
  find: (query: { key: string }) => Promise<{ text: string } | undefined>
}

/**
 * Which way a toggle's mark points: the chevron drawn beside its button
 * where a catcher lies over the two, and elsewhere the triangle its words
 * end in.
 */
const pointingOf = async (
  ui: Finder,
  key: string,
): Promise<'down' | 'up' | 'right' | undefined> => {
  const set = (await ui.find({ key: `${key}-box` })) as Tree | undefined
  const drawn = (set?.children ?? []).map(child => String(child.props?.source ?? ''))

  if (drawn.some(source => source.includes('m6 9 6 6 6-6'))) {
    return 'down'
  }

  if (drawn.some(source => source.includes('m18 15-6-6-6 6'))) {
    return 'up'
  }

  if (drawn.some(source => source.includes('m9 18 6-6-6-6'))) {
    return 'right'
  }

  const words = (await ui.find({ key }))?.text.trim() ?? ''

  return /[▾▼]$/.test(words) ? 'down' : /[▴▲]$/.test(words) ? 'up' : undefined
}

/** A toggle's words, less the triangle they end in where it is no drawing. */
const wordsOf = async (ui: Finder, key: string): Promise<string | undefined> =>
  (await ui.find({ key }))?.text.replace(/ [▾▴]$/, '')

test('the pane previews a polish and changes the box only on Apply', async ($, on) => {
  const state = world(on)

  for (const surface of ['terminal', 'desktop'] as const) {
    state.box = DRAFT
    const ui = await $.ui.mount({ ...DOCKED, surface })

    expect((await ui.find({ key: 'polish' }))?.text).toContain('Prompt Polish')
    // On the grid a button says the whole of it; on the desktop the row names
    // the setting and the button holds its value, in the settings the line
    // above them opens.
    if (surface === 'desktop') {
      await ui.press({ key: 'setup' })
    }
    expect((await ui.find({ key: 'auto' }))?.text.trim()).toBe(
      surface === 'terminal' ? 'AUTO ON' : 'AUTO',
    )
    expect((await ui.find({ key: 'target' }))?.text).toContain('Opus 5.5 (Detected)')
    expect(await ui.find({ key: 'apply' })).toBeUndefined()

    await ui.press({ key: 'polish' })
    expect(state.box).toBe(DRAFT)
    expect(state.isAsked).toBe(true)
    expect((await ui.find({ key: 'apply' }))?.text).toContain('Apply Polish')
    expect(await ui.find({ key: 'polish' })).toBeUndefined()
    expect(state.prompts.at(-1)).toContain(
      '<last_answer>\n세션 토큰 갱신에 문제가 있습니다.\n</last_answer>',
    )
    expect(state.prompts.at(-1)).not.toContain('auth/login.ts를 살펴봐줘')
    expect(state.prompts.at(-1)).not.toContain('<rejected>')

    state.reply = AGAIN
    await ui.press({ key: 'refresh' })
    expect(state.box).toBe(DRAFT)
    expect(state.prompts.at(-1)).toContain(`<draft>\n${DRAFT}\n</draft>`)
    expect(state.prompts.at(-1)).toContain(
      `<rejected>\n${POLISHED}\n</rejected>`,
    )
    state.reply = POLISHED

    await ui.press({ key: 'apply' })
    expect(state.box).toBe(AGAIN)
    expect(state.isOpen).toBe(true)
    expect(state.isAsked).toBe(false)
    expect(await ui.find({ key: 'apply' })).toBeUndefined()

    await ui.press({ key: 'restore' })
    expect(state.box).toBe(DRAFT)
    expect(await ui.find({ key: 'restore' })).toBeUndefined()

    await ui.unmount()
  }
})

test('Keep drops the preview and leaves the draft', async ($, on) => {
  const state = world(on)
  state.box = DRAFT
  const ui = await $.ui.mount(DOCKED)

  await ui.press({ key: 'polish' })
  await ui.press({ key: 'discard' })

  expect(state.box).toBe(DRAFT)
  expect(await ui.find({ key: 'apply' })).toBeUndefined()
  expect(await ui.find({ key: 'restore' })).toBeUndefined()
  expect(await ui.find({ key: 'polish' })).toBeDefined()
})

test('a failed or unchanged polish shows no preview', async ($, on) => {
  const state = world(on)
  state.box = DRAFT
  const ui = await $.ui.mount(DOCKED)

  state.reply = null
  await ui.press({ key: 'polish' })
  expect(state.box).toBe(DRAFT)
  expect(await ui.find({ key: 'apply' })).toBeUndefined()

  state.reply = DRAFT
  await ui.press({ key: 'polish' })
  expect(await ui.find({ key: 'apply' })).toBeUndefined()
})

test('the model the prompt is for is picked from a list', async ($, on) => {
  const state = world(on, 'claude-sonnet-5-5')
  state.box = DRAFT

  const ui = await $.ui.mount(DOCKED)

  // "Auto" follows the session's model.
  expect((await ui.find({ key: 'target' }))?.text).toContain('Session Model : Sonnet 5.5 (Detected)')
  expect(await pointingOf(ui, 'target')).toBe('down')
  expect(await ui.find({ key: 'target-auto' })).toBeUndefined()
  await ui.press({ key: 'polish' })
  expect(state.systems.at(-1)).toContain('Claude Sonnet 5.5')

  // A press opens the list: "auto" and the four guides, each a button a
  // click presses, and Tab then Enter. The one in use has the cursor and the tick.
  await ui.press({ key: 'target' })
  expect(await pointingOf(ui, 'target')).toBe('up')
  const rows = [
    ['target-auto', '> Sonnet 5.5 (Detected) ✓'],
    ['target-opus-5.5', 'Opus 5.5'],
    ['target-sonnet-5.5', 'Sonnet 5.5'],
    ['target-gpt-6-astra', 'GPT-6 Astra'],
    ['target-gpt-5.6', 'GPT-5.6'],
  ] as const

  for (const [key, label] of rows) {
    const row = await ui.find({ key })
    expect(row?.type).toBe('Button')
    expect(row?.text).toContain(label)
    expect(row?.props.hotkey).toBeUndefined()
  }

  // A pick takes, and closes the list.
  await ui.press({ key: 'target-gpt-6-astra' })
  expect((await ui.find({ key: 'target' }))?.text).toContain('Session Model : GPT-6 Astra')
  expect(await pointingOf(ui, 'target')).toBe('down')
  expect(await ui.find({ key: 'target-auto' })).toBeUndefined()

  // Opened again, "auto" still names the model it would detect, not the pick.
  await ui.press({ key: 'target' })
  expect((await ui.find({ key: 'target-auto' }))?.text).toContain('Sonnet 5.5 (Detected)')
  expect((await ui.find({ key: 'target-gpt-6-astra' }))?.text).toContain('GPT-6 Astra')
  await ui.press({ key: 'target' })
  await ui.press({ key: 'refresh' })
  expect(state.systems.at(-1)).toContain('GPT-6 Astra')

  // Opening another list closes this one; pressed again, a list closes unpicked.
  await ui.press({ key: 'target' })
  await ui.press({ key: 'polisher' })
  expect(await ui.find({ key: 'target-auto' })).toBeUndefined()
  expect(await ui.find({ key: 'model-sonnet' })).toBeDefined()
  await ui.press({ key: 'polisher' })
  expect(await ui.find({ key: 'model-sonnet' })).toBeUndefined()
  expect((await ui.find({ key: 'target' }))?.text).toContain('GPT-6 Astra')

  await ui.press({ key: 'target' })
  await ui.press({ key: 'target-auto' })
  expect((await ui.find({ key: 'target' }))?.text).toContain('Sonnet 5.5 (Detected)')
  await ui.press({ key: 'discard' })
  await ui.unmount()
})

test('auto mode holds a prompt back for its preview, then lets it go', async ($, on) => {
  const state = world(on)
  const submit = (text: string) =>
    $.prompt.submit({ text, wait: false, origin: USER })

  // The hold is answered at once, and the polish runs on after it.
  const later = () => state.clock.advance(0)
  const held = await submit(DRAFT)
  expect(held.drop).toContain('Held to polish first')
  await later()
  expect(state.isAsked).toBe(true)

  const dialog = await $.ui.mount({
    ...PANE,
    surface: 'terminal',
    props: { ...PANE.props, bodyColumns: 100, placement: 'inline' },
  })
  expect((await dialog.find({ key: 'apply' }))?.text).toContain('Apply Polish')
  await dialog.press({ key: 'discard' })
  expect(state.box).toBe(DRAFT)
  expect(state.isAsked).toBe(false)
  expect(await dialog.find({ key: 'polish' })).toBeDefined()
  expect((await submit(state.box)).text).toBe(DRAFT)

  expect((await submit(DRAFT)).drop).toBeDefined()
  await later()
  await dialog.press({ key: 'apply' })
  expect(state.box).toBe(POLISHED)
  expect((await submit(state.box)).text).toBe(POLISHED)
  expect(await dialog.find({ key: 'restore' })).toBeUndefined()

  expect((await submit('/compact 지금까지의 대화를 요약해줘')).text).toContain('/compact')
  expect((await submit('고마워')).text).toBe('고마워')

  const notice = await $.prompt.submit({
    text: '백그라운드 작업이 끝났다는 알림 본문입니다.',
    wait: false,
    origin: { kind: 'task-notification' },
  })
  expect(notice.text).toContain('알림 본문')

  // A polish that failed sends the prompt as it was written.
  state.reply = null
  state.sent = []
  expect((await submit(DRAFT)).drop).toBeDefined()
  await later()
  expect(state.sent).toEqual([DRAFT])

  // One that is stopped does not: the prompt is back in the box, unsent.
  state.reply = POLISHED
  state.delay = 1000
  state.sent = []
  expect((await submit(DRAFT)).drop).toBeDefined()
  await later()
  // A second Enter while it runs is held too, and starts no polish of its own.
  const calls = state.prompts.length
  expect((await submit(DRAFT)).drop).toContain('Still polishing')
  await later()
  expect(state.prompts.length).toBe(calls)
  await dialog.press({ key: 'cancel' })
  await state.clock.advance(1000)
  state.delay = 0
  expect(state.sent).toEqual([])
  expect(await dialog.find({ key: 'apply' })).toBeUndefined()

  state.reply = POLISHED
  await dialog.press({ key: 'auto' })
  expect((await dialog.find({ key: 'auto' }))?.text).toContain('AUTO OFF')
  expect((await submit(DRAFT)).text).toBe(DRAFT)
  expect(state.sent.at(-1)).toBe(DRAFT)
})

test('sending the prompt settles it: the preview closes', async ($, on) => {
  const state = world(on)
  state.box = DRAFT
  const ui = await $.ui.mount(DOCKED)

  await ui.press({ key: 'polish' })
  expect(await ui.find({ key: 'refresh' })).toBeDefined()

  await $.prompt.submit({ text: state.box, wait: false, origin: USER })
  expect(await ui.find({ key: 'refresh' })).toBeUndefined()
  expect(await ui.find({ key: 'polish' })).toBeDefined()
})

test('the terminal draws nothing above the prompt, and the pane shows no counts', async ($, on) => {
  const state = world(on)
  state.box = DRAFT

  // The terminal's band is Claude Code's own: the mod's hook passes it on.
  const band = await $.ui.mount({
    plugin: 'prompt-polish',
    component: 'AbovePrompt',
    surface: 'terminal',
    props: {
      hasSurvey: false,
      isWorking: false,
      maxRows: 10,
      bodyColumns: 100,
      scroll: { offset: 0, bodyRows: 10 },
      view: {},
    },
  })

  expect(await band.find({ key: 'band' })).toBeUndefined()
  expect(await band.find({ text: /Prompt Polish/ })).toBeUndefined()
  await band.unmount()

  for (const placement of ['dock', 'inline'] as const) {
    const pane = await $.ui.mount({
      ...PANE,
      surface: 'terminal',
      props: { ...PANE.props, placement },
    })

    await pane.press({ key: 'polish' })
    await pane.press({ key: 'apply' })
    state.box = DRAFT
    await pane.press({ key: 'polish' })
    await pane.press({ key: 'discard' })

    expect(await pane.find({ text: /다듬음 \d/ })).toBeUndefined()
    expect(await pane.find({ text: /적용 \d/ })).toBeUndefined()
    expect(await pane.find({ text: /원문 유지 \d/ })).toBeUndefined()
    await pane.unmount()
  }
})

test('/polish does what the band did: polish, switch auto, pick the model', async ($, on) => {
  const state = world(on)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  const run = (args: string) =>
    $.command.run({
      command: 'polish',
      args,
      origin: USER,
      presentation: { isFullscreen: false, columns: 100 },
    })

  expect((await run(DRAFT)).text).toContain('Polished for Opus 5.5')
  expect(state.box).toBe('')

  const ui = await $.ui.mount(DOCKED)
  await ui.press({ key: 'apply' })
  expect(state.box).toBe(POLISHED)

  expect((await run('auto')).text).toContain('AUTO: OFF')
  expect((await ui.find({ key: 'auto' }))?.text).toContain('AUTO OFF')
  expect((await run('auto')).text).toContain('AUTO: ON')

  expect((await run('target')).text).toContain('Opus 5.5 (Detected)')
  expect((await run('target')).text).toContain('auto, opus-5.5, sonnet-5.5, gpt-6-astra, gpt-5.6')
  expect((await run('target gpt-5.6')).text).toContain('Session Model: GPT-5.6')
  expect((await ui.find({ key: 'target' }))?.text).toContain('GPT-5.6')
  expect((await run('target gpt-9')).text).toContain('is not an option')
  expect((await ui.find({ key: 'target' }))?.text).toContain('GPT-5.6')
  expect((await run('target auto')).text).toContain('Opus 5.5 (Detected)')
})

test('the pane draws docked and inline, idle and in review, on every surface', async ($, on) => {
  const state = world(on)
  state.box = DRAFT

  for (const surface of ['terminal', 'desktop', 'vscode', 'mobile'] as const) {
    for (const placement of ['dock', 'inline'] as const) {
      for (const bodyColumns of [40, 66, 120]) {
        const pane = await $.ui.mount({
          ...PANE,
          surface,
          props: { ...PANE.props, isFocused: false, bodyColumns, placement },
        })

        // The desktop folds AUTO into its settings, a line it opens.
        expect(await pane.find({ key: surface === 'desktop' ? 'setup' : 'auto' })).toBeDefined()
        await pane.press({ key: 'polish' })
        expect(await pane.find({ key: 'apply' })).toBeDefined()
        expect(await pane.find({ key: 'refresh' })).toBeDefined()
        await pane.press({ key: 'discard' })
        expect(await pane.find({ key: 'apply' })).toBeUndefined()
        expect(state.box).toBe(DRAFT)
        await pane.unmount()
      }
    }
  }
})

test('the model and effort picked are the ones that polish', async ($, on) => {
  const state = world(on)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  const run = (args: string) =>
    $.command.run({
      command: 'polish',
      args,
      origin: USER,
      presentation: { isFullscreen: false, columns: 100 },
    })

  expect((await run('model')).text).toContain('opus, sonnet, haiku')
  await run(DRAFT)
  expect(state.models.at(-1)).toBe('sonnet')
  expect(state.efforts.at(-1)).toBe('low')

  expect((await run('model claude-opus-5-5')).text).toContain('claude-opus-5-5')
  expect((await run('effort high')).text).toContain('high')
  expect((await run('effort fastest')).text).toContain('low, medium, high')

  const pane = await $.ui.mount(DOCKED)
  expect((await pane.find({ key: 'polisher' }))?.text).toContain(
    'Polish Model : claude-opus-5-5 (high) ▾',
  )
  expect(await pane.find({ key: 'model' })).toBeUndefined()
  expect(await pane.find({ key: 'effort' })).toBeUndefined()

  await pane.press({ key: 'refresh' })
  expect(state.models.at(-1)).toBe('claude-opus-5-5')
  expect(state.efforts.at(-1)).toBe('high')
})

test('the loading mark is up while a polish runs and gone when it ends', async ($, on) => {
  const state = world(on)
  state.box = DRAFT
  state.delay = 5000
  const LOADING = /Polishing prompt/

  for (const placement of ['dock', 'inline'] as const) {
    const pane = await $.ui.mount({
      ...PANE,
      surface: 'terminal',
      props: { ...PANE.props, placement },
    })
    const submit = (text: string) =>
      $.prompt.submit({ text, wait: false, origin: USER })

    expect(await pane.find({ text: LOADING })).toBeUndefined()
    expect(await pane.find({ text: /Ready/ })).toBeDefined()

    // Begun by a press, ended by the reply.
    const buttons = ['auto', 'target', 'polisher']
    const shown = async () => {
      const found = []

      for (const key of buttons) {
        if ((await pane.find({ key })) !== undefined) {
          found.push(key)
        }
      }

      return found
    }
    expect(await shown()).toEqual(buttons)
    await pane.press({ key: 'polish' })
    expect(await pane.find({ text: LOADING })).toBeDefined()
    // The mark stands where the settings' buttons were, which are hidden: in
    // the settings box, as its last thing, when the pane has that box.
    expect(await shown()).toEqual([])
    // It has a round frame of its own, and its bar is as long as the
    // frame's inside: the pane less the frame, and less the settings box.
    expect((await pane.find({ key: 'loader' }))?.props.borderStyle).toBe('round')
    expect((await pane.find({ key: 'bar' }))?.props.width).toBe(
      PANE.props.bodyColumns - 4 - (placement === 'dock' ? 4 : 0),
    )

    if (placement === 'dock') {
      const inBox = keysIn((await pane.find({ key: 'settings' })) as Tree | undefined)
      expect(inBox.slice(0, 4)).toEqual(['settings', 'guide', 'pulse', 'divider'])
      expect(inBox[4]).toBe('loader')
      expect(inBox).toContain('spinner')
      expect(inBox).toContain('bar')
      // Stop is inside the settings box, as its last line, at the right end:
      // under the mark's frame, not in it, and no row is left under the box.
      expect(inBox.slice(-2)).toEqual(['loader-foot', 'cancel'])
      const box = (await pane.find({ key: 'settings' })) as Tree | undefined
      expect((box?.children ?? []).at(-1)?.props?.key).toBe('loader-foot')
      expect((box?.children ?? []).at(-2)?.props?.key).toBe('loader')
      const frame = keysIn((await pane.find({ key: 'loader' })) as Tree | undefined)
      expect(frame).toEqual(['loader', 'spinner', 'bar'])
      expect(
        keysIn((await pane.find({ key: 'pane' })) as Tree | undefined).filter(
          key => key === 'cancel',
        ),
      ).toEqual(['cancel'])
      expect(inBox.indexOf('loader-foot')).toBeGreaterThan(inBox.indexOf('bar'))
      expect((await pane.find({ key: 'loader-foot' }))?.props.justifyContent).toBe('flex-end')
      expect((await pane.find({ key: 'cancel' }))?.text.trim()).toBe('Stop')
      expect(await pane.find({ key: 'action-row' })).toBeUndefined()
      // No box of its own above the settings box any more.
      const first = (((await pane.find({ key: 'pane' })) as Tree | undefined)?.children ?? [])[0]
      expect(first?.props?.key).toBe('settings')
    }
    expect(await pane.find({ text: /Polishing/ })).toBeDefined()
    expect(await pane.find({ key: 'cancel' })).toBeDefined()
    expect(await pane.find({ key: 'polish' })).toBeUndefined()
    expect(state.statuses.at(-1)).toBe('Polishing prompt…')
    await state.clock.advance(5000)
    expect(await pane.find({ text: LOADING })).toBeUndefined()
    expect(await pane.find({ text: /Review/ })).toBeDefined()
    // Ended, the buttons are back.
    expect(await pane.find({ key: 'loader' })).toBeUndefined()
    expect(await shown()).toEqual(buttons)
    expect(state.statuses.at(-1)).toBeUndefined()

    // A refresh shows it again; a failure takes it down.
    state.reply = null
    await pane.press({ key: 'refresh' })
    expect(await pane.find({ text: LOADING })).toBeDefined()
    await state.clock.advance(5000)
    expect(await pane.find({ text: LOADING })).toBeUndefined()
    expect(await pane.find({ text: /Failed/ })).toBeDefined()
    state.reply = POLISHED
    await pane.press({ key: 'discard' })

    // Begun by Enter in auto mode, once the reviewed draft has been sent.
    await submit(state.box)
    const held = submit(DRAFT)
    await state.clock.advance(1000)
    expect(await pane.find({ text: LOADING })).toBeDefined()
    await state.clock.advance(4000)
    expect((await held).drop).toBeDefined()
    expect(await pane.find({ text: LOADING })).toBeUndefined()
    await pane.press({ key: 'discard' })
    await submit(state.box)

    // Cancelled part-way.
    state.box = DRAFT
    await pane.press({ key: 'polish' })
    expect(await pane.find({ key: 'cancel' })).toBeDefined()
    await pane.press({ key: 'cancel' })
    await state.clock.advance(5000)
    expect(await pane.find({ text: LOADING })).toBeUndefined()
    expect(await pane.find({ key: 'polish' })).toBeDefined()

    await pane.unmount()
  }
})

test('one click opens the models and the efforts together, and both are picked there', async ($, on) => {
  const state = world(on)
  state.box = DRAFT
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  const pane = await $.ui.mount(DOCKED)

  await pane.press({ key: 'polisher' })
  expect((await pane.find({ key: 'polisher' }))?.text).toContain('Polish Model : sonnet (low)')
  expect(await pointingOf(pane, 'polisher')).toBe('up')
  // One list holds both: every model and every effort.
  expect(await pane.find({ key: 'model-opus' })).toBeDefined()
  expect(await pane.find({ key: 'model-claude-haiku-5-5' })).toBeDefined()
  expect(await pane.find({ key: 'effort-high' })).toBeDefined()
  expect(await pane.find({ key: 'effort-max' })).toBeDefined()

  // A pick takes, and leaves the list up for the other pick.
  await pane.press({ key: 'model-haiku' })
  expect((await pane.find({ key: 'polisher' }))?.text).toContain('Polish Model : haiku (low)')
  expect(await pointingOf(pane, 'polisher')).toBe('up')
  expect(await pane.find({ key: 'effort-medium' })).toBeDefined()
  await pane.press({ key: 'effort-medium' })
  expect((await pane.find({ key: 'polisher' }))?.text).toContain('Polish Model : haiku (medium)')
  expect(await pointingOf(pane, 'polisher')).toBe('up')
  expect(await pane.find({ key: 'model-opus' })).toBeDefined()

  // `done` folds the list, with both picks kept: only the button is left.
  await pane.press({ key: 'polisher-done' })
  expect((await pane.find({ key: 'polisher' }))?.text).toContain('Polish Model : haiku (medium)')
  expect(await pointingOf(pane, 'polisher')).toBe('down')
  expect(await pane.find({ key: 'polisher-list' })).toBeUndefined()
  expect(await pane.find({ key: 'polisher-done' })).toBeUndefined()
  await pane.press({ key: 'polish' })
  expect(state.models.at(-1)).toBe('haiku')
  expect(state.efforts.at(-1)).toBe('medium')
  await pane.press({ key: 'discard' })

  // So does the button itself.
  await pane.press({ key: 'polisher' })
  expect(await pane.find({ key: 'polisher-list' })).toBeDefined()
  await pane.press({ key: 'polisher' })
  expect((await pane.find({ key: 'polisher' }))?.text).toContain('Polish Model : haiku (medium)')
  expect(await pointingOf(pane, 'polisher')).toBe('down')
  expect(await pane.find({ key: 'model-opus' })).toBeUndefined()
  expect(await pane.find({ key: 'effort-max' })).toBeUndefined()

  await pane.press({ key: 'polish' })
  expect(state.models.at(-1)).toBe('haiku')
  expect(state.efforts.at(-1)).toBe('medium')
  await pane.press({ key: 'discard' })

  await pane.press({ key: 'polisher' })
  await pane.press({ key: 'model-sonnet' })
  await pane.press({ key: 'effort-low' })
  await pane.press({ key: 'polisher' })
  await pane.unmount()
})

test('the record is folded to its latest row until the toggle opens it', async ($, on) => {
  const state = world(on)
  state.box = DRAFT
  const EARLIER = /Opus 5\.5 · \d+ → \d+ chars/
  const LATEST = /Applied/

  for (const surface of ['terminal', 'desktop'] as const) {
    for (const placement of ['dock', 'inline'] as const) {
      const pane = await $.ui.mount({
        ...PANE,
        surface,
        props: { ...PANE.props, placement },
      })

      // Two rows on record: a polish, then its apply.
      await pane.press({ key: 'polish' })
      await pane.press({ key: 'apply' })

      // Folded by default: the toggle and the latest row, the earlier one hidden.
      // The terminal's list opens upward; the desktop's row opens down.
      const closed = surface === 'terminal' ? 'up' : 'right'
      expect(await pointingOf(pane, 'log')).toBe(closed)
      expect(await pane.find({ text: LATEST })).toBeDefined()
      expect(await pane.find({ text: EARLIER })).toBeUndefined()

      await pane.press({ key: 'log' })
      expect(await pointingOf(pane, 'log')).toBe('down')
      expect(await pane.find({ text: LATEST })).toBeDefined()
      expect(await pane.find({ text: EARLIER })).toBeDefined()

      await pane.press({ key: 'log' })
      expect(await pointingOf(pane, 'log')).toBe(closed)
      expect(await pane.find({ text: EARLIER })).toBeUndefined()

      await pane.press({ key: 'restore' })
      await pane.unmount()
    }
  }
})

test('what AUTO does is said for five seconds after a switch, and not before', async ($, on) => {
  const state = world(on)
  const ON = /AUTO ON · Enter polishes first and shows you before sending/
  const OFF = /AUTO OFF · Enter sends right away, with no polish/

  for (const placement of ['dock', 'inline'] as const) {
    const pane = await $.ui.mount({
      ...PANE,
      surface: 'terminal',
      props: { ...PANE.props, placement },
    })

    // Hidden until AUTO is switched.
    expect(await pane.find({ text: ON })).toBeUndefined()
    expect(await pane.find({ text: OFF })).toBeUndefined()

    await pane.press({ key: 'auto' })
    expect(await pane.find({ text: OFF })).toBeDefined()
    expect(await pane.find({ text: ON })).toBeUndefined()
    await state.clock.advance(4000)
    expect(await pane.find({ text: OFF })).toBeDefined()
    await state.clock.advance(1000)
    expect(await pane.find({ text: OFF })).toBeUndefined()

    // A second switch inside the five seconds starts them over.
    await pane.press({ key: 'auto' })
    expect(await pane.find({ text: ON })).toBeDefined()
    await state.clock.advance(3000)
    await pane.press({ key: 'auto' })
    expect(await pane.find({ text: OFF })).toBeDefined()
    await state.clock.advance(3000)
    expect(await pane.find({ text: OFF })).toBeDefined()
    await state.clock.advance(2000)
    expect(await pane.find({ text: OFF })).toBeUndefined()

    await pane.press({ key: 'auto' })
    await state.clock.advance(5000)
    expect(await pane.find({ text: ON })).toBeUndefined()
    await pane.unmount()
  }
})

test('the review reads Original and Polished, with Apply, Retry and Keep', async ($, on) => {
  const state = world(on)
  state.box = DRAFT

  for (const bodyColumns of [66, 120]) {
    const pane = await $.ui.mount({
      ...DOCKED,
      props: { ...DOCKED.props, bodyColumns },
    })

    await pane.press({ key: 'polish' })
    expect(await pane.find({ text: /Original Prompt/ })).toBeDefined()
    expect(await pane.find({ text: /Polished Prompt/ })).toBeDefined()
    expect((await pane.find({ key: 'apply' }))?.text).toContain('Apply Polish')
    expect((await pane.find({ key: 'refresh' }))?.text).toContain('Retry Polish')
    expect((await pane.find({ key: 'discard' }))?.text).toContain('Keep Original')
    await pane.press({ key: 'discard' })
    await pane.unmount()
  }
})

test("rows from earlier builds read in today's short English", () => {
  const rows = [
    ['626자를 입력창에 넣음', '626 chars'],
    ['입력창을 다듬은 프롬프트로 바꿈 (865자)', '865 chars'],
    ['Polished prompt applied · 865 chars', '865 chars'],
    ['Opus 5.5 · 148→615자', 'Opus 5.5 · 148 → 615 chars'],
    ['Opus 5.5용 · 200자 → 865자', 'Opus 5.5 · 200 → 865 chars'],
    ['GPT-6 Astra · 52→118자', 'GPT-6 Astra · 52 → 118 chars'],
    ['다듬은 프롬프트를 버림', 'Original kept'],
    ['원래 프롬프트를 그대로 둠', 'Original kept'],
    ['Original prompt kept', 'Original kept'],
    ['바꿀 곳 없음', 'No changes'],
    ['고칠 곳이 없음', 'No changes'],
    ['API 오류', 'Model error'],
    ['모델을 부르는 중 오류가 났습니다', 'Model error'],
    ['빈 응답', 'Empty reply'],
    ['취소됨', 'Stopped'],
    // Today's rows are left as they are.
    ['Opus 5.5 · 148 → 615 chars', 'Opus 5.5 · 148 → 615 chars'],
    ['615 chars', '615 chars'],
  ] as const

  for (const [old, now] of rows) {
    expect(easyOf(old)).toBe(now)
  }
})

test('a button is a block of color with no brackets, and shows a key only while the keys are listed', async ($, on) => {
  const state = world(on)
  state.box = DRAFT

  for (const placement of ['dock', 'inline'] as const) {
    const pane = await $.ui.mount({
      ...PANE,
      surface: 'terminal',
      props: { ...PANE.props, placement },
    })
    // A button as drawn: no chrome, no key, and one Text that is the block.
    const block = async (key: string) => {
      const button = await pane.find({ key })
      expect(button?.type).toBe('Button')
      expect(button?.props.plain).toBe(true)
      expect(button?.props.hotkey).toBeUndefined()
      expect(button?.text).not.toContain('[')
      expect(button?.text).not.toContain(']')
      expect(button?.text).not.toMatch(/^[a-z0-9]: /)
      const text = blockOf(button)
      expect(text?.type).toBe('Text')

      return {
        words: (button?.text ?? '').trim(),
        back: text?.props?.backgroundColor,
        fore: text?.props?.color,
        isBold: text?.props?.bold === true,
      }
    }
    const main = { back: 'claude', fore: 'inverseText', isBold: true }
    // The rest have no block behind them: their words alone.
    const gray = { back: undefined, fore: undefined, isBold: false }

    // At rest: Prompt Polish and the switch that is on are the accent's,
    // the rest gray.
    expect(await block('polish')).toEqual({ words: 'Prompt Polish', ...main })
    expect(await block('auto')).toEqual({ words: 'AUTO ON', ...main })
    expect(await block('target')).toEqual({
      words: 'Session Model : Opus 5.5 (Detected) ▾',
      ...gray,
    })
    expect(await block('polisher')).toEqual({ words: 'Polish Model : sonnet (low) ▾', ...gray })
    const history = await block('log')
    expect(history.words.startsWith('History ')).toBe(true)
    expect(history.words.endsWith(' ▴')).toBe(true)
    expect({ ...history, words: '' }).toEqual({ words: '', ...gray })

    // Switched off, AUTO goes gray.
    await pane.press({ key: 'auto' })
    expect(await block('auto')).toEqual({ words: 'AUTO OFF', ...gray })
    await pane.press({ key: 'auto' })
    await state.clock.advance(5000)

    // In review: the answer that applies is the accent's.
    await pane.press({ key: 'polish' })
    expect(await block('apply')).toEqual({ words: 'Apply Polish', ...main })
    expect(await block('refresh')).toEqual({ words: 'Retry Polish', ...gray })
    expect(await block('discard')).toEqual({ words: 'Keep Original', ...gray })
    await pane.press({ key: 'apply' })
    expect(await block('restore')).toEqual({ words: 'Undo Apply', ...gray })
    await pane.press({ key: 'restore' })

    // The keys are folded away: their toggle is a gray block like the rest.
    expect(await block('keys')).toEqual({ words: 'Keys ▴', ...gray })
    expect(await pane.find({ text: /Pick from an open list/ })).toBeUndefined()

    // Opened, the list shows, and each button has the key the list gives it.
    await pane.press({ key: 'keys' })
    expect((await pane.find({ key: 'keys' }))?.text).toContain('Keys ▾')
    expect(await pane.find({ text: /Pick from an open list/ })).toBeDefined()

    for (const [key, hotkey] of Object.entries({
      polish: 'p',
      auto: 'a',
      target: 't',
      polisher: 'm',
      log: 'l',
      keys: 'k',
    })) {
      expect((await pane.find({ key }))?.props.hotkey).toBe(hotkey)
    }

    // In the one list the digits run on from the models to the efforts.
    await pane.press({ key: 'polisher' })
    expect((await pane.find({ key: 'model-sonnet' }))?.props.hotkey).toBe('1')
    expect((await pane.find({ key: 'effort-low' }))?.props.hotkey).toBe('2')
    expect((await pane.find({ key: 'effort-high' }))?.props.hotkey).toBe('4')
    await pane.press({ key: 'polisher' })
    await pane.press({ key: 'polish' })
    expect((await pane.find({ key: 'apply' }))?.props.hotkey).toBe('y')
    expect((await pane.find({ key: 'refresh' }))?.props.hotkey).toBe('r')
    expect((await pane.find({ key: 'discard' }))?.props.hotkey).toBe('x')
    await pane.press({ key: 'discard' })

    // Folded again, the list and the keys are gone.
    await pane.press({ key: 'keys' })
    expect((await pane.find({ key: 'keys' }))?.text).toContain('Keys ▴')
    expect(await pane.find({ text: /Pick from an open list/ })).toBeUndefined()
    expect((await pane.find({ key: 'polish' }))?.props.hotkey).toBeUndefined()
    await pane.unmount()
  }
})

test('a pick list is rows with a cursor and a tick on the one in use', async ($, on) => {
  const state = world(on)
  state.box = DRAFT
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  const pane = await $.ui.mount(DOCKED)
  const row = async (key: string) => {
    const button = await pane.find({ key })
    const text = blockOf(button)
    expect(button?.props.plain).toBe(true)
    expect(button?.props.hotkey).toBeUndefined()
    expect(button?.text).not.toContain('[')

    return {
      words: button?.text,
      color: text?.props?.color,
      isBold: text?.props?.bold === true,
      back: text?.props?.backgroundColor,
    }
  }
  const inUse = { color: 'claude', isBold: true, back: undefined }
  const other = { color: undefined, isBold: false, back: undefined }

  await pane.press({ key: 'polisher' })
  // The efforts are a stepped slider: a tick to a level, the knob on the
  // one in use, the ticks up to it lit, and its name lit beneath.
  const track = async () => {
    const ticks = []

    for (const level of ['low', 'medium', 'high', 'xhigh', 'max']) {
      const tick = (await pane.find({ key: `effort-tick-${level}` })) as Tree | undefined
      const [mark] = tick?.children ?? []
      // The button is the tick alone: no line is part of it.
      ticks.push(
        `${(tick as { text?: string } | undefined)?.text}|${mark?.props?.color}|${(tick?.children ?? []).length}`,
      )
    }

    return ticks
  }
  const name = async (level: string) => {
    const text = blockOf(await pane.find({ key: `effort-${level}` }))

    return { color: text?.props?.color, isBold: text?.props?.bold === true }
  }

  expect(await track()).toEqual([
    '●|claude|1',
    '○|subtle|1',
    '○|subtle|1',
    '○|subtle|1',
    '○|subtle|1',
  ])
  // The line between the ticks is plain: one dim color, lit nowhere.
  expect(await pane.find({ text: /━/ })).toBeUndefined()
  expect(await name('low')).toEqual({ color: 'claude', isBold: true })
  expect(await name('medium')).toEqual({ color: undefined, isBold: false })

  // Each name's middle is right under its tick: walk both rows cell by cell.
  const cells = (node: unknown): string => {
    const tree = node as (Tree & { text?: string }) | string | undefined

    return tree === undefined
      ? ''
      : typeof tree === 'string'
        ? tree
        : (tree.children ?? []).length > 0
          ? (tree.children ?? []).map(cells).join('')
          : (tree.text ?? '')
  }
  const trackRow = cells(await pane.find({ key: 'effort-track' }))
  const namesRow = cells(await pane.find({ key: 'effort-names' }))
  expect(trackRow).toBe(' ●───────○───────○───────○───────○')
  expect(namesRow).toBe('low   medium   high    xhigh    max')
  const ticks = [...trackRow].flatMap((cell, i) => ('●•○'.includes(cell) ? [i] : []))

  for (const [i, level] of ['low', 'medium', 'high', 'xhigh', 'max'].entries()) {
    const start = namesRow.indexOf(level)
    expect(start + Math.floor(level.length / 2)).toBe(ticks[i])
    // The button is the name alone, with no room around it.
    expect((await pane.find({ key: `effort-${level}` }))?.text).toBe(level)
  }
  expect(await row('model-sonnet')).toEqual({ words: '> sonnet ✓', ...inUse })
  expect(await row('model-opus')).toEqual({ words: '  opus', ...other })

  // The cursor and the tick follow each pick, in its own half.
  // A click on a name moves the knob there, and the button says so at once.
  await pane.press({ key: 'effort-high' })
  expect((await pane.find({ key: 'polisher' }))?.text).toContain('Polish Model : sonnet (high) ▴')
  expect(await track()).toEqual([
    '•|claude|1',
    '•|claude|1',
    '●|claude|1',
    '○|subtle|1',
    '○|subtle|1',
  ])
  expect(await pane.find({ text: /━/ })).toBeUndefined()
  expect(await name('high')).toEqual({ color: 'claude', isBold: true })
  expect(await name('low')).toEqual({ color: undefined, isBold: false })

  // So does a click on a tick.
  await pane.press({ key: 'effort-tick-max' })
  expect((await pane.find({ key: 'polisher' }))?.text).toContain('Polish Model : sonnet (max) ▴')
  expect((await track()).at(-1)).toBe('●|claude|1')
  await pane.press({ key: 'effort-tick-high' })
  expect(await row('model-sonnet')).toEqual({ words: '> sonnet ✓', ...inUse })
  await pane.press({ key: 'model-opus' })
  expect(await row('model-opus')).toEqual({ words: '> opus ✓', ...inUse })
  expect(await row('model-sonnet')).toEqual({ words: '  sonnet', ...other })
  expect(await name('high')).toEqual({ color: 'claude', isBold: true })
  await pane.press({ key: 'model-sonnet' })
  await pane.press({ key: 'effort-low' })
  await pane.press({ key: 'polisher' })

  await pane.press({ key: 'target' })
  expect(await row('target-auto')).toEqual({ words: '> Opus 5.5 (Detected) ✓', ...inUse })
  expect(await row('target-gpt-5.6')).toEqual({ words: '  GPT-5.6', ...other })
  await pane.press({ key: 'target' })
  await pane.unmount()
})

test('Keys sits above History, and History is the last row, folded or open', async ($, on) => {
  const state = world(on)
  state.box = DRAFT

  for (const bodyRows of [20, 30, 48]) {
    const docked = await $.ui.mount({
      ...PANE,
      surface: 'terminal',
      props: {
        ...PANE.props,
        placement: 'dock',
        scroll: { offset: 0, bodyRows },
      },
    })
    // The rows of the foot, top to bottom, by their keys.
    const foot = async () => {
      const root = await docked.find({ key: 'pane' })
      const last = (root?.children as Tree[] | undefined)?.at(-1)

      return {
        key: last?.props?.key,
        rows: (last?.children ?? []).map(row => row.props?.key),
        height: root?.props.minHeight,
      }
    }

    // The pane is as tall as its room, to the row; what is left over goes
    // above the foot, so the foot's last row is the pane's last row.
    expect((await docked.find({ key: 'spacer' }))?.props.flexGrow).toBe(1)
    // One empty line stands above the foot, whose first row is Keys.
    expect((await docked.find({ key: 'foot' }))?.props.marginTop).toBe(1)
    expect(await foot()).toEqual({
      key: 'foot',
      rows: ['keys-row', 'log-row'],
      height: bodyRows,
    })

    // Folded, both marks point up: the way the lists open.
    expect((await docked.find({ key: 'keys' }))?.text).toContain('Keys ▴')
    expect((await docked.find({ key: 'log' }))?.text).toContain('▴')

    // Each list opens right above its own toggle.
    await docked.press({ key: 'keys' })
    expect((await docked.find({ key: 'keys' }))?.text).toContain('Keys ▾')
    expect((await foot()).rows).toEqual(['keys-list', 'keys-row', 'log-row'])
    await docked.press({ key: 'keys' })

    // The list opens right above the toggle, which stays the last row.
    await docked.press({ key: 'log' })
    expect((await docked.find({ key: 'log' }))?.text).toContain('▾')
    expect(await foot()).toEqual({
      key: 'foot',
      rows: ['keys-row', 'log-list', 'log-row'],
      height: bodyRows,
    })

    // The same with a preview up.
    await docked.press({ key: 'polish' })
    expect((await foot()).rows).toEqual(['keys-row', 'log-list', 'log-row'])
    await docked.press({ key: 'discard' })

    await docked.press({ key: 'log' })
    expect((await foot()).rows).toEqual(['keys-row', 'log-row'])
    await docked.unmount()
  }

  // Above the prompt the pane is as tall as what it holds.
  const inline = await $.ui.mount({
    ...PANE,
    surface: 'terminal',
    props: { ...PANE.props, placement: 'inline' },
  })
  await inline.press({ key: 'polish' })
  const root = await inline.find({ key: 'pane' })
  const last = (root?.children as Tree[] | undefined)?.at(-1)
  expect(root?.props.minHeight).toBeUndefined()
  expect(await inline.find({ key: 'spacer' })).toBeUndefined()
  expect((last?.children ?? []).map(row => row.props?.key)).toEqual(['keys-row', 'log-row'])
  await inline.press({ key: 'discard' })
})

test('the state mark is a surface module in every state, and the bar runs only while polishing', async ($, on) => {
  const state = world(on)
  state.box = DRAFT
  state.delay = 5000

  for (const placement of ['dock', 'inline'] as const) {
    const pane = await $.ui.mount({
      ...PANE,
      surface: 'terminal',
      props: { ...PANE.props, placement },
    })
    const mark = async () => (await pane.find({ key: 'pulse' }))?.props.props

    expect(await mark()).toEqual({ kind: 'idle', color: 'success' })
    expect(await pane.find({ text: /Ready/ })).toBeDefined()
    expect(await pane.find({ key: 'bar' })).toBeUndefined()

    await pane.press({ key: 'polish' })
    expect(await mark()).toEqual({ kind: 'busy', color: 'claude' })
    expect(await pane.find({ key: 'spinner' })).toBeDefined()
    expect(await pane.find({ key: 'bar' })).toBeDefined()

    await state.clock.advance(5000)
    expect(await mark()).toEqual({ kind: 'review', color: 'suggestion' })
    expect(await pane.find({ text: /Review/ })).toBeDefined()
    expect(await pane.find({ key: 'spinner' })).toBeUndefined()
    expect(await pane.find({ key: 'bar' })).toBeUndefined()

    await pane.press({ key: 'discard' })
    await pane.unmount()
  }
})

test('the heading names the guide of the model picked, and a GPT model turns every box green', async ($, on) => {
  const state = world(on)
  state.box = DRAFT
  state.delay = 1000
  const GREEN = '#10A37F'
  const targets = [
    ['auto', 'Opus 5.5', false],
    ['opus-5.5', 'Opus 5.5', false],
    ['sonnet-5.5', 'Sonnet 5.5', false],
    ['gpt-6-astra', 'GPT-6 Astra', true],
    ['gpt-5.6', 'GPT-5.6', true],
  ] as const

  const pane = await $.ui.mount(DOCKED)
  const border = async (key: string) =>
    (await pane.find({ key }))?.props.borderColor

  for (const [target, label, isGpt] of targets) {
    await pane.press({ key: 'target' })
    await pane.press({ key: `target-${target}` })

    // The heading follows the pick, and names no other model.
    expect(await pane.find({ text: new RegExp(`Reference : ${label.replace('.', '\\.')} Guide`) })).toBeDefined()

    for (const [, other] of targets) {
      if (other !== label) {
        expect(await pane.find({ text: new RegExp(`Reference : ${other.replace('.', '\\.')} Guide`) })).toBeUndefined()
      }
    }

    // Every box, at rest and open: the settings, a pick list, the record.
    await pane.press({ key: 'polisher' })
    await pane.press({ key: 'log' })
    expect(await border('settings')).toBe(isGpt ? GREEN : 'claude')
    expect(await border('polisher-list')).toBe(isGpt ? GREEN : 'subtle')
    expect(await border('log-list')).toBe(isGpt ? GREEN : 'subtle')
    // The row in use in a list, and the accent's block of color.
    expect(blockOf(await pane.find({ key: 'effort-low' }))?.props?.color).toBe(
      isGpt ? GREEN : 'claude',
    )
    expect(blockOf(await pane.find({ key: 'polish' }))?.props?.backgroundColor).toBe(
      isGpt ? GREEN : 'claude',
    )
    expect(blockOf(await pane.find({ key: 'polisher' }))?.props?.backgroundColor).toBeUndefined()
    await pane.press({ key: 'polisher' })
    await pane.press({ key: 'log' })

    // The box that says what AUTO does.
    await pane.press({ key: 'auto' })
    expect(
      ((await pane.find({ key: 'hint' }))?.children as Tree[] | undefined)?.[0]?.props?.color,
    ).toBe(isGpt ? GREEN : 'claude')
    await pane.press({ key: 'auto' })
    await state.clock.advance(5000)

    // While polishing: the loading mark, in a frame of its own.
    await pane.press({ key: 'polish' })
    expect(await border('loader')).toBe(isGpt ? GREEN : 'subtle')
    expect((await pane.find({ key: 'pulse' }))?.props.props).toEqual({
      kind: 'busy',
      color: isGpt ? GREEN : 'claude',
    })
    await state.clock.advance(1000)

    // In review: the two prompts.
    expect(await border('original')).toBe(isGpt ? GREEN : 'inactive')
    expect(await border('polished')).toBe(isGpt ? GREEN : 'suggestion')
    expect(state.systems.at(-1)).toContain(label)
    await pane.press({ key: 'discard' })
  }

  await pane.press({ key: 'target' })
  await pane.press({ key: 'target-auto' })
  await pane.unmount()
})

test('auto takes its heading and color from the session model', async ($, on) => {
  const state = world(on, 'gpt-6-astra')
  state.box = DRAFT
  const pane = await $.ui.mount(DOCKED)

  expect(await pane.find({ text: /Reference : GPT-6 Astra Guide/ })).toBeDefined()
  expect((await pane.find({ key: 'target' }))?.text).toContain('GPT-6 Astra (Detected)')
  expect((await pane.find({ key: 'settings' }))?.props.borderColor).toBe('#10A37F')

  // Picking a Claude guide by hand puts the theme's colors back.
  await pane.press({ key: 'target' })
  await pane.press({ key: 'target-sonnet-5.5' })
  expect(await pane.find({ text: /Reference : Sonnet 5\.5 Guide/ })).toBeDefined()
  expect((await pane.find({ key: 'settings' }))?.props.borderColor).toBe('claude')
})

test('the heading opens a line on the guide in use, and closes it', async ($, on) => {
  const state = world(on)
  state.box = DRAFT
  const abouts = [
    ['opus-5.5', 'Opus 5.5', /Prompting tips for Claude Opus 5\.5\./],
    ['sonnet-5.5', 'Sonnet 5.5', /Prompting tips for Claude Sonnet 5\.5\./],
    ['gpt-6-astra', 'GPT-6 Astra', /Prompting tips for OpenAI GPT-6 Astra\./],
    ['gpt-5.6', 'GPT-5.6', /Prompting tips for OpenAI GPT-5\.6\./],
  ] as const

  const pane = await $.ui.mount(DOCKED)

  // The heading is a button with no key drawn, and its line is closed.
  const heading = await pane.find({ key: 'guide' })
  expect(heading?.type).toBe('Button')
  expect(heading?.text).toContain('Reference : Opus 5.5 Guide')
  expect(heading?.props.hotkey).toBeUndefined()
  expect(await pane.find({ text: /Prompting tips for/ })).toBeUndefined()

  await pane.press({ key: 'guide' })
  expect(await pane.find({ text: abouts[0][2] })).toBeDefined()

  // It is in a frame inside the settings box, the frame a pick list has.
  const about = await pane.find({ key: 'about' })
  expect(about?.props.borderStyle).toBe('round')
  expect(about?.props.borderColor).toBe('subtle')
  expect(about?.text).toMatch(abouts[0][2])
  expect(keysIn((await pane.find({ key: 'settings' })) as Tree | undefined)).toContain('about')
  // Open, it sits above the rule under the heading.
  const drawn = keysIn((await pane.find({ key: 'settings' })) as Tree | undefined)
  expect(drawn.indexOf('about')).toBeGreaterThan(drawn.indexOf('guide'))
  expect(drawn.indexOf('divider')).toBeGreaterThan(drawn.indexOf('about'))
  expect(drawn.indexOf('auto')).toBeGreaterThan(drawn.indexOf('divider'))

  // Open, it follows the model picked: one guide's line, never two.
  for (const [target, label, about] of abouts) {
    await pane.press({ key: 'target' })
    await pane.press({ key: `target-${target}` })
    expect((await pane.find({ key: 'guide' }))?.text).toContain(`Reference : ${label} Guide`)
    expect(await pane.find({ text: about })).toBeDefined()

    for (const [, , other] of abouts) {
      if (other !== about) {
        expect(await pane.find({ text: other })).toBeUndefined()
      }
    }
  }

  await pane.press({ key: 'guide' })
  expect(await pane.find({ text: /Prompting tips for/ })).toBeUndefined()

  await pane.press({ key: 'target' })
  await pane.press({ key: 'target-auto' })
  await pane.unmount()
})

test("the one list of models and efforts is the full-width box Session Model's is", async ($, on) => {
  const state = world(on)
  state.box = DRAFT
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  for (const bodyColumns of [40, 66, 120]) {
    const pane = await $.ui.mount({
      ...DOCKED,
      props: { ...DOCKED.props, bodyColumns },
    })
    // A list's frame, apart from its name.
    const frame = async (key: string) => {
      const { key: _, ...props } = ((await pane.find({ key })) as Tree | undefined)?.props ?? {}
      void _

      return props
    }

    await pane.press({ key: 'target' })
    const target = await frame('target-list')
    expect(target.width).toBeUndefined()

    // The same frame, sized by the box it is in and not by its button.
    await pane.press({ key: 'polisher' })
    const list = await frame('polisher-list')
    expect(list.width).toBeUndefined()

    for (const side of ['borderStyle', 'borderColor', 'borderDimColor', 'paddingX']) {
      expect(list[side]).toEqual(target[side])
    }

    // It is under the line of the one button, and holds both lists: the
    // models, then the efforts, side by side, wrapping in a narrow pane.
    const tuning = (await pane.find({ key: 'tuning' })) as Tree | undefined
    expect(tuning?.props?.flexDirection).toBe('column')
    expect((tuning?.children ?? []).map(keysIn)[0]).toEqual(['polisher'])
    const inside = keysIn((tuning?.children ?? [])[1])
    expect(inside[0]).toBe('polisher-list')
    expect(inside.slice(1, 3)).toEqual(['polisher-body', 'model-list'])
    expect(inside.indexOf('effort-list')).toBeGreaterThan(inside.indexOf('model-sonnet'))
    expect(inside.indexOf('effort-low')).toBeGreaterThan(inside.indexOf('effort-list'))
    const body = await pane.find({ key: 'polisher-body' })
    expect(body?.props.flexDirection).toBeUndefined()
    expect(body?.props.flexWrap).toBe('wrap')
    // The models at the left end, the slider at the right end; wrapped
    // under the models in a narrow pane, an empty line between the two.
    expect(body?.props.justifyContent).toBe('space-between')
    expect(body?.props.rowGap).toBe(1)
    expect(body?.props.columnGap).toBe(2)
    expect((await pane.find({ key: 'model-list' }))?.props.width).toBeUndefined()

    // `done` is under the frame, not in it: the line after it, at the right end.
    expect(inside).not.toContain('polisher-done')
    expect(keysIn((tuning?.children ?? [])[2])).toEqual(['polisher-foot', 'polisher-done'])
    expect((tuning?.children ?? []).length).toBe(3)
    expect((await pane.find({ key: 'polisher-foot' }))?.props.justifyContent).toBe('flex-end')
    const done = await pane.find({ key: 'polisher-done' })
    expect(done?.text.trim()).toBe('done')
    expect(blockOf(done)?.props?.backgroundColor).toBeUndefined()
    expect(await pane.find({ text: /^Polish Model$/ })).toBeDefined()
    expect(await pane.find({ text: /^Effort$/ })).toBeDefined()

    // A pick takes and the list stays, until the button folds it.
    await pane.press({ key: 'effort-medium' })
    expect((await pane.find({ key: 'polisher' }))?.text).toContain('Polish Model : sonnet (medium)')
    expect(await pointingOf(pane, 'polisher')).toBe('up')
    expect(await pane.find({ key: 'polisher-list' })).toBeDefined()
    await pane.press({ key: 'effort-low' })
    await pane.press({ key: 'polisher' })
    expect((await pane.find({ key: 'polisher' }))?.text).toContain('Polish Model : sonnet (low)')
    expect(await pointingOf(pane, 'polisher')).toBe('down')
    expect(await pane.find({ key: 'polisher-list' })).toBeUndefined()
    await pane.unmount()
  }
})

test('switching AUTO opens no pane: a framed note inside the settings box says it', async ($, on) => {
  const state = world(on)
  state.box = DRAFT
  // Every framed box of a drawn tree, by its key, in the order drawn.
  const boxesIn = (node: Tree | undefined): string[] =>
    node === undefined
      ? []
      : [
          ...(node.type === 'Box' && node.props?.borderStyle !== undefined
            ? [String(node.props.key)]
            : []),
          ...(node.children ?? []).flatMap(boxesIn),
        ]

  for (const hasPreview of [false, true]) {
    for (const bodyColumns of [40, 66, 120]) {
      const pane = await $.ui.mount({
        ...DOCKED,
        props: { ...DOCKED.props, bodyColumns },
      })

      if (hasPreview) {
        await pane.press({ key: 'polish' })
      }

      const boxes = async () =>
        boxesIn((await pane.find({ key: 'pane' })) as Tree | undefined)
      const settings = async () =>
        keysIn((await pane.find({ key: 'settings' })) as Tree | undefined)
      const before = await boxes()
      const opens = state.opens
      expect(before).toContain('settings')
      expect(await settings()).not.toContain('hint')
      expect((await pane.find({ key: 'auto' }))?.text).toContain('AUTO ON')

      // OFF: the button says so, and the note is in a frame of its own
      // inside the settings box, the one box more than before.
      await pane.press({ key: 'auto' })
      expect((await pane.find({ key: 'auto' }))?.text).toContain('AUTO OFF')
      expect((await boxes()).filter(key => key !== 'hint')).toEqual(before)
      expect(await boxes()).toContain('hint')
      expect(state.opens).toBe(opens)
      expect(await settings()).toContain('hint')
      // Right under the line of AUTO and Session Model, above the next line.
      const drawn = await settings()
      expect(drawn.indexOf('hint')).toBe(drawn.indexOf('target') + 1)
      expect(drawn.indexOf('tuning')).toBe(drawn.indexOf('hint') + 1)
      const off = await pane.find({ key: 'hint' })
      expect(off?.type).toBe('Box')
      expect(off?.props.borderStyle).toBe('round')
      expect(off?.text).toContain('AUTO OFF · Enter sends right away')

      // ON again: the same frame, the same boxes.
      await pane.press({ key: 'auto' })
      expect((await pane.find({ key: 'auto' }))?.text).toContain('AUTO ON')
      expect((await boxes()).filter(key => key !== 'hint')).toEqual(before)
      expect(state.opens).toBe(opens)
      expect((await pane.find({ key: 'hint' }))?.text).toContain('AUTO ON · Enter polishes first')

      // Five seconds on the note is gone, and the boxes are as they were.
      await state.clock.advance(5000)
      expect(await pane.find({ key: 'hint' })).toBeUndefined()
      expect(await boxes()).toEqual(before)
      expect(state.opens).toBe(opens)

      if (hasPreview) {
        await pane.press({ key: 'discard' })
      }

      await pane.unmount()
    }
  }

  // Above the prompt, where the pane has no settings box, it is framed alike.
  const inline = await $.ui.mount({
    ...PANE,
    surface: 'terminal',
    props: { ...PANE.props, placement: 'inline' },
  })
  const opens = state.opens
  await inline.press({ key: 'auto' })
  expect((await inline.find({ key: 'hint' }))?.props.borderStyle).toBe('round')
  expect((await inline.find({ key: 'hint' }))?.text).toContain('AUTO OFF')
  expect(state.opens).toBe(opens)
  await inline.press({ key: 'auto' })
  await state.clock.advance(5000)
})

test('the Polish button is the settings box\'s second line, under AUTO and Session Model', async ($, on) => {
  const state = world(on)
  state.box = DRAFT
  const shapeOf = (node: Tree | undefined): unknown =>
    node === undefined
      ? undefined
      : {
          type: node.type,
          props: node.props,
          children: (node.children ?? []).map(shapeOf),
        }

  for (const bodyColumns of [40, 66, 120]) {
    const pane = await $.ui.mount({
      ...DOCKED,
      props: { ...DOCKED.props, bodyColumns },
    })
    const settings = async () =>
      (await pane.find({ key: 'settings' })) as Tree | undefined
    const row = async () =>
      keysIn((await pane.find({ key: 'action-row' })) as Tree | undefined)

    // Inside the box, in this order: the heading, AUTO and Session Model,
    // then Polish Model and Effort on a line of their own.
    const inBox = keysIn(await settings())
    expect(inBox).toEqual([
      'settings',
      'guide',
      'pulse',
      // The rule under the heading, as wide as the box's inside.
      'divider',
      'auto',
      'target',
      'tuning',
      'polisher',
    ])

    expect((await pane.find({ key: 'divider' }))?.text).toBe('─'.repeat(bodyColumns - 4))

    // That line is the box's child right after the line of AUTO and Session
    // Model: directly under it.
    const lines = (await settings())?.children ?? []
    const first = lines.findIndex(line => keysIn(line).includes('auto'))
    expect(keysIn(lines[first])).toEqual(['auto', 'target'])
    expect(keysIn(lines[first + 1])).toEqual([
      'tuning',
      'polisher',
    ])

    // The two share the line, side by side, and wrap rather than overflow.
    const buttons = (((await pane.find({ key: 'tuning' })) as Tree | undefined)?.children ?? [])[0]
    expect(buttons?.props?.flexDirection).toBeUndefined()
    expect(buttons?.props?.flexWrap).toBe('wrap')
    expect(' Polish Model : sonnet (medium) ▾ '.length).toBeLessThanOrEqual(66 - 4)

    // The working row under the box holds Prompt Polish alone.
    expect(await row()).toEqual(['action-row', 'primary', 'polish'])
    const before = shapeOf(await settings())

    // With a preview up they are where they were: in the box, above the
    // two prompts; the row holds the three answers.
    await pane.press({ key: 'polish' })
    expect(keysIn(await settings()).slice(-2)).toEqual([
      'tuning',
      'polisher',
    ])
    const order = keysIn((await pane.find({ key: 'pane' })) as Tree | undefined)
    expect(order.indexOf('polisher')).toBeLessThan(order.indexOf('original'))
    expect(await row()).toEqual(['action-row', 'apply', 'refresh', 'discard'])

    // Applied, Undo Apply appears on Prompt Polish's line, right of it, and
    // the box is drawn exactly as it was before any of this.
    await pane.press({ key: 'apply' })
    expect(await row()).toEqual(['action-row', 'primary', 'polish', 'restore'])
    const primary = await pane.find({ key: 'primary' })
    expect(primary?.props.flexDirection).toBeUndefined()
    expect(primary?.props.columnGap).toBe(2)
    expect(primary?.props.flexWrap).toBe('wrap')
    expect(shapeOf(await settings())).toEqual(before)

    await pane.press({ key: 'restore' })
    expect(await row()).toEqual(['action-row', 'primary', 'polish'])
    expect(shapeOf(await settings())).toEqual(before)
    await pane.unmount()
  }

  // The inline summary has no box: the same line comes right after the line
  // of AUTO and Session Model.
  const inline = await $.ui.mount({
    ...PANE,
    surface: 'terminal',
    props: { ...PANE.props, placement: 'inline' },
  })
  const order = keysIn((await inline.find({ key: 'pane' })) as Tree | undefined)
  expect(order.indexOf('tuning')).toBe(order.indexOf('target') + 1)
})

// The Claude desktop app draws the pane its own way (desktop.tsx); every other
// surface, the terminal and those that draw from a grid of cells like it,
// draws it as the terminal does (terminal.tsx).
const DOCK = { ...PANE.props, placement: 'dock' } as const
const CLAY = '#D97757'
const GREEN = '#10A37F'
const QUIET = '#8C8C8C'
// A card's background and line; the accent a fifth as strong, behind what is
// in use and what is to press; and the app's own wash behind the polish on show.
const CARD = 'userMessageBackground'
const LINE = 'promptBorderShimmer'
const STRONG = 'promptBorder'
const LIST = 'userMessageBackgroundHover'
const TINT = `${CLAY}33`
const WASH = 'selectionBg'

/** Every element of a drawn tree, outermost first. */
const nodesIn = (node: unknown): Tree[] =>
  typeof node !== 'object' || node === null
    ? []
    : [node as Tree, ...((node as Tree).children ?? []).flatMap(nodesIn)]

const svgsIn = (node: unknown): Tree[] =>
  nodesIn(node).filter(found => found.type === 'Svg')

/** The color a drawing is stroked or filled in: its own, given as it is made. */
const inkOf = (svg: Tree | undefined): string | undefined =>
  /(?:stroke|fill)="(#[0-9A-F]{6})"/.exec(String(svg?.props?.source ?? ''))?.[1]

test('the desktop pane is cards: the head, four steps, and what to do now', async ($, on) => {
  const state = world(on)
  state.box = DRAFT
  const pane = await $.ui.mount({
    ...PANE,
    surface: 'desktop',
    props: { ...PANE.props, bodyColumns: 36, placement: 'dock' },
  })
  const steps = async () =>
    svgsIn(await pane.find({ key: 'stepper' })).map(svg => String(svg.props?.alt))

  for (const key of ['status-card', 'settings-card', 'history-card']) {
    expect((await pane.find({ key }))?.props).toMatchObject({
      borderStyle: 'round',
      borderColor: LINE,
      backgroundColor: CARD,
    })
  }

  // The steps of a draft: it is at the first, with the primary button to make a polish.
  expect(await steps()).toEqual(['Draft: now', 'Polish: next', 'Review: next', 'Apply: next'])
  expect((await pane.find({ key: 'status' }))?.text).toContain('Ready')
  expect(await pane.find({ key: 'polish' })).toBeDefined()

  // A row's words give way to what does not fit, and hide it: a flex item is
  // as wide as its content until it hides its overflow, so a long hint ran out
  // of its card. The name and the chevron keep their room.
  for (const key of ['setup', 'log']) {
    expect((await pane.find({ key: `${key}-words` }))?.props).toMatchObject({ flexShrink: 1, overflow: 'hidden' })
    expect(((await pane.find({ key: `${key}-words` })) as Tree | undefined)?.children?.[0]?.props?.flexShrink).toBe(0)
  }
  expect(await pointingOf(pane, 'log')).toBe('right')

  // The settings are folded to one row that says them, and opens them.
  expect(await wordsOf(pane, 'setup')).toBe('Settings')
  expect((await pane.find({ key: 'setup-box' }))?.text).toContain('Opus 5.5 · sonnet (low) · AUTO on')
  expect(await pointingOf(pane, 'setup')).toBe('right')
  for (const key of ['settings', 'auto', 'target', 'polisher', 'guide']) {
    expect(await pane.find({ key })).toBeUndefined()
  }

  await pane.press({ key: 'setup' })
  expect(await pointingOf(pane, 'setup')).toBe('down')
  expect((await pane.find({ key: 'setup-box' }))?.text).not.toContain('AUTO on')

  // Each setting's name stands over its control, in this order.
  const text = (await pane.find({ key: 'settings' }))?.text ?? ''
  const at = ['AUTO', 'Session model', 'Polish model', 'Effort', 'Opus 5.5 guide'].map(name => text.indexOf(name))
  expect(at.every(found => found >= 0)).toBe(true)
  expect([...at].sort((a, b) => a - b)).toEqual(at)

  // The switch is its row: the name, and the pill that says on or off.
  const pill = async () => String(svgsIn(await pane.find({ key: 'auto-box' }))[0]?.props?.alt)
  expect(await pill()).toBe('AUTO on')
  expect((await pane.find({ key: 'auto-part' }))?.text).toContain('Enter polishes first and shows you before sending.')
  await pane.press({ key: 'auto' })
  expect(await pill()).toBe('AUTO off')
  expect((await pane.find({ key: 'auto-part' }))?.text).toContain('Enter sends right away, with no polish.')
  expect((await pane.find({ key: 'status-card' }))?.text).not.toContain('AUTO off')
  await pane.press({ key: 'auto' })

  // The guide opens its line under its row.
  expect(await pointingOf(pane, 'guide')).toBe('right')
  expect(await pane.find({ key: 'about' })).toBeUndefined()
  await pane.press({ key: 'guide' })
  expect(await pointingOf(pane, 'guide')).toBe('down')
  expect((await pane.find({ key: 'about' }))?.text).toMatch(/Prompting tips for Claude Opus 5\.5\./)
  await pane.press({ key: 'guide' })

  // The steps follow the draft: polishing, review, applied.
  state.delay = 1000
  await pane.press({ key: 'polish' })
  expect(await steps()).toEqual(['Draft: done', 'Polish: now', 'Review: next', 'Apply: next'])
  expect(await pane.find({ key: 'settings-card' })).toBeUndefined()
  await state.clock.advance(1000)
  state.delay = 0
  expect(await steps()).toEqual(['Draft: done', 'Polish: done', 'Review: now', 'Apply: next'])
  await pane.press({ key: 'apply' })
  expect(await steps()).toEqual(['Draft: done', 'Polish: done', 'Review: done', 'Apply: now'])
  await pane.press({ key: 'restore' })
  expect(await steps()).toEqual(['Draft: now', 'Polish: next', 'Review: next', 'Apply: next'])
  await pane.unmount()
})

test('on the desktop a setting is a framed field, a list washes the one in use, and the efforts are segments', async ($, on) => {
  const state = world(on)
  state.box = DRAFT
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const pane = await $.ui.mount({ ...PANE, surface: 'desktop', props: DOCK })
  // A list's chips as drawn: the name, whether the chip is washed, and the tick.
  const rows = async (list: string) =>
    (((await pane.find({ key: list })) as Tree | undefined)?.children ?? []).map(row => {
      const button = (row.children ?? [])[0]
      expect(button?.type).toBe('Button')
      const tick = nodesIn(row).some(found => found.type === 'Text' && found.children?.[0] === '✓')

      return [button?.props?.label, row.props?.backgroundColor ?? '', tick ? '✓' : ''].join('|')
    })

  await pane.press({ key: 'setup' })
  // A select is a framed field: its value, and a chevron at the far end.
  expect((await pane.find({ key: 'target-box' }))?.props).toMatchObject({
    borderStyle: 'round',
    borderColor: STRONG,
    flexGrow: 1,
  })
  expect(await wordsOf(pane, 'target')).toBe('Opus 5.5 (Detected)')
  expect(await wordsOf(pane, 'polisher')).toBe('sonnet')
  expect(await pointingOf(pane, 'target')).toBe('down')

  await pane.press({ key: 'target' })
  expect(await pointingOf(pane, 'target')).toBe('up')
  expect(await rows('target-list')).toEqual([
    `Opus 5.5 (Detected)|${TINT}|✓`,
    'Opus 5.5||',
    'Sonnet 5.5||',
    'GPT-6 Astra||',
    'GPT-5.6||',
  ])

  // A pick takes and closes the list; opened again, the wash has moved, and
  // "auto" still names the model it would detect.
  await pane.press({ key: 'target-sonnet-5.5' })
  expect(await pane.find({ key: 'target-list' })).toBeUndefined()
  expect(await wordsOf(pane, 'target')).toBe('Sonnet 5.5')
  await pane.press({ key: 'target' })
  expect((await rows('target-list')).slice(0, 3)).toEqual([
    'Opus 5.5 (Detected)||',
    'Opus 5.5||',
    `Sonnet 5.5|${TINT}|✓`,
  ])
  await pane.press({ key: 'target-auto' })

  // The models are such a list.
  await pane.press({ key: 'polisher' })
  expect((await rows('model-list')).slice(0, 3)).toEqual([
    `sonnet|${TINT}|✓`,
    'opus||',
    'haiku||',
  ])
  // A pick folds the list, as a select's does; opened again, the model picked leads.
  await pane.press({ key: 'model-haiku' })
  expect(await pane.find({ key: 'model-list' })).toBeUndefined()
  expect(await wordsOf(pane, 'polisher')).toBe('haiku')
  await pane.press({ key: 'polisher' })
  expect((await rows('model-list'))[0]).toBe(`haiku|${TINT}|✓`)
  await pane.press({ key: 'polisher' })
  expect(await pane.find({ key: 'model-list' })).toBeUndefined()

  // The efforts are a row of segments in one frame, a fifth each, and always
  // in view: the one in use is washed, and any of them is picked by a click.
  const segments = async () =>
    nodesIn(await pane.find({ key: 'effort-segments' }))
      .filter(node => node.type === 'Box' && String(node.props?.key ?? '').match(/^effort-\w+-box$/))
      .map(box => {
        const button = (box.children ?? []).find(found => found.type === 'Button')

        return `${button?.props?.label}|${box.props?.backgroundColor ?? ''}|${box.props?.width}`
      })
  expect((await pane.find({ key: 'effort-segments' }))?.props).toMatchObject({
    borderStyle: 'round',
    borderColor: STRONG,
  })
  expect(await segments()).toEqual([
    `low|${TINT}|20%`,
    'med||20%',
    'high||20%',
    'xhigh||20%',
    'max||20%',
  ])
  await pane.press({ key: 'effort-high' })
  expect(await segments()).toEqual([
    'low||20%',
    'med||20%',
    `high|${TINT}|20%`,
    'xhigh||20%',
    'max||20%',
  ])
  await pane.press({ key: 'effort-medium' })
  expect((await segments())[1]).toBe(`med|${TINT}|20%`)
  await pane.press({ key: 'effort-high' })

  // What was picked is what polishes.
  await pane.press({ key: 'polish' })
  expect(state.models.at(-1)).toBe('haiku')
  expect(state.efforts.at(-1)).toBe('high')
  await pane.press({ key: 'discard' })

  await pane.press({ key: 'polisher' })
  await pane.press({ key: 'model-sonnet' })
  await pane.press({ key: 'polisher' })
  await pane.press({ key: 'effort-low' })
  await pane.unmount()
})

test('on the desktop every control is a framed box: the button to press, the quiet one, the field and the switch', async ($, on) => {
  const state = world(on)
  state.box = DRAFT
  const pane = await $.ui.mount({ ...PANE, surface: 'desktop', props: DOCK })
  // A button with the box it stands in: its frame and wash, and its icon.
  const drawn = async (key: string) => {
    const around = (await pane.find({ key: `${key}-box` })) as Tree | undefined
    const [icon] = svgsIn(around)
    // The catcher lies over it, last.
    expect(keysIn(around).at(-1)).toBe(`hit-${key}`)
    expect(keysIn(around)).toContain(key)

    return {
      words: (await pane.find({ key }))?.text,
      frame: around?.props?.borderStyle,
      edge: around?.props?.borderColor,
      wash: around?.props?.backgroundColor,
      icon: inkOf(icon),
      room: `${around?.props?.paddingX}|${around?.props?.paddingY}`,
    }
  }
  const pressed = { frame: 'round', edge: 'claude', wash: TINT, icon: CLAY, room: '2|0.5' }
  const quiet = { frame: 'round', edge: STRONG, wash: undefined, icon: QUIET, room: '1.5|0.5' }

  // The button to press is washed and framed in the accent; a quiet one is
  // framed in the app's line. Both stand in a box with the same room.
  expect(await drawn('polish')).toEqual({ words: 'Prompt Polish', ...pressed })
  await pane.press({ key: 'polish' })
  expect(await drawn('apply')).toEqual({ words: 'Apply Polish', ...pressed })
  expect(await drawn('refresh')).toEqual({ words: 'Retry Polish', ...quiet })
  expect(await drawn('discard')).toEqual({ words: 'Keep Original', ...quiet, icon: QUIET })
  await pane.press({ key: 'apply' })
  expect(state.box).toBe(POLISHED)
  expect(await drawn('restore')).toEqual({ words: 'Undo Apply', ...quiet })
  await pane.press({ key: 'restore' })
  expect(state.box).toBe(DRAFT)

  // A switch is a row: its name, and a pill in the app's blue while it is on,
  // a gray while it is off.
  await pane.press({ key: 'setup' })
  const pill = async () => {
    const [svg] = svgsIn(await pane.find({ key: 'auto-box' }))

    return [svg?.props?.alt, inkOf(svg), svg?.props?.width, svg?.props?.height].join('|')
  }
  expect(await pill()).toBe('AUTO on|#2F7DF6|34|20')
  await pane.press({ key: 'auto' })
  expect(await pill()).toBe('AUTO off|#8C8C8C|34|20')
  await pane.press({ key: 'auto' })
  await state.clock.advance(5000)

  // A field is a framed box that fills its row, and holds its chevron.
  expect(await drawn('target')).toMatchObject({ frame: 'round', edge: STRONG, wash: undefined, room: '1.5|0.5' })

  // For a GPT model the accent is the green.
  await pane.press({ key: 'target' })
  await pane.press({ key: 'target-gpt-5.6' })
  expect(await drawn('polish')).toEqual({
    words: 'Prompt Polish',
    frame: 'round',
    edge: GREEN,
    wash: `${GREEN}33`,
    icon: GREEN,
    room: '2|0.5',
  })
  await pane.press({ key: 'target' })
  await pane.press({ key: 'target-auto' })
  await pane.unmount()
})

test('on the desktop the loading mark is a stretch running a dotted track, and the review is the polish with the original under a toggle', async ($, on) => {
  const state = world(on)
  state.box = DRAFT
  state.delay = 1000

  for (const placement of ['dock', 'inline'] as const) {
    for (const bodyColumns of [20, 36, 120]) {
      const pane = await $.ui.mount({
        ...PANE,
        surface: 'desktop',
        props: { ...PANE.props, bodyColumns, placement },
      })
      const check = async () => {
        const drawn = nodesIn(await pane.find({ key: 'pane' }))
        expect(drawn.length).toBeGreaterThan(1)

        for (const node of drawn) {
          // A box is as wide as a name at most: never the pane's width.
          const width = node.props?.width
          expect(node.type === 'Box' && typeof width === 'number' && width > 14).toBe(false)

          // A button holds its words alone, for the app to draw its way.
          if (node.type === 'Button') {
            expect(node.props?.plain).toBe(true)
            expect(String(node.props?.label ?? '').trim()).not.toBe('')
            expect(node.children ?? []).toEqual([])
            // The app shows a key beside a button that has one: none has.
            expect(node.props?.hotkey).toBeUndefined()
          }

          // The app leaves out a drawing that says nothing, and a drawing
          // takes no color from the page: each has its words and its color.
          // An icon is 14 pixels a side, a switch 34 by 20, a step 18 a side;
          // the one drawing kept live is the loading track, a row of dots as
          // wide as the room it is given.
          if (node.type === 'Svg') {
            expect(String(node.props?.alt ?? '').trim()).not.toBe('')
            expect(node.props).toMatchObject(
              node.props?.isInteractive === true
                ? { alt: 'Polishing', height: 16 }
                : [{ width: 14, height: 14 }, { width: 34, height: 20 }, { width: 18, height: 18 }].find(
                    size => size.width === node.props?.width,
                  ) ?? { width: 14, height: 14 },
            )
            expect(String(node.props?.source)).not.toContain('currentColor')
            expect(inkOf(node)).toBeDefined()
          }
        }

        // No rule, track or bar of characters, and no word on the terminal's keys.
        expect(await pane.find({ text: /─{3}|━/ })).toBeUndefined()
        expect(await pane.find({ text: /ctrl\+x|fullscreen|Keys/ })).toBeUndefined()
      }

      await check()
      await pane.press({ key: 'setup' })
      await check()
      await pane.press({ key: 'setup' })

      // While polishing the settings and the working row give way to the
      // loading mark: in a frame of its own, what runs and who runs it, over
      // a dotted track a lit stretch runs along; and under the frame, at its
      // far end, Stop.
      await pane.press({ key: 'polish' })
      expect(await pane.find({ key: 'setup' })).toBeUndefined()
      expect(await pane.find({ key: 'action-row' })).toBeUndefined()
      const loader = await pane.find({ key: 'loader' })
      const working = (await pane.find({ key: 'working' })) as Tree | undefined
      expect(working?.props).toMatchObject({ borderStyle: 'round', borderColor: LINE })
      expect(loader?.text).toContain('Polishing prompt')
      expect(loader?.text).toContain('sonnet · effort low')
      // The track is the one drawing kept live, so that the stretch runs: dots
      // in the quiet gray from edge to edge, the stretch in the accent, and
      // asked for wider than any pane so that it is as wide as its frame.
      const [track, ...others] = svgsIn(working)
      expect(others).toEqual([])
      expect(track?.props).toMatchObject({ alt: 'Polishing', height: 16, isInteractive: true })
      expect(Number(track?.props?.width)).toBeGreaterThan(2000)
      const source = String(track?.props?.source)
      expect(source).toContain(`stroke="${QUIET}" stroke-width="2" stroke-dasharray="0.1 7.9"`)
      expect(source).toContain(`fill="${CLAY}"><animate attributeName="x"`)
      expect(source).toContain('repeatCount="indefinite"')
      expect(source).not.toContain('viewBox')
      expect(keysIn((await pane.find({ key: 'loader-foot' })) as Tree | undefined)).toEqual([
        'loader-foot',
        'cancel-box',
        'cancel',
        'hit-cancel',
      ])
      // Stop's mark is a ring round a small square, which nobody takes for a
      // box to tick as they did a square alone.
      const [mark] = svgsIn(await pane.find({ key: 'cancel-box' }))
      expect(mark?.props?.alt).toBe('Stop')
      expect(String(mark?.props?.source)).toContain('<circle cx="12" cy="12" r="10"/>')
      expect(inkOf(mark)).toBe(QUIET)
      // The mark and the time are a surface module's, in the accent, before the words.
      const [first] = working?.children?.[0]?.children ?? []
      expect(first?.props).toMatchObject({ key: 'spinner', module: 'hooks/spinner.tsx' })
      const clock = first?.props?.props as { since: number; now: number; color: string }
      expect(clock.color).toBe('claude')
      expect(clock.since).toBe(clock.now)
      // The state is a ring that turns while a polish runs: a drawing kept live.
      const [ring, ...more] = svgsIn(await pane.find({ key: 'status' }))
      expect(more).toEqual([])
      expect(ring?.props).toMatchObject({ alt: 'Polishing', width: 16, height: 16, isInteractive: true })
      expect(String(ring?.props?.source)).toContain('<animateTransform attributeName="transform" type="rotate"')
      expect(String(ring?.props?.source)).toContain(`stroke="${CLAY}"`)
      expect(await pane.find({ key: 'pulse' })).toBeUndefined()
      await check()

      // In review: the polish is the card that matters, washed and framed in
      // the color of its name; the draft is a toggle under it, folded.
      await state.clock.advance(1000)
      expect(await pane.find({ key: 'loader' })).toBeUndefined()
      expect((await pane.find({ key: 'polished' }))?.props).toMatchObject({
        borderColor: 'suggestion',
        backgroundColor: WASH,
      })
      expect((await pane.find({ key: 'polished' }))?.text).toContain(POLISHED)
      // In review the state is a mark that moves; the ring is gone.
      expect((await pane.find({ key: 'pulse' }))?.props.props).toEqual({ kind: 'review', color: 'suggestion' })
      expect(svgsIn(await pane.find({ key: 'status' }))).toEqual([])
      expect(await pane.find({ key: 'original' })).toBeUndefined()
      expect(await wordsOf(pane, 'original-toggle')).toBe(`Show original · ${DRAFT.trim().length} chars`)
      expect(await pointingOf(pane, 'original-toggle')).toBe('right')
      await check()

      await pane.press({ key: 'original-toggle' })
      expect((await pane.find({ key: 'original' }))?.props).toMatchObject({
        borderColor: LINE,
        backgroundColor: LIST,
      })
      expect((await pane.find({ key: 'original' }))?.text).toContain(DRAFT)
      expect(await wordsOf(pane, 'original-toggle')).toBe('Hide original')
      expect(await pointingOf(pane, 'original-toggle')).toBe('down')
      await check()
      const order = keysIn((await pane.find({ key: 'pane' })) as Tree | undefined)
      expect(order.indexOf('review-card')).toBeGreaterThan(order.indexOf('status-card'))
      expect(order.indexOf('polished')).toBeGreaterThan(order.indexOf('review-card'))
      expect(order.indexOf('original')).toBeGreaterThan(order.indexOf('polished'))
      expect(order.indexOf('action-row')).toBeGreaterThan(order.indexOf('original'))
      expect(order.indexOf('settings-card')).toBeGreaterThan(order.indexOf('action-row'))
      expect(order.indexOf('history-card')).toBeGreaterThan(order.indexOf('settings-card'))

      // The person's choice stays for the next review, and the answers are one
      // block: the answer that applies, then Retry and Keep Original.
      await pane.press({ key: 'discard' })
      await pane.press({ key: 'polish' })
      await state.clock.advance(1000)
      expect(await pane.find({ key: 'original' })).toBeDefined()
      expect(
        ownKeysIn((await pane.find({ key: 'action-row' })) as Tree | undefined).filter(
          key => !key.endsWith('-box'),
        ),
      ).toEqual(['action-row', 'apply', 'refresh', 'discard'])
      await pane.press({ key: 'original-toggle' })
      await pane.press({ key: 'discard' })

      // The record lists a dot in the color of what was done, when, and what.
      await pane.press({ key: 'log' })
      const [entry] = ((await pane.find({ key: 'log-list' })) as Tree | undefined)?.children ?? []
      const [dot, , word] = entry?.children ?? []
      expect(dot?.children?.[0]).toBe('●')
      expect(dot?.props?.color).toBe('suggestion')
      expect(word?.children?.[0]).toBe('Polished')
      await pane.press({ key: 'log' })
      await pane.unmount()
    }
  }
})

// A surface that draws the pane from a tree names a button by a handle the
// engine gives out afresh on each redraw, so the click that gives the pane
// the keyboard, and redraws it, is lost on its button. A catcher is named by
// its key: hooks/hit.tsx.
test('a catcher lies over each control on the desktop, and a click on it is the control\'s', async ($, on) => {
  const state = world(on)
  state.box = DRAFT
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const pane = await $.ui.mount({ ...PANE, surface: 'desktop', props: DOCK })
  /** The buttons drawn and the controls caught, each sorted. */
  const drawn = async () => {
    const nodes = nodesIn(await pane.find({ key: 'pane' }))

    return {
      buttons: nodes
        .filter(node => node.type === 'Button')
        .map(node => String(node.props?.key))
        .sort(),
      caught: nodes
        .filter(node => node.type === 'Client' && node.props?.module === 'hooks/hit.tsx')
        .map(node => String((node.props?.props as { press?: string }).press))
        .sort(),
    }
  }
  /** A click on the catcher of `key`: the button down on it, and let go on it. */
  const click = async (key: string) => {
    await pane.pointer({ type: 'down', x: 2, y: 0, button: 'left', in: `hit-${key}` })
    await pane.pointer({ type: 'up', x: 2, y: 0, button: 'left', in: `hit-${key}` })
  }

  // Every button is under a catcher of its own.
  const atRest = await drawn()
  expect(atRest.buttons).toEqual(['log', 'polish', 'setup'])
  expect(atRest.caught).toEqual(atRest.buttons)

  // A catcher is the last thing in its control's box, laid edge to edge over
  // all of it: the words, the chevron and the room about them.
  const set = (await pane.find({ key: 'setup-box' })) as Tree | undefined
  expect(set?.props).toMatchObject({ paddingY: 0.5, justifyContent: 'space-between' })
  expect(set?.children?.map(child => child.type)).toEqual(['Box', 'Svg', 'Box'])
  const over = set?.children?.at(-1)
  expect(over?.props).toEqual({ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 })
  expect(over?.children?.[0]?.props).toEqual({
    key: 'hit-setup',
    module: 'hooks/hit.tsx',
    props: { press: 'setup', rows: 2 },
    width: '100%',
    height: '100%',
  })

  // A click is the button down on the catcher and let go on it; let go off
  // the control it is taken back, as a button's is.
  await pane.pointer({ type: 'down', x: 2, y: 0, button: 'left', in: 'hit-setup' })
  expect(await pane.find({ key: 'settings' })).toBeUndefined()
  await pane.pointer({ type: 'up', x: 2, y: 0, button: 'left', in: 'hit-setup' })
  expect(await pane.find({ key: 'settings' })).toBeDefined()
  await pane.pointer({ type: 'down', x: 2, y: 0, button: 'left', in: 'hit-setup' })
  await pane.pointer({ type: 'up', x: 2, y: 5, button: 'left', in: 'hit-setup' })
  expect(await pane.find({ key: 'settings' })).toBeDefined()
  await pane.pointer({ type: 'up', x: 2, y: 0, button: 'left', in: 'hit-setup' })
  expect(await pane.find({ key: 'settings' })).toBeDefined()
  await pane.pointer({ type: 'down', x: 2, y: 0, button: 'right', in: 'hit-setup' })
  await pane.pointer({ type: 'up', x: 2, y: 0, button: 'right', in: 'hit-setup' })
  expect(await pane.find({ key: 'settings' })).toBeDefined()

  // The settings are under catchers too: a list's row is caught whole, and so
  // is each segment of the efforts, the one in use among them.
  expect((await drawn()).caught).toEqual([
    'auto',
    'effort-high',
    'effort-low',
    'effort-max',
    'effort-medium',
    'effort-xhigh',
    'guide',
    'log',
    'polish',
    'polisher',
    'setup',
    'target',
  ])
  await click('target')
  expect(await pane.find({ key: 'target-list' })).toBeDefined()
  const row = (await pane.find({ key: 'target-gpt-5.6-row' })) as Tree | undefined
  expect(ownKeysIn(row)).toEqual(['target-gpt-5.6-row', 'target-gpt-5.6'])
  await click('target-gpt-5.6')
  expect(await wordsOf(pane, 'target')).toBe('GPT-5.6')
  await click('target')
  await click('target-auto')
  expect((await pane.find({ key: 'hit-effort-low' }))?.props.props).toEqual({
    press: 'effort-low',
    rows: 2,
  })
  await click('effort-high')
  await click('polisher')
  await click('model-haiku')
  expect(await pane.find({ key: 'model-list' })).toBeUndefined()
  expect(await wordsOf(pane, 'polisher')).toBe('haiku')

  // A catcher posts its control's key, and the pane does what the control
  // does only while it draws that control: a post that names one a redraw
  // has taken away, or none, or a model not offered, does nothing.
  await pane.post({ press: 'apply' }, { in: 'hit-polish' })
  await pane.post({ press: 'older' }, { in: 'hit-polish' })
  await pane.post({ press: 'original-toggle' }, { in: 'hit-polish' })
  await pane.post({ press: 'target-gpt-5.6' }, { in: 'hit-polish' })
  await pane.post({ press: 'model-not-offered' }, { in: 'hit-polish' })
  await pane.post({ press: 'no-such-control' }, { in: 'hit-polish' })
  await pane.post({ pick: 'polish' }, { in: 'hit-polish' })
  expect(state.box).toBe(DRAFT)
  expect(await wordsOf(pane, 'target')).toBe('Opus 5.5 (Detected)')
  expect(await wordsOf(pane, 'polisher')).toBe('haiku')
  expect(state.prompts).toEqual([])

  // The working row and the review, by clicks alone.
  state.reply = POLISHED
  await click('polish')
  expect(state.models.at(-1)).toBe('haiku')
  expect(state.efforts.at(-1)).toBe('high')
  expect((await drawn()).caught).toContain('apply')
  state.reply = AGAIN
  await click('refresh')
  expect((await pane.find({ key: 'versions' }))?.text.replace(/\s+/g, '')).toBe('‹Version2of2›')
  await click('older')
  expect((await pane.find({ key: 'polished' }))?.text).toContain(POLISHED)
  await click('newer')
  await click('older')
  await click('original-toggle')
  expect((await pane.find({ key: 'original' }))?.text).toContain(DRAFT)
  await click('original-toggle')
  await click('apply')
  expect(state.box).toBe(POLISHED)
  await click('restore')
  expect(state.box).toBe(DRAFT)
  await click('polish')
  await click('discard')
  expect(await pane.find({ key: 'polished' })).toBeUndefined()

  // While a polish runs only what is drawn is caught: Stop and the record.
  // A click on anything else is no click, and Stop stops.
  state.delay = 1000
  await click('polish')
  expect((await drawn()).caught).toEqual(['cancel', 'log'])
  await pane.post({ press: 'auto' }, { in: 'hit-cancel' })
  await pane.post({ press: 'setup' }, { in: 'hit-cancel' })
  await click('cancel')
  await state.clock.advance(1000)
  expect(await pane.find({ key: 'polished' })).toBeUndefined()
  expect(String(svgsIn(await pane.find({ key: 'auto-box' }))[0]?.props?.alt)).toBe('AUTO on')
  state.delay = 0

  await click('polisher')
  await click('model-sonnet')
  await click('effort-low')
  await pane.unmount()
})

test('/polish plain leaves the desktop on its buttons, and the other surfaces draw the terminal\'s pane', async ($, on) => {
  const state = world(on)
  state.box = DRAFT
  const run = (args: string) =>
    $.command.run({
      command: 'polish',
      args,
      origin: USER,
      presentation: { isFullscreen: false, columns: 100 },
    })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const clients = async (pane: Finder) =>
    nodesIn(await pane.find({ key: 'pane' }))
      .filter(node => node.type === 'Client')
      .map(node => String(node.props?.key))

  // The VS Code extension and the mobile app run no surface module: they
  // draw the terminal's pane from its cells, its marks in its words.
  for (const surface of ['vscode', 'mobile'] as const) {
    const pane = await $.ui.mount({ ...PANE, surface, props: DOCK })
    expect(await clients(pane)).toEqual([])
    expect(svgsIn(await pane.find({ key: 'pane' }))).toEqual([])
    expect(await pane.find({ key: 'target-box' })).toBeUndefined()
    expect(await pane.find({ type: 'Text', text: '●' })).toBeDefined()
    expect((await pane.find({ key: 'target' }))?.text).toContain('Session Model : Opus 5.5 (Detected) ▾')
    expect((await pane.find({ key: 'log' }))?.text).toContain('History 0 ▴')
    await pane.press({ key: 'target' })
    expect((await pane.find({ key: 'target' }))?.text).toContain('▴')
    await pane.press({ key: 'target' })
    await pane.unmount()
  }

  // The desktop has catchers, with the chevron a drawing under each.
  const pane = await $.ui.mount({ ...PANE, surface: 'desktop', props: DOCK })
  expect(await clients(pane)).toContain('hit-setup')
  expect(await wordsOf(pane, 'setup')).toBe('Settings')
  expect(await pointingOf(pane, 'setup')).toBe('right')

  // `/polish plain` is the way out should the catchers lose clicks: it leaves
  // them out, and the chevron is the end of the button's words, where a click
  // on it is the button's. Again, they are back.
  expect((await run('plain')).text).toContain('Plain buttons: ON')
  // A pane at rest has a dot that does not move, so no mark of a module's.
  expect(await clients(pane)).toEqual([])
  expect((await pane.find({ key: 'setup' }))?.text).toBe('Settings ▸')
  await pane.press({ key: 'setup' })
  expect((await pane.find({ key: 'setup' }))?.text).toBe('Settings ▾')
  expect((await pane.find({ key: 'auto' }))?.text).toBe('AUTO On')
  await pane.press({ key: 'target' })
  expect(await pane.find({ key: 'target-list' })).toBeDefined()
  await pane.press({ key: 'target-sonnet-5.5' })
  expect((await pane.find({ key: 'target' }))?.text).toBe('Sonnet 5.5 ▾')
  await pane.press({ key: 'target' })
  await pane.press({ key: 'target-auto' })
  await pane.press({ key: 'setup' })
  expect((await run('plain')).text).toContain('Plain buttons: OFF')
  expect(await clients(pane)).toContain('hit-setup')
  await pane.unmount()
})

const BAND = {
  plugin: 'prompt-polish',
  component: 'AbovePrompt',
  surface: 'desktop',
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 10,
    bodyColumns: 100,
    scroll: { offset: 0, bodyRows: 10 },
    view: {},
  },
} as const

test('on the desktop the pane is a band above the prompt box, and a polish is read in full in the pane', async ($, on) => {
  const state = world(on)
  state.surfaces = ['desktop']
  state.box = DRAFT
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  // The band is where it is drawn: no pane is opened at the start.
  expect(state.opens).toBe(0)
  const band = await $.ui.mount(BAND)
  const pill = async () => String(svgsIn(await band.find({ key: 'auto-box' }))[0]?.props?.alt)
  /** The keys of the controls in a row, in the order drawn, less the boxes they stand in. */
  const controlsIn = async (key: string) =>
    ownKeysIn((await band.find({ key })) as Tree | undefined).filter(
      found =>
        found !== key &&
        found !== 'pulse' &&
        found !== 'spinner' &&
        !/-(box|words|pill|fill|before|row|part)$/.test(found),
    )

  // The head: the name at the left; at the right AUTO, and the state last.
  expect((await band.find({ key: 'band-card' }))?.props).toMatchObject({
    borderStyle: 'round',
    borderColor: LINE,
    backgroundColor: CARD,
  })
  expect((await band.find({ key: 'band-head' }))?.text).toContain('Prompt Polish')
  expect((await band.find({ key: 'status' }))?.text).toContain('Ready')
  expect(await controlsIn('band-head')).toEqual(['title', 'auto', 'status'])
  expect(await pill()).toBe('AUTO on')

  // The settings are three selects on one line, each with its name.
  expect(await controlsIn('band-settings')).toEqual(['target', 'polisher', 'effort'])
  expect(await wordsOf(band, 'target')).toBe('Opus 5.5 (Detected)')
  expect(await wordsOf(band, 'polisher')).toBe('sonnet')
  expect(await wordsOf(band, 'effort')).toBe('low')
  expect((await band.find({ key: 'target-box' }))?.text).toContain('Session')
  expect((await band.find({ key: 'polisher-box' }))?.text).toContain('Polish')
  expect((await band.find({ key: 'effort-box' }))?.text).toContain('Effort')
  expect((await band.find({ key: 'target-box' }))?.props).toMatchObject({ flexGrow: 1, flexShrink: 0 })
  expect(await band.find({ key: 'setup' })).toBeUndefined()

  // Nothing is going on, so there is no stage; the foot has what to do now at
  // the left, and History at the right.
  const foot = async () => controlsIn('action-row')
  expect(await band.find({ key: 'band-stage' })).toBeUndefined()
  expect(await foot()).toEqual(['polish', 'log'])

  // Every control is the kit's: a framed box, with a catcher over it.
  const caught = async () =>
    nodesIn(await band.find({ key: 'band' }))
      .filter(node => node.type === 'Client' && node.props?.module === 'hooks/hit.tsx')
      .map(node => String((node.props?.props as { press?: string }).press))
      .sort()
  expect(await caught()).toEqual(['auto', 'effort', 'log', 'polish', 'polisher', 'target'])
  const click = async (key: string) => {
    await band.pointer({ type: 'down', x: 2, y: 0, button: 'left', in: `hit-${key}` })
    await band.pointer({ type: 'up', x: 2, y: 0, button: 'left', in: `hit-${key}` })
  }

  // The settings are changed in the head and the line under it. A list opens
  // under the settings and takes the place of the stage and the foot, so the
  // band is no taller for it; a pick folds it.
  await click('auto')
  expect(await pill()).toBe('AUTO off')
  await click('auto')
  await click('target')
  expect(await band.find({ key: 'target-list' })).toBeDefined()
  expect(await band.find({ key: 'action-row' })).toBeUndefined()
  expect(await pointingOf(band, 'target')).toBe('up')
  await click('target-sonnet-5.5')
  expect(await band.find({ key: 'target-list' })).toBeUndefined()
  expect(await foot()).toEqual(['polish', 'log'])
  expect(await wordsOf(band, 'target')).toBe('Sonnet 5.5')
  await click('target')
  await click('target-auto')
  await click('target')
  await click('guide')
  expect((await band.find({ key: 'about' }))?.text).toMatch(/Prompting tips for Claude Opus 5\.5\./)
  await click('guide')
  await click('target')

  // The models are chips that wrap in a tray: the one in use is washed and
  // ticked, and a pick folds the tray.
  await click('polisher')
  const chips = (await band.find({ key: 'model-list' })) as Tree | undefined
  expect(chips?.props).toMatchObject({ flexWrap: 'wrap', backgroundColor: LIST })
  expect(chips?.children?.map(chip => chip.props?.backgroundColor ?? '')[0]).toBe(TINT)
  expect(await band.find({ key: 'effort-segments' })).toBeUndefined()
  expect(await band.find({ key: 'unlisted' })).toBeUndefined()
  await click('model-haiku')
  expect(await band.find({ key: 'model-list' })).toBeUndefined()
  expect(await wordsOf(band, 'polisher')).toBe('haiku')

  // The effort is a select of its own, and its pick folds its list too.
  await click('effort')
  expect((await band.find({ key: 'effort-list' }))?.children?.map(chip => chip.props?.backgroundColor ?? '')).toEqual([TINT, '', '', '', ''])
  await click('effort-high')
  expect(await band.find({ key: 'effort-list' })).toBeUndefined()
  expect(await wordsOf(band, 'effort')).toBe('high')

  // A click for a control the band does not draw now does nothing.
  await band.post({ press: 'setup' }, { in: 'hit-polish' })
  await band.post({ press: 'original-toggle' }, { in: 'hit-polish' })
  await band.post({ press: 'panel' }, { in: 'hit-polish' })
  await band.post({ press: 'effort-low' }, { in: 'hit-polish' })
  await band.post({ press: 'model-sonnet' }, { in: 'hit-polish' })
  expect(await wordsOf(band, 'effort')).toBe('high')
  expect(await wordsOf(band, 'polisher')).toBe('haiku')
  expect(state.opens).toBe(0)

  // Polishing: the settings give way to the loading mark in the stage; the
  // foot stays, with Stop where the button was, and History where it was.
  state.delay = 1000
  await click('polish')
  expect(state.models.at(-1)).toBe('haiku')
  expect(state.efforts.at(-1)).toBe('high')
  expect((await band.find({ key: 'band-stage' }))?.props).toMatchObject({ minHeight: 4.5 })
  expect(await band.find({ key: 'working' })).toBeDefined()
  // The selects cannot be used while it runs, and say what runs in their place.
  expect(await band.find({ key: 'target' })).toBeUndefined()
  expect(await controlsIn('band-settings')).toEqual(['target-now', 'polisher-now', 'effort-now'])
  expect((await band.find({ key: 'band-settings' }))?.text).toContain('haiku')
  expect((await band.find({ key: 'band-settings' }))?.text).toContain('high')
  expect(await controlsIn('band-head')).toEqual(['title', 'status'])
  expect(await foot()).toEqual(['cancel', 'log'])
  expect(await caught()).toEqual(['cancel', 'log'])
  expect(state.opens).toBe(0)
  await state.clock.advance(1000)
  state.delay = 0

  // In review the stage holds the start of the polish, as high as the loading
  // mark was; the draft and the polish in full are in the pane, which opened
  // for the review and left the keyboard where it was.
  expect(state.opens).toBe(1)
  expect(state.isOpen).toBe(true)
  expect(state.isAsked).toBe(false)
  expect((await band.find({ key: 'band-stage' }))?.props).toMatchObject({ minHeight: 4.5 })
  expect(await band.find({ key: 'working' })).toBeUndefined()
  expect(await band.find({ key: 'original' })).toBeUndefined()
  expect((await band.find({ key: 'polished' }))?.text).toContain(POLISHED)
  expect((await band.find({ key: 'polished' }))?.props).toMatchObject({
    borderColor: 'suggestion',
    backgroundColor: WASH,
  })
  expect(await foot()).toEqual(['apply', 'refresh', 'discard', 'panel', 'log'])
  expect((await band.find({ key: 'apply-box' }))?.props).toMatchObject({ borderColor: 'claude', backgroundColor: TINT })
  state.reply = AGAIN
  await click('refresh')
  expect((await band.find({ key: 'versions' }))?.text.replace(/\s+/g, '')).toBe('‹Version2of2›')
  expect(await foot()).toEqual(['apply', 'refresh', 'discard', 'panel', 'log'])
  expect(await controlsIn('band-stage')).toContain('older')
  await click('older')
  expect((await band.find({ key: 'polished' }))?.text).toContain(POLISHED)
  await click('newer')

  // Full view opens the pane again where it was put away; History opens it
  // with the record, which the band has no list of.
  expect(state.opens).toBe(2)
  await click('panel')
  expect(state.opens).toBe(3)
  await click('log')
  expect(state.opens).toBe(4)
  const pane = await $.ui.mount({ ...PANE, surface: 'desktop', props: DOCK })
  expect(await pane.find({ key: 'log-list' })).toBeDefined()
  expect((await pane.find({ key: 'polished' }))?.text).toContain(AGAIN)
  await pane.press({ key: 'log' })
  await pane.unmount()

  // A polish longer than the stage is cut with an ellipsis; the pane has it all.
  const LONG = POLISHED.repeat(8)
  state.reply = LONG
  await click('refresh')
  const cut = (await band.find({ key: 'polished' }))?.text ?? ''
  expect(cut).toContain('…')
  expect(cut.length).toBeLessThan(LONG.length)
  expect(((await band.find({ key: 'polished' })) as Tree | undefined)?.children?.[1]?.props).toMatchObject({ height: 2, overflow: 'hidden' })

  // Apply puts the polish in the prompt box and the pane away; the band stays.
  await click('apply')
  expect(state.box).toBe(LONG)
  expect(state.isOpen).toBe(false)
  expect(await band.find({ key: 'polished' })).toBeUndefined()
  expect(await band.find({ key: 'band-stage' })).toBeUndefined()
  expect(await foot()).toEqual(['polish', 'restore', 'log'])
  await click('restore')
  expect(state.box).toBe(DRAFT)
  state.reply = POLISHED
  await click('polish')
  expect(state.isOpen).toBe(true)
  await click('discard')
  expect(state.isOpen).toBe(false)
  await band.unmount()
})

test('/polish close puts the band away, and /polish brings it back', async ($, on) => {
  const state = world(on)
  state.surfaces = ['desktop']
  const run = (args: string) =>
    $.command.run({
      command: 'polish',
      args,
      origin: USER,
      presentation: { isFullscreen: false, columns: 100 },
    })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const drawn = async () => {
    try {
      const band = await $.ui.mount(BAND)
      const isDrawn = (await band.find({ key: 'band' })) !== undefined
      await band.unmount()

      return isDrawn
    } catch {
      return false
    }
  }

  expect(await drawn()).toBe(true)
  expect((await run('close')).text).toBe('Prompt Polish closed.')
  expect(await drawn()).toBe(false)
  const opened = (await run('')).text ?? ''
  expect(opened).toBe('Prompt Polish opened.')
  expect(await drawn()).toBe(true)
  expect(state.opens).toBe(0)
})

test('the terminal keeps its pane when the desktop is not the only surface, and the band is the desktop\'s alone', async ($, on) => {
  const state = world(on)
  state.box = DRAFT

  // A terminal session opens the pane at the start, and draws no band.
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  expect(state.opens).toBe(1)
  let isBand = true

  try {
    const band = await $.ui.mount({ ...BAND, surface: 'terminal' })
    isBand = (await band.find({ key: 'band' })) !== undefined
    await band.unmount()
  } catch {
    isBand = false
  }

  expect(isBand).toBe(false)

  // With the terminal attached beside the desktop, the pane opens for the
  // terminal, and the desktop still draws the band.
  state.surfaces = ['terminal', 'desktop']
  await $.command.run({
    command: 'polish',
    args: '',
    origin: USER,
    presentation: { isFullscreen: true, columns: 200 },
  })
  expect(state.opens).toBe(2)
  const band = await $.ui.mount(BAND)
  expect(await band.find({ key: 'band' })).toBeDefined()
  await band.unmount()
})

test('a retry adds a version to page through, and Apply takes the one on show', async ($, on) => {
  const state = world(on)
  const THIRD = '로그인 버그의 원인을 찾아 고치고, 테스트 결과를 알려줘.'

  for (const surface of ['terminal', 'desktop'] as const) {
    state.box = DRAFT
    state.reply = POLISHED
    const pane = await $.ui.mount({ ...PANE, surface, props: DOCK })
    const shown = async () => (await pane.find({ key: 'polished' }))?.text ?? ''
    // The pager as it reads, less the room between its parts, which is
    // spaces on the grid and a gap off it.
    const paging = async () =>
      (await pane.find({ key: 'versions' }))?.text.replace(/\s+/g, '')
    // On the grid the pager is the numbers between the arrows; on the desktop
    // it says "Version" and "of".
    const page = (n: number, of: number) =>
      surface === 'terminal' ? `‹${n}/${of}›` : `‹Version${n}of${of}›`
    const keysOf = async (key: string) =>
      ownKeysIn((await pane.find({ key })) as Tree | undefined).filter(
        found => !found.endsWith('-set') && !found.endsWith('-block') && !found.endsWith('-box'),
      )

    // One polish is one version: there is nothing to page.
    await pane.press({ key: 'polish' })
    expect(await pane.find({ key: 'versions' })).toBeUndefined()

    // A retry adds one and shows it. On the grid the pager is the working
    // row's last thing, at its far end; off it, it is in the head of the
    // polished prompt's card. At the newest version the arrow on is no button.
    state.reply = AGAIN
    await pane.press({ key: 'refresh' })
    expect(await shown()).toContain(AGAIN)
    expect(await paging()).toBe(page(2, 2))
    expect(await keysOf('action-row')).toEqual(
      surface === 'terminal'
        ? ['action-row', 'apply', 'refresh', 'discard', 'versions', 'older']
        : ['action-row', 'apply', 'refresh', 'discard'],
    )
    expect(await keysOf('polished')).toEqual(['polished'])
    // On the desktop the pager is in the head of the review card.
    expect((await keysOf('review-card')).slice(0, 3)).toEqual(
      surface === 'terminal' ? [] : ['review-card', 'pager-row', 'versions'],
    )
    expect((await pane.find({ key: 'older' }))?.type).toBe('Button')
    expect(await pane.find({ key: 'newer' })).toBeUndefined()

    // A press back shows the one before, and at the oldest the arrow back is
    // no button.
    await pane.press({ key: 'older' })
    expect(await shown()).toContain(POLISHED)
    expect(await paging()).toBe(page(1, 2))
    expect(await pane.find({ key: 'older' })).toBeUndefined()
    expect((await pane.find({ key: 'newer' }))?.type).toBe('Button')
    await pane.press({ key: 'newer' })
    expect(await shown()).toContain(AGAIN)
    await pane.press({ key: 'older' })

    // A retry polishes away from the version on show. While it runs the
    // working row is gone, and the pager with it, and the preview stays;
    // its result is the newest.
    state.reply = THIRD
    state.delay = 1000
    await pane.press({ key: 'refresh' })
    expect(await pane.find({ key: 'action-row' })).toBeUndefined()
    expect(await pane.find({ key: 'versions' })).toBeUndefined()
    expect(await shown()).toContain(POLISHED)
    await state.clock.advance(1000)
    state.delay = 0
    expect(state.prompts.at(-1)).toContain(`<rejected>\n${POLISHED}\n</rejected>`)
    expect(await paging()).toBe(page(3, 3))
    expect(await shown()).toContain(THIRD)

    // A retry that comes to a version already made shows that one, and adds none.
    state.reply = AGAIN
    await pane.press({ key: 'refresh' })
    expect(await paging()).toBe(page(2, 3))
    expect(await shown()).toContain(AGAIN)

    // With the keys listed, the two arrows have theirs: the terminal's keys.
    if (surface === 'terminal') {
      await pane.press({ key: 'keys' })
      expect((await pane.find({ key: 'older' }))?.props.hotkey).toBe('b')
      expect((await pane.find({ key: 'newer' }))?.props.hotkey).toBe('n')
      await pane.press({ key: 'keys' })
    }

    // Apply takes the version on show, and the versions go with the preview.
    await pane.press({ key: 'older' })
    await pane.press({ key: 'apply' })
    expect(state.box).toBe(POLISHED)
    expect(await pane.find({ key: 'versions' })).toBeUndefined()
    await pane.press({ key: 'restore' })
    expect(state.box).toBe(DRAFT)

    // A new polish starts them over, and so does a retry of a draft edited since.
    state.reply = POLISHED
    await pane.press({ key: 'polish' })
    expect(await pane.find({ key: 'versions' })).toBeUndefined()
    state.reply = AGAIN
    await pane.press({ key: 'refresh' })
    expect(await paging()).toBe(page(2, 2))
    state.box = `${DRAFT} 테스트도 추가해줘.`
    state.reply = THIRD
    await pane.press({ key: 'refresh' })
    expect(await shown()).toContain(THIRD)
    expect(await pane.find({ key: 'versions' })).toBeUndefined()

    // Keep Original drops them with the preview.
    state.reply = AGAIN
    await pane.press({ key: 'refresh' })
    expect(await paging()).toBe(page(2, 2))
    await pane.press({ key: 'discard' })
    await pane.press({ key: 'polish' })
    expect(await pane.find({ key: 'versions' })).toBeUndefined()
    await pane.press({ key: 'discard' })
    await pane.unmount()
  }
})

test('the terminal draws no SVG, and its marks are in its words', async ($, on) => {
  const state = world(on)
  state.box = DRAFT
  state.delay = 1000
  const terminal = await $.ui.mount(DOCKED)

  expect(svgsIn(await terminal.find({ key: 'pane' }))).toEqual([])
  expect(await terminal.find({ key: 'target-set' })).toBeUndefined()
  expect((await terminal.find({ key: 'target' }))?.text).toContain('Session Model : Opus 5.5 (Detected) ▾')
  await terminal.press({ key: 'polish' })
  expect(svgsIn(await terminal.find({ key: 'pane' }))).toEqual([])
  expect(
    Object.keys(((await terminal.find({ key: 'spinner' }))?.props.props ?? {}) as object),
  ).toEqual(['since', 'now', 'color'])
  await state.clock.advance(1000)
  await terminal.press({ key: 'discard' })
})

test('the keys list is the terminal\'s: the desktop has none', async ($, on) => {
  const state = world(on)
  state.box = DRAFT

  // The desktop has no keys list: its buttons are clicked, with Tab and Enter.
  const desktop = await $.ui.mount({ ...PANE, surface: 'desktop', props: DOCK })
  expect(await desktop.find({ key: 'keys' })).toBeUndefined()
  expect(await desktop.find({ text: /Keys|ctrl\+x/ })).toBeUndefined()
  await desktop.unmount()

  for (const surface of ['terminal', 'vscode', 'mobile'] as const) {
    const pane = await $.ui.mount({ ...PANE, surface, props: DOCK })

    await pane.press({ key: 'keys' })
    const list = (await pane.find({ key: 'keys-list' }))?.text ?? ''
    expect(list).toContain('Keys work while this list is open.')
    expect(list).toContain('Click the pane or press ctrl+x tab first.')

    // Open, the buttons have their keys on every surface.
    for (const [key, hotkey] of Object.entries({ polish: 'p', auto: 'a', target: 't', log: 'l' })) {
      expect((await pane.find({ key }))?.props.hotkey).toBe(hotkey)
    }

    await pane.press({ key: 'keys' })
    expect((await pane.find({ key: 'polish' }))?.props.hotkey).toBeUndefined()
    await pane.unmount()
  }
})

test('opening the pane names the terminal\'s chord only where a terminal draws', async ($, on) => {
  const state = world(on)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  const open = () =>
    $.command.run({
      command: 'polish',
      args: '',
      origin: USER,
      presentation: { isFullscreen: true, columns: 200 },
    })

  expect((await open()).text).toContain('Prompt Polish opened. Press ctrl+x tab to use its keys.')

  state.surfaces = ['desktop']
  const onDesktop = (await open()).text ?? ''
  expect(onDesktop).toContain('Prompt Polish opened.')
  expect(onDesktop).not.toContain('ctrl+x')
})

test('/p_polish is the same command as /polish: it opens the pane, and polishes', async ($, on) => {
  const state = world(on)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  expect(state.commands).toEqual(['polish', 'p_polish'])

  const run = (args: string) =>
    $.command.run({
      command: 'p_polish',
      args,
      origin: USER,
      presentation: { isFullscreen: true, columns: 200 },
    })

  // Alone, over an empty prompt box, it opens the pane.
  state.isOpen = false
  expect((await run('')).text).toContain('Prompt Polish opened')
  expect(state.isOpen).toBe(true)

  // With a prompt it polishes; with a setting it sets.
  expect((await run(DRAFT)).text).toContain('Polished for Opus 5.5')
  expect((await run('auto')).text).toContain('AUTO: OFF')
  expect((await run('auto')).text).toContain('AUTO: ON')
})

test('a polish is given the project, the files named and the last answer, and nothing else of the session', async ($, on) => {
  const state = world(on)
  state.box = 'auth/login.ts 의 로그인 버그 좀 고쳐줄 수 있어? .env 도 확인해줘'
  const pane = await $.ui.mount(DOCKED)

  await pane.press({ key: 'polish' })
  const sent = state.prompts.at(-1) ?? ''

  // The map of the project, its instructions and its manifest.
  expect(sent).toContain('<project>')
  expect(sent).toContain('## 파일 목록 (5개)')
  expect(sent).toContain('auth/session.ts')
  expect(sent).toContain('커밋 메시지는 영어로 쓴다.')
  expect(sent).toContain('"next": "15"')
  // The file the draft names, read; the one it does not, listed only.
  expect(sent).toContain('<files>\n### auth/login.ts')
  expect(sent).toContain('export const login')
  expect(sent).not.toContain('export const refresh')
  // A file of secrets is listed by name and never read.
  expect(sent).toContain('.env')
  expect(sent).not.toContain('hunter2')
  // Of the session, the last answer alone.
  expect(sent).toContain('<last_answer>\n세션 토큰 갱신에 문제가 있습니다.')
  expect(sent).not.toContain('<conversation>')
  expect(sent).not.toContain('살펴봐줘')
  // From what changes least to what changes most.
  const order = ['<project>', '<files>', '<last_answer>', '<draft>'].map(tag =>
    sent.indexOf(tag),
  )
  expect(order).toEqual([...order].sort((a, b) => a - b))
  expect(order[0]).toBe(0)
  await pane.press({ key: 'discard' })
})

test('a retry is given what its polish read, and a new polish reads the project again', async ($, on) => {
  const state = world(on)
  state.box = DRAFT
  const pane = await $.ui.mount(DOCKED)
  const before = (text: string) => text.slice(0, text.indexOf('<draft>'))

  await pane.press({ key: 'polish' })
  expect(state.lists).toBe(1)
  const first = state.prompts.at(-1) ?? ''

  // The project changes on disk; the retry does not read it again, and its
  // request opens exactly as the polish's did.
  state.files['auth/new.ts'] = 'export {}'
  state.reply = AGAIN
  await pane.press({ key: 'refresh' })
  expect(state.lists).toBe(1)
  expect(before(state.prompts.at(-1) ?? '')).toBe(before(first))
  expect(state.prompts.at(-1)).toContain('<rejected>')

  // A retry of a draft edited in the box: the project and the answer are
  // still what was read, and the file the draft now names is read.
  const upTo = (text: string, tag: string) => text.slice(0, text.indexOf(tag))
  state.box = `${DRAFT} auth/session.ts 도 봐줘`
  await pane.press({ key: 'refresh' })
  const edited = state.prompts.at(-1) ?? ''
  expect(state.lists).toBe(2)
  expect(upTo(edited, '</project>')).toBe(upTo(first, '</project>'))
  expect(edited).not.toContain('auth/new.ts')
  expect(first).not.toContain('<files>')
  expect(edited).toContain('<files>\n### auth/session.ts')
  expect(edited).toContain('<last_answer>\n세션 토큰 갱신에 문제가 있습니다.')

  await pane.press({ key: 'discard' })

  // A new polish reads the project as it now stands.
  state.reply = POLISHED
  await pane.press({ key: 'polish' })
  expect(state.lists).toBe(3)
  expect(state.prompts.at(-1)).toContain('auth/new.ts')
  expect(state.prompts.at(-1)).toContain('## 파일 목록 (6개)')

  await pane.press({ key: 'apply' })
  await pane.press({ key: 'restore' })
})

test('with no project to read, a polish is given the last answer and the draft', async ($, on) => {
  const state = world(on)
  state.files = {}
  state.box = DRAFT
  const pane = await $.ui.mount(DOCKED)

  await pane.press({ key: 'polish' })
  expect(state.prompts.at(-1)).not.toContain('<project>')
  expect(state.prompts.at(-1)).not.toContain('<files>')
  expect(state.prompts.at(-1)?.startsWith('<last_answer>')).toBe(true)
  expect(state.prompts.at(-1)).toContain(`<draft>\n${DRAFT}\n</draft>`)
  await pane.press({ key: 'discard' })
})

test('the project is mapped short, and files are found by the names a text gives them', () => {
  const paths = pathsOf('src\\b.ts\nsrc/a.ts\n\nREADME.md\nsrc/a.ts\nlib/util/a.ts\n')
  expect(paths).toEqual(['README.md', 'lib/util/a.ts', 'src/a.ts', 'src/b.ts'])

  // A small project is listed whole.
  expect(mapOf(paths)).toBe(paths.join('\n'))

  // A large one: the files near the root by name, the rest counted by folder.
  const many = pathsOf(
    [
      'README.md',
      'src/index.ts',
      ...Array.from({ length: 200 }, (_, i) => `src/pages/p${i}.tsx`),
      ...Array.from({ length: 30 }, (_, i) => `test/unit/t${i}.ts`),
    ].join('\n'),
  )
  expect(mapOf(many).split('\n')).toEqual([
    'README.md',
    'src/index.ts',
    'src/pages/ (200 files)',
    'test/unit/ (30 files)',
  ])

  // By whole path, by its end, or by a file name one file alone has; a name
  // two files share finds neither. A Korean particle after the name is not it.
  expect(mentionedIn('src/b.ts를 고치고 README.md.', paths)).toEqual(['src/b.ts', 'README.md'])
  expect(mentionedIn('b.ts 랑 util/a.ts', paths)).toEqual(['src/b.ts', 'lib/util/a.ts'])
  expect(mentionedIn('a.ts 를 봐줘', paths)).toEqual([])
  expect(mentionedIn('그 파일 고쳐줘', paths)).toEqual([])
  expect(mentionedIn('.\\src\\a.ts', paths)).toEqual(['src/a.ts'])

  for (const path of ['.env', 'config/.env.local', 'deploy/id_rsa', 'tls/server.pem', 'logo.png', 'bun.lock']) {
    expect(isReadable(path)).toBe(false)
  }

  expect(isReadable('src/environment.ts')).toBe(true)
})

test('the last answer is the last thing the agent said, its end kept when it is long', () => {
  const said = (role: 'user' | 'assistant', text: string) => ({ role, text, toolUses: [] })

  expect(answerOf([])).toBe('')
  expect(answerOf([said('user', '안녕')])).toBe('')
  expect(
    answerOf([said('assistant', '첫 답변'), said('user', '질문'), said('assistant', '둘째 답변'), said('assistant', ' ')]),
  ).toBe('둘째 답변')

  const long = answerOf([said('assistant', `${'가'.repeat(5000)}끝`)])
  expect(long.endsWith('끝')).toBe(true)
  expect(long.startsWith('(앞부분 생략)')).toBe(true)
  expect(long.length).toBeLessThan(4100)
})

test('the Claude guides name the published pages they were written from', () => {
  expect(GUIDES['opus-5.5'].sources).toEqual([
    'https://claude.dev/blog/getting-the-most-out-of-opus-5-5/',
    'https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-opus-5-5',
  ])
  expect(GUIDES['sonnet-5.5'].sources).toEqual([
    'https://claude.dev/blog/building-with-claude-sonnet-5-5/',
    'https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-sonnet-5-5',
  ])
})

test('what a polish read is held through Retry and Keep Original, and dropped on Apply', async ($, on) => {
  const state = world(on)
  state.box = DRAFT
  // The session's values, kept here so the test sees each write of `held`.
  const values = new Map<string, { value: unknown; version: number }>()
  const writes: unknown[] = []
  on('state.get', (_, e) => ({
    value: values.get(e.key) ?? { value: undefined, version: 0 },
  }))
  on('state.set', (_, e) => {
    const version = (values.get(e.key)?.version ?? 0) + 1
    values.set(e.key, { value: e.value, version })

    if (e.key === 'held') {
      writes.push(e.value)
    }

    return { value: { isSet: true, version } }
  })
  const held = () => values.get('held')?.value
  // Values kept here redraw nothing: each press is on a pane drawn anew.
  const press = async (key: string) => {
    const pane = await $.ui.mount(DOCKED)
    await pane.press({ key })
    await pane.unmount()
  }

  await press('polish')
  expect(held()).toMatchObject({ answer: '세션 토큰 갱신에 문제가 있습니다.' })
  const read = held()

  state.reply = AGAIN
  await press('refresh')
  expect(state.prompts.at(-1)).toContain('<rejected>')
  expect(held()).toEqual(read)

  await press('discard')
  expect(held()).toEqual(read)
  expect(writes).not.toContain(null)

  state.reply = POLISHED
  await press('polish')
  await press('apply')
  expect(state.box).toBe(POLISHED)
  expect(held()).toBeNull()
  expect(writes.at(-1)).toBeNull()
})
