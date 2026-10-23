// The earlier sessions of a project, as the pane lists them: read from the
// session files Claude Code keeps on this computer, so a session shows up
// whether or not the trail was on while it ran. Nothing is read until the
// person opens the list, only the start and the end of each file are read, and
// only a few lines of it are kept: what is handed over is masked and cut, and
// nothing of it is stored here.
//
// The files are Claude Code's own and their format is not a promise: a line
// that does not read as expected is passed over, and a session that yields no
// prompt is left out of the list.
import type { EngineInterface } from 'claude-code'

import type { SessionRow } from '../types'
import { isSecretPath } from './project'
import {
  clipped,
  EDITS,
  emptyTrail,
  endOf,
  redact,
  relativeTo,
  withPrompt,
} from './trail'
import type { Todo, Trail } from './trail'

export const DAY_MS = 24 * 60 * 60_000
export const WEEK_MS = 7 * DAY_MS

/** How much of the start of a file is read, for the first prompt. */
const HEAD_BYTES = 65_536
/** How much of the end, for the last prompts, answer and files. */
const TAIL_BYTES = 262_144
/** The most sessions listed. */
const LISTED = 30
const TITLE_CHARS = 80
const LAST_CHARS = 140
const FILES = 30
const TODOS = 12

// What a user line holds that the person did not type: commands, notices, hooks.
const NOT_A_PROMPT =
  /^<(?:command-|local-command-|system-reminder|task-notification|ide_)|^\[Request interrupted/

type Entry = Record<string, unknown>

const asEntry = (value: unknown): Entry | undefined =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? { ...value }
    : undefined

/**
 * The JSON lines of a piece of a file. A piece cut at its start begins in the
 * middle of a line, and one cut at its end stops in the middle of one: those
 * two are dropped.
 */
export const entriesOf = (
  text: string,
  isStartCut: boolean,
  isEndCut: boolean,
): Entry[] => {
  const lines = text.split('\n')
  const body = isEndCut ? lines.slice(0, -1) : lines
  const found: Entry[] = []

  for (const line of body.slice(isStartCut ? 1 : 0)) {
    try {
      const entry = asEntry(JSON.parse(line))

      if (entry !== undefined) {
        found.push(entry)
      }
    } catch {
      // Not a line this reader knows: passed over.
    }
  }

  return found
}

const blocksOf = (entry: Entry): Entry[] => {
  const content = asEntry(entry.message)?.content

  return Array.isArray(content)
    ? content.map(asEntry).filter(block => block !== undefined)
    : []
}

/** What the person typed in a user line, or undefined for a line that is not their prompt. */
export const promptOfEntry = (entry: Entry): string | undefined => {
  if (entry.type !== 'user' || entry.isMeta === true || entry.isSidechain === true) {
    return undefined
  }

  const content = asEntry(entry.message)?.content
  let text: string | undefined

  if (typeof content === 'string') {
    text = content
  } else if (Array.isArray(content)) {
    const blocks = blocksOf(entry)

    // A tool's answer rides in a user line and is no prompt.
    text = blocks.some(block => block.type === 'tool_result')
      ? undefined
      : blocks
          .map(block => (block.type === 'text' ? String(block.text ?? '') : ''))
          .join('\n')
  }

  const prompt = text?.trim()

  return prompt === undefined || prompt === '' || NOT_A_PROMPT.test(prompt)
    ? undefined
    : prompt
}

const answerOfEntry = (entry: Entry): string | undefined => {
  if (entry.type !== 'assistant' || entry.isSidechain === true) {
    return undefined
  }

  const text = blocksOf(entry)
    .map(block => (block.type === 'text' ? String(block.text ?? '') : ''))
    .join('\n')
    .trim()

  return text === '' ? undefined : text
}

/** What a session's start and end say of it. */
export type Summary = {
  title: string
  last: string
  prompts: string[]
  answer: string
  files: string[]
  todos: Todo[]
}

const lastOf = <T>(items: readonly T[]): T | undefined => items[items.length - 1]

/**
 * The summary of a session from the start and the end of its file: its title
 * (the one Claude Code gave it, else its first prompt), the last prompts, the
 * end of the last answer, the files its recent part changed and its to-do list.
 */
export const summarize = (
  head: readonly Entry[],
  tail: readonly Entry[],
  root: string,
): Summary => {
  const prompts = tail.map(promptOfEntry).filter(text => text !== undefined)
  const first = head.map(promptOfEntry).find(text => text !== undefined)
  const named = tail
    .filter(entry => entry.type === 'custom-title')
    .map(entry => entry.customTitle)
    .filter(title => typeof title === 'string' && title.trim() !== '')
  const lastPrompts = tail
    .filter(entry => entry.type === 'last-prompt')
    .map(entry => entry.lastPrompt)
    .filter(text => typeof text === 'string' && text.trim() !== '' && !text.startsWith('/'))
  const answers = tail.map(answerOfEntry).filter(text => text !== undefined)
  const touched = new Set<string>()
  let todos: Todo[] = []

  for (const entry of tail) {
    if (entry.type !== 'assistant' || entry.isSidechain === true) {
      continue
    }

    for (const block of blocksOf(entry)) {
      if (block.type !== 'tool_use' || typeof block.name !== 'string') {
        continue
      }

      const input = asEntry(block.input) ?? {}
      const argument = EDITS[block.name]
      const path = argument === undefined ? undefined : input[argument]
      const inside = typeof path === 'string' ? relativeTo(path, root) : undefined

      if (inside !== undefined && inside !== '' && !isSecretPath(inside)) {
        touched.delete(inside)
        touched.add(inside)
      }

      if (block.name === 'TodoWrite' && Array.isArray(input.todos)) {
        todos = input.todos
          .map(asEntry)
          .filter(todo => typeof todo?.content === 'string')
          .slice(0, TODOS)
          .map(todo => ({
            content: clipped(redact(String(todo?.content)), 160),
            status: String(todo?.status ?? ''),
          }))
      }
    }
  }

  const shown = [...prompts]
  const lastPrompt = lastOf(prompts) ?? lastOf(lastPrompts)

  return {
    title: clipped(
      redact(String(lastOf(named) ?? first ?? prompts[0] ?? '').trim()),
      TITLE_CHARS,
    ),
    last: clipped(redact(String(lastPrompt ?? '').trim()), LAST_CHARS),
    prompts: shown.length > 0 ? shown : first === undefined ? [] : [first],
    answer: lastOf(answers) ?? '',
    files: [...touched].slice(-FILES).map(redact),
    todos,
  }
}

/** The summary as a trail, the shape that is rendered and handed over. */
export const trailOfSummary = (
  summary: Summary,
  id: string,
  at: number,
  name: string,
): Trail => {
  let trail = emptyTrail(name, id, at)

  for (const prompt of summary.prompts) {
    trail = withPrompt(trail, prompt, at)
  }

  return {
    ...trail,
    answer: summary.answer === '' ? '' : endOf(summary.answer),
    files: summary.files,
    todos: summary.todos,
  }
}

/** When a session was last written to, told against `now`. */
export const agoOf = (now: number, at: number): string => {
  const minutes = Math.max(0, Math.round((now - at) / 60_000))

  if (minutes < 2) {
    return 'just now'
  }

  if (minutes < 60) {
    return `${minutes} min ago`
  }

  const hours = Math.round(minutes / 60)

  return hours < 48 ? `${hours} h ago` : `${Math.round(hours / 24)} days ago`
}

/** The folder Claude Code keeps a project's sessions in: the project's path with every character that is no letter or digit made a hyphen. */
export const projectFolderOf = (path: string): string =>
  path.replace(/[^A-Za-z0-9]/g, '-')

async function sessionFolders($: EngineInterface): Promise<string[]> {
  const config = await $.env.get('CLAUDE_CONFIG_DIR').catch(() => undefined)
  const home = await $.env.get('HOME').catch(() => undefined)
  const base = config ?? (home === undefined ? undefined : `${home}/.claude`)
  const cwd = await $.session.cwd().catch(() => undefined)
  const root = await $.session.root().catch(() => undefined)

  if (base === undefined) {
    return []
  }

  return [
    ...new Set(
      [cwd, root]
        .filter(path => path !== undefined)
        .map(path => `${base}/projects/${projectFolderOf(path)}`),
    ),
  ]
}

async function readPiece(
  $: EngineInterface,
  command: 'head' | 'tail',
  bytes: number,
  path: string,
): Promise<string | undefined> {
  const run = await $.process
    .run([command, '-c', String(bytes), path], { timeoutMs: 5_000 })
    .catch(() => undefined)

  return run !== undefined && run.exitCode === 0 ? run.stdout : undefined
}

/** A session file, read at its start and its end, as the entries of each. */
export async function readSession(
  $: EngineInterface,
  path: string,
  size: number,
): Promise<{ head: Entry[]; tail: Entry[] } | undefined> {
  if (size <= TAIL_BYTES) {
    const whole = await readPiece($, 'head', TAIL_BYTES, path)

    if (whole === undefined) {
      return undefined
    }

    const all = entriesOf(whole, false, false)

    return { head: all, tail: all }
  }

  const start = await readPiece($, 'head', HEAD_BYTES, path)
  const end = await readPiece($, 'tail', TAIL_BYTES, path)

  return start === undefined || end === undefined
    ? undefined
    : { head: entriesOf(start, false, true), tail: entriesOf(end, true, false) }
}

/** The session files of this project written within `range` ms, newest first, this session's own left out. */
export async function sessionFiles(
  $: EngineInterface,
  range: number,
): Promise<{ id: string; path: string; at: number; size: number }[]> {
  const now = await $.clock.now()
  const current = await $.session.id()
  const found: { id: string; path: string; at: number; size: number }[] = []

  for (const folder of await sessionFolders($)) {
    for (const entry of await $.fs.list(folder).catch(() => [])) {
      const id = entry.name.endsWith('.jsonl') ? entry.name.slice(0, -6) : ''

      if (
        entry.kind === 'file' &&
        id !== '' &&
        id !== current &&
        now - entry.mtimeMs <= range
      ) {
        found.push({ id, path: `${folder}/${entry.name}`, at: entry.mtimeMs, size: entry.size })
      }
    }
  }

  return found.sort((a, b) => b.at - a.at).slice(0, LISTED)
}

/** The sessions of this project in the last `range` ms that have a prompt to show, newest first. */
export async function listSessions(
  $: EngineInterface,
  range: number,
  handoffSession: string | undefined,
): Promise<SessionRow[]> {
  const root = (await $.session.root().catch(() => undefined)) ?? ''
  const files = await sessionFiles($, range)
  const rows: SessionRow[] = []

  // A few at a time: each is two short reads.
  for (let i = 0; i < files.length; i += 6) {
    const batch = await Promise.all(
      files.slice(i, i + 6).map(async file => {
        const read = await readSession($, file.path, file.size)

        return read === undefined
          ? undefined
          : { file, summary: summarize(read.head, read.tail, root) }
      }),
    )

    for (const item of batch) {
      if (item !== undefined && (item.summary.title !== '' || item.summary.last !== '')) {
        rows.push({
          id: item.file.id,
          at: item.file.at,
          title: item.summary.title === '' ? item.summary.last : item.summary.title,
          last: item.summary.last,
          files: item.summary.files.length,
          hasHandoff: item.file.id === handoffSession,
        })
      }
    }
  }

  return rows
}

/** The notes of one session, made from its file, or undefined when it cannot be read. */
export async function notesOf(
  $: EngineInterface,
  id: string,
  name: string,
): Promise<Trail | undefined> {
  const root = (await $.session.root().catch(() => undefined)) ?? ''

  for (const file of await sessionFiles($, WEEK_MS)) {
    if (file.id === id) {
      const read = await readSession($, file.path, file.size)

      return read === undefined
        ? undefined
        : trailOfSummary(summarize(read.head, read.tail, root), id, file.at, name)
    }
  }

  return undefined
}
