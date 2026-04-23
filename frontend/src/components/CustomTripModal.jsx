import { useState } from 'react';
import { API_BASE_URL } from '../config/api';

const occasions = [
  'Honeymoon 💑', 'Anniversary 🥂', 'Birthday 🎂', 'Family Vacation 👨‍👩‍👧‍👦',
  'Friends Trip 🎉', 'Solo Adventure 🧭', 'Corporate Retreat 💼', 'Other'
];

const budgetRanges = [
  'Under ₹25,000', '₹25,000 – ₹50,000', '₹50,000 – ₹1,00,000',
  '₹1,00,000 – ₹2,00,000', '₹2,00,000+', 'Flexible'
];

const CustomTripModal = ({ isOpen, onClose }) => {
  const [step, setStep] = useState(1);
  const [submitted, setSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [form, setForm] = useState({
    destination: '',
    travelDate: '',
    travelers: '2',
    budget: '',
    occasion: '',
    name: '',
    email: '',
    phone: '',
    notes: '',
  });

  const update = (field, value) => setForm({ ...form, [field]: value });

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      const message = [
        `📍 Destination: ${form.destination}`,
        `📅 Date: ${form.travelDate}`,
        `👥 Travelers: ${form.travelers}`,
        `💰 Budget: ${form.budget}`,
        `🎊 Occasion: ${form.occasion}`,
        form.notes ? `📝 Notes: ${form.notes}` : '',
      ].filter(Boolean).join('\n');

      const response = await fetch(`${API_BASE_URL}/api/contact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          email: form.email,
          phone: form.phone,
          interest: 'Custom Trip Request',
          message,
          priority: 'high',
        }),
      });
      if (response.ok) setSubmitted(true);
    } catch (err) {
      console.error('Submit error:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    onClose();
    setTimeout(() => {
      setStep(1);
      setSubmitted(false);
      setForm({ destination: '', travelDate: '', travelers: '2', budget: '', occasion: '', name: '', email: '', phone: '', notes: '' });
    }, 300);
  };

  if (!isOpen) return null;

  const inputClass = "w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-400 outline-none focus:border-violet-400 focus:bg-white/10 transition-all font-medium";

  // ── Success Screen ──
  if (submitted) {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center px-4" onClick={handleClose}>
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
        <div className="relative bg-[#1a1f35]/95 backdrop-blur-xl border border-white/10 rounded-[28px] p-10 max-w-md w-full text-center shadow-2xl" onClick={e => e.stopPropagation()}>
          <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center shadow-lg shadow-emerald-500/30">
            <svg className="w-10 h-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-2xl font-black text-white mb-2">Request Received!</h2>
          <p className="text-gray-400 text-sm leading-relaxed mb-6">
            Our travel experts will craft a personalized itinerary for <span className="text-violet-400 font-bold">{form.destination}</span> and contact you within <span className="text-amber-400 font-bold">24 hours</span>.
          </p>
          <button onClick={handleClose} className="px-8 py-3 bg-gradient-to-r from-violet-600 to-indigo-600 text-white font-bold text-sm rounded-xl hover:brightness-110 transition-all">
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center px-4" onClick={handleClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative bg-[#1a1f35]/95 backdrop-blur-xl border border-white/10 rounded-[28px] max-w-lg w-full shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        
        {/* Decorative */}
        <div className="absolute top-0 right-0 w-[300px] h-[300px] bg-violet-600/15 rounded-full blur-[100px] pointer-events-none" />

        {/* Header */}
        <div className="relative px-8 pt-8 pb-4">
          <button onClick={handleClose} className="absolute top-4 right-4 w-8 h-8 bg-white/5 hover:bg-white/10 rounded-full flex items-center justify-center text-gray-400 hover:text-white transition text-sm">✕</button>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-lg shadow-lg shadow-amber-500/30">✨</div>
            <div>
              <h2 className="text-xl font-black text-white">Custom Trip</h2>
              <p className="text-gray-400 text-xs">Step {step} of 2</p>
            </div>
          </div>
          {/* Progress bar */}
          <div className="mt-4 h-1 bg-white/5 rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-amber-400 to-violet-500 rounded-full transition-all duration-500" style={{ width: step === 1 ? '50%' : '100%' }} />
          </div>
        </div>

        {/* Body */}
        <div className="relative px-8 pb-8 pt-4">
          {step === 1 ? (
            <div className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Where do you want to go? *</label>
                <input type="text" value={form.destination} onChange={e => update('destination', e.target.value)} placeholder="e.g. Bali, Kashmir, Europe..." className={inputClass} autoFocus />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Travel Date *</label>
                  <input type="date" value={form.travelDate} onChange={e => update('travelDate', e.target.value)} min={new Date().toISOString().split('T')[0]} className={inputClass} />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Travelers</label>
                  <input type="number" min="1" max="50" value={form.travelers} onChange={e => update('travelers', e.target.value)} className={inputClass} />
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Budget Range *</label>
                <div className="grid grid-cols-3 gap-2">
                  {budgetRanges.map(b => (
                    <button key={b} onClick={() => update('budget', b)}
                      className={`px-3 py-2 rounded-lg text-[11px] font-bold border transition-all ${form.budget === b ? 'bg-violet-500/20 border-violet-400 text-violet-300' : 'bg-white/5 border-white/10 text-gray-400 hover:border-white/20'}`}
                    >{b}</button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Occasion</label>
                <div className="flex flex-wrap gap-2">
                  {occasions.map(o => (
                    <button key={o} onClick={() => update('occasion', o)}
                      className={`px-3 py-1.5 rounded-full text-[11px] font-bold border transition-all ${form.occasion === o ? 'bg-amber-500/20 border-amber-400 text-amber-300' : 'bg-white/5 border-white/10 text-gray-400 hover:border-white/20'}`}
                    >{o}</button>
                  ))}
                </div>
              </div>
              <button
                onClick={() => { if (form.destination && form.travelDate && form.budget) setStep(2); }}
                disabled={!form.destination || !form.travelDate || !form.budget}
                className="w-full py-3.5 bg-gradient-to-r from-violet-600 to-indigo-600 hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed text-white font-black text-sm uppercase tracking-widest rounded-xl transition-all shadow-lg shadow-violet-500/20 mt-2"
              >
                Next →
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Full Name *</label>
                <input type="text" value={form.name} onChange={e => update('name', e.target.value)} placeholder="Your name" className={inputClass} autoFocus />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Email *</label>
                  <input type="email" value={form.email} onChange={e => update('email', e.target.value)} placeholder="you@email.com" className={inputClass} />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Phone *</label>
                  <input type="tel" value={form.phone} onChange={e => update('phone', e.target.value)} placeholder="+91 98765 43210" className={inputClass} />
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Additional Notes</label>
                <textarea value={form.notes} onChange={e => update('notes', e.target.value)} placeholder="Special requirements, preferences..." rows={3} className={inputClass + " resize-none"} />
              </div>

              {/* Summary */}
              <div className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-1.5">
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Trip Summary</p>
                <p className="text-xs text-gray-300"><span className="text-gray-500">📍</span> {form.destination}</p>
                <p className="text-xs text-gray-300"><span className="text-gray-500">📅</span> {form.travelDate}</p>
                <p className="text-xs text-gray-300"><span className="text-gray-500">💰</span> {form.budget}</p>
                {form.occasion && <p className="text-xs text-gray-300"><span className="text-gray-500">🎊</span> {form.occasion}</p>}
              </div>

              <div className="flex gap-3">
                <button onClick={() => setStep(1)} className="px-5 py-3.5 bg-white/5 border border-white/10 text-gray-400 font-bold text-sm rounded-xl hover:bg-white/10 transition-all">
                  ← Back
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={!form.name || !form.email || !form.phone || isSubmitting}
                  className="flex-1 py-3.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed text-white font-black text-sm uppercase tracking-widest rounded-xl transition-all shadow-lg shadow-amber-500/20"
                >
                  {isSubmitting ? 'Submitting...' : '🚀 Submit Custom Trip'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CustomTripModal;
