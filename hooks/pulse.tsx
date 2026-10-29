// The pane's state mark, moving on the surface's own frame clock so the pane
// need not redraw for it: at rest a dot, which does not move; the MiniDot
// spinner of charmbracelet/bubbles while a polish runs; its Points while a
// preview waits for an answer. A mark that does not move has no clock.
import type { ClientModule } from 'claude-code'

type Props = { kind: 'idle' | 'review' | 'busy'; color: string }
type Ref = { ticks: number; stop: (() => void) | null }
type State = { ref: Ref }

const TICK_MS = 100

// `hold` is how many ticks each frame stays up.
const MARKS = {
  idle: { hold: 1, frames: ['●'] },
  review: { hold: 2, frames: ['∙∙∙', '●∙∙', '∙●∙', '∙∙●'] },
  busy: { hold: 1, frames: ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'] },
} as const

const Pulse: ClientModule<Props, State> = (props, surface) => {
  const { Text } = surface.elements
  const ref = surface.state?.ref ?? { ticks: 0, stop: null }
  const mark = MARKS[props.kind]
  const isMoving = mark.frames.length > 1

  // The clock starts when the mark moves, once, and stops when it comes to rest.
  if (isMoving && ref.stop === null) {
    ref.stop = surface.every(TICK_MS, () => {
      ref.ticks += 1
      surface.setState({ ref })
    })
    surface.setState({ ref })
  } else if (!isMoving && ref.stop !== null) {
    ref.stop()
    ref.stop = null
    ref.ticks = 0
  }

  const frame = Math.floor(ref.ticks / mark.hold) % mark.frames.length

  return (
    <Text color={props.color} bold>
      {mark.frames[frame]}
    </Text>
  )
}

export default Pulse
