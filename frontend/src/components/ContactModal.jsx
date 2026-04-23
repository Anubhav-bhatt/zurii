import { useState, useEffect, useRef } from "react";

const ContactModal = ({ isOpen, onClose, source = "Website Modal" }) => {
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    message: "",
  });

  const [errors, setErrors] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const overlayRef = useRef(null);

  // Lock scroll
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
      setForm({ name: "", email: "", phone: "", message: "" });
      setErrors({});
      setSubmitted(false);
    }
    return () => (document.body.style.overflow = "");
  }, [isOpen]);

  // ESC close
  useEffect(() => {
    const handler = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  // Validation
  const validate = () => {
    const e = {};
    if (!form.name.trim()) e.name = "Full name is required";
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
      const response = await fetch('http://localhost:5001/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, interest: `Source: ${source}` }),
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

  if (!isOpen) return null;

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-6"
      onClick={(e) => {
        if (e.target === overlayRef.current) onClose();
      }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-md transition-opacity duration-300" />

      {/* Modal */}
      <div className="relative bg-white rounded-[24px] w-full max-w-lg shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Top Decorative Header */}
        <div className="h-24 bg-gradient-to-br from-violet-600 to-indigo-700 relative overflow-hidden flex items-center px-8">
          {/* subtle pattern */}
          <div className="absolute inset-0 opacity-20 pointer-events-none">
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-full">
              <path fill="white" d="M0 100 Q 25 50 50 100 T 100 100 V 100 H 0 Z" />
            </svg>
          </div>
          <button
            onClick={onClose}
            className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-black/10 hover:bg-black/20 text-white transition-colors"
          >
            ✕
          </button>
          
          <div className="relative z-10 flex items-center gap-3 text-white">
            <div className="w-12 h-12 bg-white/20 backdrop-blur-sm rounded-2xl flex items-center justify-center text-2xl">
              ✈️
            </div>
            <div>
              <h2 className="text-xl font-black">Plan Your Trip</h2>
              <p className="text-violet-200 text-xs font-semibold uppercase tracking-widest mt-0.5">We're here to help</p>
            </div>
          </div>
        </div>

        <div className="p-8">
          {submitted ? (
            /* ✅ SUCCESS */
            <div className="text-center py-8">
              <div className="w-20 h-20 bg-green-100 text-green-500 rounded-full flex items-center justify-center text-4xl mx-auto mb-5 shadow-inner">
                🎉
              </div>
              <h2 className="text-2xl font-black text-gray-800 mb-2">Request Submitted!</h2>
              <p className="text-gray-500 text-sm mb-8 px-4 leading-relaxed">
                Thank you for reaching out! Our travel experts will get back to you shortly to craft your perfect journey.
              </p>
              <button
                onClick={onClose}
                className="w-full py-3.5 bg-gray-900 text-white font-bold text-sm rounded-xl hover:bg-gray-800 transition-colors shadow-lg"
              >
                Close Window
              </button>
            </div>
          ) : (
            /* 📝 FORM */
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-4">
                {/* Name */}
                <div>
                  <label className="block text-xs font-bold text-gray-600 uppercase tracking-widest mb-1.5 ml-1">Full Name</label>
                  <input
                    name="name"
                    value={form.name}
                    onChange={handleChange}
                    placeholder="E.g., Yash Jain"
                    className="w-full bg-gray-50 border border-gray-200/80 rounded-xl px-4 py-3 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:bg-white focus:border-violet-400 focus:ring-4 focus:ring-violet-50 transition-all font-medium"
                  />
                  {errors.name && <p className="text-red-500 text-xs mt-1.5 ml-1 font-medium">{errors.name}</p>}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {/* Email */}
                  <div>
                    <label className="block text-xs font-bold text-gray-600 uppercase tracking-widest mb-1.5 ml-1">Email Address</label>
                    <input
                      name="email"
                      value={form.email}
                      onChange={handleChange}
                      placeholder="hello@example.com"
                      className="w-full bg-gray-50 border border-gray-200/80 rounded-xl px-4 py-3 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:bg-white focus:border-violet-400 focus:ring-4 focus:ring-violet-50 transition-all font-medium"
                    />
                    {errors.email && <p className="text-red-500 text-xs mt-1.5 ml-1 font-medium">{errors.email}</p>}
                  </div>

                  {/* Phone */}
                  <div>
                    <label className="block text-xs font-bold text-gray-600 uppercase tracking-widest mb-1.5 ml-1">Phone Number</label>
                    <input
                      name="phone"
                      value={form.phone}
                      onChange={handleChange}
                      placeholder="+91 99068 92984"
                      required
                      className="w-full bg-gray-50 border border-gray-200/80 rounded-xl px-4 py-3 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:bg-white focus:border-violet-400 focus:ring-4 focus:ring-violet-50 transition-all font-medium"
                    />
                    {errors.phone && <p className="text-red-500 text-xs mt-1.5 ml-1 font-medium">{errors.phone}</p>}
                  </div>
                </div>

                {/* Message */}
                <div>
                  <label className="block text-xs font-bold text-gray-600 uppercase tracking-widest mb-1.5 ml-1">Brief Details (Optional)</label>
                  <textarea
                    name="message"
                    value={form.message}
                    onChange={handleChange}
                    placeholder="Where do you want to go?"
                    rows="2"
                    className="w-full bg-gray-50 border border-gray-200/80 rounded-xl px-4 py-3 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:bg-white focus:border-violet-400 focus:ring-4 focus:ring-violet-50 transition-all font-medium resize-none"
                  />
                </div>
              </div>

              {/* Submit Button */}
              <div className="pt-3">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full relative flex items-center justify-center gap-2 py-4 bg-gradient-to-r from-violet-600 to-indigo-600 text-white font-black text-[13px] uppercase tracking-widest rounded-xl hover:brightness-110 active:scale-[0.98] transition-all shadow-xl shadow-violet-500/20 disabled:opacity-70 disabled:cursor-not-allowed group overflow-hidden"
                >
                  <div className="absolute inset-0 bg-white/20 -translate-x-full group-hover:translate-x-full transition-transform duration-700 ease-out" />
                  {isSubmitting ? (
                    <span className="flex items-center gap-2">
                       <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                       Submitting...
                    </span>
                  ) : (
                    <span>Submit Details</span>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

export default ContactModal;
