// The loading line: a short lit stretch that runs along a dotted track and comes
// round again for as long as a polish runs, on the surface's own frame clock.
// It says "working", never "this far along": a model call reports no progress,
// so nothing here fills up or counts down.
import type { ClientModule } from 'claude-code'

type Props = { width: number; color: string; dim: string }
type Ref = { ticks: number }
type State = { ref: Ref }

const TICK_MS = 45
const LIT = 6
// Dots, not a line: the rule under the pane's heading is a line, and the two
// stand one above the other.
const TRACK = '·'

const Bar: ClientModule<Props, State> = (props, surface) => {
  const { Text } = surface.elements
  const ref = surface.state?.ref ?? { ticks: 0 }

  if (surface.state === undefined) {
    surface.setState({ ref })
    surface.every(TICK_MS, () => {
      ref.ticks += 1
      surface.setState({ ref })
    })
  }

  const width = Math.max(LIT + 2, Math.floor(props.width))
  // The stretch enters at the left edge, leaves at the right, and enters again.
  const head = (ref.ticks % (width + LIT)) - LIT
  const from = Math.max(0, head)
  const to = Math.min(width, head + LIT)

  return (
    <Text>
      <Text color={props.dim}>{TRACK.repeat(from)}</Text>
      <Text color={props.color}>{'━'.repeat(Math.max(0, to - from))}</Text>
      <Text color={props.dim}>{TRACK.repeat(width - to)}</Text>
    </Text>
  )
}

export default Bar
