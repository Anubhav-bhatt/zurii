import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import { AdminApiError } from '../../../services/adminApi';
import { CHANNEL_LABELS, FORM_LABELS } from '../campaignLabels';
import { addLeadNote, getLead, updateLeadStatus } from '../../../services/leadsApi';
import {
  KIND_LABELS,
  LEAD_STATUSES,
  STATUS_LABELS,
  STATUS_STYLES,
  cleanInterest,
  describeActivity,
  formatDate,
  formatDateTime,
  leadSubject,
  mailtoHref,
  whatsappHref,
} from './leadFormat';

const SECTION = 'text-[10px] font-bold uppercase text-zinc-400 block mb-1.5';
const BOX = 'bg-zinc-50 border border-zinc-200/50 rounded-xl p-4';
const NOTE_MAX = 2000;

function CopyRow({ label, value, copied, onCopy }) {
  return (
    <div>
      <span className={SECTION}>{label}</span>
      <div className={`${BOX} flex items-center justify-between gap-3`}>
        <span className="font-semibold text-zinc-800 text-sm truncate">{value || '—'}</span>
        {value && (
          <button
            type="button"
            onClick={onCopy}
            className={`px-3 py-1.5 rounded-lg text-[10px] font-bold border transition-all ${
              copied ? 'bg-green-50 border-green-200 text-green-700' : 'bg-white border-zinc-200 hover:bg-zinc-100 text-zinc-600'
            }`}
          >
            {copied ? 'Copied ✓' : 'Copy'}
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * The full enquiry: details, status, internal notes and its history. Loads
 * from GET /api/admin/leads/:leadId each time it opens, so what it shows —
 * notes included — is always what PostgreSQL holds, whatever page the list is on.
 */
export default function LeadDrawer({ leadId, onClose, onChanged, onRequestDelete, onRequestRestore, onError }) {
  const [state, setState] = useState({ loading: true, error: '', data: null });
  const [saving, setSaving] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [note, setNote] = useState('');
  const [copied, setCopied] = useState('');
  const closeRef = useRef(null);

  const load = useCallback(
    async (signal) => {
      setState((s) => ({ ...s, loading: true, error: '' }));
      try {
        const data = await getLead(leadId, { signal });
        setState({ loading: false, error: '', data });
      } catch (err) {
        if (err.name === 'AbortError') return;
        if (onError(err)) return;
        setState({ loading: false, error: err.message || 'Could not load this lead.', data: null });
      }
    },
    [leadId, onError]
  );

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const lead = state.data?.lead;

  const copy = (text, key) => {
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(''), 1500);
    });
  };

  const changeStatus = async (status) => {
    if (!lead || status === lead.status) return;
    setSaving('status');
    setStatusMessage('');
    try {
      await updateLeadStatus(lead.leadId, status, lead.status);
      await load();
      onChanged();
    } catch (err) {
      if (onError(err)) return;
      if (err instanceof AdminApiError && err.code === 'STATUS_CONFLICT') {
        setStatusMessage('Someone else changed this lead meanwhile — its current status is shown.');
        await load();
        onChanged();
      } else {
        setStatusMessage(err.message || 'Could not change the status.');
      }
    } finally {
      setSaving('');
    }
  };

  const saveNote = async (e) => {
    e.preventDefault();
    const body = note.trim();
    if (!body || !lead) return;
    setSaving('note');
    try {
      await addLeadNote(lead.leadId, body);
      setNote('');
      await load();
    } catch (err) {
      if (!onError(err)) setStatusMessage(err.message || 'Could not save the note.');
    } finally {
      setSaving('');
    }
  };

  return (
    <>
      <div onClick={onClose} className="fixed inset-0 bg-black/35 backdrop-blur-xs z-[190]" aria-hidden="true" />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={lead ? `Lead: ${lead.name}` : 'Lead detail'}
        className="fixed right-0 bottom-0 md:top-0 h-[85vh] md:h-screen w-full md:max-w-md bg-white border-t md:border-t-0 md:border-l border-zinc-200/50 shadow-2xl z-[200] flex flex-col rounded-t-[28px] md:rounded-t-none pb-safe"
      >
        <div className="p-6 border-b border-zinc-100 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <span className="text-[9px] font-black tracking-wider uppercase text-zinc-400">
              Lead Detail {lead ? `· ${KIND_LABELS[lead.kind]}` : ''}
            </span>
            <h2 className="text-xl font-bold text-zinc-950 mt-0.5 tracking-tight leading-snug truncate">{lead?.name ?? '…'}</h2>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close lead detail"
            className="w-8 h-8 shrink-0 rounded-full bg-zinc-50 border border-zinc-200 hover:bg-zinc-100 flex items-center justify-center text-zinc-500"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {state.loading && !lead && <p className="text-xs text-zinc-400" role="status">Loading lead…</p>}
          {state.error && (
            <div role="alert" className="bg-red-50 border border-red-200 rounded-xl p-4 text-xs text-red-700">
              {state.error}{' '}
              <button type="button" onClick={() => load()} className="font-bold underline">Try again</button>
            </div>
          )}

          {lead && (
            <>
              {lead.deletedAt && (
                <div role="status" className="bg-red-50 border border-red-200 rounded-xl p-4 text-xs text-red-800">
                  <p className="font-bold">Deleted {formatDateTime(lead.deletedAt)}{lead.deletedBy ? ` by ${lead.deletedBy}` : ''}</p>
                  {lead.deleteReason && <p className="mt-1">Reason: {lead.deleteReason}</p>}
                  <p className="mt-1">It is hidden from the normal lists until restored.</p>
                </div>
              )}

              <div className="flex items-start justify-between gap-3">
                <div>
                  <label htmlFor="lead-detail-status" className={SECTION}>Status</label>
                  <div className="flex items-center gap-2">
                    <select
                      id="lead-detail-status"
                      value={lead.status}
                      disabled={Boolean(lead.deletedAt) || saving === 'status'}
                      onChange={(e) => changeStatus(e.target.value)}
                      className={`rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-wider ${STATUS_STYLES[lead.status] ?? ''}`}
                    >
                      {LEAD_STATUSES.map((s) => (
                        <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                      ))}
                    </select>
                    {lead.priority === 'high' && (
                      <span className="inline-block px-2.5 py-1 rounded-full text-[10px] font-bold uppercase bg-amber-50 text-amber-700 border border-amber-200">🔥 High</span>
                    )}
                  </div>
                  {statusMessage && <p className="mt-2 text-[11px] text-amber-700" role="alert">{statusMessage}</p>}
                </div>
                <div className="text-right">
                  <span className={SECTION}>Inquiry Date</span>
                  <span className="text-xs font-semibold text-zinc-800">{formatDate(lead.createdAt)}</span>
                </div>
              </div>

              <div>
                <span className={SECTION}>{lead.kind === 'contact' ? 'Destination Interest' : 'Trip'}</span>
                <div className="bg-violet-50/50 border border-violet-100 p-4 rounded-xl">
                  <p className="font-bold text-violet-900 text-sm">{leadSubject(lead)}</p>
                  {lead.kind === 'contact' && (
                    <p className="text-[10px] text-violet-500 font-semibold uppercase tracking-wider mt-0.5">Original: {lead.interest || 'General'}</p>
                  )}
                  {lead.packageSlug && (
                    <Link to={`/trip/${lead.packageSlug}`} className="text-[11px] font-semibold text-violet-700 underline mt-1 inline-block">
                      View trip page
                    </Link>
                  )}
                </div>
              </div>

              <CopyRow label="Phone Contact" value={lead.phone} copied={copied === 'phone'} onCopy={() => copy(lead.phone, 'phone')} />
              <CopyRow label="Email Address" value={lead.email} copied={copied === 'email'} onCopy={() => copy(lead.email, 'email')} />

              {lead.kind !== 'contact' && (
                <div className="grid grid-cols-3 gap-2">
                  {[
                    ['Travel date', lead.travelDate ? formatDate(lead.travelDate) : '—'],
                    ['Travellers', lead.travellers ?? '—'],
                    ['From', lead.departureCity || '—'],
                  ].map(([label, value]) => (
                    <div key={label} className={`${BOX} !p-3`}>
                      <span className="text-[9px] font-bold uppercase text-zinc-400 block">{label}</span>
                      <span className="text-xs font-semibold text-zinc-800">{value}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Where the lead came from (ZT-16) — captured by the visitor's own
                  browser at submission; absent for leads saved before tracking. */}
              {lead.attribution && (
                <div>
                  <span className={SECTION}>Where this lead came from</span>
                  <div className={`${BOX} grid grid-cols-2 gap-x-3 gap-y-2 text-xs`}>
                    {[
                      ['Channel', CHANNEL_LABELS[lead.attribution.channel] ?? lead.attribution.channel],
                      ['Form', FORM_LABELS[lead.attribution.submissionSource] ?? lead.attribution.submissionSource],
                      ['Source / medium', [lead.attribution.utmSource, lead.attribution.utmMedium].filter(Boolean).join(' / ')],
                      ['Campaign', lead.attribution.utmCampaign],
                      ['Referring site', lead.attribution.referrerHost],
                      ['Landing page', lead.attribution.landingPage],
                      ['Ad click', lead.attribution.clickIdType === 'gclid' ? 'Google Ads' : lead.attribution.clickIdType === 'fbclid' ? 'Facebook / Instagram link' : null],
                      ['Destination chosen', lead.destinationName],
                    ].filter(([, value]) => value).map(([label, value]) => (
                      <div key={label} className="min-w-0">
                        <span className="text-[9px] font-bold uppercase text-zinc-400 block">{label}</span>
                        <span className="block truncate font-semibold text-zinc-800" title={String(value)}>{value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {lead.kind === 'contact' && lead.callback && (
                <div>
                  <span className={SECTION}>Preferred callback</span>
                  <div className={`${BOX} text-xs font-semibold text-zinc-700`}>{lead.callback}</div>
                </div>
              )}

              <div>
                <span className={SECTION}>Special Notes / Message</span>
                <div className={`${BOX} text-xs font-semibold text-zinc-700 leading-relaxed whitespace-pre-line min-h-[80px]`}>
                  {lead.message || 'No additional traveler specs provided.'}
                </div>
              </div>

              <section aria-labelledby="lead-notes-title">
                <h3 id="lead-notes-title" className={SECTION}>Internal notes</h3>
                {lead.legacyNote && (
                  <div className={`${BOX} mb-2 text-xs text-zinc-700 whitespace-pre-line`}>
                    <span className="block text-[9px] font-bold uppercase text-zinc-400 mb-1">Earlier note</span>
                    {lead.legacyNote}
                  </div>
                )}
                {state.data.notes.length === 0 && !lead.legacyNote && <p className="text-xs text-zinc-400">No notes yet.</p>}
                <ul className="space-y-2">
                  {state.data.notes.map((n) => (
                    <li key={n.id} className={`${BOX} !p-3`}>
                      <p className="text-xs text-zinc-800 whitespace-pre-line">{n.body}</p>
                      <p className="mt-1 text-[10px] text-zinc-400">{n.author} · {formatDateTime(n.createdAt)}</p>
                    </li>
                  ))}
                </ul>
                <form onSubmit={saveNote} className="mt-3">
                  <label htmlFor="lead-note" className="sr-only">Add an internal note</label>
                  <textarea
                    id="lead-note"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    maxLength={NOTE_MAX}
                    rows={3}
                    placeholder="Add an internal note (only admins see it)…"
                    className="w-full border border-zinc-200 rounded-xl p-3 text-xs outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/10"
                  />
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-[10px] text-zinc-400">{note.length}/{NOTE_MAX}</span>
                    <button
                      type="submit"
                      disabled={!note.trim() || saving === 'note'}
                      className="px-4 py-2 bg-zinc-950 hover:bg-zinc-800 disabled:opacity-40 text-white text-xs font-bold rounded-xl"
                    >
                      {saving === 'note' ? 'Saving…' : 'Add note'}
                    </button>
                  </div>
                </form>
              </section>

              <section aria-labelledby="lead-activity-title">
                <h3 id="lead-activity-title" className={SECTION}>Activity</h3>
                <ol className="space-y-2 border-l border-zinc-200 pl-4">
                  <li className="text-xs text-zinc-600">
                    <span className="font-semibold text-zinc-800">Enquiry received</span>
                    <span className="block text-[10px] text-zinc-400">{formatDateTime(lead.createdAt)} · website{lead.kind === 'contact' ? ` · ${cleanInterest(lead.interest)}` : ''}</span>
                  </li>
                  {state.data.activity.map((a) => (
                    <li key={a.id} className="text-xs text-zinc-600">
                      <span className="font-semibold text-zinc-800">{describeActivity(a)}</span>
                      <span className="block text-[10px] text-zinc-400">{formatDateTime(a.createdAt)} · {a.actor}</span>
                    </li>
                  ))}
                </ol>
              </section>
            </>
          )}
        </div>

        {lead && (
          <div className="p-6 border-t border-zinc-100 bg-zinc-50/50 flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-3">
              {whatsappHref(lead) && (
                <a
                  href={whatsappHref(lead, { withGreeting: true })}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs uppercase tracking-wide rounded-xl flex items-center justify-center gap-1.5 text-center"
                >
                  💬 WhatsApp
                </a>
              )}
              {mailtoHref(lead) && (
                <a
                  href={mailtoHref(lead)}
                  className="py-3 bg-zinc-950 hover:bg-zinc-800 text-white font-bold text-xs uppercase tracking-wide rounded-xl flex items-center justify-center gap-1.5 text-center"
                >
                  ✉️ Email Client
                </a>
              )}
            </div>
            {lead.deletedAt ? (
              <button
                type="button"
                onClick={() => onRequestRestore(lead)}
                className="py-3 bg-violet-600 hover:bg-violet-700 text-white font-bold text-xs uppercase tracking-wide rounded-xl"
              >
                ↺ Restore lead
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onRequestDelete(lead)}
                className="py-3 bg-red-600 hover:bg-red-700 text-white font-bold text-xs uppercase tracking-wide rounded-xl"
              >
                🗑️ Delete inquiry
              </button>
            )}
          </div>
        )}
      </aside>
    </>
  );
}
