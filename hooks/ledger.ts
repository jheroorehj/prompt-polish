// What the polish calls cost, as the API counted it, kept as numbers only: the
// tokens of each call, which block of the request was how long, and when. No
// text of a prompt, a project or an answer is kept. It is there to measure
// before changing what a polish is given: the cache marks on the request pay
// only when a read follows a write within five minutes, and nothing else says
// how often that is.
import type { ModelUsage } from 'claude-code'

export type Kind = 'polish' | 'retry'

/** One call: when, which model, a polish or a retry of one, its tokens, and the request's blocks in characters. */
export type Spend = {
  at: number
  model: string
  kind: Kind
  input: number
  write: number
  read: number
  output: number
  /** The system text, the project, the files and last answer, and the draft. */
  chars: readonly [number, number, number, number]
}

export type Ledger = {
  since: number
  polishes: number
  retries: number
  failed: number
  input: number
  write: number
  read: number
  output: number
  /** The latest calls, oldest first. */
  recent: readonly Spend[]
}

/** How many calls are kept in full; the totals are kept for all. */
export const RECENT = 40

/** The prompt cache keeps an entry this long after its last use. */
export const CACHE_MS = 5 * 60_000

const isCount = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0

const isSpend = (value: unknown): value is Spend => {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  const spend: Record<string, unknown> = { ...value }
  const chars = spend.chars

  return (
    isCount(spend.at) &&
    typeof spend.model === 'string' &&
    (spend.kind === 'polish' || spend.kind === 'retry') &&
    isCount(spend.input) &&
    isCount(spend.write) &&
    isCount(spend.read) &&
    isCount(spend.output) &&
    Array.isArray(chars) &&
    chars.length === 4 &&
    chars.every(isCount)
  )
}

/** Whether what the store gave back is a ledger this build wrote. */
export const isLedger = (value: unknown): value is Ledger => {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  const ledger: Record<string, unknown> = { ...value }

  return (
    isCount(ledger.since) &&
    isCount(ledger.polishes) &&
    isCount(ledger.retries) &&
    isCount(ledger.failed) &&
    isCount(ledger.input) &&
    isCount(ledger.write) &&
    isCount(ledger.read) &&
    isCount(ledger.output) &&
    Array.isArray(ledger.recent) &&
    ledger.recent.every(isSpend)
  )
}

export const emptyLedger = (since: number): Ledger => ({
  since,
  polishes: 0,
  retries: 0,
  failed: 0,
  input: 0,
  write: 0,
  read: 0,
  output: 0,
  recent: [],
})

/** The ledger with one more call in it; `usage` is what the API counted, `isAnswered` whether it answered. */
export const recorded = (
  ledger: Ledger,
  spend: Omit<Spend, 'input' | 'write' | 'read' | 'output'>,
  usage: ModelUsage,
  isAnswered: boolean,
): Ledger => {
  const counted: Spend = {
    ...spend,
    input: usage.input_tokens,
    write: usage.cache_creation_input_tokens,
    read: usage.cache_read_input_tokens,
    output: usage.output_tokens,
  }

  return {
    ...ledger,
    polishes: ledger.polishes + (spend.kind === 'polish' ? 1 : 0),
    retries: ledger.retries + (spend.kind === 'retry' ? 1 : 0),
    failed: ledger.failed + (isAnswered ? 0 : 1),
    input: ledger.input + counted.input,
    write: ledger.write + counted.write,
    read: ledger.read + counted.read,
    output: ledger.output + counted.output,
    recent: [...ledger.recent, counted].slice(-RECENT),
  }
}

/** Which blocks of a request carry a cache mark. */
export type CachePlan = {
  system: boolean
  project: boolean
  /** The files the draft names and the last answer: read again only by a retry. */
  turn: boolean
}

/** Calls the ledger needs before it changes any mark: fewer is too few to tell. */
export const MIN_CALLS = 10

/**
 * What a mark must be read back at to pay: a cache write costs a quarter more
 * than plain input, and a read saves nineteen twentieths of it.
 */
export const BREAK_EVEN = 0.25 / 0.95

const nearOf = (recent: readonly Spend[]): { near: number; total: number } => {
  const gaps = recent
    .slice(1)
    .map((spend, i) => spend.at - (recent[i]?.at ?? spend.at))

  return { near: gaps.filter(gap => gap <= CACHE_MS).length, total: gaps.length }
}

/**
 * Where a cache mark is worth its write, by what this person's calls have
 * shown. The system text and the project are read again by any call that
 * follows another within the cache's five minutes; the files and the last
 * answer only by a retry of the same polish. Until enough calls are recorded
 * every block is marked, and a mark that stops paying is left off until the
 * numbers say it pays again: they go on being counted whatever the marks.
 */
export const cachePlanOf = (ledger: Ledger): CachePlan => {
  const all: CachePlan = { system: true, project: true, turn: true }

  if (ledger.polishes + ledger.retries < MIN_CALLS || ledger.recent.length < MIN_CALLS) {
    return all
  }

  const { near, total } = nearOf(ledger.recent)
  const isNear = total === 0 || near / total >= BREAK_EVEN
  const isRetried = ledger.polishes === 0 || ledger.retries / ledger.polishes >= BREAK_EVEN

  return { system: isNear, project: isNear, turn: isRetried }
}

const group = (n: number): string =>
  String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',')

const count = (n: number, one: string, many: string): string =>
  `${n} ${n === 1 ? one : many}`

const percent = (part: number, whole: number): string =>
  whole === 0 ? 'n/a' : `${Math.round((part / whole) * 100)}%`

const minutes = (ms: number): string => `${(ms / 60_000).toFixed(1)} min`

const dayOf = (ms: number): string => {
  const date = new Date(ms)
  const two = (n: number) => String(n).padStart(2, '0')

  return `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())} ${two(date.getHours())}:${two(date.getMinutes())}`
}

const median = (values: readonly number[]): number | undefined => {
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)

  return sorted.length === 0
    ? undefined
    : sorted.length % 2 === 1
      ? sorted[middle]
      : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
}

const average = (values: readonly number[]): number =>
  values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length

/**
 * The ledger in words: the totals, how much of the input the cache served, how
 * often a call followed another within the cache's five minutes, and how often
 * a polish was retried. Those last two are what decide whether a cache mark on
 * the request pays: a write costs a quarter more than plain input, a read a
 * twentieth of it on the current Claude models, so a mark pays when a read
 * follows it often enough.
 */
export const reportOf = (ledger: Ledger): string => {
  const calls = ledger.polishes + ledger.retries

  if (calls === 0) {
    return 'No polishes recorded yet.'
  }

  const everything = ledger.input + ledger.write + ledger.read
  const recent = ledger.recent
  const gaps = recent
    .slice(1)
    .map((spend, i) => spend.at - (recent[i]?.at ?? spend.at))
  const near = gaps.filter(gap => gap <= CACHE_MS).length
  const middle = median(gaps)
  const plan = cachePlanOf(ledger)
  const marked = [
    plan.system ? 'system' : undefined,
    plan.project ? 'project' : undefined,
    plan.turn ? 'files and last answer' : undefined,
  ].filter(name => name !== undefined)
  const part = (at: 0 | 1 | 2 | 3) => average(recent.map(spend => spend.chars[at]))

  return [
    `Prompt Polish usage since ${dayOf(ledger.since)}: ${count(ledger.polishes, 'polish', 'polishes')}, ${count(ledger.retries, 'retry', 'retries')}, ${ledger.failed} failed.`,
    `Tokens: ${group(ledger.input)} input, ${group(ledger.write)} cache write, ${group(ledger.read)} cache read, ${group(ledger.output)} output.`,
    `Served from the cache: ${percent(ledger.read, everything)} of the input tokens.`,
    `Retried: ${percent(ledger.retries, ledger.polishes)} of the polishes (the files and last answer are read from the cache only by a retry).`,
    recent.length < 2
      ? 'Calls within 5 minutes of the one before: n/a (needs two calls).'
      : `Calls within 5 minutes of the one before: ${near} of ${gaps.length}, median gap ${minutes(middle ?? 0)} (the last ${recent.length} calls).`,
    `Request, average characters: system ${group(part(0))}, project ${group(part(1))}, files and last answer ${group(part(2))}, draft ${group(part(3))}.`,
    calls < MIN_CALLS
      ? `Cache marks: all on until ${MIN_CALLS} calls are recorded (${calls} so far).`
      : `Cache marks now: ${marked.length === 0 ? 'none' : marked.join(', ')}. A mark pays once it is read back in ${percent(BREAK_EVEN * 100, 100)} of the calls; this is set from the numbers above.`,
  ].join('\n')
}
