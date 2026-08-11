import { Children } from 'react';

/**
 * Responsive card collection: a swipeable, edge-bled carousel on phones and a
 * normal grid from `sm` up.
 *
 * Native scrolling only — `overflow-x` plus CSS scroll-snap. No library, no
 * scroll listeners, no cloned slides, no autoplay; the browser owns the touch
 * physics, `prefers-reduced-motion` is honoured automatically, and cards stay
 * in DOM order so keyboard users tab through them exactly as in the grid.
 *
 * The mobile card width intentionally leaves the next card peeking in from the
 * right — that sliver is the "swipe →" affordance, so no arrows and no dot
 * rows. `snap-proximity` (not mandatory) keeps flick-scrolling free instead of
 * trapping every gesture on a card boundary.
 *
 * Children are the CARDS themselves (each already carrying its list key); the
 * rail wraps each in an <li> and, from `sm` up, hands layout back to the grid
 * classes passed in. A child may carry a `railItem` prop with extra li classes
 * (PopularDestinations uses it for its editorial col/row spans).
 *
 * @param grid  grid classes applied from sm upward, e.g. 'sm:grid-cols-2 lg:grid-cols-3 sm:gap-5'
 * @param item  mobile slide width, default ~85% so the next card peeks
 */
export default function CardRail({ grid = '', item = 'w-[85%]', className = '', children, ...rest }) {
  return (
    <ul
      className={`rail-bleed scrollbar-hide flex snap-x snap-proximity gap-4 overflow-x-auto pb-1 sm:grid sm:snap-none sm:overflow-visible sm:pb-0 ${grid} ${className}`}
      {...rest}
    >
      {Children.map(children, (child) =>
        child == null ? null : (
          <li className={`${item} shrink-0 snap-start sm:w-auto sm:min-w-0 sm:shrink ${child.props?.railItem ?? ''}`}>
            {child}
          </li>
        )
      )}
    </ul>
  );
}
