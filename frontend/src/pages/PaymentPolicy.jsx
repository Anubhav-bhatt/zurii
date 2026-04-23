import { useState } from 'react';

const copied = (text, setCopied) => {
  navigator.clipboard.writeText(text).catch(() => {});
  setCopied(text);
  setTimeout(() => setCopied(''), 2000);
};

const CopyButton = ({ text, label = 'Copy' }) => {
  const [copiedText, setCopiedText] = useState('');
  return (
    <button
      onClick={() => copied(text, setCopiedText)}
      className="inline-flex items-center gap-1.5 mt-3 px-4 py-2 rounded-lg text-xs font-bold bg-violet-50 text-violet-600 hover:bg-violet-100 border border-violet-100 transition"
    >
      {copiedText === text ? (
        <><span>✅</span> Copied!</>
      ) : (
        <><span>📋</span> {label}</>
      )}
    </button>
  );
};

const shortHaulRows = [
  { days: 'At Booking', amount: '25% of Full Tour Cost or Cancellation Charges, whichever is higher' },
  { days: '45 Days Prior', amount: '50% or Cancellation Charges, whichever is higher' },
  { days: '30 Days Prior', amount: '75% or Cancellation Charges, whichever is higher' },
  { days: '20 Days Prior', amount: '100% of Full Tour Cost' },
];

const longHaulRows = [
  { days: 'At Booking', amount: 'INR 40,000 per person or Cancellation Charges, whichever is higher' },
  { days: '60 Days Prior', amount: '50% or Cancellation Charges, whichever is higher' },
  { days: '45 Days Prior', amount: '75% or Cancellation Charges, whichever is higher' },
  { days: '30 Days Prior', amount: '100% of Full Tour Cost' },
];

const PaymentPolicy = () => (
  <section className="min-h-screen bg-gray-50 pt-24 pb-20 px-6">
    <div className="max-w-5xl mx-auto space-y-12">

      {/* ── Header ── */}
      <div className="text-center">
        <span className="inline-block text-xs font-semibold uppercase tracking-widest text-violet-500 bg-violet-50 px-3 py-1 rounded-full mb-3">Payments</span>
        <h1 className="text-4xl font-black text-gray-900 mb-3">Payment Details</h1>
        <p className="text-gray-500 text-lg max-w-xl mx-auto leading-relaxed">
          Secure &amp; convenient payment options. Find all the information you need to make payments for your dream vacation with complete security.
        </p>

        {/* Stats */}
        <div className="flex items-center justify-center gap-8 mt-8">
          {[
            { value: '3', label: 'Methods' },
            { value: '24/7', label: 'Support' },
            { value: '100%', label: 'Secure' },
          ].map((s, i) => (
            <div key={i} className="text-center">
              <p className="text-3xl font-black bg-gradient-to-r from-violet-600 to-indigo-600 bg-clip-text text-transparent">{s.value}</p>
              <p className="text-xs text-gray-400 font-semibold uppercase tracking-widest mt-1">{s.label}</p>
            </div>
          ))}
        </div>
      </div>


      {/* Payment methods removed — contact team directly for payment info */}


      {/* ── Payment Schedule ── */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Payment Schedule</h2>
        <p className="text-gray-500 text-sm mb-6">Flexible payment plans for different destinations</p>

        <div className="grid sm:grid-cols-2 gap-6">

          {/* Short Haul */}
          <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="bg-gradient-to-r from-violet-600 to-indigo-600 px-6 py-4">
              <h3 className="text-white font-bold text-lg">✈️ Short Haul Packages</h3>
              <p className="text-violet-200 text-xs mt-1">
                Weekend · Domestic · Bhutan · Nepal · Sri Lanka · Thailand · Singapore · Bali · Kazakhstan · Azerbaijan · Vietnam · Dubai etc.
              </p>
            </div>
            <div className="divide-y divide-gray-50">
              <div className="grid grid-cols-2 px-5 py-2 bg-gray-50">
                <span className="text-[10px] font-black uppercase tracking-wide text-gray-400">Days Before Departure</span>
                <span className="text-[10px] font-black uppercase tracking-wide text-gray-400">Payment Amount</span>
              </div>
              {shortHaulRows.map((row, i) => (
                <div key={i} className="grid grid-cols-2 px-5 py-3.5 items-start gap-4 hover:bg-violet-50/30 transition">
                  <span className="text-xs font-bold text-violet-700">{row.days}</span>
                  <span className="text-xs text-gray-600 leading-snug">{row.amount}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Long Haul */}
          <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="bg-gradient-to-r from-indigo-600 to-blue-600 px-6 py-4">
              <h3 className="text-white font-bold text-lg">🌍 Long Haul Packages</h3>
              <p className="text-indigo-200 text-xs mt-1">
                Europe · UK · USA · Canada · Japan · South Korea · Australia etc.
              </p>
            </div>
            <div className="divide-y divide-gray-50">
              <div className="grid grid-cols-2 px-5 py-2 bg-gray-50">
                <span className="text-[10px] font-black uppercase tracking-wide text-gray-400">Days Before Departure</span>
                <span className="text-[10px] font-black uppercase tracking-wide text-gray-400">Payment Amount</span>
              </div>
              {longHaulRows.map((row, i) => (
                <div key={i} className="grid grid-cols-2 px-5 py-3.5 items-start gap-4 hover:bg-indigo-50/30 transition">
                  <span className="text-xs font-bold text-indigo-700">{row.days}</span>
                  <span className="text-xs text-gray-600 leading-snug">{row.amount}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Security Notice ── */}
      <div className="bg-red-50 border border-red-100 rounded-3xl p-7">
        <div className="flex items-start gap-4">
          <span className="text-3xl shrink-0">🔐</span>
          <div>
            <h2 className="text-lg font-bold text-gray-900 mb-2">Important Security Notice</h2>
            <ul className="space-y-2 text-sm text-gray-700 leading-relaxed">
              <li>• For secure transactions, please make payments <strong>exclusively to the official bank details listed on our website</strong>.</li>
              <li>• Payments made to any other account will not be our responsibility, and we cannot compensate for any losses incurred from such transactions.</li>
              <li>• For any questions or concerns, please contact us at <a href="tel:+919906892984" className="text-violet-600 font-semibold hover:underline">+91 99068 92984</a> or <a href="tel:+919929618966" className="text-violet-600 font-semibold hover:underline">+91 99296 18966</a>.</li>
            </ul>
          </div>
        </div>
      </div>

      {/* ── Payment T&C ── */}
      <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-8">
        <h2 className="text-xl font-bold text-gray-900 mb-5">📄 Payment Terms &amp; Conditions</h2>
        <ul className="space-y-3">
          {[
            'Flight ticket issuance requires full airfare payment.',
            'Non-refundable services must be paid in full during booking.',
            'Payment schedules may vary based on events, peak seasons, etc.',
            'Please contact your assigned Sales Executive for the exact payment schedule.',
          ].map((point, i) => (
            <li key={i} className="flex items-start gap-3 text-sm text-gray-600">
              <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-violet-500 shrink-0" />
              {point}
            </li>
          ))}
          <li className="flex items-start gap-3 text-sm text-gray-600">
            <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-violet-500 shrink-0" />
            Do check our{' '}
            <a href="/cancellation-policy" className="text-violet-600 hover:underline font-semibold mx-0.5">Cancellation Policy</a>,{' '}
            <a href="/privacy-policy" className="text-violet-600 hover:underline font-semibold mx-0.5">Privacy Policy</a> and Disclaimer on our website for related details.
          </li>
        </ul>
      </div>

    </div>
  </section>
);

export default PaymentPolicy;
