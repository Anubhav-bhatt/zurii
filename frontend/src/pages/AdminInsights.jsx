import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  adminLogin,
  adminLogout,
  bootstrapSession,
  getAdminSession,
  AdminApiError,
  AdminAuthError,
  AdminUnavailableError,
} from '../services/adminApi';
import ChangePasswordForm from '../components/admin/ChangePasswordForm';
// The CRM itself (Phase 4): server-side lists, statuses, notes and history for
// every enquiry. This page keeps only authentication and the frame around it.
import LeadsWorkspace from '../components/admin/leads/LeadsWorkspace';

const AdminInsights = () => {
  // Authentication & Session
  //
  // ONE state, not three booleans.
  //
  //   'checkingSession'    — the refresh cookie is being exchanged on mount.
  //   'login'              — no session; show the credentials form.
  //   'mustChangePassword' — authenticated, but the account still holds an
  //                          operator-issued temporary password.
  //   'authenticated'      — full access; render the CRM.
  //
  // This used to be `isRestoringSession`, `mustChangePassword` and
  // `isAuthenticated` held separately, which made states representable that the
  // product does not have — every combination of three booleans is eight
  // states, and only four of them mean anything. The render path below happened
  // to check them in an order that hid the rest, so the bug it invited was not a
  // wrong screen but a silent dependency on `if` ordering: moving one block, or
  // adding a fourth screen above it, would have shown the CRM to an account
  // that had not finished authenticating. A single value cannot drift out of
  // step with itself, and the ordering of the returns below stops being
  // load-bearing.
  //
  // Login failures are NOT a state here. They leave the page in 'login' with a
  // message beside the form, which is where the admin has to act.
  const [authState, setAuthState] = useState('checkingSession');
  // Bumped by "Try again" when the session could not be checked (a 503 or a
  // network failure), which re-runs the restore effect below.
  const [sessionAttempt, setSessionAttempt] = useState(0);
  const [unavailableMessage, setUnavailableMessage] = useState('');
  const [loginForm, setLoginForm] = useState({ username: '', password: '' });
  const [loginError, setLoginError] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  // Read by the forced password screen so it can name the signed-in admin.
  const [adminUser, setAdminUser] = useState(null);
  // No local access-token ref. The token lives in services/adminApi.js, which
  // is the single owner of the admin session for the whole app — see the note
  // on the auth helpers below.

  // The CRM owns its own data (components/admin/leads). The page only asks it
  // to reload, and shows the header spinner while it does.
  const [refreshKey, setRefreshKey] = useState(0);
  const [crmLoading, setCrmLoading] = useState(false);

  // ── Auth ────────────────────────────────────────────────────────
  //
  // All of it delegates to services/adminApi.js. This page used to carry its
  // own copy — a token in a ref, its own refresh-on-401 retry, its own logout
  // — duplicating the module that the analytics dashboard already used. Two
  // implementations of one security-sensitive flow meant a fix to either
  // silently missed the other, and they had already drifted in two ways that
  // mattered:
  //
  //   1. ChangePasswordForm calls adminApi's changeAdminPassword(), which
  //      signs requests with adminApi's token. This page kept its token
  //      somewhere else, so that token was null here and the request went out
  //      with no Authorization header — the FORCED first-login password change
  //      answered 401 and could not be completed from this page at all.
  //   2. The local version refreshed on every concurrent 401 independently.
  //      adminApi deduplicates them into one in-flight refresh, so a dashboard
  //      firing several requests at once no longer races itself.
  //
  // `clearSession` is the one piece that stays local: it resets THIS page's
  // React state after adminApi has already dropped the token.
  const clearSession = useCallback(() => {
    setAuthState('login');
    setAdminUser(null);
  }, []);

  // Logout handler. adminLogout revokes server-side (bumping token_version,
  // which kills every session for this admin) and clears the local token.
  const handleLogout = useCallback(async () => {
    await adminLogout();
    clearSession();
  }, [clearSession]);

  // Login handler — calls backend API
  const handleLogin = async (e) => {
    e.preventDefault();
    setIsLoggingIn(true);
    setLoginError('');

    try {
      // adminLogin stores the access token inside adminApi, so every later
      // call from this page AND from ChangePasswordForm is signed with it.
      const admin = await adminLogin(loginForm.username, loginForm.password);
      setAdminUser(admin);
      // Credentials cleared the moment they are no longer needed, so the
      // temporary password does not sit in React state behind the next screen.
      setLoginForm({ username: '', password: '' });
      // Temporary password: the CRM stays closed until it is replaced. The
      // backend refuses its data either way — this only picks the screen.
      setAuthState(admin?.mustChangePassword ? 'mustChangePassword' : 'authenticated');
    } catch (err) {
      // AdminApiError already carries the server's user-safe sentence
      // ("Invalid username or password.", or the lockout message).
      setLoginError(
        err instanceof AdminApiError
          ? err.message
          : 'Unable to reach server. Please check your connection.'
      );
    } finally {
      setIsLoggingIn(false);
    }
  };

  // Session restore on mount — exchange the httpOnly refresh cookie for a token.
  useEffect(() => {
    let cancelled = false;
    const restoreSession = async () => {
      try {
        // bootstrapSession is the same call the analytics dashboard makes, so
        // an admin signed in on either page is signed in on both.
        if (await bootstrapSession()) {
          // POST /api/auth/refresh does not report mustChangePassword, so the
          // restored session is asked directly. GET /api/admin/session is one
          // of only two endpoints an account holding a temporary password can
          // reach — it answers where every dashboard call would 403.
          //
          // An account still holding an operator-issued temporary password is
          // sent to the password screen rather than an empty dashboard.
          const session = await getAdminSession();
          if (cancelled) return;
          setAdminUser(session);
          setAuthState(session?.mustChangePassword ? 'mustChangePassword' : 'authenticated');
          return;
        }
      } catch (err) {
        // The server could not answer (ZT-07): the refresh cookie is intact, so
        // this is a retry, not a sign-out. Anything else falls through to the
        // login gate as before.
        if (err instanceof AdminUnavailableError) {
          if (!cancelled) {
            setUnavailableMessage(err.message);
            setAuthState('unavailable');
          }
          return;
        }
      }
      // Reached only when there is no usable session. Written last and exactly
      // once, so the page never sits in 'checkingSession' after this resolves
      // and never lands in 'login' having already restored one.
      if (!cancelled) setAuthState('login');
    };
    restoreSession();
    return () => { cancelled = true; };
  }, [sessionAttempt]);

  // ─── SESSION RESTORING SPINNER ───
  //
  // Every branch below is keyed off `authState` alone, and the CRM is the
  // fall-through of an exhaustive switch rather than "whatever is left". No
  // protected markup exists in the tree until the state says 'authenticated',
  // so there is no frame in which admin content is painted and then withdrawn.
  if (authState === 'checkingSession') {
    return (
      <div className="min-h-screen flex items-center justify-center"
           style={{ background: 'linear-gradient(135deg, #090d16 0%, #111322 50%, #090d16 100%)' }}>
        <div className="flex items-center gap-3">
          <span className="w-5 h-5 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-zinc-400 font-medium text-sm">Restoring session...</span>
        </div>
      </div>
    );
  }

  if (authState === 'unavailable') {
    return (
      <div className="min-h-screen flex items-center justify-center px-4"
           style={{ background: 'linear-gradient(135deg, #090d16 0%, #111322 50%, #090d16 100%)' }}>
        <div role="alert" className="max-w-sm text-center">
          <p className="text-zinc-100 font-semibold">Can't reach the admin service</p>
          <p className="mt-2 text-sm text-zinc-400">{unavailableMessage} You have not been signed out.</p>
          <button
            type="button"
            onClick={() => {
              setAuthState('checkingSession');
              setSessionAttempt((n) => n + 1);
            }}
            className="mt-5 inline-flex items-center rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  // ─── FORCED FIRST-LOGIN PASSWORD CHANGE ───
  //
  // Placed before the login gate and before the CRM: an account holding a
  // temporary password is authenticated, so the login form would be wrong, but
  // it must not see the CRM either. The same component and endpoint serve the
  // analytics dashboard, so there is one password flow in the product.
  if (authState === 'mustChangePassword') {
    return (
      <div className="min-h-screen flex items-center justify-center px-6 py-16"
           style={{ background: 'linear-gradient(135deg, #090d16 0%, #111322 50%, #090d16 100%)' }}>
        <div className="w-full max-w-md">
          <ChangePasswordForm
            forced
            username={adminUser?.username}
            onDone={() => {
              // The change revoked every token issued before it — including the
              // temporary-password session that reached this screen — and the
              // server handed back a fresh one, which adminApi is already
              // holding. So this goes straight to the dashboard: the admin has
              // just proved the current password and chosen the new one, and
              // sending them to a login form to retype something they set ten
              // seconds ago is what makes people pick memorable passwords.
              setAuthState('authenticated');
            }}
          />
        </div>
      </div>
    );
  }

  // ─── LOGIN GATE VIEW ───
  if (authState === 'login') {
    return (
      <div className="min-h-screen flex items-center justify-center px-6 relative" 
           style={{ background: 'linear-gradient(135deg, #090d16 0%, #111322 50%, #090d16 100%)' }}>
        
        <div className="absolute top-1/4 right-1/4 w-[450px] h-[450px] bg-violet-600/10 rounded-full blur-[130px] pointer-events-none" />
        <div className="absolute bottom-1/4 left-1/4 w-[400px] h-[400px] bg-indigo-500/10 rounded-full blur-[120px] pointer-events-none" />

        <div className="relative w-full max-w-md z-10">
          <div className="absolute -inset-0.5 bg-gradient-to-br from-violet-500/20 to-indigo-600/20 rounded-[28px] blur-sm opacity-50" />
          
          <div className="relative bg-[#111422]/85 backdrop-blur-3xl border border-white/10 rounded-[28px] p-8 md:p-10 shadow-2xl">
            <div className="text-center mb-8">
              <div className="w-15 h-15 mx-auto mb-4.5 rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-violet-500/20">
                <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <h1 className="text-xl font-bold text-white tracking-tight">Zurii Travels</h1>
              <p className="text-zinc-400 text-xs mt-1.5 font-medium">CRM Back-Office Authentication</p>
            </div>

            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1.5 ml-0.5">Username</label>
                <input
                  type="text"
                  required
                  disabled={isLoggingIn}
                value={loginForm.username}
                  onChange={(e) => { setLoginForm({ ...loginForm, username: e.target.value }); setLoginError(''); }}
                  placeholder="Enter username"
                  className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-zinc-600 outline-none focus:border-violet-500 focus:bg-white/[0.06] transition-all duration-300 font-medium"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1.5 ml-0.5">Password</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    disabled={isLoggingIn}
                    value={loginForm.password}
                    onChange={(e) => { setLoginForm({ ...loginForm, password: e.target.value }); setLoginError(''); }}
                    placeholder="Enter account password"
                    className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-zinc-600 outline-none focus:border-violet-500 focus:bg-white/[0.06] transition-all duration-300 font-medium pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white transition-colors"
                  >
                    {showPassword ? (
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              {loginError && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-red-400 text-xs font-semibold text-center leading-relaxed">
                  ⚠️ {loginError}
                </div>
              )}

              <button
                type="submit"
                disabled={isLoggingIn}
                className="w-full relative py-3.5 bg-gradient-to-r from-violet-600 to-indigo-600 hover:brightness-105 text-white font-bold tracking-wide rounded-xl transition-all duration-300 shadow-xl shadow-violet-500/10 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed text-xs uppercase flex items-center justify-center gap-2"
              >
                {isLoggingIn ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Verifying...
                  </>
                ) : (
                  "Access CRM Portal"
                )}
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  // ─── MAIN CRM DASHBOARD VIEW ───
  return (
    <div className="min-h-screen bg-gray-50 pt-28 pb-20 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        
        {/* Dashboard Header Banner */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-8 gap-4">
          <div>
            <span className="inline-block text-[10px] font-bold uppercase tracking-widest text-violet-600 bg-violet-50 px-3.5 py-1.5 rounded-full mb-2 border border-violet-100">
              Back-Office CRM
            </span>
            <h1 className="text-3xl font-extrabold text-zinc-950 tracking-tight">Customer Inquiries</h1>
            <p className="text-zinc-500 text-sm mt-1.5 font-medium">
              Real-time lead tracking, travel queries, and conversion metrics.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Link
              to="/admin/analytics"
              className="px-4 py-2.5 bg-violet-600 hover:bg-violet-700 text-white font-semibold text-xs rounded-xl transition-all shadow-xs active:scale-95 flex items-center gap-1.5"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 012-2h2a2 2 0 012 2v6m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              Analytics Dashboard
            </Link>
            <button
              onClick={() => setRefreshKey((k) => k + 1)}
              disabled={crmLoading}
              className="p-2.5 bg-white hover:bg-zinc-50 text-zinc-700 rounded-xl transition-all border border-zinc-200 shadow-xs hover:border-zinc-300 active:scale-95 flex items-center justify-center"
              title="Refresh Leads Data"
            >
              <svg className={`w-4 h-4 ${crmLoading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.228 9H18" />
              </svg>
            </button>
            <button
              onClick={handleLogout}
              className="px-4 py-2.5 bg-white hover:bg-red-50 text-zinc-700 hover:text-red-600 font-semibold text-xs rounded-xl transition-all border border-zinc-200 hover:border-red-200 active:scale-95 flex items-center gap-1.5 shadow-xs"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              Logout
            </button>
          </div>
        </div>

        <LeadsWorkspace
          refreshKey={refreshKey}
          onLoadingChange={setCrmLoading}
          onAuthLost={clearSession}
          onPasswordChangeRequired={() => setAuthState('mustChangePassword')}
        />

      </div>

    </div>
  );
};

export default AdminInsights;
