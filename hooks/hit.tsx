// A catcher laid over one of the pane's controls, where a surface draws the
// pane from a tree it was sent: it takes a click anywhere on the control (its
// icon, its chevron, the room around its words) and posts the control's key.
//
// It is here for the clicks a button there loses. Such a surface names a
// button by a handle the engine gives out afresh on every redraw, and the
// click that gives the pane the keyboard redraws it: by the time that click
// is let go, its button's handle is gone, and the press with it. A post names
// the catcher by its key, which a redraw leaves alone.
import type { ClientModule } from 'claude-code'

// `press` is the key of the control under the catcher; `rows` is how many
// rows of it there are at most, past which a click let go is no click.
type Props = { press: string; rows?: number }
type Ref = { isOver: boolean; isDown: boolean }
type State = { ref: Ref }

// A gray that stands on a dark page and on a light one, a sixth as strong
// under the pointer and a quarter under a press.
const OVER = '#8C8C8C2B'
const DOWN = '#8C8C8C40'

const Hit: ClientModule<Props, State> = (props, surface) => {
  const { Box } = surface.elements
  const ref = surface.state?.ref ?? { isOver: false, isDown: false }
  const rows = Math.max(1, Math.floor(props.rows ?? 2))

  // Set on every call, so the listener posts the key the control has now.
  surface.onPointer(event => {
    if (event.type === 'enter' || event.type === 'leave') {
      ref.isOver = event.type === 'enter'
    } else if (event.type === 'down' && event.button === 'left') {
      ref.isDown = true
    } else if (event.type === 'up') {
      // Let go off the control, the click is taken back, as a button's is.
      // Before the region is laid out its width is not known, and not asked.
      const isOn =
        event.y >= 0 &&
        event.y < rows &&
        event.x >= 0 &&
        (surface.columns === 0 || event.x < surface.columns)

      if (ref.isDown && isOn && event.button === 'left') {
        surface.post({ press: props.press })
      }

      ref.isDown = false
    } else {
      return
    }

    surface.setState({ ref })
  })

  // Taller than any control: the room it is given cuts it to the control's own.
  return (
    <Box
      width="100%"
      height={rows + 1}
      {...(ref.isDown
        ? { backgroundColor: DOWN }
        : ref.isOver
          ? { backgroundColor: OVER }
          : {})}
    />
  )
}

export default Hit
