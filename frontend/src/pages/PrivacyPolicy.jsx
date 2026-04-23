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
      <span className="inline-block text-xs font-semibold uppercase tracking-widest text-violet-500 bg-violet-50 px-3 py-1 rounded-full mb-3">
        Legal
      </span>
      <h1 className="text-4xl font-black text-gray-900 mb-3">Privacy Policy</h1>
      <p className="text-gray-500 text-lg">
        Last Updated: <span className="font-semibold text-gray-700">July 2024</span>
      </p>
      <p className="text-gray-500 text-base mt-2 leading-relaxed">
        We protect your privacy and secure your personal information. This policy explains how we collect, use, and safeguard your data.
      </p>
    </div>

    {/* Data sections */}
    <div className="grid sm:grid-cols-3 gap-5 mb-8">
      {sections.map((s, i) => (
        <div key={i} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <span className="text-3xl mb-3 block">{s.icon}</span>
          <h2 className="text-base font-bold text-gray-900 mb-3">{s.title}</h2>
          <ul className="space-y-2">
            {s.items.map((item, j) => (
              <li key={j} className="flex items-start gap-2 text-sm text-gray-600">
                <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-violet-400 shrink-0" />
                {item}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>

    {/* Your Rights */}
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-5 flex gap-5">
      <span className="text-3xl shrink-0">⚖️</span>
      <div>
        <h2 className="text-base font-bold text-gray-900 mb-2">Your Rights</h2>
        <p className="text-sm text-gray-600 leading-relaxed">
          You can access, correct, or delete your data at any time. Opt-out of marketing communications anytime by contacting us or using the unsubscribe link in any email.
        </p>
      </div>
    </div>

    {/* Security */}
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-10 flex gap-5">
      <span className="text-3xl shrink-0">🔒</span>
      <div>
        <h2 className="text-base font-bold text-gray-900 mb-2">Security</h2>
        <p className="text-sm text-gray-600 leading-relaxed">
          We use industry-standard security measures — including encrypted data transmission and secure storage — to protect your personal information from unauthorized access, disclosure, or misuse.
        </p>
      </div>
    </div>

    {/* Contact */}
    <div className="bg-gradient-to-br from-violet-50 to-indigo-50 border border-violet-100 rounded-3xl p-8">
      <div className="flex items-center gap-3 mb-4">
        <span className="text-2xl">✉️</span>
        <h2 className="text-lg font-bold text-gray-900">Contact Us</h2>
      </div>
      <p className="text-gray-600 text-sm mb-5 leading-relaxed">
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
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-white text-violet-700 border border-violet-200 text-sm font-semibold rounded-xl hover:bg-violet-50 transition"
        >
          📧 info@zuriitravels.com
        </a>
        <a
          href="tel:+919906892984"
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-white text-violet-700 border border-violet-200 text-sm font-semibold rounded-xl hover:bg-violet-50 transition"
        >
          📞 +91 99068 92984
        </a>
      </div>
    </div>
  </section>
);

export default PrivacyPolicy;
