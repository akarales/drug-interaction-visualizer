/**
 * Decorative active-state outline (see `.trace` in index.css): constant
 * speed along the perimeter, exact rounded corners, static under
 * prefers-reduced-motion. The active state itself is announced through
 * `aria-current` on the card, never through this graphic.
 */
export function ActiveTrace() {
  return (
    <svg aria-hidden className="trace">
      <rect className="trace__base" pathLength={100} />
      <rect className="trace__glow" pathLength={100} />
      <rect className="trace__head" pathLength={100} />
    </svg>
  );
}
