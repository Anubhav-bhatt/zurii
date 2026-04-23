const CancellationPolicy = () => (
  <section className="py-20 px-6 max-w-4xl mx-auto min-h-screen">
    {/* Header */}
    <div className="mb-10">
      <span className="inline-block text-xs font-semibold uppercase tracking-widest text-violet-500 bg-violet-50 px-3 py-1 rounded-full mb-3">Legal</span>
      <h1 className="text-4xl font-black text-gray-900 mb-3">Cancellation Policy</h1>
      <p className="text-gray-500 text-lg leading-relaxed">
        Understand our cancellation policy, refund process, and important timelines before you book.
      </p>
    </div>

    {/* Policy Summary Table */}
    <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden mb-10">
      <div className="bg-gradient-to-r from-violet-600 to-indigo-600 px-6 py-4">
        <h2 className="text-white font-bold text-lg">Cancellation Charges</h2>
      </div>
      <div className="divide-y divide-gray-100">
        <div className="grid grid-cols-2 px-6 py-4 bg-gray-50">
          <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">Days Before Arrival</span>
          <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">Cancellation Charge</span>
        </div>
        {[
          { period: "More than 30 days", charge: "10% of total package cost" },
          { period: "20 – 30 days", charge: "30% of total package cost" },
          { period: "10 – 19 days", charge: "50% of total package cost" },
          { period: "Within 9 days", charge: "100% — Non-Refundable" },
          { period: "Same day / No show", charge: "100% — Fully Non-Refundable" },
        ].map((row, i) => (
          <div
            key={i}
            className={`grid grid-cols-2 px-6 py-4 items-center ${
              i >= 3 ? "bg-red-50/50" : "hover:bg-violet-50/30"
            } transition-colors`}
          >
            <span className="text-sm font-semibold text-gray-700">{row.period}</span>
            <span
              className={`text-sm font-bold ${
                i >= 3 ? "text-red-600" : "text-gray-800"
              }`}
            >
              {row.charge}
            </span>
          </div>
        ))}
      </div>
    </div>

    {/* Policy Points */}
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-gray-900 mb-2">Important Notes</h2>
      {[
        {
          icon: "📅",
          text: "Cancellation more than 30 days prior to arrival will attract a cancellation charge of 10% of the total package cost.",
        },
        {
          icon: "📋",
          text: "Cancellation between 20 to 30 days prior to arrival will attract a cancellation charge of 30% of the total package cost.",
        },
        {
          icon: "⚠️",
          text: "Cancellation between 10 to 19 days prior to arrival will attract a cancellation charge of 50% of the total package cost.",
        },
        {
          icon: "🚫",
          text: "Cancellation within 9 days prior to arrival will be non-refundable.",
        },
        {
          icon: "❌",
          text: "No-show or same-day cancellation will be treated as fully non-refundable.",
        },
      ].map((item, i) => (
        <div
          key={i}
          className="flex items-start gap-4 bg-white rounded-2xl p-5 border border-gray-100 shadow-sm"
        >
          <span className="text-2xl shrink-0">{item.icon}</span>
          <p className="text-gray-600 leading-relaxed text-sm">{item.text}</p>
        </div>
      ))}
    </div>

    {/* Contact nudge */}
    <div className="mt-12 bg-gradient-to-br from-violet-50 to-indigo-50 border border-violet-100 rounded-3xl p-8 text-center">
      <p className="text-gray-700 font-semibold mb-1">Need help with a cancellation?</p>
      <p className="text-gray-500 text-sm mb-4">Our team is here to assist you.</p>
      <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
        <a
          href="tel:+919906892984"
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-violet-600 text-white text-sm font-semibold rounded-xl hover:bg-violet-700 transition"
        >
          📞 +91 99068 92984
        </a>
        <a
          href="tel:+919929618966"
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-white text-violet-700 border border-violet-200 text-sm font-semibold rounded-xl hover:bg-violet-50 transition"
        >
          📞 +91 99296 18966
        </a>
      </div>
    </div>
  </section>
);

export default CancellationPolicy;
