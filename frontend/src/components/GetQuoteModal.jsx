import { useState, useEffect, useRef } from "react";
import { API_BASE_URL } from "../config/api";

const GetQuoteModal = ({ isOpen, onClose, tripName = "" }) => {
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    travelers: "",
    travelDate: "",
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
      setForm({ name: "", email: "", phone: "", travelers: "", travelDate: "", message: "" });
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
    if (!form.email.trim()) e.email = "Email is required";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email))
      e.email = "Invalid email address";
    if (!form.phone.trim()) e.phone = "Phone number is required";
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
      const payload = {
        name: form.name,
        email: form.email,
        phone: form.phone,
        interest: `Quote Request: ${tripName}`,
        message: [
          form.travelers ? `Travelers: ${form.travelers}` : "",
          form.travelDate ? `Preferred Date: ${form.travelDate}` : "",
          form.message || "",
        ].filter(Boolean).join(" | "),
        callback: "requested",
        priority: "high",
      };

      const response = await fetch(`${API_BASE_URL}/api/contact`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (response.ok) {
        setSubmitted(true);
      } else {
        alert("Failed to submit. Please try again.");
      }
    } catch (err) {
      console.error(err);
      alert("Network error. Please try again.");
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
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-md transition-opacity duration-300" />

      {/* Modal */}
      <div className="relative bg-white rounded-[24px] w-full max-w-lg shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">

        {/* Top Header */}
        <div className="h-28 bg-gradient-to-br from-emerald-500 via-teal-500 to-cyan-600 relative overflow-hidden flex items-center px-8">
          {/* Decorative circles */}
          <div className="absolute -top-6 -right-6 w-32 h-32 bg-white/10 rounded-full" />
          <div className="absolute -bottom-8 -left-4 w-24 h-24 bg-white/10 rounded-full" />

          <button
            onClick={onClose}
            className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-black/10 hover:bg-black/20 text-white transition-colors"
          >
            ✕
          </button>

          <div className="relative z-10 flex items-center gap-3 text-white">
            <div className="w-12 h-12 bg-white/20 backdrop-blur-sm rounded-2xl flex items-center justify-center text-2xl">
              💰
            </div>
            <div>
              <h2 className="text-xl font-black">Get a Quote</h2>
              <p className="text-emerald-100 text-xs font-semibold uppercase tracking-widest mt-0.5 line-clamp-1">
                {tripName || "Custom Trip Quote"}
              </p>
            </div>
          </div>
        </div>

        <div className="p-8">
          {submitted ? (
            /* ✅ SUCCESS */
            <div className="text-center py-8">
              <div className="w-20 h-20 bg-emerald-100 text-emerald-500 rounded-full flex items-center justify-center text-4xl mx-auto mb-5 shadow-inner">
                ✅
              </div>
              <h2 className="text-2xl font-black text-gray-800 mb-2">Quote Requested!</h2>
              <p className="text-gray-500 text-sm mb-8 px-4 leading-relaxed">
                We've received your quote request for <strong>{tripName}</strong>. Our travel experts will reach out within 24 hours with the best deal!
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
              {/* Trip name badge */}
              {tripName && (
                <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-2.5">
                  <span className="text-emerald-600 text-sm">📍</span>
                  <span className="text-sm font-bold text-emerald-700 truncate">{tripName}</span>
                </div>
              )}

              <div className="space-y-4">
                {/* Name */}
                <div>
                  <label className="block text-xs font-bold text-gray-600 uppercase tracking-widest mb-1.5 ml-1">Full Name *</label>
                  <input
                    name="name"
                    value={form.name}
                    onChange={handleChange}
                    placeholder="E.g., Anubhav Bhatt"
                    className="w-full bg-gray-50 border border-gray-200/80 rounded-xl px-4 py-3 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:bg-white focus:border-emerald-400 focus:ring-4 focus:ring-emerald-50 transition-all font-medium"
                  />
                  {errors.name && <p className="text-red-500 text-xs mt-1.5 ml-1 font-medium">{errors.name}</p>}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {/* Email */}
                  <div>
                    <label className="block text-xs font-bold text-gray-600 uppercase tracking-widest mb-1.5 ml-1">Email *</label>
                    <input
                      name="email"
                      value={form.email}
                      onChange={handleChange}
                      placeholder="hello@example.com"
                      className="w-full bg-gray-50 border border-gray-200/80 rounded-xl px-4 py-3 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:bg-white focus:border-emerald-400 focus:ring-4 focus:ring-emerald-50 transition-all font-medium"
                    />
                    {errors.email && <p className="text-red-500 text-xs mt-1.5 ml-1 font-medium">{errors.email}</p>}
                  </div>

                  {/* Phone */}
                  <div>
                    <label className="block text-xs font-bold text-gray-600 uppercase tracking-widest mb-1.5 ml-1">Phone *</label>
                    <input
                      name="phone"
                      value={form.phone}
                      onChange={handleChange}
                      placeholder="+91 99068 92984"
                      required
                      className="w-full bg-gray-50 border border-gray-200/80 rounded-xl px-4 py-3 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:bg-white focus:border-emerald-400 focus:ring-4 focus:ring-emerald-50 transition-all font-medium"
                    />
                    {errors.phone && <p className="text-red-500 text-xs mt-1.5 ml-1 font-medium">{errors.phone}</p>}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {/* Travelers */}
                  <div>
                    <label className="block text-xs font-bold text-gray-600 uppercase tracking-widest mb-1.5 ml-1">No. of Travelers</label>
                    <select
                      name="travelers"
                      value={form.travelers}
                      onChange={handleChange}
                      className="w-full bg-gray-50 border border-gray-200/80 rounded-xl px-4 py-3 text-sm text-gray-800 focus:outline-none focus:bg-white focus:border-emerald-400 focus:ring-4 focus:ring-emerald-50 transition-all font-medium"
                    >
                      <option value="">Select</option>
                      <option value="1">1 Person</option>
                      <option value="2">2 People</option>
                      <option value="3-5">3–5 People</option>
                      <option value="6-10">6–10 People</option>
                      <option value="10+">10+ People</option>
                    </select>
                  </div>

                  {/* Travel Date */}
                  <div>
                    <label className="block text-xs font-bold text-gray-600 uppercase tracking-widest mb-1.5 ml-1">Travel Date</label>
                    <input
                      name="travelDate"
                      type="date"
                      value={form.travelDate}
                      onChange={handleChange}
                      className="w-full bg-gray-50 border border-gray-200/80 rounded-xl px-4 py-3 text-sm text-gray-800 focus:outline-none focus:bg-white focus:border-emerald-400 focus:ring-4 focus:ring-emerald-50 transition-all font-medium"
                    />
                  </div>
                </div>

                {/* Message */}
                <div>
                  <label className="block text-xs font-bold text-gray-600 uppercase tracking-widest mb-1.5 ml-1">Any special requests?</label>
                  <textarea
                    name="message"
                    value={form.message}
                    onChange={handleChange}
                    placeholder="E.g., Need airport pickup, vegetarian meals..."
                    rows="2"
                    className="w-full bg-gray-50 border border-gray-200/80 rounded-xl px-4 py-3 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:bg-white focus:border-emerald-400 focus:ring-4 focus:ring-emerald-50 transition-all font-medium resize-none"
                  />
                </div>
              </div>

              {/* Submit Button */}
              <div className="pt-3">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full relative flex items-center justify-center gap-2 py-4 bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-black text-[13px] uppercase tracking-widest rounded-xl hover:brightness-110 active:scale-[0.98] transition-all shadow-xl shadow-emerald-500/20 disabled:opacity-70 disabled:cursor-not-allowed group overflow-hidden"
                >
                  <div className="absolute inset-0 bg-white/20 -translate-x-full group-hover:translate-x-full transition-transform duration-700 ease-out" />
                  {isSubmitting ? (
                    <span className="flex items-center gap-2">
                       <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                       Submitting...
                    </span>
                  ) : (
                    <span>🚀 Get My Quote</span>
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

export default GetQuoteModal;
