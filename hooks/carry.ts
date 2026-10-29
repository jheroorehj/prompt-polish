// Carrying a session over to the next: the session trail the person turns on,
// the handoff document an installed skill writes on request, the question at
// the first prompt of a new session about which to pick up, and the offer when
// a session's context runs full. Everything here is the person's choice: the
// trail starts off, a document is written only when asked for, nothing is
// attached to a prompt without a yes, and nothing is sent anywhere.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, PromptSubmitInput } from 'claude-code'

import type { SessionRow, SessionsState } from '../types'

import {
  authorOf,
  findHandoff,
  handoffBlock,
  handoffOffer,
  HANDOFF_MISSING,
  isEffortless,
  isPlanning,
  markHandoffOffered,
  readHandoff,
  recoverHandoff,
  saveHandoff,
  setupText,
  candidatesOf,
} from './handoff'
import type { Handoff } from './handoff'
import { agoOf, DAY_MS, listSessions, notesOf, WEEK_MS } from './sessions'
import {
  blockOf,
  clearTrails,
  isTrailOn,
  markOffered,
  nameOf,
  offerOf,
  readTrails,
  recordPrompt,
  recordTurn,
  renderOf,
  setTrail,
  storedTrailOf,
  summaryOf,
} from './trail'
import type { Offer } from './trail'
import type { SessionsView } from './view'

/** The person's switch for the trail, as the pane draws it (core.ts reads it by the same key). */
const isTrailing = atom(
  { plugin: 'prompt-polish', key: 'isTrailing' } as const,
  false,
)
/** What `/polish carry use` armed for the next prompt. */
const carryArmed = atom(
  { plugin: 'prompt-polish', key: 'carryArmed' } as const,
  null,
)
/** A handoff skill that was started, and whether it has begun its turn. */
const handoffRun = atom(
  { plugin: 'prompt-polish', key: 'handoffRun' } as const,
  null,
)
/** The list of earlier sessions the pane shows, and what was picked in it. */
const sessions = atom(
  { plugin: 'prompt-polish', key: 'sessions' } as const,
  {
    isOpen: false,
    range: 'day',
    rows: null,
    isLoading: false,
    picked: null,
    kind: 'notes',
    done: [],
  },
)
/** The session the context question was asked in, so it is asked once. */
const measureAsked = atom(
  { plugin: 'prompt-polish', key: 'measureAsked' } as const,
  null,
)

/** A question left unanswered this fast was never asked: nobody is there to answer one. */
const UNASKED_MS = 250

/** How long after a command answers the skill it started is run. */
export const RUN_AFTER_MS = 100

/** The context fill, in percent, at which a handoff is offered. */
export const THRESHOLD = 70

/** Once, before the first prompt: the switch the person left, and nothing pending. */
export async function carryStart($: EngineInterface): Promise<void> {
  const saved = await isTrailOn($)

  await update($, isTrailing, () => saved)
  await update($, carryArmed, () => null)
  await update($, handoffRun, () => null)
  await update($, sessions, s => ({
    ...s,
    isOpen: false,
    rows: null,
    isLoading: false,
    picked: null,
    done: [],
  }))
}

/** Turns the session trail on or off for this person: kept for the next session, and drawn now. */
async function turnTrail($: EngineInterface, isOn: boolean): Promise<void> {
  await setTrail($, isOn)
  await update($, isTrailing, () => isOn)
}

// A toast stays about four seconds: each is one short line.
const TRAIL_ON_TOAST = 'Session trail on · kept on this computer only.'
const TRAIL_OFF_TOAST = 'Session trail off · nothing more is recorded.'

/** The pane's TRAIL button. */
export async function toggleTrail($: EngineInterface): Promise<void> {
  try {
    const isOn = !(await read($, isTrailing))

    await turnTrail($, isOn)
    $.ui.toast(isOn ? TRAIL_ON_TOAST : TRAIL_OFF_TOAST)
  } catch (error) {
    $.ui.toast(`The trail setting could not be saved: ${String(error).slice(0, 160)}`)
  }
}

const CARRY_ON = [
  'Session trail: ON.',
  'From now on Prompt Polish keeps, for each project, on this computer only: your last prompts, the end of the last answer, the files changed, the to-do list and the git state. Keys, tokens, passwords, addresses, phone numbers and your home folder are masked before anything is saved.',
  "It is kept in this plugin's own store in your Claude folder, never in the project or the repository, and no model is called to write it.",
  '/p_polish carry show prints it, carry clear deletes it, carry off stops it. In a new session, the first prompt asks whether to pick up where the last one stopped.',
].join('\n')

const CARRY_OFF = [
  'Session trail: OFF. Nothing more is recorded.',
  'What was kept stays until /p_polish carry clear (this project) or carry clear all (every project) deletes it.',
].join('\n')

const NOTHING_WAITING = 'Nothing from an earlier session is waiting for this project.'

/**
 * `/p_polish carry ...`: the session trail and the handoff document, which each
 * person turns on and asks for themself.
 */
export async function onCarry($: EngineInterface, rest: string): Promise<string> {
  const head = rest.split(/\s+/)[0] ?? ''
  const tail = rest.slice(head.length).trim()

  if (head === 'on') {
    await turnTrail($, true)

    return CARRY_ON
  }

  if (head === 'off') {
    await turnTrail($, false)

    return CARRY_OFF
  }

  if (head === 'now') {
    return startHandoff($, tail)
  }

  if (head === 'setup') {
    return setupText($)
  }

  if (head === 'sessions') {
    return sessionsText($, tail === 'week' ? 'week' : 'day')
  }

  if (head === 'take') {
    return takeText($, tail)
  }

  // What an earlier session left, taken or put by without waiting to be asked.
  if (head === 'use' || head === 'skip') {
    const handoff = await handoffOffer($, false)
    const trail = await offerOf($, false)

    if (head === 'skip') {
      if (handoff === undefined && trail === undefined) {
        return NOTHING_WAITING
      }

      await spend($, trail, handoff)
      await update($, carryArmed, () => null)

      return 'Skipped. It will not be offered again; carry show still prints it.'
    }

    const want =
      tail === 'trail' || tail === 'handoff'
        ? tail
        : handoff !== undefined
          ? 'handoff'
          : 'trail'

    if (want === 'handoff' ? handoff === undefined : trail === undefined) {
      return NOTHING_WAITING
    }

    await update($, carryArmed, () => want)

    return want === 'handoff' && handoff !== undefined
      ? `The handoff document of the earlier session (/${handoff.command}) will be added to your next prompt, as notes to check against the files.`
      : `The trail of the earlier session (${trail === undefined ? '' : summaryOf(trail.trail)}) will be added to your next prompt, as notes to check against the files.`
  }

  if (head === 'clear') {
    const count = await clearTrails($, tail === 'all')

    return count === 0
      ? 'Nothing was kept.'
      : `Session trail and handoff document deleted${tail === 'all' ? ' for every project' : ' for this project'}.`
  }

  const trails = await readTrails($)

  if (head === 'show' && tail === 'handoff') {
    const handoff = await readHandoff($)

    return handoff === undefined
      ? 'No handoff document is kept for this project. /p_polish carry now writes one.'
      : `Handoff document, written by ${authorOf(handoff.command)}:\n\n${handoff.text}`
  }

  if (head === 'show') {
    if (trails.current !== undefined && trails.current.prompts.length > 0) {
      return renderOf(trails.current)
    }

    if (trails.previous !== undefined) {
      return `Nothing yet in this session. The session before:\n\n${renderOf(trails.previous)}`
    }

    return trails.current === undefined
      ? 'No session trail is kept for this project.'
      : renderOf(trails.current)
  }

  const handoff = await readHandoff($)

  return [
    `Session trail: ${(await isTrailOn($)) ? 'ON' : 'OFF (it starts off; each person turns it on with /p_polish carry on)'}.`,
    trails.current === undefined
      ? 'This session: nothing kept.'
      : `This session: ${summaryOf(trails.current)}.`,
    ...(trails.previous === undefined
      ? []
      : [`The session before: ${summaryOf(trails.previous)}.`]),
    handoff === undefined
      ? 'Handoff document: none (carry now writes one with an installed handoff skill).'
      : `Handoff document: from /${handoff.command}${handoff.purpose === '' ? '' : `, for: ${handoff.purpose}`}.`,
    'Commands: carry on | off | now [what the next session is for] | setup | sessions [week] | take <number> [handoff] | show [handoff] | use [trail|handoff] | skip | clear [all]',
  ].join('\n')
}

// --- The handoff document ----------------------------------------------------

/**
 * Starts the installed handoff skill. It is one turn of this session, so it
 * begins once the session is idle and not inside this command, and it spends
 * this session's tokens: the answer says so before anything runs.
 */
async function startHandoff($: EngineInterface, purpose: string): Promise<string> {
  if ((await read($, handoffRun)) !== null) {
    return 'A handoff document is already being written.'
  }

  const command = await findHandoff($)

  if (command === undefined) {
    return HANDOFF_MISSING
  }

  await update($, handoffRun, () => ({
    command,
    purpose,
    isStarted: false,
    startedAt: 0,
  }))
  // The engine refuses to run a command from inside a command's own hook (it
  // would wait on the turn the hook holds): it is run after the hook has returned.
  $.clock.after(RUN_AFTER_MS, () => {
    void $.command.run({ command, args: purpose }).catch(async (error: unknown) => {
      await update($, handoffRun, () => null)
      $.ui.toast(`/${command} could not be run: ${String(error).slice(0, 200)}`)
    })
  })

  return [
    `Running /${command}${purpose === '' ? '' : ` for: ${purpose}`}.`,
    "This is one turn of this session, so it uses this session's tokens. When it ends, the document is kept here (keys and personal details masked), and the first prompt of your next session in this project offers it.",
  ].join('\n')
}

/** A skill's prompt was expanded: the handoff skill has begun its turn. */
export async function onSkill($: EngineInterface, skill: string): Promise<void> {
  const run = await read($, handoffRun)

  if (run !== null && !run.isStarted && run.command === skill) {
    const startedAt = await $.clock.now()

    await update($, handoffRun, () => ({ ...run, isStarted: true, startedAt }))
  }
}

/** The handoff turn ended: the file the skill wrote is kept as this project's document. */
async function finishHandoff(
  $: EngineInterface,
  run: { command: string; purpose: string; startedAt: number },
  answer: string,
  isAborted: boolean,
): Promise<void> {
  await update($, handoffRun, () => null)

  if (isAborted) {
    $.ui.toast('Handoff stopped. Nothing was kept.')

    return
  }

  const messages = await $.session.messages().catch(() => [])
  const text = await recoverHandoff(
    $,
    candidatesOf(messages, answer),
    run.startedAt,
  )

  if (text === undefined) {
    $.ui.toast(
      'Handoff ended, but its file could not be found. Nothing kept.',
    )

    return
  }

  await saveHandoff($, run, text)
  $.ui.toast('Handoff document kept · your next session will offer it.')
}

/** A turn of the main conversation ended: the handoff skill's, or one the trail takes. */
export async function onTurnEnd(
  $: EngineInterface,
  answer: string,
  isAborted: boolean,
): Promise<void> {
  const run = await read($, handoffRun)

  if (run !== null && run.isStarted) {
    await finishHandoff($, run, answer, isAborted)

    return
  }

  await recordTurn($, isAborted ? '' : answer)
}

// --- Picking it up in a new session -------------------------------------------

/** A prompt that is going to the session, as it goes: kept in the trail if it is the person's own words. */
export async function onSent(
  $: EngineInterface,
  e: PromptSubmitInput,
): Promise<void> {
  if (
    e.origin.kind === 'composer' &&
    e.command === undefined &&
    e.isMeta !== true
  ) {
    await recordPrompt($, e.text)
  }
}

/** The answers to the question of picking up an earlier session. */
const CARRY = {
  handoff: 'Add the handoff document',
  trail: 'Add the trail',
  skip: 'Skip',
} as const

const cutTo = (text: string, limit: number): string =>
  text.length > limit ? `${text.slice(0, limit)}…` : text

const carryQuestion = (
  trail: Offer | undefined,
  handoff: Handoff | undefined,
): string =>
  [
    'Pick up where your last session in this project stopped?',
    '',
    ...(handoff === undefined
      ? []
      : [
          `Handoff document (/${handoff.command})${handoff.purpose === '' ? '' : ` for: ${handoff.purpose}`}: ${handoff.text.length.toLocaleString('en-US')} characters.`,
        ]),
    ...(trail === undefined
      ? []
      : [
          `Session trail kept on this computer: ${summaryOf(trail.trail)}.`,
          `Your last prompt there: ${cutTo(trail.trail.prompts.at(-1) ?? '', 120)}`,
        ]),
    '',
    'Adding one attaches it to this prompt as notes for the model to check against the files. Keys and personal details are masked.',
  ].join('\n')

/** What the person decided about what an earlier session left, and what it was. */
export type Carry = {
  trail?: Offer
  handoff?: Handoff
  block: string | null
}

/**
 * The first prompt of a session, when an earlier session of this project left
 * a handoff document or, for a person who turned the trail on, a trail: asks
 * which to add, if any. Asked before the polish, because it is about the
 * session and not the prompt. A question nobody could be asked leaves a hint
 * and the command, and one put away is a Skip. Nothing is attached or spent
 * here: the prompt may still be stopped.
 */
export async function onCarryOver(
  $: EngineInterface,
  e: PromptSubmitInput,
): Promise<Carry | undefined> {
  if (
    e.origin.kind !== 'composer' ||
    e.command !== undefined ||
    e.isMeta === true
  ) {
    return undefined
  }

  const armed = await read($, carryArmed)

  if (armed !== null) {
    await update($, carryArmed, () => null)

    if (armed === 'handoff') {
      const handoff = await handoffOffer($, false)

      return handoff === undefined
        ? undefined
        : { handoff, block: handoffBlock(handoff) }
    }

    const trail = await offerOf($, false)

    return trail === undefined
      ? undefined
      : { trail, block: blockOf(trail.trail) }
  }

  const handoff = await handoffOffer($, true)
  const found = await offerOf($, true)
  // planning-with-files recovers a session from its own files: a trail would say it twice.
  const trail = found !== undefined && !(await isPlanning($)) ? found : undefined

  if (handoff === undefined && trail === undefined) {
    return undefined
  }

  const offered = {
    ...(trail === undefined ? {} : { trail }),
    ...(handoff === undefined ? {} : { handoff }),
  }
  const askedAt = await $.clock.now()
  const answer = await $.ui
    .ask(carryQuestion(trail, handoff), {
      header: 'Carry over',
      options: [
        ...(handoff === undefined ? [] : [CARRY.handoff]),
        ...(trail === undefined ? [] : [CARRY.trail]),
        CARRY.skip,
      ],
    })
    .catch(() => undefined)

  if (answer === undefined) {
    if ((await $.clock.now()) - askedAt < UNASKED_MS) {
      $.ui.toast('Last session is kept · /p_polish carry use adds it.')

      return undefined
    }

    return { ...offered, block: null }
  }

  return {
    ...offered,
    block:
      answer === CARRY.handoff && handoff !== undefined
        ? handoffBlock(handoff)
        : answer === CARRY.trail && trail !== undefined
          ? blockOf(trail.trail)
          : null,
  }
}

/** The offer is spent, taken or skipped: neither is offered again. */
async function spend(
  $: EngineInterface,
  trail: Offer | undefined,
  handoff: Handoff | undefined,
): Promise<void> {
  if (trail !== undefined) {
    await markOffered($, trail)
  }

  if (handoff !== undefined) {
    await markHandoffOffered($, handoff)
  }
}

/** The prompt goes on: the offer is spent, and what was taken goes with it. */
export async function onCarried(
  $: EngineInterface,
  carry: Carry | undefined,
): Promise<readonly string[]> {
  if (carry === undefined) {
    return []
  }

  await spend($, carry.trail, carry.handoff)

  return carry.block === null ? [] : [carry.block]
}

// --- When the context runs full ------------------------------------------------

const MEASURE = { now: 'Write the handoff', later: 'Not now' } as const

/**
 * The context passed the threshold: once in a session, asks whether to write a
 * handoff document, or says how to get the skill that writes one. It asks and
 * never runs on its own. The work is detached: the engine's measuring does not
 * wait for the person's answer.
 */
export async function onMeasure(
  $: EngineInterface,
  percent: number | undefined,
  changed: readonly string[],
): Promise<void> {
  if (percent === undefined || percent < THRESHOLD || !changed.includes('context')) {
    return
  }

  // effortless judges handoffs itself, from 30% of the context: asking twice would be noise.
  if (await isEffortless($)) {
    return
  }

  const session = await $.session.id()

  if ((await read($, measureAsked)) === session) {
    return
  }

  await update($, measureAsked, () => session)

  if ((await read($, handoffRun)) !== null) {
    return
  }

  const command = await findHandoff($)

  if (command === undefined) {
    $.ui.toast(`Context is ${percent}% full · handoff skill: /p_polish carry setup`)

    return
  }

  void askHandoff($, command, percent).catch(() => undefined)
}

async function askHandoff(
  $: EngineInterface,
  command: string,
  percent: number,
): Promise<void> {
  const askedAt = await $.clock.now()
  const answer = await $.ui
    .ask(
      `Context is ${percent}% full.\n\nWrite a handoff document now, so a new session can pick up from here? It runs /${command} as one turn of this session, which uses this session's tokens.`,
      { header: 'Context', options: [MEASURE.now, MEASURE.later] },
    )
    .catch(() => undefined)

  if (answer === MEASURE.now) {
    await startHandoff($, '')
  } else if (answer === undefined && (await $.clock.now()) - askedAt < UNASKED_MS) {
    $.ui.toast(`Context is ${percent}% full · /p_polish carry now writes a handoff.`)
  }
}


// --- Picking up an earlier session ---------------------------------------------

/** The list the pane draws: what is open, picked and handed over, told against now and this session. */
export async function sessionsView($: EngineInterface): Promise<SessionsView> {
  const state = await read($, sessions)
  const current = await $.session.id().catch(() => '')

  // Each entry is `session|id|title`: the sessions handed over to the one now open.
  const done = state.done
    .filter(entry => entry.startsWith(`${current}|`))
    .map(entry => entry.slice(current.length + 1))
    .map(entry => {
      const at = entry.indexOf('|')

      return { id: entry.slice(0, at), title: entry.slice(at + 1) }
    })

  return { ...state, done, now: await $.clock.now() }
}

async function loadSessions($: EngineInterface): Promise<void> {
  const state = await read($, sessions)

  await update($, sessions, s => ({ ...s, isLoading: true }))

  try {
    const handoff = await readHandoff($)
    const rows = await listSessions(
      $,
      state.range === 'day' ? DAY_MS : WEEK_MS,
      handoff?.session,
    )

    await update($, sessions, s => ({ ...s, rows, isLoading: false }))
  } catch {
    await update($, sessions, s => ({ ...s, rows: [], isLoading: false }))
  }
}

/** The pane's Earlier sessions row: opens the list, reading the files then and not before, or folds it. */
export async function toggleSessions($: EngineInterface): Promise<void> {
  const state = await read($, sessions)

  if (state.isOpen) {
    await update($, sessions, s => ({ ...s, isOpen: false, picked: null }))

    return
  }

  await update($, sessions, s => ({ ...s, isOpen: true, rows: null, picked: null }))
  await loadSessions($)
}

/** Opens the list if it is not open yet, reading the session files then. */
export async function openSessions($: EngineInterface): Promise<void> {
  if (!(await read($, sessions)).isOpen) {
    await toggleSessions($)
  }
}

/** The last day, or up to a week. */
export async function setRange(
  $: EngineInterface,
  range: SessionsState['range'],
): Promise<void> {
  await update($, sessions, s => ({ ...s, range, rows: null, picked: null }))
  await loadSessions($)
}

/** Opens a session of the list for a closer look, or folds it. Notes are given unless it has a handoff document. */
export async function pickSession($: EngineInterface, id: string): Promise<void> {
  await update($, sessions, s => {
    const row = s.rows?.find(r => r.id === id)
    const kind: SessionsState['kind'] = row?.hasHandoff === true ? 'handoff' : 'notes'

    return s.picked === id ? { ...s, picked: null } : { ...s, picked: id, kind }
  })
}

export async function setKind(
  $: EngineInterface,
  kind: SessionsState['kind'],
): Promise<void> {
  await update($, sessions, s => ({ ...s, kind }))
}

/**
 * Hands an earlier session over to this one: its notes (or its handoff
 * document) are appended to this conversation as a row the person does not
 * type, which the model reads with the next prompt. No turn is made here.
 */
async function handOver(
  $: EngineInterface,
  id: string,
  kind: SessionsState['kind'],
): Promise<{ text: string; toast: string }> {
  const fail = (text: string) => ({ text, toast: text.slice(0, 70) })
  const root = await $.session.root().catch(() => undefined)
  const state = await read($, sessions)
  const row = state.rows?.find(r => r.id === id)
  let block: string
  let said: string

  if (kind === 'handoff') {
    const handoff = await readHandoff($)

    if (handoff === undefined || handoff.session !== id) {
      return fail('No handoff document is kept for that session.')
    }

    block = handoffBlock(handoff)
    said = 'its handoff document'
    await markHandoffOffered($, handoff)
  } else {
    const stored = await storedTrailOf($, id)
    const trail =
      stored?.trail ?? (await notesOf($, id, nameOf(root ?? '')))

    if (trail === undefined) {
      return fail('That session could not be read.')
    }

    block = blockOf(trail)
    said = 'its notes'

    if (stored !== undefined) {
      await markOffered($, stored)
    }
  }

  const appended = await $.session.append({
    message: { type: 'user', content: [{ type: 'text', text: block }] },
  })

  if ('deny' in appended) {
    return fail(`It could not be handed over: ${String(appended.deny).slice(0, 160)}`)
  }

  const current = await $.session.id()
  const title = row?.title ?? id

  await update($, sessions, s => ({
    ...s,
    done: [...s.done.filter(entry => entry !== `${current}|${id}|${title}`), `${current}|${id}|${title}`],
  }))

  return {
    text: `Handed over ${said} of "${title}". The model reads it with your next prompt.`,
    toast: `Handed over "${title.length > 32 ? `${title.slice(0, 32)}…` : title}" · send your next prompt.`,
  }
}

/** The pane's button: hands over the session that is opened, in the form that is chosen. */
export async function takeSession($: EngineInterface): Promise<void> {
  const state = await read($, sessions)

  if (state.picked === null) {
    return
  }

  try {
    $.ui.toast((await handOver($, state.picked, state.kind)).toast)
  } catch (error) {
    $.ui.toast(`It could not be handed over: ${String(error).slice(0, 160)}`)
  }
}

const numbered = (rows: readonly SessionRow[], now: number): string =>
  rows
    .map(
      (row, i) =>
        `${i + 1}. ${agoOf(now, row.at)} · ${row.title}${row.files > 0 ? ` (${row.files} ${row.files === 1 ? 'file' : 'files'}${row.hasHandoff ? ', handoff document' : ''})` : row.hasHandoff ? ' (handoff document)' : ''}${row.last !== '' && row.last !== row.title ? `\n   last prompt: ${row.last}` : ''}`,
    )
    .join('\n')

/** `/p_polish carry sessions [week]`: the sessions of this project from the last day, or up to a week. */
async function sessionsText(
  $: EngineInterface,
  range: SessionsState['range'],
): Promise<string> {
  await update($, sessions, s => ({ ...s, range, rows: null, picked: null }))
  await loadSessions($)

  const state = await read($, sessions)
  const rows = state.rows ?? []
  const now = await $.clock.now()
  const where = range === 'day' ? 'the last 24 hours' : 'the last 7 days'

  if (rows.length === 0) {
    return [
      `No earlier session of this project in ${where}.`,
      ...(range === 'day' ? ['Not here? /p_polish carry sessions week'] : []),
    ].join('\n')
  }

  return [
    `Earlier sessions of this project, ${where}:`,
    numbered(rows, now),
    '',
    ...(range === 'day' ? ['Not here? /p_polish carry sessions week'] : []),
    'Hand one over to this session: /p_polish carry take <number> [handoff]',
  ].join('\n')
}

/** `/p_polish carry take <number> [handoff]`: hands the numbered session of the last listing over to this one. */
async function takeText($: EngineInterface, rest: string): Promise<string> {
  const [which = '', form = ''] = rest.split(/\s+/)
  const state = await read($, sessions)
  const rows = state.rows

  if (rows === null) {
    return 'List the sessions first: /p_polish carry sessions'
  }

  const row = /^\d+$/.test(which)
    ? rows[Number(which) - 1]
    : rows.find(r => which !== '' && r.id.startsWith(which))

  if (row === undefined) {
    return `No session ${which === '' ? 'was named' : `"${which}"`} in the last listing. /p_polish carry sessions shows it.`
  }

  return (await handOver($, row.id, form === 'handoff' ? 'handoff' : 'notes')).text
}
