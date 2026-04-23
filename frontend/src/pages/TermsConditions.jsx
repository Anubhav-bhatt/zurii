const sections = [
  {
    icon: "🚫",
    title: "Non-Liability for Harassment and Personal Conduct",
    body: "Desh Videsh is not liable for any instances of verbal or physical harassment within or outside the group. All personal conduct, including intimate behavior, is at the discretion and responsibility of the individuals involved. Any repercussions from such behavior are solely the responsibility of the individual(s) involved.",
  },
  {
    icon: "🏠",
    title: "Property Damage and Maintenance",
    body: "Clients are responsible for maintaining the quality of accommodations provided. Any damage caused to property, including furniture or the surrounding environment, must be avoided. Clients are expected to follow responsible tourism guidelines, including cleanliness in both public and private spaces.",
  },
  {
    icon: "⛰️",
    title: "Safety and Participation in Activities",
    body: "All activities, including adventure sports, are undertaken at the client's own risk. Clients are responsible for taking necessary precautions and complying with safety instructions. Desh Videsh is not liable for any accidents or injuries sustained during these activities.",
  },
  {
    icon: "🏥",
    title: "Travel Insurance and Medical Expenses",
    body: "Desh Videsh will not be responsible for any accidents, mishaps, or medical expenses during the trip. Clients are advised to arrange comprehensive travel insurance covering health, accidents, and other liabilities at their own expense. If a trip is terminated due to the client's own behavior, any additional costs for return or alternative arrangements will be borne solely by the client.",
  },
  {
    icon: "⚠️",
    title: "Termination of Participation Due to Misconduct",
    body: "Desh Videsh maintains a zero-tolerance policy for misconduct or disturbances towards trip captains, fellow travelers, vendors, or local residents. Clients engaging in such behavior may be removed from the trip at their own expense. No refunds will be given, and Desh Videsh will not bear any costs related to the client's removal or further travel arrangements.",
  },
  {
    icon: "🚷",
    title: "Drugs and Narcotics Policy",
    body: "Desh Videsh neither encourages nor provides any illegal drugs or narcotics. Should a client choose to engage in substance abuse, they do so entirely at their own risk. Desh Videsh is not liable for any consequences arising from such behavior, including legal or personal repercussions.",
  },
  {
    icon: "🕐",
    title: "Missed Transfers and Timeliness",
    body: "Desh Videsh is not liable for missed transfers or itinerary elements due to the client's negligence. Clients must adhere to the scheduled timeline. No refunds will be given for missed activities or transfers due to client tardiness.",
  },
  {
    icon: "🌪️",
    title: "Unforeseeable Conditions",
    body: "Desh Videsh is not responsible for any delays, alterations, or cancellations of the trip caused by natural disasters, political instability, war, or other unforeseen circumstances. No compensation will be provided for itinerary changes caused by such events. Clients are responsible for any additional expenses incurred due to disruptions caused by these issues.",
  },
  {
    icon: "🎒",
    title: "Responsibility for Personal Belongings",
    body: "Clients are solely responsible for their personal belongings, including passports, luggage, and valuables. Desh Videsh is not liable for any loss, theft, or damage to personal items during the trip, whether in transit, at accommodations, or during activities.",
  },
  {
    icon: "📸",
    title: "Photos / Videos Content Usage",
    body: "Any photos or videos created during the trip by Desh Videsh content creators or clients are the property of Desh Videsh and may be used solely by Desh Videsh Experiences for advertising across media platforms. Digital content cannot be used by anyone for commercial purposes without prior permission from Desh Videsh.",
  },
];

const bookingPoints = [
  "Full payment of the trip cost must be completed before the trip begins. Pending payments may lead to cancellation of the trip.",
  "All IDs must be verified before boarding. No boarding will be allowed without a valid government ID.",
  "Transfer of bookings is not permitted. Only the names confirmed at the time of booking will be allowed to travel.",
  "Passports for international travel must be valid for at least six (6) months from the intended date of travel.",
  "No refunds will be made for any trip inclusions not availed by the client.",
];

const operationalPoints = [
  "Travelers must report to the pickup point 30 minutes before scheduled departure.",
  "Air Conditioning will be switched off in the hills and at driver's discretion during unsafe routes.",
  "Drinking and smoking are strictly prohibited during the tour.",
  "Desh Videsh is not responsible for money borrowed between clients.",
];

const healthPoints = [
  "Travelers must be in good physical condition for demanding activities.",
  "In case of injury/illness, evacuation costs will be borne by participant.",
  "Itinerary may be altered due to weather, road conditions, or participant ability.",
];

const TermsConditions = () => (
  <section className="py-20 px-6 max-w-4xl mx-auto min-h-screen">
    {/* Header */}
    <div className="mb-12">
      <span className="inline-block text-xs font-semibold uppercase tracking-widest text-violet-500 bg-violet-50 px-3 py-1 rounded-full mb-3">
        Legal
      </span>
      <h1 className="text-4xl font-black text-gray-900 mb-3">Terms &amp; Conditions</h1>
      <p className="text-gray-500 text-lg leading-relaxed">
        Last Updated: <span className="font-semibold text-gray-700">July 2024</span>
      </p>
      <p className="text-gray-500 text-base mt-2">
        Please read our terms and conditions carefully before booking your trip with us.
      </p>
    </div>

    {/* Main Sections */}
    <div className="space-y-5 mb-14">
      {sections.map((s, i) => (
        <div
          key={i}
          className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 flex gap-5"
        >
          <span className="text-3xl shrink-0 mt-0.5">{s.icon}</span>
          <div>
            <h2 className="text-base font-bold text-gray-900 mb-2">{s.title}</h2>
            <p className="text-gray-600 text-sm leading-relaxed">{s.body}</p>
          </div>
        </div>
      ))}
    </div>

    {/* Booking & Payment */}
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden mb-6">
      <div className="bg-gradient-to-r from-violet-600 to-indigo-600 px-6 py-4 flex items-center gap-3">
        <span className="text-xl">💳</span>
        <h2 className="text-white font-bold text-lg">Booking and Payment Policies</h2>
      </div>
      <ul className="divide-y divide-gray-50">
        {bookingPoints.map((p, i) => (
          <li key={i} className="flex items-start gap-3 px-6 py-4">
            <span className="mt-1 w-2 h-2 rounded-full bg-violet-500 shrink-0" />
            <p className="text-gray-600 text-sm leading-relaxed">{p}</p>
          </li>
        ))}
      </ul>
    </div>

    {/* Operational */}
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden mb-6">
      <div className="bg-gradient-to-r from-indigo-600 to-blue-600 px-6 py-4 flex items-center gap-3">
        <span className="text-xl">🚌</span>
        <h2 className="text-white font-bold text-lg">Operational Policies</h2>
      </div>
      <ul className="divide-y divide-gray-50">
        {operationalPoints.map((p, i) => (
          <li key={i} className="flex items-start gap-3 px-6 py-4">
            <span className="mt-1 w-2 h-2 rounded-full bg-indigo-500 shrink-0" />
            <p className="text-gray-600 text-sm leading-relaxed">{p}</p>
          </li>
        ))}
      </ul>
    </div>

    {/* Health & Safety */}
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden mb-6">
      <div className="bg-gradient-to-r from-emerald-500 to-teal-600 px-6 py-4 flex items-center gap-3">
        <span className="text-xl">💊</span>
        <h2 className="text-white font-bold text-lg">Health and Safety</h2>
      </div>
      <ul className="divide-y divide-gray-50">
        {healthPoints.map((p, i) => (
          <li key={i} className="flex items-start gap-3 px-6 py-4">
            <span className="mt-1 w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
            <p className="text-gray-600 text-sm leading-relaxed">{p}</p>
          </li>
        ))}
      </ul>
    </div>

    {/* Dispute Resolution */}
    <div className="bg-amber-50 border border-amber-100 rounded-2xl p-6 mb-12">
      <div className="flex items-center gap-3 mb-3">
        <span className="text-2xl">⚖️</span>
        <h2 className="text-lg font-bold text-gray-900">Dispute Resolution</h2>
      </div>
      <p className="text-gray-600 text-sm leading-relaxed">
        A comprehensive dispute resolution clause will be included in the agreement provided to clients before departure.
      </p>
    </div>

    {/* Contact nudge */}
    <div className="bg-gradient-to-br from-violet-50 to-indigo-50 border border-violet-100 rounded-3xl p-8 text-center">
      <p className="text-gray-700 font-semibold mb-1">Questions about our terms?</p>
      <p className="text-gray-500 text-sm mb-4">Our team is happy to clarify any clause before you book.</p>
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

export default TermsConditions;
