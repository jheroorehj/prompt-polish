// The pane's loading mark: a spinner and the time a polish has run, ticking on
// the surface's own frame clock so the pane need not redraw for it.
// `since` and `now` come from the hooks module's $.clock; between redraws it
// adds its own ticks.
import type { ClientModule } from 'claude-code'

type Props = { since: number; now: number; color: string }
type Ref = { base: number; ticks: number; lastNow: number }
type State = { ref: Ref }

const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']
const TICK_MS = 100

const fmt = (ms: number): string => {
  const seconds = Math.max(0, Math.floor(ms / 1000))

  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

const Spinner: ClientModule<Props, State> = (props, surface) => {
  const { Text } = surface.elements
  const ref = surface.state?.ref ?? { base: 0, ticks: 0, lastNow: -1 }

  if (props.now !== ref.lastNow) {
    // A fresh reading from the hooks module: restart the local count from it.
    ref.lastNow = props.now
    ref.base = props.now - props.since
    ref.ticks = 0
  }

  if (surface.state === undefined) {
    surface.setState({ ref })
    surface.every(TICK_MS, () => {
      ref.ticks += 1
      surface.setState({ ref })
    })
  }

  return (
    <Text color={props.color} bold>
      {`${FRAMES[ref.ticks % FRAMES.length]} ${fmt(ref.base + ref.ticks * TICK_MS)}`}
    </Text>
  )
}

export default Spinner
