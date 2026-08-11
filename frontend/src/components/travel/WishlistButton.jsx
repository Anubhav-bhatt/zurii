import { useWishlist } from '../../hooks/useWishlist';

/**
 * The save-a-trip control. One implementation, two skins.
 *
 * It is a real `<button>` with `aria-pressed`, not a decorative heart, so the
 * saved/unsaved state is announced rather than only coloured.
 *
 * Cards make their whole surface clickable with a stretched link, and this
 * button sits on top of that overlay — so the click is stopped here to make
 * sure saving never navigates. The stacking context belongs to the card
 * (`z-20` there), which is why no z-index is set here; pass `className` instead.
 */

/**
 * Sized to the 44px the project's own `.touch-target` defines, not to the icon.
 *
 * This was 36px, which matters more here than on an ordinary button: on a card
 * the surrounding surface is the title link's card-wide overlay, so a near-miss
 * did not just do nothing — it navigated to the trip instead of saving it.
 *
 * The hit area is the element itself rather than an `::before` overlay on
 * purpose: growing it with a pseudo-element needs `relative` on the button, and
 * Tailwind emits `relative` after `absolute`, so it would override the
 * `absolute` that PackageCard positions this button with.
 */
const SIZES = {
  sm: 'h-10 w-10',
  md: 'h-11 w-11',
};

const ICON_SIZES = {
  sm: 'h-4 w-4',
  md: 'h-[18px] w-[18px]',
};

const BASE =
  'flex shrink-0 items-center justify-center rounded-full border ' +
  'transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2';

const VARIANTS = {
  // Over a photo: translucent until saved, then a solid pill so it stays legible.
  overlay: {
    on: 'border-rose-200 bg-white text-rose-500 backdrop-blur-md focus-visible:ring-white',
    off: 'border-white/40 bg-black/25 text-white backdrop-blur-md hover:bg-black/40 focus-visible:ring-white',
  },
  // On a card surface: a normal bordered control.
  plain: {
    on:
      'border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100 focus-visible:ring-rose-400 ' +
      'dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-300 dark:hover:bg-rose-950/50',
    off:
      'border-zinc-300 bg-white text-zinc-500 hover:border-zinc-400 hover:text-zinc-700 ' +
      'dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:border-zinc-600 dark:hover:text-zinc-300 ' +
      'focus-visible:ring-zinc-900/20 dark:focus-visible:ring-zinc-100/20',
  },
};

const HeartIcon = ({ filled, className }) => (
  <svg
    viewBox="0 0 24 24"
    aria-hidden="true"
    className={className}
    fill={filled ? 'currentColor' : 'none'}
    stroke="currentColor"
    strokeWidth="2"
  >
    <path
      d="M12 21s-7.5-4.7-9.3-9A5.2 5.2 0 0 1 12 6.2 5.2 5.2 0 0 1 21.3 12c-1.8 4.3-9.3 9-9.3 9z"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export default function WishlistButton({ slug, title = 'this trip', className = '', size = 'md', variant = 'overlay' }) {
  const { has, toggle } = useWishlist();

  if (!slug) return null;

  const saved = has(slug);
  const skin = VARIANTS[variant] ?? VARIANTS.overlay;

  const onClick = (event) => {
    // The card's stretched link covers this button; without both of these a
    // save would also open the trip page.
    event.preventDefault();
    event.stopPropagation();
    toggle(slug);
  };

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={saved}
      aria-label={saved ? `Remove ${title} from wishlist` : `Add ${title} to wishlist`}
      className={`${BASE} ${SIZES[size] ?? SIZES.md} ${saved ? skin.on : skin.off} ${className}`}
    >
      <HeartIcon filled={saved} className={ICON_SIZES[size] ?? ICON_SIZES.md} />
    </button>
  );
}
