/**
 * A stable dispatcher that always forwards to the most recently installed
 * handler.
 *
 * Why this exists
 * ---------------
 * `PredictSocket` is created once per recognition session and stores its
 * prediction callback permanently. If that callback were the `useCallback`
 * returned during the render in which the socket was built, it would keep
 * closing over that render's values — including the output `language`.
 * Changing the language mid-session would then keep producing English.
 *
 * Installing the newest handler into a stable wrapper removes that entire class
 * of stale-closure bug without changing how the socket is created.
 */

export interface LatestHandler<TArgs extends unknown[]> {
  (...args: TArgs): void
  /** Replace the handler that subsequent calls will forward to. */
  set(next: (...args: TArgs) => void): void
}

export function createLatestHandler<TArgs extends unknown[]>(
  handler: (...args: TArgs) => void,
): LatestHandler<TArgs> {
  let current = handler
  const stable = ((...args: TArgs) => {
    current(...args)
  }) as LatestHandler<TArgs>
  stable.set = (next) => {
    current = next
  }
  return stable
}