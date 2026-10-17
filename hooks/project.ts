import type { SessionMessage } from 'claude-code'

const MAP_LINES = 150
const DOC_LIMIT = 2_000
const MANIFEST_LIMIT = 1_500
const MANIFESTS_READ = 2
const FILE_LIMIT = 2_000
const FILES_READ = 3
const ANSWER_LIMIT = 4_000

const DOCS = ['CLAUDE.md']

// The files a stack is read off, in the order looked for.
const MANIFESTS = [
  'package.json',
  'go.mod',
  'pyproject.toml',
  'requirements.txt',
  'Cargo.toml',
  'build.gradle',
  'pom.xml',
  'Package.swift',
  'Gemfile',
  'composer.json',
  'Makefile',
  'CMakeLists.txt',
]

// Never walked when the project is no git repository to say what it ignores.
export const SKIPPED_DIRS: readonly string[] = [
  '.git',
  'node_modules',
  'dist',
  'build',
  'out',
  'target',
  'vendor',
  '.next',
  '.venv',
  'venv',
  '__pycache__',
]

// Listed by name, never read: keys and credentials, and what is not text.
const SECRET = /(^|\/)(\.env(\..*)?|\.npmrc|\.netrc|id_[a-z0-9]+|.*\.(pem|key|p12|pfx|keystore)|.*(secret|credential).*)$/i
const BINARY = /\.(png|jpe?g|gif|webp|ico|svg|pdf|zip|gz|tar|7z|exe|dll|so|dylib|bin|woff2?|ttf|otf|mp[34]|mov|wav|lock)$/i

export const isReadable = (path: string): boolean =>
  !SECRET.test(path) && !BINARY.test(path)

const clip = (text: string, limit: number): string =>
  text.length <= limit ? text : `${text.slice(0, limit)}\n… (잘림)`

const depthOf = (path: string): number => path.split('/').length - 1

/** The paths `git ls-files` printed, or a walk found: forward slashes, sorted, each once. */
export const pathsOf = (listing: string): string[] =>
  [
    ...new Set(
      listing
        .split('\n')
        .map(line => line.trim().replaceAll('\\', '/'))
        .filter(line => line !== ''),
    ),
  ].sort()

/**
 * The project's files as a map short enough to send whole: every path of a
 * small project; of a large one the files near the root by name, the rest
 * counted by folder.
 */
export const mapOf = (paths: readonly string[]): string => {
  if (paths.length <= MAP_LINES) {
    return paths.join('\n')
  }

  const near = paths.filter(path => depthOf(path) < 2)
  const folders = new Map<string, number>()

  for (const path of paths) {
    if (depthOf(path) >= 2) {
      const folder = `${path.split('/').slice(0, 2).join('/')}/`
      folders.set(folder, (folders.get(folder) ?? 0) + 1)
    }
  }

  const lines = [
    ...near,
    ...[...folders].map(([folder, count]) => `${folder} (${count} files)`),
  ].sort()
  const shown = lines.slice(0, MAP_LINES)

  return lines.length > shown.length
    ? `${shown.join('\n')}\n… (${lines.length - shown.length}줄 더 있음)`
    : shown.join('\n')
}

/**
 * The project's files a text names, in the order it names them: by their
 * whole path, by the end of it, or by a file name only one file has.
 */
export const mentionedIn = (text: string, paths: readonly string[]): string[] => {
  const words = (text.match(/[\w@.\\/-]+\.[A-Za-z0-9]+/g) ?? []).map(word =>
    word.replaceAll('\\', '/').replace(/^\.\//, ''),
  )
  const found: string[] = []

  for (const word of words) {
    const hits = paths.filter(
      path => path === word || path.endsWith(`/${word}`),
    )
    const [hit] = hits

    if (hit !== undefined && hits.length === 1 && !found.includes(hit)) {
      found.push(hit)
    }
  }

  return found
}

/** The last thing the agent said in the session, its end kept when it is long. */
export const answerOf = (messages: readonly SessionMessage[]): string => {
  const last = messages
    .toReversed()
    .find(message => message.role === 'assistant' && message.text.trim() !== '')
  const text = last?.text.trim() ?? ''

  return text.length <= ANSWER_LIMIT
    ? text
    : `(앞부분 생략) …\n${text.slice(-ANSWER_LIMIT)}`
}

const titled = (title: string, body: string): string => `## ${title}\n${body}`

const fenced = (path: string, text: string, limit: number): string =>
  `### ${path}\n\`\`\`\n${clip(text.trim(), limit)}\n\`\`\``

export type Read = (path: string) => Promise<string | undefined>

/**
 * The part of the project every polish of it reads alike: the map of its
 * files, its CLAUDE.md, and the manifests its stack is read off. The same
 * project gives the same text, to the byte, so the prompt cache finds it again.
 */
export const projectOf = async (
  paths: readonly string[],
  read: Read,
): Promise<string> => {
  if (paths.length === 0) {
    return ''
  }

  const parts = [titled(`파일 목록 (${paths.length}개)`, mapOf(paths))]

  for (const doc of DOCS.filter(name => paths.includes(name))) {
    const text = await read(doc)

    if (text !== undefined) {
      parts.push(titled('프로젝트 지침', fenced(doc, text, DOC_LIMIT)))
    }
  }

  const manifests: string[] = []

  for (const name of MANIFESTS.filter(file => paths.includes(file))) {
    const text = manifests.length < MANIFESTS_READ ? await read(name) : undefined

    if (text !== undefined) {
      manifests.push(fenced(name, text, MANIFEST_LIMIT))
    }
  }

  if (manifests.length > 0) {
    parts.push(titled('매니페스트', manifests.join('\n\n')))
  }

  return parts.join('\n\n')
}

/** The start of each file the draft names, then of those the last answer names. */
export const filesOf = async (
  names: readonly string[],
  read: Read,
): Promise<string> => {
  const files: string[] = []

  for (const name of names.filter(isReadable)) {
    const text = files.length < FILES_READ ? await read(name) : undefined

    if (text !== undefined) {
      files.push(fenced(name, text, FILE_LIMIT))
    }
  }

  return files.join('\n\n')
}
