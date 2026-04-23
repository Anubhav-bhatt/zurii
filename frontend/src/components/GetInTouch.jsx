import { useState } from "react";
import { API_BASE_URL } from "../config/api";

const GetInTouch = () => {
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    message: ""
  });

  const [errors, setErrors] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Validation
  const validate = () => {
    const e = {};
    if (!form.name.trim()) e.name = "Name required";
    if (!form.email.trim()) e.email = "Email required";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email))
      e.email = "Invalid email";
    if (!form.phone.trim()) e.phone = "Phone required";
    return e;
  };

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
    setErrors({ ...errors, [e.target.name]: "" });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errs = validate();

    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/contact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, interest: 'Plan Your Dream Trip Inline Form' }),
      });
      if (response.ok) {
        setSubmitted(true);
      } else {
        alert('Failed to submit. Please try again.');
      }
    } catch (err) {
      console.error(err);
      alert('Network error. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const inputBase =
    "w-full bg-white/5 border border-white/10 rounded-xl px-5 py-3.5 text-sm text-white placeholder-gray-400 outline-none focus:border-violet-400 focus:bg-white/10 transition-all font-medium backdrop-blur-sm";

  return (
    <section className="pt-24 pb-16 px-6 relative overflow-hidden -mb-px" 
             style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%)' }}>
      
      {/* Decorative blobs */}
      <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-violet-600/20 rounded-full blur-[120px] -translate-y-1/2 translate-x-1/3 pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-indigo-500/20 rounded-full blur-[100px] translate-y-1/3 -translate-x-1/4 pointer-events-none" />

      <div className="max-w-6xl mx-auto grid lg:grid-cols-2 gap-16 items-center relative z-10">

        {/* LEFT COPY */}
        <div className="lg:pr-10">
          <span className="inline-block px-4 py-1.5 rounded-full bg-white/10 text-violet-300 text-xs font-black uppercase tracking-[0.2em] mb-6 backdrop-blur-md border border-white/10">
            Let's Connect
          </span>
          <h2 className="text-4xl md:text-5xl font-black mb-6 text-white leading-tight">
            Plan Your <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-400 to-indigo-300">Dream Trip</span> ✈️
          </h2>

          <p className="text-gray-300 text-lg mb-10 leading-relaxed">
            Share your travel aspirations with us, and our destination experts will craft a personalized itinerary just for you. Your ultimate adventure is one conversation away.
          </p>

          <div className="space-y-6">
            {[
              { icon: '⚡', title: 'Lightning Fast Response', desc: 'Hear back from us within 24 hours.' },
              { icon: '🔒', title: '100% Secure & Private', desc: 'Your data is safe, no spam ever.' },
              { icon: '🧳', title: 'Bespoke Packages', desc: 'Tailored perfectly to your unique budget.' },
            ].map((feature, idx) => (
              <div key={idx} className="flex items-center gap-5 group">
                <div className="w-12 h-12 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-xl shadow-inner group-hover:bg-violet-600/30 transition-colors">
                  {feature.icon}
                </div>
                <div>
                  <h4 className="font-bold text-white tracking-wide">{feature.title}</h4>
                  <p className="text-sm text-gray-400 mt-0.5">{feature.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* RIGHT FORM */}
        <div className="relative">
          <div className="absolute -inset-1 bg-gradient-to-br from-violet-500 to-indigo-600 rounded-[32px] blur opacity-30" />
          <div className="relative bg-[#1e2336]/80 backdrop-blur-xl border border-white/10 p-8 md:p-10 rounded-[32px] shadow-2xl">

            {submitted ? (
              <div className="text-center py-16 animate-in fade-in zoom-in duration-500">
                <div className="w-24 h-24 bg-gradient-to-br from-green-400 to-emerald-600 rounded-full flex items-center justify-center text-4xl mx-auto mb-6 shadow-lg shadow-green-500/30">
                  ✨
                </div>
                <h3 className="text-3xl font-black text-white mb-3 tracking-tight">
                  You're all set!
                </h3>
                <p className="text-gray-400 mb-8 text-lg">
                  Our travel experts are reviewing your details. We'll be in touch shortly to plan your getaway.
                </p>

                <button
                  onClick={() => setSubmitted(false)}
                  className="px-8 py-3.5 bg-white/10 hover:bg-white/20 text-white font-bold rounded-xl transition-colors border border-white/10"
                >
                  Submit Another Request
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="grid md:grid-cols-2 gap-5">
                  {/* Name */}
                  <div>
                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2 ml-1">Full Name</label>
                    <input
                      name="name"
                      value={form.name}
                      onChange={handleChange}
                      placeholder="e.g. Yash Jain"
                      className={inputBase}
                    />
                    {errors.name && <p className="text-red-400 text-xs mt-1.5 ml-1">{errors.name}</p>}
                  </div>

                  {/* Phone */}
                  <div>
                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2 ml-1">Phone Number</label>
                    <input
                      name="phone"
                      value={form.phone}
                      onChange={handleChange}
                      placeholder="+91 99068 92984"
                      required
                      className={inputBase}
                    />
                    {errors.phone && <p className="text-red-400 text-xs mt-1.5 ml-1">{errors.phone}</p>}
                  </div>
                </div>

                {/* Email */}
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2 ml-1">Email Address</label>
                  <input
                    name="email"
                    value={form.email}
                    onChange={handleChange}
                    placeholder="hello@example.com"
                    className={inputBase}
                  />
                  {errors.email && <p className="text-red-400 text-xs mt-1.5 ml-1">{errors.email}</p>}
                </div>

                {/* Message */}
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2 ml-1">Your Trip Details</label>
                  <textarea
                    name="message"
                    value={form.message}
                    onChange={handleChange}
                    placeholder="Where do you want to go? Approximate dates?"
                    rows="3"
                    className={`${inputBase} resize-none`}
                  />
                </div>

                {/* Submit */}
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full relative mt-4 flex items-center justify-center py-4 bg-gradient-to-r from-violet-600 to-indigo-600 hover:brightness-110 text-white font-black uppercase tracking-widest rounded-xl transition-all shadow-xl shadow-violet-500/20 disabled:opacity-70 disabled:cursor-not-allowed group overflow-hidden"
                >
                  <div className="absolute inset-0 bg-white/20 -translate-x-full group-hover:translate-x-full transition-transform duration-700 ease-out" />
                  {isSubmitting ? (
                    <span className="flex items-center gap-2 text-sm">
                      <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                      Submitting...
                    </span>
                  ) : (
                    <span className="text-sm">Start Planning</span>
                  )}
                </button>
              </form>
            )}
          </div>
        </div>

      </div>
    </section>
  );
};

export default GetInTouch;
