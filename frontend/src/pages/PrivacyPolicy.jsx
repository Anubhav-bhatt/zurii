import { META_PIXEL_ID } from '../config/marketing';
import { openConsentPreferences } from '../services/consent';

const sections = [
  {
    icon: "📋",
    title: "Data Collection",
    items: [
      "Personal details (name, email, phone, payment info)",
      "Travel preferences to customize services",
      "Website usage data (IP address, browser type)",
      "Communications with us",
    ],
  },
  {
    icon: "🎯",
    title: "Data Usage",
    items: [
      "To provide and improve our services",
      "For personalized travel experiences",
      "Marketing (with consent)",
      "Legal compliance",
    ],
  },
  {
    icon: "🤝",
    title: "Data Sharing",
    items: [
      "With trusted service providers",
      "When legally required",
      "During business transfers",
    ],
  },
];

const PrivacyPolicy = () => (
  <section className="py-20 px-6 max-w-4xl mx-auto min-h-screen">
    {/* Header */}
    <div className="mb-12">
      <span className="inline-block text-xs font-semibold uppercase tracking-widest text-violet-500 dark:text-violet-400 bg-violet-50 dark:bg-violet-950/30 px-3 py-1 rounded-full mb-3">
        Legal
      </span>
      <h1 className="text-4xl font-black text-gray-900 dark:text-zinc-50 mb-3">Privacy Policy</h1>
      <p className="text-gray-500 dark:text-zinc-400 text-lg">
        Last Updated: <span className="font-semibold text-gray-700 dark:text-zinc-300">July 2024</span>
      </p>
      <p className="text-gray-500 dark:text-zinc-400 text-base mt-2 leading-relaxed">
        We protect your privacy and secure your personal information. This policy explains how we collect, use, and safeguard your data.
      </p>
    </div>

    {/* Data sections */}
    <div className="grid sm:grid-cols-3 gap-5 mb-8">
      {sections.map((s, i) => (
        <div key={i} className="bg-white dark:bg-zinc-900 rounded-2xl border border-gray-100 dark:border-zinc-800 shadow-sm p-6">
          <span className="text-3xl mb-3 block">{s.icon}</span>
          <h2 className="text-base font-bold text-gray-900 dark:text-zinc-50 mb-3">{s.title}</h2>
          <ul className="space-y-2">
            {s.items.map((item, j) => (
              <li key={j} className="flex items-start gap-2 text-sm text-gray-600 dark:text-zinc-300">
                <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-violet-400 shrink-0" />
                {item}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>

    {/* Your Rights */}
    <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-gray-100 dark:border-zinc-800 shadow-sm p-6 mb-5 flex gap-5">
      <span className="text-3xl shrink-0">⚖️</span>
      <div>
        <h2 className="text-base font-bold text-gray-900 dark:text-zinc-50 mb-2">Your Rights</h2>
        <p className="text-sm text-gray-600 dark:text-zinc-300 leading-relaxed">
          You can access, correct, or delete your data at any time. Opt-out of marketing communications anytime by contacting us or using the unsubscribe link in any email.
        </p>
      </div>
    </div>

    {/* Cookies and ads measurement — Phase 3 draft: needs legal review before
        it is deployed. Describes what the code does; promises nothing more. */}
    <section
      id="cookies"
      className="bg-white dark:bg-zinc-900 rounded-2xl border border-gray-100 dark:border-zinc-800 shadow-sm p-6 mb-5 flex gap-5"
    >
      <span className="text-3xl shrink-0">🍪</span>
      <div className="space-y-2 text-sm text-gray-600 dark:text-zinc-300 leading-relaxed">
        <h2 className="text-base font-bold text-gray-900 dark:text-zinc-50">Cookies and ads measurement</h2>
        <p>
          To run the site we keep a few items in your browser: your theme and wishlist, and a random visitor ID and
          session ID that let us see how the site is used — which pages are viewed and which enquiry forms are used.
          These stay with Zurii and are not shared with advertisers.
        </p>
        {/* Phase 6 (ZT-16) — same legal review as this section. */}
        <p>
          When you arrive from an ad, an email or another website, we note where you came from — the campaign tags in
          the link, the referring site&apos;s name and the first page you opened — and attach it to an enquiry if you
          send one, so we can tell which campaigns work. It stays in your browser for that visit; only if you allow
          marketing cookies is it kept for up to 30 days, and withdrawing that permission deletes it. It is not shared
          with advertisers.
        </p>
        <p>
          Only if you allow it, we use the Meta Pixel to measure our Facebook and Instagram ads. Meta then receives the
          pages you visit here, the trips and destinations you view, and the fact that a search, an enquiry or a
          WhatsApp click happened, together with what your browser sends with any web request (such as your IP address
          and browser details) and Meta&apos;s own cookies. We do not send Meta your name, phone number, email address,
          messages or search terms. Meta handles this information under its own policies.
        </p>
        <p>
          Declining changes nothing about browsing, enquiries or WhatsApp, and you can change your choice at any time
          {META_PIXEL_ID ? (
            <>
              {' '}in{' '}
              <button
                type="button"
                onClick={openConsentPreferences}
                className="font-semibold text-violet-700 underline underline-offset-2 dark:text-violet-300"
              >
                Cookie preferences
              </button>
              .
            </>
          ) : (
            '.'
          )}
        </p>
      </div>
    </section>

    {/* Security */}
    <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-gray-100 dark:border-zinc-800 shadow-sm p-6 mb-10 flex gap-5">
      <span className="text-3xl shrink-0">🔒</span>
      <div>
        <h2 className="text-base font-bold text-gray-900 dark:text-zinc-50 mb-2">Security</h2>
        <p className="text-sm text-gray-600 dark:text-zinc-300 leading-relaxed">
          We use industry-standard security measures — including encrypted data transmission and secure storage — to protect your personal information from unauthorized access, disclosure, or misuse.
        </p>
      </div>
    </div>

    {/* Contact */}
    <div className="bg-gradient-to-br from-violet-50 to-indigo-50 dark:from-violet-950/30 dark:to-indigo-950/30 border border-violet-100 dark:border-violet-900/50 rounded-3xl p-8">
      <div className="flex items-center gap-3 mb-4">
        <span className="text-2xl">✉️</span>
        <h2 className="text-lg font-bold text-gray-900 dark:text-zinc-50">Contact Us</h2>
      </div>
      <p className="text-gray-600 dark:text-zinc-300 text-sm mb-5 leading-relaxed">
        Questions about this Privacy Policy? Reach out to our team:
      </p>
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 flex-wrap">
        <a
          href="mailto:zuriitravels@gmail.com"
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-violet-600 text-white text-sm font-semibold rounded-xl hover:bg-violet-700 transition"
        >
          📧 zuriitravels@gmail.com
        </a>
        <a
          href="mailto:info@zuriitravels.com"
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-white dark:bg-zinc-900 text-violet-700 dark:text-violet-400 border border-violet-200 dark:border-violet-900/50 text-sm font-semibold rounded-xl hover:bg-violet-50 dark:hover:bg-violet-950/30 transition"
        >
          📧 info@zuriitravels.com
        </a>
        <a
          href="tel:+919906892984"
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-white dark:bg-zinc-900 text-violet-700 dark:text-violet-400 border border-violet-200 dark:border-violet-900/50 text-sm font-semibold rounded-xl hover:bg-violet-50 dark:hover:bg-violet-950/30 transition"
        >
          📞 +91 99068 92984
        </a>
      </div>
    </div>
  </section>
);

export default PrivacyPolicy;
