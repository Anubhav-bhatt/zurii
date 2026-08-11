import { Link } from 'react-router-dom';

import Container from './ui/Container';
import { SITE, whatsappLink } from './../config/site';

/**
 * Site footer.
 *
 * Only real, already-configured business information appears here. The previous
 * footer rendered Facebook, Twitter and YouTube icons that all pointed at `#`;
 * those are gone rather than presented as real profiles. No email address
 * exists anywhere in the project, so none is invented.
 *
 * Legal links point only at pages that exist as routes.
 *
 * The footer slab is zinc-950 in both themes, so its own text and borders need
 * no dark pairings — two judgement calls follow from that:
 *   · the top border steps up to zinc-700 in dark, where the page behind it is
 *     also zinc-950 and the border is the only thing separating the two;
 *   · links carry a light neutral focus ring instead of relying on the global
 *     focus outline, which is zinc-800 in the light theme and would disappear
 *     against this slab.
 */

const COLUMNS = [
  {
    title: 'Explore',
    links: [
      { label: 'All Packages', to: '/packages' },
      { label: 'International', to: '/packages?tag=international' },
      { label: 'India', to: '/packages?tag=domestic' },
      { label: 'Trending Trips', to: '/packages?popular=true' },
    ],
  },
  {
    title: 'Company',
    links: [
      { label: 'About Zurii', to: '/about' },
      { label: 'Contact Us', to: '/contact-us' },
      { label: 'Weekend Trips', to: '/weekend-trips' },
      { label: 'Corporate Tours', to: '/corporate-tours' },
      { label: 'Blogs', to: '/blogs' },
    ],
  },
  {
    title: 'Policies',
    links: [
      { label: 'Payment Policy', to: '/payment-policy' },
      { label: 'No-Cost EMI', to: '/no-cost-emi' },
      { label: 'Cancellation Policy', to: '/cancellation-policy' },
      { label: 'Terms & Conditions', to: '/terms-conditions' },
      { label: 'Privacy Policy', to: '/privacy-policy' },
    ],
  },
];

const InstagramIcon = () => (
  <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
  </svg>
);

export default function Footer() {
  return (
    <footer className="mt-auto border-t border-zinc-800 dark:border-zinc-700 bg-zinc-950 text-zinc-400">
      <Container className="py-12 sm:py-16">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.4fr_repeat(3,1fr)]">
          {/* Brand */}
          <div>
            <Link
              to="/"
              className="inline-block rounded focus-visible:ring-2 focus-visible:ring-zinc-100/20"
            >
              <img src="/zurii-logo.png" alt="Zurii" className="h-9 w-auto rounded-md" />
            </Link>

            <p className="mt-4 max-w-xs text-sm leading-relaxed">
              Curated holidays and travel experiences, planned by hand and priced up front.
            </p>

            {SITE.socials.length > 0 && (
              <ul className="mt-5 flex items-center gap-2">
                {SITE.socials.map((social) => (
                  <li key={social.name}>
                    <a
                      href={social.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`Zurii on ${social.name}`}
                      className="flex h-9 w-9 items-center justify-center rounded-xl bg-zinc-800/80 text-zinc-300 transition-colors duration-200 hover:bg-violet-600 hover:text-white focus-visible:ring-2 focus-visible:ring-zinc-100/20"
                    >
                      <InstagramIcon />
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Link columns */}
          {COLUMNS.map((column) => (
            <nav key={column.title} aria-label={column.title}>
              <h2 className="mb-3.5 text-[11px] font-bold uppercase tracking-[0.14em] text-zinc-200">
                {column.title}
              </h2>
              <ul className="space-y-2">
                {column.links.map((link) => (
                  <li key={link.to}>
                    <Link
                      to={link.to}
                      className="rounded text-sm transition-colors duration-150 hover:text-white focus-visible:ring-2 focus-visible:ring-zinc-100/20"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        {/* Contact strip */}
        <div className="mt-12 grid gap-8 border-t border-zinc-800/80 pt-8 sm:grid-cols-3">
          <div>
            <h2 className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-zinc-200">Get in touch</h2>
            <ul className="space-y-1">
              {SITE.phones.map((phone) => (
                <li key={phone.href}>
                  <a
                    href={phone.href}
                    className="rounded text-sm transition-colors hover:text-white focus-visible:ring-2 focus-visible:ring-zinc-100/20"
                  >
                    {phone.label}
                  </a>
                </li>
              ))}
              <li>
                <a
                  href={SITE.email.href}
                  className="rounded text-sm transition-colors hover:text-white focus-visible:ring-2 focus-visible:ring-zinc-100/20"
                >
                  {SITE.email.label}
                </a>
              </li>
            </ul>
          </div>

          <div>
            <h2 className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-zinc-200">Office</h2>
            <address className="text-sm not-italic leading-relaxed">
              {SITE.address.map((line) => (
                <span key={line} className="block">
                  {line}
                </span>
              ))}
            </address>
          </div>

          <div>
            <h2 className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-zinc-200">Hours</h2>
            <p className="text-sm leading-relaxed">
              {SITE.hours.map((line) => (
                <span key={line} className="block">
                  {line}
                </span>
              ))}
            </p>
          </div>
        </div>

        <div className="mt-10 flex flex-col items-center justify-between gap-3 border-t border-zinc-800/80 pt-6 sm:flex-row">
          <p className="text-xs text-zinc-500">
            © {new Date().getFullYear()} {SITE.legalName}. All rights reserved.
          </p>
          <a
            href={whatsappLink()}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded text-xs font-semibold text-emerald-400 transition-colors hover:text-emerald-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
          >
            Chat with a travel expert on WhatsApp →
          </a>
        </div>
      </Container>
    </footer>
  );
}
