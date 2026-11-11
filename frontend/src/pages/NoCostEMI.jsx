import { Link } from 'react-router-dom';

import { SITE, whatsappLink } from '../config/site';
import { trackWhatsAppClick } from '../services/marketing';

/**
 * ZT-34: this page used to list EMI terms — a ₹10,000 minimum, 3/6/9-month
 * tenures, "select credit cards and banks" — that no one has confirmed, under a
 * leftover "Add EMI details here" note. Until the owner supplies verified terms
 * it says only what is true: the team confirms what is possible for each
 * booking. (Listed for owner approval in the Phase 5 report.)
 */
const NoCostEMI = () => (
  <section className="py-20 px-6 max-w-4xl mx-auto min-h-screen">
    <h1 className="text-3xl font-black mb-4 text-gray-900 dark:text-zinc-50">No-Cost EMI</h1>
    <p className="text-gray-600 dark:text-zinc-300 mb-6 leading-relaxed">
      Want to pay for your trip in instalments? Ask our team before you book. Whether EMI is possible depends on the trip, the
      amount and your card or bank, so we confirm the exact options and any conditions for your booking in writing before you pay.
    </p>
    <div className="flex flex-wrap gap-3">
      <Link
        to="/contact-us"
        className="touch-target inline-flex items-center rounded-xl bg-zinc-900 px-5 text-sm font-semibold text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
      >
        Ask about EMI
      </Link>
      <a
        href={whatsappLink()}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => trackWhatsAppClick('emi_page')}
        className="touch-target inline-flex items-center rounded-xl border border-zinc-300 px-5 text-sm font-semibold text-zinc-900 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-900"
      >
        Chat on WhatsApp
      </a>
      <a href={SITE.phones[0].href} className="touch-target inline-flex items-center px-2 text-sm font-semibold text-zinc-700 underline underline-offset-2 dark:text-zinc-300">
        Call {SITE.phones[0].label}
      </a>
    </div>
  </section>
);

export default NoCostEMI;
