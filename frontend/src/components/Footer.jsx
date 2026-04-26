import { useState } from 'react';

const Footer = () => {
  const [hoveredLink, setHoveredLink] = useState(null);

  const exploreLinks = [
    { label: 'Weekend Trips', icon: '🏕️', href: '/weekend-trips' },
    { label: 'Corporate Tours', icon: '🏢', href: '/corporate-tours' },
    { label: 'Blogs', icon: '📝', href: '/blogs' },
  ];

  const supportLinks = [
    { label: 'Contact Us', icon: '📞', href: '/contact-us' },
    { label: 'Payment Policy', icon: '💳', href: '/payment-policy' },
    { label: 'No-Cost EMI', icon: '🏷️', href: '/no-cost-emi' },
  ];

  const legalLinks = [
    { label: 'Terms & Conditions', icon: '📄', href: '/terms-conditions' },
    { label: 'Privacy Policy', icon: '🔒', href: '/privacy-policy' },
    { label: 'Cancellation Policy', icon: '❌', href: '/cancellation-policy' },
  ];

  return (
    <>
      <footer className="relative bg-slate-900">
        {/* Main footer */}
        <div className="pt-14 pb-8">
          {/* Subtle gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-b from-violet-600/5 via-transparent to-indigo-600/5 pointer-events-none" />

          <div className="relative max-w-6xl mx-auto px-6">
            {/* Top Section — 4 columns */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-10 lg:gap-8">

              {/* Column 1: Brand */}
              <div className="lg:col-span-1">
                <div className="flex items-center gap-2.5 mb-5">
                  <img
                    src="/zurii-logo.png"
                    alt="Zurii Travels"
                    className="h-16 w-auto object-contain rounded-lg"
                    style={{ filter: 'drop-shadow(0 0 8px rgba(255,255,255,0.15))' }}
                  />
                </div>
                <p className="text-sm text-gray-400 leading-relaxed mb-6">
                  Your trusted travel partner crafting unforgettable journeys. From weekend getaways to grand international tours — we make every trip extraordinary.
                </p>
                {/* Social Icons */}
                <div className="flex items-center gap-2">
                  {[
                    {
                      name: 'Instagram',
                      href: 'https://www.instagram.com/zurii_travels?igsh=MWs5MzZya242ZTRzdA%3D%3D&utm_source=qr',
                      hoverClass: 'hover:bg-gradient-to-br hover:from-purple-500 hover:via-pink-500 hover:to-orange-400',
                      icon: (
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
                        </svg>
                      ),
                    },
                    {
                      name: 'Facebook',
                      href: '#',
                      hoverClass: 'hover:bg-blue-600',
                      icon: (
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                        </svg>
                      ),
                    },
                    {
                      name: 'Twitter',
                      href: '#',
                      hoverClass: 'hover:bg-sky-500',
                      icon: (
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                        </svg>
                      ),
                    },
                    {
                      name: 'YouTube',
                      href: '#',
                      hoverClass: 'hover:bg-red-600',
                      icon: (
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
                        </svg>
                      ),
                    },
                  ].map((social) => (
                    <a
                      key={social.name}
                      href={social.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`w-9 h-9 rounded-[10px] flex items-center justify-center text-gray-400 ${social.hoverClass} hover:text-white transition-all duration-300 bg-slate-800/60 hover:scale-110`}
                      title={social.name}
                    >
                      {social.icon}
                    </a>
                  ))}
                </div>
              </div>

              {/* Column 2: Explore */}
              <div>
                <h3 className="text-sm font-bold text-white tracking-wider uppercase mb-5 flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-violet-500" />
                  Explore
                </h3>
                <ul className="space-y-3">
                  {exploreLinks.map((link, i) => (
                    <li key={i}>
                      <a
                        href={link.href}
                        className="group flex items-center gap-2.5 text-sm text-gray-400 hover:text-violet-400 transition-all duration-200"
                        onMouseEnter={() => setHoveredLink(`explore-${i}`)}
                        onMouseLeave={() => setHoveredLink(null)}
                      >
                        <span
                          className={`text-base transition-transform duration-200 ${
                            hoveredLink === `explore-${i}` ? 'scale-125' : ''
                          }`}
                        >
                          {link.icon}
                        </span>
                        <span className="relative">
                          {link.label}
                          <span
                            className={`absolute -bottom-0.5 left-0 h-px bg-violet-400 transition-all duration-300 ${
                              hoveredLink === `explore-${i}` ? 'w-full' : 'w-0'
                            }`}
                          />
                        </span>
                      </a>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Column 3: Support */}
              <div>
                <h3 className="text-sm font-bold text-white tracking-wider uppercase mb-5 flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                  Support
                </h3>
                <ul className="space-y-3">
                  {supportLinks.map((link, i) => (
                    <li key={i}>
                      <a
                        href={link.href}
                        className="group flex items-center gap-2.5 text-sm text-gray-400 hover:text-indigo-400 transition-all duration-200"
                        onMouseEnter={() => setHoveredLink(`support-${i}`)}
                        onMouseLeave={() => setHoveredLink(null)}
                      >
                        <span
                          className={`text-base transition-transform duration-200 ${
                            hoveredLink === `support-${i}` ? 'scale-125' : ''
                          }`}
                        >
                          {link.icon}
                        </span>
                        <span className="relative">
                          {link.label}
                          <span
                            className={`absolute -bottom-0.5 left-0 h-px bg-indigo-400 transition-all duration-300 ${
                              hoveredLink === `support-${i}` ? 'w-full' : 'w-0'
                            }`}
                          />
                        </span>
                      </a>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Column 4: Legal */}
              <div>
                <h3 className="text-sm font-bold text-white tracking-wider uppercase mb-5 flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-purple-500" />
                  Legal
                </h3>
                <ul className="space-y-3">
                  {legalLinks.map((link, i) => (
                    <li key={i}>
                      <a
                        href={link.href}
                        className="group flex items-center gap-2.5 text-sm text-gray-400 hover:text-purple-400 transition-all duration-200"
                        onMouseEnter={() => setHoveredLink(`legal-${i}`)}
                        onMouseLeave={() => setHoveredLink(null)}
                      >
                        <span
                          className={`text-base transition-transform duration-200 ${
                            hoveredLink === `legal-${i}` ? 'scale-125' : ''
                          }`}
                        >
                          {link.icon}
                        </span>
                        <span className="relative">
                          {link.label}
                          <span
                            className={`absolute -bottom-0.5 left-0 h-px bg-purple-400 transition-all duration-300 ${
                              hoveredLink === `legal-${i}` ? 'w-full' : 'w-0'
                            }`}
                          />
                        </span>
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Contact Info Bar */}
            <div className="mt-14 pt-8 border-t border-slate-800/80">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Address */}
                <div className="flex items-start gap-3 group">
                  <div className="w-10 h-10 rounded-[12px] bg-slate-800/80 flex items-center justify-center shrink-0 group-hover:bg-violet-500/15 transition-colors duration-300">
                    <svg className="w-4.5 h-4.5 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  </div>
                  <div>
                    <h4 className="text-xs font-semibold text-gray-300 tracking-wide uppercase mb-1">Office Address</h4>
                    <p className="text-sm text-gray-500 leading-relaxed">
                      Office, Bemina, hamdaniya colony,<br />
                      Sector D, 190018
                    </p>
                  </div>
                </div>

                {/* Business Hours */}
                <div className="flex items-start gap-3 group">
                  <div className="w-10 h-10 rounded-[12px] bg-slate-800/80 flex items-center justify-center shrink-0 group-hover:bg-indigo-500/15 transition-colors duration-300">
                    <svg className="w-4.5 h-4.5 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div>
                    <h4 className="text-xs font-semibold text-gray-300 tracking-wide uppercase mb-1">Business Hours</h4>
                    <p className="text-sm text-gray-500 leading-relaxed">
                      Mon – Sat: 9:00 AM – 7:00 PM<br />
                      Sunday: 10:00 AM – 4:00 PM
                    </p>
                  </div>
                </div>

                {/* Phone */}
                <div className="flex items-start gap-3 group">
                  <div className="w-10 h-10 rounded-[12px] bg-slate-800/80 flex items-center justify-center shrink-0 group-hover:bg-purple-500/15 transition-colors duration-300">
                    <svg className="w-4.5 h-4.5 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                    </svg>
                  </div>
                  <div>
                    <h4 className="text-xs font-semibold text-gray-300 tracking-wide uppercase mb-1">Call Us</h4>
                    <p className="text-sm text-gray-500 leading-relaxed">
                      <a href="tel:+919906892984" className="hover:text-violet-400 transition-colors">+91 99068 92984</a><br />
                      <a href="tel:+919929618966" className="hover:text-violet-400 transition-colors">+91 99296 18966</a>
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Bottom Bar */}
            <div className="mt-10 pt-6 border-t border-slate-800/60 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex flex-col sm:flex-row items-center gap-3">
                <p className="text-xs text-gray-500">
                  © {new Date().getFullYear()} Zurii. All rights reserved. Made with 💜 in India.
                </p>
                <a href="/admin/insights" className="text-xs text-gray-600 hover:text-violet-400 font-semibold border-l border-slate-700 pl-3 ml-1 transition-colors">
                  Admin Panel &rarr;
                </a>
              </div>
              <div className="flex items-center gap-4">
                <span className="text-xs text-gray-600">Trusted by 10,000+ travelers</span>
                <div className="flex items-center gap-1">
                  {[...Array(5)].map((_, i) => (
                    <svg key={i} className="w-3.5 h-3.5 text-amber-400" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                  ))}
                  <span className="text-xs text-gray-400 ml-1 font-semibold">4.9</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </footer>

      {/* Floating WhatsApp Button */}
      <a
        href="https://wa.me/919906892984"
        target="_blank"
        rel="noopener noreferrer"
        className="fixed bottom-6 right-6 z-50 group"
        title="Chat on WhatsApp"
        id="whatsapp-widget"
      >
        {/* Pulse ring */}
        <div className="absolute inset-0 rounded-full bg-violet-500 animate-ping opacity-20" />
        {/* Button */}
        <div className="relative w-14 h-14 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg shadow-violet-500/40 group-hover:shadow-xl group-hover:shadow-violet-500/50 group-hover:scale-110 transition-all duration-300">
          <svg className="w-7 h-7 text-white" fill="currentColor" viewBox="0 0 24 24">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
          </svg>
        </div>
        {/* Tooltip */}
        <div className="absolute right-full mr-3 top-1/2 -translate-y-1/2 px-3 py-1.5 bg-slate-800 text-white text-xs font-medium rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-300 whitespace-nowrap pointer-events-none shadow-lg">
          Chat with us!
          <div className="absolute left-full top-1/2 -translate-y-1/2 w-0 h-0 border-t-[5px] border-t-transparent border-b-[5px] border-b-transparent border-l-[5px] border-l-slate-800" />
        </div>
      </a>
    </>
  );
};

export default Footer;
