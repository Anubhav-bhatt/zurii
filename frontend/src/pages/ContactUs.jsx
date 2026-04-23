import { useState } from 'react';
import { API_BASE_URL } from '../config/api';

const ContactUs = () => {
  const [callback, setCallback] = useState(null);
  const [submitted, setSubmitted] = useState(false);
  const [form, setForm] = useState({
    name: '', email: '', phone: '', interest: '', message: '',
  });

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const response = await fetch(`${API_BASE_URL}/api/contact`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ...form, callback }),
      });
      if (response.ok) {
        setSubmitted(true);
      } else {
        alert('Failed to submit the form. Please try again later.');
      }
    } catch (err) {
      console.error(err);
      alert('An error occurred. Please try again.');
    }
  };

  const contactItems = [
    {
      icon: '📍',
      label: 'Office Address',
      value: 'Bemina, Hamdaniya Colony, Sector D, 190018',
      href: 'https://maps.google.com/?q=Bemina+Hamdaniya+Colony+Sector+D+190018',
    },
    { icon: '✉️', label: 'Email', value: 'zuriitravels@gmail.com', href: 'mailto:zuriitravels@gmail.com' },
    { icon: '🌐', label: 'Website', value: 'sales.zuriitravels.com', href: 'https://sales.zuriitravels.com' },
    { icon: '📞', label: 'Phone 1', value: '+91 99068 92984', href: 'tel:+919906892984' },
    { icon: '📞', label: 'Phone 2', value: '+91 99296 18966', href: 'tel:+919929618966' },
  ];

  const quickLinks = [
    {
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
        </svg>
      ),
      label: 'Message on WhatsApp',
      href: 'https://wa.me/919906892984',
      color: 'bg-green-500 hover:bg-green-600',
    },
    {
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
          <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
        </svg>
      ),
      label: 'Instagram DM',
      href: 'https://www.instagram.com/zurii_travels?igsh=MWs5MzZya242ZTRzdA%3D%3D&utm_source=qr',
      color: 'bg-gradient-to-br from-purple-500 via-pink-500 to-orange-400 hover:brightness-110',
    },
  ];

  return (
    <section className="min-h-screen bg-gray-50 pt-24 pb-20 px-6">
      <div className="max-w-6xl mx-auto">

        {/* Header */}
        <div className="text-center mb-14">
          <span className="inline-block text-xs font-semibold uppercase tracking-widest text-violet-500 bg-violet-50 px-3 py-1 rounded-full mb-3">
            Contact
          </span>
          <h1 className="text-4xl sm:text-5xl font-black text-gray-900 mb-4">Get in Touch with Us</h1>
          <p className="text-gray-500 text-lg max-w-xl mx-auto leading-relaxed">
            Have questions about our trips or planning your next getaway? We're here to help. Reach out for inquiries, assistance, or travel advice.
          </p>
        </div>

        <div className="grid lg:grid-cols-5 gap-8">

          {/* ── Left: Form ── */}
          <div className="lg:col-span-3">
            {submitted ? (
              <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-12 flex flex-col items-center justify-center text-center h-full">
                <span className="text-6xl mb-4">🎉</span>
                <h2 className="text-2xl font-black text-gray-900 mb-2">Request Submitted!</h2>
                <p className="text-gray-500 text-sm leading-relaxed mb-6">
                  Thanks, <strong>{form.name}</strong>! We've received your message and will get back to you shortly.
                </p>
                <button
                  onClick={() => { setSubmitted(false); setForm({ name: '', email: '', phone: '', interest: '', message: '' }); setCallback(null); }}
                  className="px-6 py-2.5 bg-violet-600 text-white text-sm font-semibold rounded-xl hover:bg-violet-700 transition"
                >
                  Send Another Message
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="bg-white rounded-3xl border border-gray-100 shadow-sm p-8 space-y-5">
                {/* Name */}
                <div>
                  <label className="block text-xs font-bold text-gray-600 uppercase tracking-widest mb-2">Full Name</label>
                  <input
                    name="name" value={form.name} onChange={handleChange} required
                    placeholder="Full Name"
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 transition"
                  />
                </div>

                {/* Email + Phone */}
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-600 uppercase tracking-widest mb-2">Email Address</label>
                    <input
                      name="email" type="email" value={form.email} onChange={handleChange} required
                      placeholder="Email Address"
                      className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 transition"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-600 uppercase tracking-widest mb-2">Contact Number</label>
                    <input
                      name="phone" type="tel" value={form.phone} onChange={handleChange} required
                      placeholder="Contact Number"
                      className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 transition"
                    />
                  </div>
                </div>

                {/* Interest */}
                <div>
                  <label className="block text-xs font-bold text-gray-600 uppercase tracking-widest mb-2">What are you interested in?</label>
                  <select
                    name="interest" value={form.interest} onChange={handleChange} required
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm text-gray-800 focus:outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 transition bg-white"
                  >
                    <option value="" disabled>Select an option...</option>
                    <option>Domestic Tour Package</option>
                    <option>International Tour Package</option>
                    <option>Honeymoon Trip</option>
                    <option>Family Vacation</option>
                    <option>Adventure / Trekking</option>
                    <option>Corporate Tour</option>
                    <option>Custom Itinerary</option>
                    <option>Other</option>
                  </select>
                </div>

                {/* Message */}
                <div>
                  <label className="block text-xs font-bold text-gray-600 uppercase tracking-widest mb-2">Share more about what you're interested in</label>
                  <textarea
                    name="message" value={form.message} onChange={handleChange}
                    rows={4} placeholder="Tell us more..."
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 transition resize-none"
                  />
                </div>

                {/* Callback */}
                <div>
                  <label className="block text-xs font-bold text-gray-600 uppercase tracking-widest mb-2">Are you expecting a callback?</label>
                  <div className="flex gap-3">
                    {['Yes, please call me', 'No, email is fine'].map((opt) => (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => setCallback(opt)}
                        className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border transition ${
                          callback === opt
                            ? 'bg-violet-600 text-white border-violet-600'
                            : 'bg-white text-gray-600 border-gray-200 hover:border-violet-300'
                        }`}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Submit */}
                <div className="pt-2">
                  <button
                    type="submit"
                    className="w-full py-3.5 bg-gradient-to-r from-violet-600 to-indigo-600 text-white font-bold text-sm rounded-xl hover:brightness-110 active:scale-[0.98] transition shadow-md shadow-violet-500/25"
                  >
                    Submit Request
                  </button>
                  <p className="text-center text-xs text-gray-400 mt-3">
                    By submitting this form, I confirm that I have read and understood the{' '}
                    <a href="/privacy-policy" className="text-violet-500 hover:underline">Privacy Policy</a>.
                  </p>
                </div>
              </form>
            )}
          </div>

          {/* ── Right: Contact Info ── */}
          <div className="lg:col-span-2 flex flex-col gap-5">

            {/* Contact Details */}
            <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-6 space-y-5">
              <h2 className="text-base font-bold text-gray-900">Contact Information</h2>
              {contactItems.map((item, i) => (
                <a
                  key={i}
                  href={item.href}
                  target={item.href.startsWith('http') ? '_blank' : undefined}
                  rel="noopener noreferrer"
                  className="flex items-start gap-3 group"
                >
                  <span className="text-xl shrink-0 mt-0.5">{item.icon}</span>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-0.5">{item.label}</p>
                    <p className="text-sm font-semibold text-gray-700 group-hover:text-violet-600 transition">{item.value}</p>
                  </div>
                </a>
              ))}
            </div>

            {/* Quick Connect */}
            <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-6 space-y-3">
              <h2 className="text-base font-bold text-gray-900 mb-1">Quick Connect</h2>
              {quickLinks.map((link, i) => (
                <a
                  key={i}
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`flex items-center gap-3 w-full px-4 py-3 rounded-xl text-white text-sm font-semibold ${link.color} transition`}
                >
                  {link.icon}
                  {link.label}
                </a>
              ))}
            </div>

            {/* Business Hours */}
            <div className="bg-gradient-to-br from-violet-50 to-indigo-50 border border-violet-100 rounded-3xl p-6">
              <h2 className="text-base font-bold text-gray-900 mb-4">🕐 Business Hours</h2>
              <div className="space-y-2 text-sm text-gray-600">
                <div className="flex justify-between"><span>Monday – Saturday</span><span className="font-semibold text-gray-800">9:00 AM – 7:00 PM</span></div>
                <div className="flex justify-between"><span>Sunday</span><span className="font-semibold text-gray-800">10:00 AM – 4:00 PM</span></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default ContactUs;
