import { useEffect, useId, useRef, useState } from 'react';

import { changeAdminPassword } from '../../services/adminApi';

/**
 * Replace the signed-in admin's password.
 *
 * One component serves both cases, because the server exposes one endpoint:
 *
 *   - `forced` — the account still holds an operator-issued temporary password.
 *     Every business API returns 403 until this succeeds, so this form is the
 *     entire admin surface until then.
 *   - routine rotation from the dashboard.
 *
 * A successful change revokes every token issued before it — including the one
 * that authorised the request, and the temporary password the operator knows —
 * and the server then issues a fresh session for the same admin. So `onDone`
 * runs with a live, fully privileged session in hand: the forced flow continues
 * into the dashboard, and the routine one returns to it.
 */

/**
 * Mirrors MIN_LENGTH in backend/lib/validateAdminPassword.js. Duplicated rather
 * than fetched because it only decides when to show a message before a round
 * trip — the server re-checks every rule and remains the authority, so the two
 * drifting costs a slightly late error message, never a weak password.
 */
const MIN_LENGTH = 20;

export default function ChangePasswordForm({ forced = false, username, onDone, onCancel }) {
  const uid = useId();
  const [values, setValues] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [reveal, setReveal] = useState(false);
  const [errors, setErrors] = useState({});
  const [status, setStatus] = useState('idle'); // idle | saving | done
  const [message, setMessage] = useState('');

  /**
   * `onDone` hands control back to the page, which unmounts this component. The
   * ref makes that a one-way door: the confirmation panel below can be dismissed
   * either by the timer or by the button, and without this guard a click landing
   * in the same tick as the timeout would fire the transition twice.
   */
  const finished = useRef(false);
  const finish = () => {
    if (finished.current) return;
    finished.current = true;
    onDone?.();
  };

  // Show the confirmation long enough to read, then continue. The session is
  // already live at this point — the server issued a fresh token as part of the
  // change — so there is nothing to wait for but the reader.
  useEffect(() => {
    if (status !== 'done') return undefined;
    const timer = setTimeout(finish, 1200);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const set = (field) => (event) => {
    setValues((prev) => ({ ...prev, [field]: event.target.value }));
    // Clear the field's error as soon as it is edited: a stale message next to a
    // field the admin has already fixed reads as a second failure.
    setErrors((prev) => (prev[field] ? { ...prev, [field]: null } : prev));
  };

  /** Client-side checks mirror the server's, which remains the authority. */
  const validate = () => {
    const found = {};
    if (!values.currentPassword) found.currentPassword = 'Enter your current password.';
    if (!values.newPassword) found.newPassword = 'Choose a new password.';
    else if (values.newPassword.length < MIN_LENGTH) {
      found.newPassword = `Use at least ${MIN_LENGTH} characters.`;
    } else if (values.newPassword === values.currentPassword) {
      found.newPassword = 'Your new password must be different from your current one.';
    }
    if (values.confirmPassword !== values.newPassword) {
      found.confirmPassword = 'The two passwords do not match.';
    }
    return found;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (status === 'saving') return;

    const found = validate();
    setErrors(found);
    if (Object.keys(found).length > 0) {
      document.getElementById(`${uid}-${Object.keys(found)[0]}`)?.focus();
      return;
    }

    setStatus('saving');
    setMessage('');
    try {
      const { message: note } = await changeAdminPassword(values.currentPassword, values.newPassword);
      // Cleared immediately so nothing sits in component state afterwards.
      setValues({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setStatus('done');
      setMessage(note);
    } catch (err) {
      setStatus('idle');
      setErrors(err.fields ?? {});
      setMessage(err.message || 'Could not change the password.');
    }
  };

  const field = (name, label, autoComplete) => (
    <div>
      <label
        htmlFor={`${uid}-${name}`}
        className="block text-[11px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400"
      >
        {label}
      </label>
      <input
        id={`${uid}-${name}`}
        name={name}
        type={reveal ? 'text' : 'password'}
        value={values[name]}
        onChange={set(name)}
        autoComplete={autoComplete}
        required
        aria-invalid={errors[name] ? 'true' : undefined}
        aria-describedby={errors[name] ? `${uid}-${name}-error` : undefined}
        className="mt-1.5 w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3.5 py-2.5 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500"
      />
      {errors[name] && (
        <p id={`${uid}-${name}-error`} className="mt-1.5 text-xs text-rose-600 dark:text-rose-400">
          {errors[name]}
        </p>
      )}
    </div>
  );

  if (status === 'done') {
    return (
      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 text-center">
        <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-50">{message}</h2>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
          Your temporary password no longer works, and every earlier session has been signed out.
        </p>
        <button
          type="button"
          onClick={finish}
          className="mt-5 w-full rounded-xl bg-zinc-900 dark:bg-zinc-100 px-4 py-2.5 text-sm font-bold text-white dark:text-zinc-900"
        >
          Continue to dashboard
        </button>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6"
      noValidate
    >
      <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-50">
        {forced ? 'Create a new password' : 'Change your password'}
      </h2>
      <p className="mt-1.5 text-sm text-zinc-600 dark:text-zinc-300">
        {forced
          ? 'For security, you must replace your temporary password before accessing the admin dashboard. Only you should know your new password.'
          : 'You will be signed out on every other device after changing it.'}
      </p>
      {username && (
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          Signed in as <span className="font-semibold">{username}</span>
        </p>
      )}

      <div className="mt-5 space-y-4">
        {field('currentPassword', forced ? 'Temporary password' : 'Current password', 'current-password')}
        {/* autocomplete="new-password" on both: it stops the browser filling
            these with the password being replaced, and prompts a password
            manager to offer a generated one — which is the outcome we want. */}
        {field('newPassword', 'New password', 'new-password')}
        {field('confirmPassword', 'Confirm new password', 'new-password')}
      </div>

      <label className="mt-3 flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-300">
        <input
          type="checkbox"
          checked={reveal}
          onChange={(event) => setReveal(event.target.checked)}
          className="h-3.5 w-3.5"
        />
        Show passwords
      </label>

      <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
        At least {MIN_LENGTH} characters. A long passphrase from a password manager is ideal — no
        symbol-and-digit gymnastics required.
      </p>

      {message && status === 'idle' && (
        <p role="alert" className="mt-3 text-sm text-rose-600 dark:text-rose-400">
          {message}
        </p>
      )}

      <div className="mt-5 flex gap-3">
        <button
          type="submit"
          disabled={status === 'saving'}
          className="flex-1 rounded-xl bg-zinc-900 dark:bg-zinc-100 px-4 py-2.5 text-sm font-bold text-white dark:text-zinc-900 disabled:opacity-60"
        >
          {status === 'saving' ? 'Updating…' : 'Update password'}
        </button>
        {/* No way out of the forced version: there is nothing else to reach. */}
        {!forced && onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-xl border border-zinc-300 dark:border-zinc-700 px-4 py-2.5 text-sm font-semibold text-zinc-700 dark:text-zinc-200"
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
