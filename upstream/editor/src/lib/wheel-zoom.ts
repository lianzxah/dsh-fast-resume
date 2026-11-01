/** Wheel zoom follows physical direction when the browser exposes a device-inversion flag. */
type WheelInput={deltaY:number;webkitDirectionInvertedFromDevice?:boolean}
/** Normalize wheel zoom; auto keeps unflagged events native, while explicit overrides also affect trackpad-generated wheel events.
 * @param event Wheel delta and optional WebKit device-direction metadata.
 * @param direction Auto normalization or an explicit device-specific override.
 * @returns Negative for enlargement and positive for reduction.
 */
export function physicalWheelDelta(event:WheelInput,direction:'auto'|'standard'|'reversed'):number{
 const inverted=direction==='reversed'||direction==='auto'&&event.webkitDirectionInvertedFromDevice===true
 return inverted?-event.deltaY:event.deltaY
}
