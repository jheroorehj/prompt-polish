// The pane's drawings, for the surfaces that draw SVG: the icons beside its
// buttons, the chevrons of its toggles, and the track of its loading mark.
//
// The icons are Lucide's (https://lucide.dev), ISC License, Copyright (c)
// Lucide Icons and Contributors; `check`, `down`, `up`, `close` and `stop`
// derive from Feather, MIT License, Copyright (c) Cole Bemis.
// THIRD_PARTY_NOTICES.md at the mod's root holds the notices in full.
//
// A surface draws an SVG apart from its page, so a drawing takes no color
// from the theme: each is given its color as it is made. And it leaves out a
// drawing that says nothing, so each is given its words (`alt`) where drawn.

/** The paths of each icon, drawn in a 24 by 24 box with a round stroke of 2. */
const PATHS = {
  // lucide: check
  check: '<path d="M20 6 9 17l-5-5"/>',
  // lucide: rotate-ccw
  retry:
    '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>',
  // lucide: undo-2
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5a5.5 5.5 0 0 1-5.5 5.5H11"/>',
  // lucide: x
  close: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  // lucide: circle-stop. A ring round a small square: the mark of stopping,
  // and nothing like a box to tick, which a square alone was taken for.
  stop: '<circle cx="12" cy="12" r="10"/><rect x="9" y="9" width="6" height="6" rx="1"/>',
  // lucide: wand-sparkles
  wand: '<path d="m21.64 3.64-1.28-1.28a1.21 1.21 0 0 0-1.72 0L2.36 18.64a1.21 1.21 0 0 0 0 1.72l1.28 1.28a1.2 1.2 0 0 0 1.72 0L21.64 5.36a1.2 1.2 0 0 0 0-1.72"/><path d="m14 7 3 3"/><path d="M5 6v4"/><path d="M19 14v4"/><path d="M10 2v2"/><path d="M7 8H3"/><path d="M21 16h-4"/><path d="M11 3H9"/>',
  // lucide: book-open
  book: '<path d="M12 5v16"/><path d="M20.001 19A2 2 0 0022 17V5a2 2 0 00-1.999-2L16 3.002A5 5 0 0012 5a5 5 0 00-4-2H4a2 2 0 00-2 2v12a2 2 0 001.999 2H8a5 5 0 014 2 5 5 0 014-2z"/>',
  // lucide: chevron-down
  down: '<path d="m6 9 6 6 6-6"/>',
  // lucide: chevron-up
  up: '<path d="m18 15-6-6-6 6"/>',
  // lucide: chevron-left
  left: '<path d="m15 18-6-6 6-6"/>',
  // lucide: chevron-right
  right: '<path d="m9 18 6-6-6-6"/>',
} as const

export type IconName = keyof typeof PATHS

/** One icon as an SVG document, stroked in `color`. */
export const iconOf = (name: IconName, color: string): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${PATHS[name]}</svg>`

/** How tall the loading track is drawn, in pixels. */
export const TRACK_HEIGHT = 16

/**
 * The loading mark's track as an SVG document: a row of dots in `dim` from
 * edge to edge, and a stretch in `color` that runs along it from the left and
 * comes round again. It says "working", never "this far along".
 *
 * It has no view box, so a unit is a pixel however wide it is drawn: the dots
 * stand 8 apart at any width, and the stretch runs the width by percentages.
 * It runs by SMIL, which a surface runs only in a drawing it keeps live.
 */
export const trackOf = (color: string, dim: string): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="${TRACK_HEIGHT}"><line x1="4" y1="8" x2="100%" y2="8" stroke="${dim}" stroke-width="2" stroke-dasharray="0.1 7.9" stroke-linecap="round"/><rect x="-15%" y="6.7" width="48" height="2.6" rx="1.3" fill="${color}"><animate attributeName="x" values="-15%;100%" dur="1.485s" repeatCount="indefinite"/></rect></svg>`

/** The switch, 34 by 20: its track in the app's blue while it is on, a gray while off. */
export const SWITCH_WIDTH = 34
export const SWITCH_HEIGHT = 20
export const switchOf = (isOn: boolean): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="34" height="20" viewBox="0 0 34 20"><rect width="34" height="20" rx="10" fill="${isOn ? '#2F7DF6' : '#8C8C8C'}"${isOn ? '' : ' fill-opacity="0.45"'}/><circle cx="${isOn ? 24 : 10}" cy="10" r="8" fill="#FFFFFF"/></svg>`

export type StepState = 'done' | 'now' | 'todo'

/**
 * One step of the draft's progress, 18 by 18: a green disc with a tick once it
 * is done, the accent's with its number while it is the one, a ring with its
 * number before it.
 */
export const stepOf = (state: StepState, n: number, accent: string): string => {
  const open =
    '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 18 18">'
  const number = (color: string) =>
    `<text x="9" y="12.6" text-anchor="middle" font-size="10" font-family="sans-serif" font-weight="600" fill="${color}">${n}</text>`

  return state === 'done'
    ? `${open}<circle cx="9" cy="9" r="9" fill="#2EA043"/><path d="M5 9.4l2.7 2.7L13 6.8" stroke="#FFFFFF" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`
    : state === 'now'
      ? `${open}<circle cx="9" cy="9" r="9" fill="${accent}"/>${number('#FFFFFF')}</svg>`
      : `${open}<circle cx="9" cy="9" r="8.25" stroke="#8C8C8C" fill="none"/>${number('#8C8C8C')}</svg>`
}

/** The loading ring, 16 by 16: a quiet ring, and an arc of the accent that turns round it. It turns by SMIL, which a surface runs only in a drawing it keeps live. */
export const RING = 16
export const ringOf = (color: string): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="#8C8C8C" stroke-opacity="0.3" stroke-width="3"/><path d="M12 3a9 9 0 0 1 9 9" stroke="${color}" stroke-width="3" stroke-linecap="round"><animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="0.8s" repeatCount="indefinite"/></path></svg>`
