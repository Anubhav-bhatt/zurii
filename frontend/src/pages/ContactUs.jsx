import { useId, useState } from 'react';

import Container from '../components/ui/Container';
import Breadcrumbs from '../components/ui/Breadcrumbs';
import Button from '../components/ui/Button';
import { API_BASE_URL } from '../config/api';
import { SITE, whatsappLink } from '../config/site';
import { attribution, track } from '../services/analytics';

/**
 * Contact page.
 *
 * The submission path is unchanged — the same `POST /api/contact` payload the
 * previous version sent, including the `callback` preference — so existing lead
 * capture and the admin insights view keep working exactly as before.
 *
 * What changed is the form itself: every field now has a real `<label>` rather
 * than relying on placeholders, errors are reported inline and announced, and
 * the alert() failure path was replaced with an in-page error message.
 */

const FIELD =
  'w-full rounded-xl border bg-white dark:bg-zinc-900 px-3.5 py-3 text-sm text-zinc-900 dark:text-zinc-100 transition-colors duration-200 ' +
  'placeholder:text-zinc-400 dark:placeholder:text-zinc-500 hover:border-zinc-400 dark:hover:border-zinc-600 ' +
  'focus:outline-none focus:ring-2 focus:ring-zinc-900/20 dark:focus:ring-zinc-100/20';
const FIELD_OK = 'border-zinc-300 dark:border-zinc-700 focus:border-zinc-400 dark:focus:border-zinc-500';
const FIELD_ERROR = 'border-rose-400 focus:border-rose-500 focus:ring-rose-500/25';
const LABEL = 'mb-1.5 block text-sm font-semibold text-zinc-800 dark:text-zinc-200';

const CALLBACK_OPTIONS = [
  { value: 'am', label: 'Morning (9am – 12pm)' },
  { value: 'pm', label: 'Afternoon (12pm – 5pm)' },
  { value: 'eve', label: 'Evening (5pm – 7pm)' },
];

const EMPTY = { name: '', email: '', phone: '', interest: '', message: '' };

function validate(form) {
  const errors = {};
  if (!form.name.trim()) errors.name = 'Please tell us your name.';
  else if (form.name.trim().length < 2) errors.name = 'That name looks too short.';

  // Deliberately permissive: something@something.something.
  if (!form.email.trim()) errors.email = 'We need an email to reply to.';
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(form.email.trim())) errors.email = 'That email does not look right.';

  const digits = form.phone.replace(/\D/g, '');
  if (!form.phone.trim()) errors.phone = 'A phone number helps us reach you faster.';
  else if (digits.length < 7 || digits.length > 15) errors.phone = 'Please enter a valid phone number.';

  return errors;
}

export default function ContactUs() {
  const uid = useId();
  const [form, setForm] = useState(EMPTY);
  const [callback, setCallback] = useState('');
  const [errors, setErrors] = useState({});
  const [status, setStatus] = useState('idle'); // idle | submitting | success | error

  const update = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: undefined }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    const found = validate(form);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      document.getElementById(`${uid}-${Object.keys(found)[0]}`)?.focus();
      return;
    }

    setStatus('submitting');
    try {
      // The anonymous visitor/session ids ride along on the contact itself so
      // the admin can see the journey behind the lead; the server silently
      // drops a malformed id rather than failing the submission.
      const response = await fetch(`${API_BASE_URL}/api/contact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, callback, ...attribution() }),
      });

      if (!response.ok) throw new Error('Request failed');

      // After the contact resolved, fire-and-forget — no personal data on it.
      track('contact_submitted');

      setStatus('success');
      setForm(EMPTY);
      setCallback('');
    } catch {
      setStatus('error');
    }
  };

  const details = [
    { label: 'Email', value: SITE.email.label, href: SITE.email.href },
    ...SITE.phones.map((phone, i) => ({ label: `Phone ${i + 1}`, value: phone.label, href: phone.href })),
    { label: 'Website', value: SITE.website.label, href: SITE.website.href },
    { label: 'Office', value: SITE.address.join(', '), href: SITE.mapsUrl },
  ];

  return (
    <div className="pt-16 sm:pt-[68px]">
      <Container className="py-10 sm:py-14">
        <Breadcrumbs items={[{ label: 'Home', to: '/' }, { label: 'Contact' }]} />

        <div className="mt-6 max-w-2xl">
          <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.16em] text-violet-700 dark:text-violet-400">Contact</p>
          <h1 className="text-fluid-display font-bold text-zinc-950 dark:text-zinc-50">Let's plan your trip</h1>
          <p className="mt-3 text-fluid-body text-zinc-600 dark:text-zinc-300">
            Tell us roughly where you want to go and we'll come back with an itinerary and a price. No obligation.
          </p>
        </div>

        <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-14">
          {/* Form */}
          <div>
            {status === 'success' ? (
              <div
                className="rounded-2xl border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/60 dark:bg-emerald-950/30 p-8 text-center"
                role="status"
              >
                <p className="text-lg font-bold text-emerald-900 dark:text-emerald-300">Thanks — your enquiry has been sent.</p>
                <p className="mx-auto mt-2 max-w-md text-sm text-emerald-800/80 dark:text-emerald-300/80">
                  Our team will get in touch to talk through the details.
                </p>
                <Button variant="secondary" size="md" className="mt-6" onClick={() => setStatus('idle')}>
                  Send another enquiry
                </Button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} noValidate className="space-y-5">
                <div className="grid gap-5 sm:grid-cols-2">
                  <div>
                    <label className={LABEL} htmlFor={`${uid}-name`}>
                      Your name <span className="text-rose-500">*</span>
                    </label>
                    <input
                      id={`${uid}-name`}
                      name="name"
                      value={form.name}
                      onChange={update}
                      autoComplete="name"
                      aria-invalid={Boolean(errors.name)}
                      aria-describedby={errors.name ? `${uid}-name-error` : undefined}
                      className={`${FIELD} ${errors.name ? FIELD_ERROR : FIELD_OK}`}
                      placeholder="Aisha Khan"
                    />
                    {errors.name && (
                      <p id={`${uid}-name-error`} className="mt-1.5 text-xs font-medium text-rose-600 dark:text-rose-400">
                        {errors.name}
                      </p>
                    )}
                  </div>

                  <div>
                    <label className={LABEL} htmlFor={`${uid}-phone`}>
                      Phone <span className="text-rose-500">*</span>
                    </label>
                    <input
                      id={`${uid}-phone`}
                      name="phone"
                      type="tel"
                      inputMode="tel"
                      value={form.phone}
                      onChange={update}
                      autoComplete="tel"
                      aria-invalid={Boolean(errors.phone)}
                      aria-describedby={errors.phone ? `${uid}-phone-error` : undefined}
                      className={`${FIELD} ${errors.phone ? FIELD_ERROR : FIELD_OK}`}
                      placeholder="+91 90000 00000"
                    />
                    {errors.phone && (
                      <p id={`${uid}-phone-error`} className="mt-1.5 text-xs font-medium text-rose-600 dark:text-rose-400">
                        {errors.phone}
                      </p>
                    )}
                  </div>
                </div>

                <div>
                  <label className={LABEL} htmlFor={`${uid}-email`}>
                    Email <span className="text-rose-500">*</span>
                  </label>
                  <input
                    id={`${uid}-email`}
                    name="email"
                    type="email"
                    value={form.email}
                    onChange={update}
                    autoComplete="email"
                    aria-invalid={Boolean(errors.email)}
                    aria-describedby={errors.email ? `${uid}-email-error` : undefined}
                    className={`${FIELD} ${errors.email ? FIELD_ERROR : FIELD_OK}`}
                    placeholder="you@example.com"
                  />
                  {errors.email && (
                    <p id={`${uid}-email-error`} className="mt-1.5 text-xs font-medium text-rose-600 dark:text-rose-400">
                      {errors.email}
                    </p>
                  )}
                </div>

                <div>
                  <label className={LABEL} htmlFor={`${uid}-interest`}>
                    Where would you like to go?
                  </label>
                  <input
                    id={`${uid}-interest`}
                    name="interest"
                    value={form.interest}
                    onChange={update}
                    className={`${FIELD} ${FIELD_OK}`}
                    placeholder="Bali, Kashmir, somewhere in Europe…"
                  />
                </div>

                <fieldset>
                  <legend className={LABEL}>Best time to call you</legend>
                  <div className="flex flex-wrap gap-2">
                    {/*
                      The selected pill is the one violet tint on this page, so in dark it follows
                      the inclusion-panel pattern rather than staying a light lavender chip.
                    */}
                    {CALLBACK_OPTIONS.map((option) => (
                      <label
                        key={option.value}
                        className={`flex min-h-[44px] cursor-pointer items-center gap-2 rounded-xl border px-3.5 text-sm transition-colors duration-200 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-zinc-900/20 dark:has-[:focus-visible]:ring-zinc-100/20 ${
                          callback === option.value
                            ? 'border-violet-400 dark:border-violet-800 bg-violet-50 dark:bg-violet-950/30 text-violet-900 dark:text-violet-300'
                            : 'border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 hover:border-zinc-400 dark:hover:border-zinc-600'
                        }`}
                      >
                        <input
                          type="radio"
                          name="callback"
                          value={option.value}
                          checked={callback === option.value}
                          onChange={(e) => setCallback(e.target.value)}
                          className="h-4 w-4 accent-violet-600"
                        />
                        {option.label}
                      </label>
                    ))}
                  </div>
                </fieldset>

                <div>
                  <label className={LABEL} htmlFor={`${uid}-message`}>
                    Anything else we should know?
                  </label>
                  <textarea
                    id={`${uid}-message`}
                    name="message"
                    value={form.message}
                    onChange={update}
                    rows={5}
                    className={`${FIELD} ${FIELD_OK} resize-y`}
                    placeholder="Rough dates, how many of you are travelling, the pace you enjoy…"
                  />
                </div>

                {status === 'error' && (
                  <p
                    role="alert"
                    className="rounded-xl border border-rose-200 dark:border-rose-900/50 bg-rose-50 dark:bg-rose-950/30 px-4 py-3 text-sm text-rose-800 dark:text-rose-300"
                  >
                    We couldn't send that just now. Please try again, or reach us on WhatsApp.
                  </p>
                )}

                <div className="flex flex-col gap-3 sm:flex-row">
                  <Button
                    type="submit"
                    variant="accent"
                    size="lg"
                    loading={status === 'submitting'}
                    className="w-full sm:w-auto"
                  >
                    {status === 'submitting' ? 'Sending…' : 'Send Enquiry'}
                  </Button>
                  <Button
                    href={whatsappLink()}
                    target="_blank"
                    rel="noopener noreferrer"
                    variant="whatsapp"
                    size="lg"
                    className="w-full sm:w-auto"
                  >
                    Chat on WhatsApp
                  </Button>
                </div>
              </form>
            )}
          </div>

          {/* Details */}
          <aside className="lg:pt-1">
            <div className="rounded-2xl border border-zinc-200/80 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-900/60 p-6">
              <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Reach us directly</h2>

              <dl className="mt-4 space-y-4">
                {details.map((item) => (
                  <div key={item.label}>
                    <dt className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                      {item.label}
                    </dt>
                    <dd className="mt-0.5 text-sm">
                      <a
                        href={item.href}
                        target={item.href.startsWith('http') ? '_blank' : undefined}
                        rel={item.href.startsWith('http') ? 'noopener noreferrer' : undefined}
                        className="rounded font-medium text-zinc-900 dark:text-zinc-100 transition-colors hover:text-violet-700 dark:hover:text-violet-400"
                      >
                        {item.value}
                      </a>
                    </dd>
                  </div>
                ))}

                <div>
                  <dt className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Hours</dt>
                  <dd className="mt-0.5 text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
                    {SITE.hours.map((line) => (
                      <span key={line} className="block">
                        {line}
                      </span>
                    ))}
                  </dd>
                </div>
              </dl>

              {SITE.socials.length > 0 && (
                <div className="mt-6 border-t border-zinc-200 dark:border-zinc-800 pt-5">
                  {SITE.socials.map((social) => (
                    <a
                      key={social.name}
                      href={social.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded text-sm font-semibold text-violet-700 dark:text-violet-400 transition-colors hover:text-violet-900 dark:hover:text-violet-300"
                    >
                      Message us on {social.name} →
                    </a>
                  ))}
                </div>
              )}
            </div>
          </aside>
        </div>
      </Container>
    </div>
  );
}
