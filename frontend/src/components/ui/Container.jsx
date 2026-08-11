import { createElement } from 'react';

/**
 * The page width contract. Every section uses this instead of repeating
 * `max-w-7xl mx-auto px-6`, so horizontal rhythm is identical site-wide.
 *
 * `as` lets a caller pick the semantic element (`section`, `header`, `footer`).
 * createElement is used rather than a `<Tag>` JSX variable so the dynamic tag
 * stays explicit.
 */
const WIDTHS = {
  default: 'max-w-7xl',
  wide: 'max-w-[90rem]',
  narrow: 'max-w-4xl',
};

export default function Container({ as = 'div', width = 'default', className = '', children, ...rest }) {
  return createElement(
    as,
    { className: `${WIDTHS[width] ?? WIDTHS.default} mx-auto w-full section-padding ${className}`, ...rest },
    children
  );
}
