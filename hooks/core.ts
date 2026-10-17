// The pane's one body of logic, whatever surface draws it: the state it keeps,
// what each control does, and the polish itself. The surfaces differ only in
// how they draw it (terminal.tsx, desktop.tsx), so everything they share is
// here and what they are given is a View (view.ts) and an Act.
import { atom, read, update } from 'claude-code'
import type {
  EngineInterface,
  ModelEffort,
  PluginOptions,
  PromptSubmitInput,
} from 'claude-code'

import type { Held, LogKind, LogLine, Menu, Target, TargetChoice } from '../types'
import { CHOICES, GUIDES, isChoice, targetOf } from './guides'
import {
  easyOf,
  EFFORTS,
  isEffort,
  isPolishable,
  modelsOf,
  polishedOf,
  requestOf,
  rowsOf,
} from './polish'
import type { Polished } from './polish'
import {
  answerOf,
  filesOf,
  mentionedIn,
  pathsOf,
  projectOf,
  SKIPPED_DIRS,
} from './project'
import type { Read } from './project'
import type { Act, View } from './view'

// Also written out in register.tsx, where the matchers on it are read from.
export const PANE = 'prompt-polish'
export const TITLE = 'Prompt Polish'
const PANE_COLUMNS = 71
export const IDLE_ROWS = 9
const HINT_MS = 5000
// How many polishes of one draft are kept to page through.
const VERSIONS = 10

const GPT_TARGETS: readonly Target[] = ['gpt-6-astra', 'gpt-5.6']

const isAuto = atom({ plugin: 'prompt-polish', key: 'isAuto' } as const, true)
const target = atom({ plugin: 'prompt-polish', key: 'target' } as const, 'auto')
const isBusy = atom({ plugin: 'prompt-polish', key: 'isBusy' } as const, false)
const busySince = atom(
  { plugin: 'prompt-polish', key: 'busySince' } as const,
  null,
)
const menu = atom({ plugin: 'prompt-polish', key: 'menu' } as const, null)
const original = atom(
  { plugin: 'prompt-polish', key: 'original' } as const,
  null,
)
const proposal = atom(
  { plugin: 'prompt-polish', key: 'proposal' } as const,
  null,
)
const versions = atom({ plugin: 'prompt-polish', key: 'versions' } as const, [])
const version = atom({ plugin: 'prompt-polish', key: 'version' } as const, 0)
const held = atom({ plugin: 'prompt-polish', key: 'held' } as const, null)
const isReviewed = atom(
  { plugin: 'prompt-polish', key: 'isReviewed' } as const,
  false,
)
const log = atom({ plugin: 'prompt-polish', key: 'log' } as const, [])
const isLogOpen = atom(
  { plugin: 'prompt-polish', key: 'isLogOpen' } as const,
  false,
)
const isKeysOpen = atom(
  { plugin: 'prompt-polish', key: 'isKeysOpen' } as const,
  false,
)
const isGuideOpen = atom(
  { plugin: 'prompt-polish', key: 'isGuideOpen' } as const,
  false,
)
const hintUntil = atom(
  { plugin: 'prompt-polish', key: 'hintUntil' } as const,
  null,
)
const isPlain = atom({ plugin: 'prompt-polish', key: 'isPlain' } as const, false)
const isSetupOpen = atom(
  { plugin: 'prompt-polish', key: 'isSetupOpen' } as const,
  false,
)
const isOriginalOpen = atom(
  { plugin: 'prompt-polish', key: 'isOriginalOpen' } as const,
  false,
)
const isBandOpen = atom(
  { plugin: 'prompt-polish', key: 'isBandOpen' } as const,
  true,
)
const models = atom({ plugin: 'prompt-polish', key: 'models' } as const, [])
const model = atom({ plugin: 'prompt-polish', key: 'model' } as const, null)
const effort = atom({ plugin: 'prompt-polish', key: 'effort' } as const, null)

// The polish a button press started, for the Cancel press that follows it.
let stop: AbortController | null = null

type Proposed = { isProposed: boolean; isStopped?: boolean; note: string }

async function resolveTarget($: EngineInterface): Promise<Target> {
  const choice = await read($, target)

  return choice === 'auto' ? targetOf(await $.session.model()) : choice
}

/** How a choice of the model the prompt is for reads: its guide's name, or what "auto" came to. */
const choiceLabel = (choice: TargetChoice, resolved: Target): string =>
  choice === 'auto'
    ? `${GUIDES[resolved].label} (Detected)`
    : GUIDES[choice].label

/** The model and effort that polish: the pane's picks over the mod's options. */
async function pickedOf(
  $: EngineInterface,
  options: PluginOptions,
): Promise<{ polishModel: string; effort: ModelEffort }> {
  const level = (await read($, effort)) ?? options.effort

  return {
    polishModel: (await read($, model)) ?? String(options.polishModel ?? 'sonnet'),
    effort: isEffort(level) ? level : 'low',
  }
}

async function loadModels($: EngineInterface): Promise<void> {
  const rows = await $.config.list().catch(() => [])
  const listed = rows.find(row => row.key === 'model')?.options ?? []
  const list = modelsOf(listed, await $.session.model())
  await update($, models, () => list)
}

async function toggleLog($: EngineInterface): Promise<void> {
  await update($, isLogOpen, isOpen => !isOpen)
}

async function toggleKeys($: EngineInterface): Promise<void> {
  await update($, isKeysOpen, isOpen => !isOpen)
}

/** Opens the pane to read the polish on show in full, or to rest. */
async function showPanel(
  $: EngineInterface,
  isLogged = false,
): Promise<void> {
  const text = await read($, proposal)
  const draft = await read($, original)

  if (isLogged) {
    await update($, isLogOpen, () => true)
  }

  await openPane(
    $,
    text !== null && draft !== null ? rowsOf(draft, text) : IDLE_ROWS,
    false,
  )
}

async function toggleSetup($: EngineInterface): Promise<void> {
  await update($, isSetupOpen, isOpen => !isOpen)
}

async function toggleOriginal($: EngineInterface): Promise<void> {
  const isOpen = !(await read($, isOriginalOpen))
  await update($, isOriginalOpen, () => isOpen)
  await $.store.set('isOriginalOpen', isOpen)
}

async function toggleGuide($: EngineInterface): Promise<void> {
  await update($, isGuideOpen, isOpen => !isOpen)
}

async function toggleMenu($: EngineInterface, which: Menu): Promise<void> {
  await update($, menu, shown => (shown === which ? null : which))
}

async function closeMenu($: EngineInterface): Promise<void> {
  await update($, menu, () => null)
}

async function pickTarget($: EngineInterface, value: string): Promise<void> {
  if (!isChoice(value)) {
    return
  }

  await update($, menu, () => null)
  await update($, target, () => value)
  await $.store.set('target', value)
}

async function pickModel($: EngineInterface, value: string): Promise<void> {
  await update($, model, () => value)
  await $.store.set('model', value)
}

async function pickEffort($: EngineInterface, value: string): Promise<void> {
  if (!isEffort(value)) {
    return
  }

  await update($, effort, () => value)
  await $.store.set('effort', value)
}

async function say(
  $: EngineInterface,
  kind: LogKind,
  text: string,
): Promise<void> {
  const line: LogLine = { at: await $.clock.now(), kind, text }
  await update($, log, lines => [...lines, line].slice(-30))
}

/**
 * Opens the pane, or resizes the open one: `columns` docked beside a
 * fullscreen transcript, `rows` inline above the prompt. `isAsking` asks for
 * the keyboard, which the surface gives over an empty prompt box.
 */
function openPane($: EngineInterface, rows: number, isAsking: boolean) {
  return $.ui.open({
    id: PANE,
    title: TITLE,
    columns: PANE_COLUMNS,
    rows,
    ...(isAsking ? ({ focus: true } as const) : {}),
  })
}

/**
 * Whether the pane is drawn as a band above the prompt box: the Claude desktop
 * app does when the person's option says so. The terminal and the other
 * surfaces always have the pane.
 */
export async function isBandOn(
  $: EngineInterface,
  options: PluginOptions,
): Promise<boolean> {
  const surfaces: readonly string[] = await $.session.surfaces().catch(() => [])

  return (
    options.placement === 'band' &&
    surfaces.includes('desktop') &&
    (await read($, isBandOpen))
  )
}

/** Whether the pane is to be opened: it is not when the desktop is the one surface, and shows the band. */
async function needsPane(
  $: EngineInterface,
  options: PluginOptions,
): Promise<boolean> {
  const surfaces: readonly string[] = await $.session.surfaces().catch(() => [])

  return !(
    options.placement === 'band' &&
    surfaces.length > 0 &&
    surfaces.every(surface => surface === 'desktop')
  )
}

// Nothing hands a pane's keyboard back but its close: closed and opened
// again, the pane stays up and the prompt box has the keys for Enter.
async function rest(
  $: EngineInterface,
  options: PluginOptions,
): Promise<void> {
  // The band is where the desktop lives; the pane was opened to read a
  // polish in full, and is put away when the answer is given.
  if (!(await needsPane($, options))) {
    await $.ui.close({ id: PANE }).catch(() => undefined)

    return
  }

  await $.ui.close({ id: PANE })
  await openPane($, IDLE_ROWS, false)
}

const WALK_DEPTH = 3
const WALK_FILES = 2_000

/** The project's files by walking it, where git cannot list them. */
async function walk($: EngineInterface, root: string): Promise<string[]> {
  const found: string[] = []
  const visit = async (dir: string, depth: number): Promise<void> => {
    const entries = await $.fs.list(dir === '' ? root : `${root}/${dir}`).catch(() => [])

    for (const entry of entries) {
      const path = dir === '' ? entry.name : `${dir}/${entry.name}`

      if (found.length >= WALK_FILES) {
        return
      }

      if (entry.kind === 'file') {
        found.push(path)
      } else if (
        entry.kind === 'dir' &&
        depth < WALK_DEPTH &&
        !SKIPPED_DIRS.includes(entry.name)
      ) {
        await visit(path, depth + 1)
      }
    }
  }

  await visit('', 0)

  return found
}

async function listed($: EngineInterface, root: string): Promise<string[]> {
  // What git tracks, and what it neither tracks nor ignores; a name outside
  // ASCII as it is written, not escaped.
  const git = await $.process
    .run(
      [
        'git',
        '-c',
        'core.quotepath=false',
        'ls-files',
        '--cached',
        '--others',
        '--exclude-standard',
      ],
      { cwd: root, timeoutMs: 10_000 },
    )
    .catch(() => undefined)

  return git !== undefined && git.exitCode === 0 && git.stdout.trim() !== ''
    ? pathsOf(git.stdout)
    : pathsOf((await walk($, root)).join('\n'))
}

function readerOf($: EngineInterface, root: string): Read {
  return async path => {
    const text = await $.fs.read(`${root}/${path}`).catch(() => undefined)

    // A NUL says the file is not text, whatever its name.
    return text === undefined || text.includes('\0') ? undefined : text
  }
}

/** The start of each file `draft` names, then of those `answer` names, among `paths`. */
const namedOf = (
  paths: readonly string[],
  draft: string,
  answer: string,
  read: Read,
): Promise<string> =>
  filesOf(
    [...new Set([...mentionedIn(draft, paths), ...mentionedIn(answer, paths)])],
    read,
  )

/**
 * Reads what one polish is given besides the draft: the project as it stands
 * on disk, the files the draft and the last answer name, and that answer.
 * Nothing here calls a model.
 */
async function gather($: EngineInterface, draft: string): Promise<Held> {
  const answer = answerOf(await $.session.messages().catch(() => []))
  const root = await $.session.root().catch(() => undefined)

  if (root === undefined) {
    return { project: '', files: '', answer }
  }

  const paths = await listed($, root)
  const read = readerOf($, root)

  return {
    project: await projectOf(paths, read),
    files: await namedOf(paths, draft, answer, read),
    answer,
  }
}

/**
 * What a retry of an edited draft is given: the project and the answer as
 * its polish read them, and the files the draft now names.
 */
async function regather(
  $: EngineInterface,
  kept: Held,
  draft: string,
): Promise<Held> {
  const root = await $.session.root().catch(() => undefined)

  if (root === undefined) {
    return kept
  }

  const paths = await listed($, root)

  return {
    ...kept,
    files: await namedOf(paths, draft, kept.answer, readerOf($, root)),
  }
}

async function polish(
  $: EngineInterface,
  draft: string,
  guide: Target,
  given: Held,
  options: PluginOptions,
  signal: AbortSignal,
  rejected?: string,
): Promise<Polished> {
  const request = requestOf(
    { draft, target: guide, held: given, rejected },
    { ...options, ...(await pickedOf($, options)) },
  )

  return polishedOf(await $.model.complete(request, { signal }))
}

/**
 * Polishes `draft` and holds the result as the proposal the pane previews;
 * the prompt box is left as it is. `rejected` is an earlier proposal of the
 * same draft, to polish away from.
 *
 * A polish reads the project and the last answer anew. A retry is given what
 * its polish read, unchanged, so the request opens as the last one did and
 * the prompt cache serves that part again; of a draft edited since, the files
 * it now names are read, and the rest is as it was.
 */
async function propose(
  $: EngineInterface,
  draft: string,
  options: PluginOptions,
  rejected?: string,
): Promise<Proposed> {
  if (await read($, isBusy)) {
    return { isProposed: false, note: 'Already polishing. Please wait.' }
  }

  if (draft.trim() === '') {
    return {
      isProposed: false,
      note: 'Nothing to polish. Type a prompt first.',
    }
  }

  const mine = new AbortController()
  stop = mine
  const startedAt = await $.clock.now()
  await update($, busySince, () => startedAt)
  await update($, isBusy, () => true)
  $.ui.status('Polishing prompt…')

  // The loading mark is the pane's: a polish begun with the pane closed opens
  // it, unless the band above the prompt box is where it is drawn.
  if (
    (await needsPane($, options)) &&
    !(await $.ui.panes()).some(pane => pane.id === PANE)
  ) {
    await openPane($, IDLE_ROWS, false)
  }

  try {
    const guide = await resolveTarget($)
    const kept = rejected === undefined ? null : await read($, held)
    const isEdited = draft.trim() !== (await read($, original))?.trim()
    const given =
      kept === null
        ? await gather($, draft)
        : isEdited
          ? await regather($, kept, draft)
          : kept
    await update($, held, () => given)
    const result = await polish(
      $,
      draft,
      guide,
      given,
      options,
      mine.signal,
      rejected,
    )

    // A reply that raced the Cancel press is dropped with it.
    if (mine.signal.aborted) {
      return { isProposed: false, isStopped: true, note: 'Polish stopped.' }
    }

    if (!result.isPolished) {
      await say($, 'fail', result.reason)

      return { isProposed: false, note: `Polish failed. ${result.reason}.` }
    }

    if (result.text === draft.trim()) {
      await say($, 'keep', 'No changes')

      return {
        isProposed: false,
        note: 'Already clear. No changes.',
      }
    }

    const text = result.text
    // A retry of the same draft adds a version to those made of it, unless it
    // came to one of them again; a polish, or a retry of a draft edited
    // since, starts them over.
    const earlier =
      rejected === undefined || isEdited ? [] : await read($, versions)
    const again = earlier.indexOf(text)
    const made = (again === -1 ? [...earlier, text] : earlier).slice(-VERSIONS)
    await update($, original, () => draft)
    await update($, versions, () => made)
    await update($, version, () => (again === -1 ? made.length - 1 : again))
    await update($, proposal, () => text)
    await update($, isReviewed, () => true)
    await say(
      $,
      rejected === undefined ? 'polish' : 'refresh',
      `${GUIDES[guide].label} · ${draft.trim().length} → ${text.length} chars`,
    )

    // Where the band is, the pane is opened to read the polish in full, and
    // leaves the keyboard where it is: the band has the answers.
    const isPaneTheSurface = await needsPane($, options)
    await openPane($, rowsOf(draft, text), isPaneTheSurface)

    return {
      isProposed: true,
      note: `Polished for ${GUIDES[guide].label}. Check it, then apply or keep.`,
    }
  } finally {
    stop = null
    $.ui.status(undefined)
    await update($, isBusy, () => false)
    await update($, busySince, () => null)
  }
}

async function polishBox(
  $: EngineInterface,
  options: PluginOptions,
): Promise<void> {
  const box = (await $.prompt.read()).text
  $.ui.toast((await propose($, box, options)).note)
}

/** Polishes again, away from the proposal on show: the box's draft, or the one it was made from. */
async function refresh(
  $: EngineInterface,
  options: PluginOptions,
): Promise<void> {
  const shown = await read($, proposal)
  const draft = await read($, original)

  if (shown === null || draft === null) {
    return
  }

  const box = (await $.prompt.read()).text
  const again = box.trim() === '' ? draft : box
  $.ui.toast((await propose($, again, options, shown)).note)
}

/** Puts the version before or after the one on preview there in its place. */
async function step($: EngineInterface, by: -1 | 1): Promise<void> {
  const at = (await read($, version)) + by
  const text = (await read($, versions))[at]

  if (text === undefined || (await read($, proposal)) === null) {
    return
  }

  await update($, version, () => at)
  await update($, proposal, () => text)
}

/** Puts the proposal in the prompt box, keeping what the box held for Undo. */
async function apply(
  $: EngineInterface,
  options: PluginOptions,
): Promise<void> {
  const text = await read($, proposal)
  const draft = await read($, original)

  if (text === null) {
    return
  }

  const box = (await $.prompt.read()).text
  const filled = await $.prompt.fill({ text })

  if (!filled.isFilled) {
    $.ui.toast('Could not change the prompt box.')

    return
  }

  const kept = box.trim() === '' ? draft : box
  await update($, proposal, () => null)
  await update($, versions, () => [])
  await update($, held, () => null)
  await update($, original, () => kept)
  await say($, 'apply', `${text.length} chars`)
  await rest($, options)
  $.ui.toast('Applied. Press Enter to send.')
}

/** Drops the proposal; a prompt box the held draft left empty gets it back. */
async function keep($: EngineInterface): Promise<void> {
  const draft = await read($, original)

  if ((await read($, proposal)) === null) {
    return
  }

  if (draft !== null && (await $.prompt.read()).text.trim() === '') {
    await $.prompt.fill({ text: draft })
  }

  await update($, proposal, () => null)
  await update($, versions, () => [])
  await update($, original, () => null)
  await say($, 'keep', 'Original kept')
}

async function discard(
  $: EngineInterface,
  options: PluginOptions,
): Promise<void> {
  await keep($)
  await rest($, options)
}

async function restore($: EngineInterface): Promise<void> {
  const draft = await read($, original)

  if (draft === null) {
    return
  }

  const filled = await $.prompt.fill({ text: draft })

  if (filled.isFilled) {
    await update($, original, () => null)
  }
}

async function settle(
  $: EngineInterface,
  options: PluginOptions,
): Promise<void> {
  if ((await read($, proposal)) !== null) {
    await update($, proposal, () => null)
    await update($, versions, () => [])

    if (!(await needsPane($, options))) {
      await $.ui.close({ id: PANE }).catch(() => undefined)
    }
  }

  if ((await read($, original)) !== null) {
    await update($, original, () => null)
  }

  if (await read($, isReviewed)) {
    await update($, isReviewed, () => false)
  }
}

// Takes down the note a switch of AUTO put up, unless a later switch renewed it.
async function hideHint($: EngineInterface, until: number): Promise<void> {
  await update($, hintUntil, shown => (shown === until ? null : shown))
}

/** Switches AUTO, and says for a few seconds what Enter does from now on. */
async function toggleAuto($: EngineInterface): Promise<void> {
  const isOn = !(await read($, isAuto))
  const until = (await $.clock.now()) + HINT_MS
  await update($, isAuto, () => isOn)
  await update($, hintUntil, () => until)
  await $.store.set('isAuto', isOn)
  $.clock.after(HINT_MS, () => void hideHint($, until))
}

/** What each control of the pane does, by the name a frontend has for it. */
export function actsOf($: EngineInterface, options: PluginOptions): Act {
  return {
    guide: () => void toggleGuide($),
    auto: () => void toggleAuto($),
    menu: which => void toggleMenu($, which),
    done: () => void closeMenu($),
    target: value => void pickTarget($, value),
    model: value => void pickModel($, value),
    effort: value => void pickEffort($, value),
    polish: () => void polishBox($, options),
    apply: () => void apply($, options),
    retry: () => void refresh($, options),
    keep: () => void discard($, options),
    undo: () => void restore($),
    stop: () => stop?.abort(),
    step: by => void step($, by),
    log: () => void toggleLog($),
    keys: () => void toggleKeys($),
    setup: () => void toggleSetup($),
    original: () => void toggleOriginal($),
    panel: () => void showPanel($),
    history: () => void showPanel($, true),
  }
}

// What Enter does under each setting of AUTO, said alike.
const HINT_ON = 'AUTO ON · Enter polishes first and shows you before sending.'
const HINT_OFF = 'AUTO OFF · Enter sends right away, with no polish.'

/** The state as the pane draws it, read once: the same for every surface. */
export async function viewOf(
  $: EngineInterface,
  options: PluginOptions,
): Promise<View> {
  const choice = await read($, target)
  const resolved = await resolveTarget($)
  // What "auto" comes to, whichever model is picked: its row in the list
  // names the session's model, not the pick.
  const detected =
    choice === 'auto' ? resolved : targetOf(await $.session.model())
  const picked = await pickedOf($, options)
  const preview = await read($, proposal)
  const isRunning = await read($, isBusy)
  const isOn = await read($, isAuto)
  const now = await $.clock.now()
  const hintAt = await read($, hintUntil)

  return {
    phase: isRunning ? 'busy' : preview !== null ? 'review' : 'idle',
    isOn,
    isRunning,
    isGpt: GPT_TARGETS.includes(resolved),
    guide: GUIDES[resolved].label,
    about: GUIDES[resolved].about,
    isGuideShown: await read($, isGuideOpen),
    choice,
    targetLabel: choiceLabel(choice, resolved),
    targets: CHOICES.map(value => ({
      value,
      label: choiceLabel(value, detected),
    })),
    models: [
      picked.polishModel,
      ...(await read($, models)).filter(name => name !== picked.polishModel),
    ],
    model: picked.polishModel,
    effort: picked.effort,
    menu: await read($, menu),
    draft: await read($, original),
    preview,
    version: await read($, version),
    versions: (await read($, versions)).length,
    lines: await read($, log),
    isLogShown: await read($, isLogOpen),
    isKeysShown: await read($, isKeysOpen),
    isSetupShown: await read($, isSetupOpen),
    isOriginalShown: await read($, isOriginalOpen),
    hint: hintAt === null ? null : isOn ? HINT_ON : HINT_OFF,
    since: (await read($, busySince)) ?? now,
    now,
    isPlain: await read($, isPlain),
  }
}

/** Once, before the first prompt: what the person left set, the commands, the pane. */
export async function onStart(
  $: EngineInterface,
  options: PluginOptions,
): Promise<void> {
  const savedAuto = await $.store.get('isAuto')
  const savedTarget = await $.store.get('target')

  if (typeof savedAuto === 'boolean') {
    await update($, isAuto, () => savedAuto)
  }

  if (isChoice(savedTarget)) {
    await update($, target, () => savedTarget)
  }

  const savedModel = await $.store.get('model')
  const savedEffort = await $.store.get('effort')

  if (typeof savedModel === 'string' && savedModel !== '') {
    await update($, model, () => savedModel)
  }

  if (isEffort(savedEffort)) {
    await update($, effort, () => savedEffort)
  }

  const savedOriginal = await $.store.get('isOriginalOpen')

  if (typeof savedOriginal === 'boolean') {
    await update($, isOriginalOpen, () => savedOriginal)
  }

  const savedPlain = await $.store.get('isPlain')

  if (typeof savedPlain === 'boolean') {
    await update($, isPlain, () => savedPlain)
  }

  await update($, isSetupOpen, () => false)

  await loadModels($)

  // A reload mid-polish drops the call and would leave the pane busy.
  await update($, isBusy, () => false)
  await update($, busySince, () => null)
  await update($, menu, () => null)
  await update($, hintUntil, () => null)
  // Rows a session kept from an earlier build read as today's do.
  await update($, log, lines =>
    lines.map(line => ({ ...line, text: easyOf(line.text) })),
  )
  // One command under two names: `/polish`, and `/p_polish` beside it.
  for (const name of ['polish', 'p_polish']) {
    await $.command.register({
      name,
      description:
        'Prompt Polish: open the pane, polish a prompt, or change settings',
      argumentHint:
        '[prompt | auto | target <name> | model <name> | effort <level> | plain | close]',
    })
  }

  if (options.openOnStart !== false && (await needsPane($, options))) {
    void openPane($, IDLE_ROWS, false).catch(() => undefined)
  }
}

/** `/polish` and `/p_polish`: the text the command answers with. */
export async function onCommand(
  $: EngineInterface,
  args: string,
  options: PluginOptions,
): Promise<{ text: string }> {
  const word = args.trim()

  if (word === 'auto') {
    await toggleAuto($)

    return {
      text: `AUTO: ${(await read($, isAuto)) ? 'ON' : 'OFF'}`,
    }
  }

  if (word === 'target' || word.startsWith('target ')) {
    const name = word.slice(6).trim()

    if (name !== '' && !isChoice(name)) {
      return {
        text: `"${name}" is not an option.\nOptions: ${CHOICES.join(', ')}`,
      }
    }

    await pickTarget($, name)
    const label = choiceLabel(await read($, target), await resolveTarget($))

    return {
      text:
        name === ''
          ? `Session Model: ${label}\nOptions: ${CHOICES.join(', ')}`
          : `Session Model: ${label}`,
    }
  }

  if (word === 'model' || word.startsWith('model ')) {
    const name = word.slice(5).trim()

    if (name === '') {
      const now = (await pickedOf($, options)).polishModel

      return {
        text: `Polish Model: ${now}\nOptions: ${(await read($, models)).join(', ')}`,
      }
    }

    await pickModel($, name)

    return { text: `Polish Model: ${name}` }
  }

  if (word === 'effort' || word.startsWith('effort ')) {
    const level = word.slice(6).trim()

    if (!isEffort(level)) {
      const now = (await pickedOf($, options)).effort

      return { text: `Effort: ${now}\nOptions: ${EFFORTS.join(', ')}` }
    }

    await pickEffort($, level)

    return { text: `Effort: ${level}` }
  }

  // The way out, should a surface's catchers ever take clicks and lose them.
  if (word === 'plain') {
    const isOff = !(await read($, isPlain))
    await update($, isPlain, () => isOff)
    await $.store.set('isPlain', isOff)

    return {
      text: isOff
        ? 'Plain buttons: ON. A control is clicked on its words alone.'
        : 'Plain buttons: OFF. A control is clicked anywhere on it.',
    }
  }

  if (word === 'close') {
    await update($, isBandOpen, () => false)
    await $.ui.close({ id: PANE }).catch(() => undefined)

    return { text: 'Prompt Polish closed.' }
  }

  const draft = word === '' ? (await $.prompt.read()).text : args

  if (draft.trim() === '') {
    await update($, isBandOpen, () => true)

    if (!(await needsPane($, options))) {
      return { text: 'Prompt Polish opened.' }
    }

    const opened = await openPane($, IDLE_ROWS, false)

    if (!opened.isPlaced) {
      return { text: `Prompt Polish is not shown yet. ${opened.reason}` }
    }

    // The chord is a terminal's; on any other surface the pane is clicked.
    const surfaces: readonly string[] = await $.session
      .surfaces()
      .catch(() => [])

    return {
      text: surfaces.includes('terminal')
        ? 'Prompt Polish opened. Press ctrl+x tab to use its keys.'
        : 'Prompt Polish opened.',
    }
  }

  return { text: (await propose($, draft, options)).note }
}

/**
 * A prompt submitted from the box. In auto mode the first Enter holds it back
 * for its preview, and the Enter after that sends what the box holds. The
 * answer is a `drop` to stop it, or nothing to let it go on.
 *
 * The hold is answered at once and the polish runs on after it: a hook that
 * waited for the model would leave the prompt up in the session, held, for
 * as long as the polish takes, and drop it at the end.
 */
export async function onSubmit(
  $: EngineInterface,
  e: PromptSubmitInput,
  options: PluginOptions,
): Promise<{ drop: string } | undefined> {
  if (e.origin.kind !== 'composer') {
    return undefined
  }

  const isHeld =
    (await read($, isAuto)) && !(await read($, isReviewed)) && isPolishable(e)

  if (!isHeld) {
    await settle($, options)

    return undefined
  }

  // Another polish is running: this one is not sent, and does not start.
  if (await read($, isBusy)) {
    return {
      drop: 'Still polishing. When it is ready, pick Apply Polish or Keep Original.',
    }
  }

  void holdOn($, e.text, options).catch(() => undefined)

  return {
    drop: 'Held to polish first. When it is ready, pick Apply Polish or Keep Original, then press Enter again.',
  }
}

/**
 * Polishes a prompt that was held, and puts it up for review. A polish that
 * did not come to one, a failure or a prompt already clear, sends the prompt
 * as it was written, as the Enter asked; one the person stopped does not.
 */
async function holdOn(
  $: EngineInterface,
  text: string,
  options: PluginOptions,
): Promise<void> {
  const proposed = await propose($, text, options)

  if (proposed.isProposed) {
    return
  }

  if (proposed.isStopped) {
    $.ui.toast('Polish stopped. Your prompt is back in the box.')

    return
  }

  $.ui.toast(`Sent as written. ${proposed.note}`)
  await settle($, options)
  await $.prompt.submit({ text, asUser: true })
}

/** The person closing the pane over a preview is "keep my draft". */
export async function onClose(
  $: EngineInterface,
  origin: { kind: string },
  options: PluginOptions,
): Promise<void> {
  // Where the band is, the pane is for reading in full: closing it is closing
  // a window, and the band still holds the answers.
  if (origin.kind === 'person' && !(await isBandOn($, options))) {
    await keep($)
  }
}

/** A catcher that failed would lie dead over its control: the pane goes on its buttons alone. */
export async function onFault(
  $: EngineInterface,
  module: string,
): Promise<void> {
  if (module.endsWith('hit.tsx')) {
    await update($, isPlain, () => true)
  }
}
