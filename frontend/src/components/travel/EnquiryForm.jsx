import { useId, useRef, useState } from 'react';

import Button from '../ui/Button';
import { whatsappLink } from '../../config/site';
import { createBooking } from '../../services/bookingsApi';
import { track } from '../../services/analytics';
import { useAsyncData } from '../../hooks/useAsyncData';
import { getDestinationsCached } from '../../services/destinationsApi';

/**
 * The enquiry form, used inline on a trip page and inside `EnquiryModal`.
 *
 * Deliberately the same form as ContactUs.jsx — same field classes, same inline
 * error treatment, same success wording — because a visitor should not feel like
 * they have landed on a different site when they open it from a package.
 *
 * Two rules shape the copy: no response time is promised anywhere (the team
 * cannot honour one), and when the enquiry starts from a package the package is
 * shown as read-only text. Nobody who clicked "Enquire" on a specific trip
 * should have to name that trip again.
 */

// `[color-scheme:dark]` is here for the native controls the same class dresses:
// without it the date picker's icon and the number spinners stay drawn light and
// vanish against the dark field.
const FIELD =
  'w-full rounded-xl border bg-white dark:bg-zinc-900 dark:[color-scheme:dark] px-3.5 py-3 text-sm text-zinc-900 dark:text-zinc-100 transition-colors duration-200 ' +
  'placeholder:text-zinc-400 dark:placeholder:text-zinc-500 hover:border-zinc-400 dark:hover:border-zinc-600 focus:outline-none focus:ring-2 focus:ring-zinc-900/20 dark:focus:ring-zinc-100/20';
const FIELD_OK = 'border-zinc-300 dark:border-zinc-700 focus:border-zinc-400 dark:focus:border-zinc-500';
const FIELD_ERROR = 'border-rose-400 focus:border-rose-500 focus:ring-rose-500/25';
const LABEL = 'mb-1.5 block text-sm font-semibold text-zinc-800 dark:text-zinc-200';

const EMPTY = {
  name: '',
  phone: '',
  email: '',
  travelDate: '',
  travellers: '2',
  departureCity: '',
  message: '',
  // Only collected in `tripContext` mode — see the note on that prop.
  destination: '',
  budget: '',
};

/**
 * Budget bands, worded as the homepage search words them so a visitor who came
 * from there sees the same choices.
 */
const BUDGETS = [
  'Up to ₹25,000',
  '₹25,000 – ₹50,000',
  '₹50,000 – ₹1,00,000',
  '₹1,00,000 – ₹2,00,000',
  'Above ₹2,00,000',
];

// Used to focus the *first* invalid field rather than whichever key the
// validator happened to add first.
const FIELD_ORDER = ['name', 'phone', 'email', 'travelDate', 'travellers', 'departureCity', 'message'];

/**
 * Today in the visitor's own calendar. `toISOString()` alone would be UTC,
 * which reads as yesterday for an Indian visitor enquiring after midnight.
 */
function todayISO() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

/** Mirrors the server rules so the common mistakes never cost a round trip. */
function validate(form, today) {
  const errors = {};

  if (!form.name.trim()) errors.name = 'Please tell us your name.';
  else if (form.name.trim().length < 2) errors.name = 'That name looks too short.';

  const digits = form.phone.replace(/\D/g, '');
  if (!form.phone.trim()) errors.phone = 'A phone number helps us reach you faster.';
  else if (digits.length < 7 || digits.length > 15) errors.phone = 'Please enter a valid phone number.';

  // Deliberately permissive: something@something.something.
  if (!form.email.trim()) errors.email = 'We need an email to reply to.';
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(form.email.trim())) errors.email = 'That email does not look right.';

  // ISO dates compare correctly as strings.
  if (form.travelDate && form.travelDate < today) errors.travelDate = 'Please pick a date from today onwards.';

  const travellers = Number(form.travellers);
  if (!form.travellers.trim()) errors.travellers = 'How many of you are travelling?';
  else if (!Number.isInteger(travellers) || travellers < 1 || travellers > 50) {
    errors.travellers = 'Enter a number between 1 and 50.';
  }

  return errors;
}

/** The server's messages are sentences without a full stop; ours are joined to another. */
const endWithStop = (text) => (/[.!?…]$/.test(text) ? text : `${text}.`);

/**
 * @param packageSlug  attaches the enquiry to a trip; shown read-only
 * @param tripContext  for a package-less "Plan My Trip" enquiry: adds Destination
 *                     and Budget pickers. Neither is a column on `bookings` —
 *                     they are folded into the message as labelled lines, which
 *                     is all a person calling the lead back needs, and avoids a
 *                     schema change for two free-text planning hints.
 */
export default function EnquiryForm({
  packageSlug,
  packageTitle,
  tripContext = false,
  onSuccess,
  className = '',
  compact = false,
}) {
  const uid = useId();
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [status, setStatus] = useState('idle'); // idle | submitting | success | error
  const [submitError, setSubmitError] = useState('');

  const today = todayISO();
  const pair = compact ? 'grid gap-4' : 'grid gap-5 sm:grid-cols-2';

  // A package enquiry already knows its destination, so the pickers are only
  // for the general flow. Memoised loader: normally already resolved.
  const showTripContext = tripContext && !packageSlug;
  const { data: destinations } = useAsyncData(
    () => (showTripContext ? getDestinationsCached() : Promise.resolve([])),
    ['enquiry-destinations', showTripContext]
  );
  const destinationOptions = destinations ?? [];

  // One enquiry_form_started per mount, on the first field change. A ref, not
  // state: nothing re-renders over it, and it is only read inside the handler.
  const startedRef = useRef(false);

  const update = (event) => {
    if (!startedRef.current) {
      startedRef.current = true;
      track('enquiry_form_started', {
        ...(packageSlug ? { entityType: 'package', entitySlug: packageSlug } : {}),
      });
    }
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: undefined }));
  };

  const focusFirstInvalid = (found) => {
    const first = FIELD_ORDER.find((field) => found[field]);
    if (first) document.getElementById(`${uid}-${first}`)?.focus();
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (status === 'submitting') return; // a second click must not create a second enquiry

    const found = validate(form, today);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      focusFirstInvalid(found);
      return;
    }

    setStatus('submitting');
    setSubmitError('');

    // Destination and budget are planning hints rather than columns, so they go
    // into the message as labelled lines above whatever the visitor wrote.
    const contextLines = [];
    if (showTripContext) {
      const chosen = destinationOptions.find((d) => d.slug === form.destination);
      if (chosen) contextLines.push(`Destination: ${chosen.name}`);
      if (form.budget) contextLines.push(`Budget: ${form.budget}`);
    }
    const composedMessage = [contextLines.join(' | '), form.message.trim()]
      .filter(Boolean)
      .join('\n\n');

    try {
      const result = await createBooking({
        ...(packageSlug ? { packageSlug } : {}),
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        travelDate: form.travelDate,
        travellers: Number(form.travellers),
        departureCity: form.departureCity.trim(),
        message: composedMessage,
      });

      // After the enquiry resolved, fire-and-forget: the success panel is
      // never delayed by analytics, and no personal data rides on the event.
      track('enquiry_submitted', {
        ...(packageSlug ? { entityType: 'package', entitySlug: packageSlug } : {}),
      });

      setStatus('success');
      setForm(EMPTY);
      onSuccess?.(result);
    } catch (err) {
      // A 400 comes back with per-field messages: show them where they belong
      // instead of a banner the visitor cannot act on. Only fields this form
      // actually renders count — a message about something the visitor cannot
      // see would otherwise leave the submit looking like it did nothing.
      const fields = err?.fields ?? {};
      if (FIELD_ORDER.some((field) => fields[field])) {
        setErrors((prev) => ({ ...prev, ...fields }));
        setStatus('idle');
        focusFirstInvalid(fields);
        return;
      }

      // A 400 about something this form does not render — in practice
      // `packageSlug`, when the trip was unpublished between page load and
      // submit. "Please check the highlighted fields" with nothing highlighted
      // is a dead end, so show the specific reason and what to do instead.
      if (fields.packageSlug) {
        setSubmitError(`${endWithStop(fields.packageSlug)} Please pick another trip, or send us a general enquiry.`);
        setStatus('error');
        return;
      }

      setSubmitError(err?.message || '');
      setStatus('error');
    }
  };

  if (status === 'success') {
    return (
      <div className={className}>
        <div
          className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-8 text-center dark:border-emerald-900/50 dark:bg-emerald-950/30"
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
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className={`${compact ? 'space-y-4' : 'space-y-5'} ${className}`}>
      {packageSlug && (
        <p className="rounded-xl border border-violet-100 bg-violet-50/70 px-4 py-3 text-sm text-violet-900 dark:border-violet-900/50 dark:bg-violet-950/40 dark:text-violet-300">
          <span className="font-semibold">Enquiry for:</span> {packageTitle || packageSlug}
        </p>
      )}

      {showTripContext && (
        <div className={pair}>
          <div>
            <label className={LABEL} htmlFor={`${uid}-destination`}>
              Where would you like to go?
            </label>
            <select
              id={`${uid}-destination`}
              name="destination"
              value={form.destination}
              onChange={update}
              className={`${FIELD} ${FIELD_OK}`}
            >
              <option value="">Not sure yet</option>
              {destinationOptions.map((destination) => (
                <option key={destination.slug} value={destination.slug}>
                  {destination.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={LABEL} htmlFor={`${uid}-budget`}>
              Budget per person
            </label>
            <select
              id={`${uid}-budget`}
              name="budget"
              value={form.budget}
              onChange={update}
              className={`${FIELD} ${FIELD_OK}`}
            >
              <option value="">Not sure yet</option>
              {BUDGETS.map((band) => (
                <option key={band} value={band}>
                  {band}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      <div className={pair}>
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
            <p id={`${uid}-name-error`} className="mt-1.5 text-xs font-medium text-rose-600 dark:text-rose-300">
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
            <p id={`${uid}-phone-error`} className="mt-1.5 text-xs font-medium text-rose-600 dark:text-rose-300">
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
          <p id={`${uid}-email-error`} className="mt-1.5 text-xs font-medium text-rose-600 dark:text-rose-300">
            {errors.email}
          </p>
        )}
      </div>

      <div className={pair}>
        <div>
          <label className={LABEL} htmlFor={`${uid}-travelDate`}>
            Preferred travel date
          </label>
          <input
            id={`${uid}-travelDate`}
            name="travelDate"
            type="date"
            min={today}
            value={form.travelDate}
            onChange={update}
            aria-invalid={Boolean(errors.travelDate)}
            aria-describedby={errors.travelDate ? `${uid}-travelDate-error` : undefined}
            className={`${FIELD} ${errors.travelDate ? FIELD_ERROR : FIELD_OK}`}
          />
          {errors.travelDate && (
            <p id={`${uid}-travelDate-error`} className="mt-1.5 text-xs font-medium text-rose-600 dark:text-rose-300">
              {errors.travelDate}
            </p>
          )}
        </div>

        <div>
          <label className={LABEL} htmlFor={`${uid}-travellers`}>
            Travellers
          </label>
          <input
            id={`${uid}-travellers`}
            name="travellers"
            type="number"
            inputMode="numeric"
            min={1}
            max={50}
            step={1}
            value={form.travellers}
            onChange={update}
            aria-invalid={Boolean(errors.travellers)}
            aria-describedby={errors.travellers ? `${uid}-travellers-error` : undefined}
            className={`${FIELD} ${errors.travellers ? FIELD_ERROR : FIELD_OK}`}
          />
          {errors.travellers && (
            <p id={`${uid}-travellers-error`} className="mt-1.5 text-xs font-medium text-rose-600 dark:text-rose-300">
              {errors.travellers}
            </p>
          )}
        </div>
      </div>

      <div>
        <label className={LABEL} htmlFor={`${uid}-departureCity`}>
          Departure city
        </label>
        <input
          id={`${uid}-departureCity`}
          name="departureCity"
          value={form.departureCity}
          onChange={update}
          autoComplete="address-level2"
          aria-invalid={Boolean(errors.departureCity)}
          aria-describedby={errors.departureCity ? `${uid}-departureCity-error` : undefined}
          className={`${FIELD} ${errors.departureCity ? FIELD_ERROR : FIELD_OK}`}
          placeholder="Srinagar, Delhi, Mumbai…"
        />
        {errors.departureCity && (
          <p id={`${uid}-departureCity-error`} className="mt-1.5 text-xs font-medium text-rose-600 dark:text-rose-300">
            {errors.departureCity}
          </p>
        )}
      </div>

      <div>
        <label className={LABEL} htmlFor={`${uid}-message`}>
          Anything else we should know?
        </label>
        <textarea
          id={`${uid}-message`}
          name="message"
          value={form.message}
          onChange={update}
          rows={compact ? 3 : 4}
          aria-invalid={Boolean(errors.message)}
          aria-describedby={errors.message ? `${uid}-message-error` : undefined}
          className={`${FIELD} ${errors.message ? FIELD_ERROR : FIELD_OK} resize-y`}
          placeholder="Hotel preference, the pace you enjoy, anyone travelling with kids…"
        />
        {errors.message && (
          <p id={`${uid}-message-error`} className="mt-1.5 text-xs font-medium text-rose-600 dark:text-rose-300">
            {errors.message}
          </p>
        )}
      </div>

      {status === 'error' && (
        <p
          role="alert"
          className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-300"
        >
          {submitError ? endWithStop(submitError) : "We couldn't send that just now."} Please try again, or reach us
          on WhatsApp.
        </p>
      )}

      <div className="flex flex-col gap-3 sm:flex-row">
        <Button
          type="submit"
          variant="accent"
          size="lg"
          loading={status === 'submitting'}
          disabled={status === 'submitting'}
          className="w-full sm:w-auto"
        >
          {status === 'submitting' ? 'Sending…' : 'Send Enquiry'}
        </Button>
        <Button
          href={whatsappLink(packageTitle)}
          target="_blank"
          rel="noopener noreferrer"
          variant="whatsapp"
          size="lg"
          className="w-full"
        >
          Chat on WhatsApp
        </Button>
      </div>
    </form>
  );
}
