import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { API_BASE_URL } from '../config/api';

// Relative Time Helper
const getRelativeTime = (dateString) => {
  const now = new Date();
  const past = new Date(dateString);
  const diffMs = now.getTime() - past.getTime();
  const diffMins = Math.floor(diffMs / (60 * 1000));
  const diffHrs = Math.floor(diffMs / (60 * 60 * 1000));
  const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHrs < 24) return `${diffHrs}h ago`;
  if (diffDays === 1) return "yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  return past.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
};

const AdminInsights = () => {
  // Authentication & Session
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loginForm, setLoginForm] = useState({ username: '', password: '' });
  const [loginError, setLoginError] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [adminUser, setAdminUser] = useState(null);
  const [isRestoringSession, setIsRestoringSession] = useState(true);
  const accessTokenRef = useRef(null);

  // Data State
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState('');

  // Tab State
  const [statusTab, setStatusTab] = useState('pending'); // 'pending' | 'completed'

  // Filtering & Sorting
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [activeQuick, setActiveQuick] = useState('all');
  const [sortField, setSortField] = useState('created_at');
  const [sortOrder, setSortOrder] = useState('desc');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Active Details Drawer
  const [selectedLead, setSelectedLead] = useState(null);

  // Clipboard Copied Notifications
  const [copiedKey, setCopiedKey] = useState(null); // 'email-id' or 'phone-id'

  // Delete & Complete Confirm Dialog States
  const [leadToDelete, setLeadToDelete] = useState(null);
  const [leadToComplete, setLeadToComplete] = useState(null);
  
  // Custom Toast State
  const [toast, setToast] = useState(null);
  const toastTimeoutRef = useRef(null);

  // Action Loading States (For optimistic rollbacks)
  const [actionInProgress, setActionInProgress] = useState(null); // 'delete-id' or 'complete-id'

  // ── Auth Helper: make authenticated fetch requests ──
  const authFetch = useCallback(async (url, options = {}) => {
    const headers = { ...options.headers };
    if (accessTokenRef.current) {
      headers['Authorization'] = `Bearer ${accessTokenRef.current}`;
    }
    
    let res = await fetch(url, { ...options, headers, credentials: 'include' });
    
    // If access token expired, attempt silent refresh
    if (res.status === 401) {
      try {
        const refreshRes = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
          method: 'POST',
          credentials: 'include',
        });
        if (refreshRes.ok) {
          const refreshData = await refreshRes.json();
          accessTokenRef.current = refreshData.accessToken;
          headers['Authorization'] = `Bearer ${refreshData.accessToken}`;
          res = await fetch(url, { ...options, headers, credentials: 'include' });
        } else {
          // Refresh failed — session is truly expired
          accessTokenRef.current = null;
          setIsAuthenticated(false);
          setAdminUser(null);
          setContacts([]);
          setSelectedLead(null);
          return res;
        }
      } catch {
        accessTokenRef.current = null;
        setIsAuthenticated(false);
        setAdminUser(null);
        return res;
      }
    }
    return res;
  }, []);

  // Logout handler
  const handleLogout = useCallback(async () => {
    try {
      await fetch(`${API_BASE_URL}/api/auth/logout`, {
        method: 'POST',
        credentials: 'include',
      });
    } catch { /* ignore logout errors */ }
    accessTokenRef.current = null;
    setIsAuthenticated(false);
    setAdminUser(null);
    setContacts([]);
    setSelectedLead(null);
  }, []);

  // Fetch leads from PostgreSQL API (Authenticated)
  const fetchContacts = useCallback(async () => {
    setLoading(true);
    setFetchError('');
    try {
      const response = await authFetch(`${API_BASE_URL}/api/contact`, {
        signal: AbortSignal.timeout(10000)
      });
      if (!response.ok) {
        if (response.status === 401) return; // handled by authFetch
        throw new Error(`HTTP Error ${response.status}`);
      }
      const data = await response.json();
      if (data.success) {
        setContacts(data.data);
      } else {
        throw new Error(data.error || "Server returned failure response");
      }
    } catch (err) {
      console.error("Failed to fetch insights:", err);
      setFetchError(err.message || 'Database connection offline or API request timed out.');
    } finally {
      setLoading(false);
    }
  }, [authFetch]);

  // Login handler — calls backend API
  const handleLogin = async (e) => {
    e.preventDefault();
    setIsLoggingIn(true);
    setLoginError('');

    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          username: loginForm.username,
          password: loginForm.password,
        }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        accessTokenRef.current = data.accessToken;
        setAdminUser(data.admin);
        setIsAuthenticated(true);
      } else {
        setLoginError(data.error || 'Invalid username or password.');
      }
    } catch (err) {
      console.error('Login error:', err);
      setLoginError('Unable to reach server. Please check your connection.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  // Debounced search query sync
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
      setCurrentPage(1); // Reset page on search
    }, 250);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  // Session restore on mount — attempt silent refresh
  useEffect(() => {
    const restoreSession = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
          method: 'POST',
          credentials: 'include',
        });
        if (res.ok) {
          const data = await res.json();
          accessTokenRef.current = data.accessToken;
          setAdminUser(data.admin);
          setIsAuthenticated(true);
        }
      } catch { /* no valid session */ }
      setIsRestoringSession(false);
    };
    restoreSession();
  }, []);

  // Trigger fetch on auth state
  useEffect(() => {
    if (isAuthenticated) {
      fetchContacts();
    }
  }, [isAuthenticated, fetchContacts]);

  // Copy to clipboard helper
  const handleCopy = (text, key) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    });
  };

  // Custom Toast notification helper with optional Undo support
  const showToast = (message, type = 'success', action = null) => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setToast({ message, type, action });
    toastTimeoutRef.current = setTimeout(() => {
      setToast(null);
    }, 10000); // Remain on screen for 10 seconds for Undo capabilities
  };

  // COMPLETE Lead Action (Optimistic updates)
  const completeLead = async (id) => {
    const originalContacts = [...contacts];
    setActionInProgress(`complete-${id}`);
    
    // Optimistic Update
    setContacts(prev => prev.map(c => c.id === id ? { ...c, status: 'completed' } : c));
    if (selectedLead && selectedLead.id === id) {
      setSelectedLead(prev => ({ ...prev, status: 'completed' }));
    }
    
    try {
      const res = await authFetch(`${API_BASE_URL}/api/contact/${id}/complete`, {
        method: 'PATCH'
      });
      if (!res.ok) throw new Error('API failure completing lead');
      
      showToast('Lead marked as completed.', 'success', {
        leadId: id,
        previousStatus: 'pending'
      });
    } catch (err) {
      console.error("Complete Lead Error:", err);
      // Rollback
      setContacts(originalContacts);
      if (selectedLead && selectedLead.id === id) {
        setSelectedLead(prev => ({ ...prev, status: 'pending' }));
      }
      showToast('Failed to complete lead. Please try again.', 'error');
    } finally {
      setActionInProgress(null);
    }
  };

  // REOPEN Lead Action (Undo / Restore completed lead)
  const reopenLead = async (id) => {
    const originalContacts = [...contacts];
    setActionInProgress(`complete-${id}`);
    
    // Optimistic Update
    setContacts(prev => prev.map(c => c.id === id ? { ...c, status: 'pending' } : c));
    if (selectedLead && selectedLead.id === id) {
      setSelectedLead(prev => ({ ...prev, status: 'pending' }));
    }
    
    try {
      const res = await authFetch(`${API_BASE_URL}/api/contact/${id}/reopen`, {
        method: 'PATCH'
      });
      if (!res.ok) throw new Error('API failure restoring lead');
      
      showToast('Lead restored to pending status.', 'success', {
        leadId: id,
        previousStatus: 'completed'
      });
    } catch (err) {
      console.error("Restore Lead Error:", err);
      // Rollback
      setContacts(originalContacts);
      if (selectedLead && selectedLead.id === id) {
        setSelectedLead(prev => ({ ...prev, status: 'completed' }));
      }
      showToast('Failed to restore lead. Please try again.', 'error');
    } finally {
      setActionInProgress(null);
    }
  };

  // DELETE Lead Action
  const deleteLead = async (id) => {
    const originalContacts = [...contacts];
    setActionInProgress(`delete-${id}`);
    
    // Optimistic Update
    setContacts(prev => prev.filter(c => c.id !== id));
    if (selectedLead && selectedLead.id === id) {
      setSelectedLead(null);
    }
    
    try {
      const res = await authFetch(`${API_BASE_URL}/api/contact/${id}`, {
        method: 'DELETE'
      });
      if (!res.ok) throw new Error('API failure deleting lead');
      
      showToast('Lead deleted successfully.', 'success');
    } catch (err) {
      console.error("Delete Lead Error:", err);
      // Rollback
      setContacts(originalContacts);
      showToast('Failed to delete lead. Please try again.', 'error');
    } finally {
      setActionInProgress(null);
    }
  };

  // Handle Undo click on Toast snackbar
  const handleUndo = async () => {
    if (!toast || !toast.action) return;
    const { leadId, previousStatus } = toast.action;
    setToast(null);
    
    if (previousStatus === 'pending') {
      await reopenLead(leadId);
    } else {
      await completeLead(leadId);
    }
  };

  // Extract dynamically unique list of sources (interests) from leads
  const uniqueSources = useMemo(() => {
    const sourcesSet = new Set();
    contacts.forEach(c => {
      if (c.interest) {
        let cleanName = c.interest;
        if (cleanName.startsWith("Quote Request: ")) {
          cleanName = cleanName.replace("Quote Request: ", "");
        } else if (cleanName.startsWith("Plan Your Dream Trip")) {
          cleanName = "Landing Lead";
        }
        sourcesSet.add(cleanName);
      } else {
        sourcesSet.add('General');
      }
    });
    return Array.from(sourcesSet);
  }, [contacts]);

  // Handle Quick Filters
  const handleQuickFilter = (type) => {
    setActiveQuick(type);
    setCurrentPage(1);
    const now = new Date();
    const oneDay = 24 * 60 * 60 * 1000;

    if (type === 'all') {
      setDateFrom('');
      setDateTo('');
      setPriorityFilter('all');
      setSourceFilter('all');
      return;
    }

    if (type === 'today') {
      const todayStr = now.toISOString().split('T')[0];
      setDateFrom(todayStr);
      setDateTo(todayStr);
    } else if (type === 'yesterday') {
      const yesterdayStr = new Date(now.getTime() - oneDay).toISOString().split('T')[0];
      setDateFrom(yesterdayStr);
      setDateTo(yesterdayStr);
    } else if (type === '7d') {
      const fromStr = new Date(now.getTime() - 7 * oneDay).toISOString().split('T')[0];
      setDateFrom(fromStr);
      setDateTo(now.toISOString().split('T')[0]);
    } else if (type === '30d') {
      const fromStr = new Date(now.getTime() - 30 * oneDay).toISOString().split('T')[0];
      setDateFrom(fromStr);
      setDateTo(now.toISOString().split('T')[0]);
    } else if (type === 'this-month') {
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      setDateFrom(startOfMonth.toISOString().split('T')[0]);
      setDateTo(now.toISOString().split('T')[0]);
    } else if (type === 'last-month') {
      const startOfLast = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const endOfLast = new Date(now.getFullYear(), now.getMonth(), 0);
      setDateFrom(startOfLast.toISOString().split('T')[0]);
      setDateTo(endOfLast.toISOString().split('T')[0]);
    }
  };

  // Memoized Filter & Sort Logic
  const filteredContacts = useMemo(() => {
    return contacts
      .filter((c) => {
        // Tab Status Filter (pending covers empty status values)
        const leadStatus = c.status === 'completed' ? 'completed' : 'pending';
        if (statusTab !== leadStatus) return false;

        // Date Boundaries
        const createdDate = new Date(c.created_at);
        if (dateFrom) {
          const start = new Date(dateFrom);
          start.setHours(0, 0, 0, 0);
          if (createdDate < start) return false;
        }
        if (dateTo) {
          const end = new Date(dateTo);
          end.setHours(23, 59, 59, 999);
          if (createdDate > end) return false;
        }

        // Fuzzy Text Search
        if (debouncedSearchQuery) {
          const query = debouncedSearchQuery.toLowerCase();
          const pBadge = c.priority === 'high' ? 'priority' : 'normal';
          const interestLabel = c.interest ? c.interest.toLowerCase() : 'general';
          const blob = `${c.name} ${c.email} ${c.phone} ${interestLabel} ${c.message || ''} ${pBadge}`.toLowerCase();
          if (!blob.includes(query)) return false;
        }

        // Priority Filter
        if (priorityFilter === 'high' && c.priority !== 'high') return false;
        if (priorityFilter === 'normal' && c.priority === 'high') return false;

        // Source Filter
        if (sourceFilter !== 'all') {
          let cleanName = c.interest || 'General';
          if (cleanName.startsWith("Quote Request: ")) {
            cleanName = cleanName.replace("Quote Request: ", "");
          } else if (cleanName.startsWith("Plan Your Dream Trip")) {
            cleanName = "Landing Lead";
          }
          if (cleanName !== sourceFilter) return false;
        }

        return true;
      })
      .sort((a, b) => {
        let valA = a[sortField];
        let valB = b[sortField];

        if (sortField === 'created_at') {
          valA = new Date(a.created_at).getTime();
          valB = new Date(b.created_at).getTime();
        } else {
          valA = (valA || '').toString().toLowerCase();
          valB = (valB || '').toString().toLowerCase();
        }

        if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
        if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
        return 0;
      });
  }, [contacts, statusTab, dateFrom, dateTo, debouncedSearchQuery, priorityFilter, sourceFilter, sortField, sortOrder]);

  // Paginated View Slice
  const paginatedContacts = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredContacts.slice(start, start + pageSize);
  }, [filteredContacts, currentPage, pageSize]);

  // Total pages
  const totalPages = Math.ceil(filteredContacts.length / pageSize) || 1;

  // Sorting Header Click Handler
  const handleSort = (field) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
    setCurrentPage(1);
  };

  // Memoized Key Performance Indicators (KPI Analytics)
  const kpis = useMemo(() => {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    let pending = 0;
    let completed = 0;
    let today = 0;
    let highPriorityPending = 0;

    contacts.forEach(c => {
      const status = c.status === 'completed' ? 'completed' : 'pending';
      const created = new Date(c.created_at);

      if (status === 'completed') completed++;
      else pending++;

      if (created >= todayStart) today++;

      if (c.priority === 'high' && status === 'pending') highPriorityPending++;
    });

    const completionRate = contacts.length > 0 
      ? Math.round((completed / contacts.length) * 100) 
      : 0;

    return {
      total: contacts.length,
      pending,
      completed,
      today,
      highPriorityPending,
      completionRate,
      filtered: filteredContacts.length
    };
  }, [contacts, filteredContacts.length]);

  const getCleanSource = (interest) => {
    if (!interest) return 'General';
    if (interest.startsWith("Quote Request: ")) {
      return interest.replace("Quote Request: ", "");
    }
    if (interest.startsWith("Plan Your Dream Trip")) {
      return "Landing Lead";
    }
    return interest;
  };

  // Close details drawer on Escape key press
  useEffect(() => {
    const escClose = (e) => e.key === 'Escape' && setSelectedLead(null);
    window.addEventListener('keydown', escClose);
    return () => window.removeEventListener('keydown', escClose);
  }, []);

  // ─── SESSION RESTORING SPINNER ───
  if (isRestoringSession) {
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

  // ─── LOGIN GATE VIEW ───
  if (!isAuthenticated) {
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
            <button
              onClick={fetchContacts}
              disabled={loading}
              className="p-2.5 bg-white hover:bg-zinc-50 text-zinc-700 rounded-xl transition-all border border-zinc-200 shadow-xs hover:border-zinc-300 active:scale-95 flex items-center justify-center"
              title="Refresh Leads Data"
            >
              <svg className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
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

        {/* 📊 KPI ANALYTICS CARDS SECTION */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {[
            { label: 'Pending Inquiries', value: kpis.pending, desc: `Quotes pending: ${kpis.highPriorityPending}`, icon: '🎒', color: 'text-violet-600 bg-violet-50 border-violet-100' },
            { label: "Today's Leads", value: kpis.today, desc: `Overall: ${kpis.total} leads`, icon: '⚡', color: 'text-emerald-600 bg-emerald-50 border-emerald-100' },
            { label: 'Completed Leads', value: kpis.completed, desc: 'Successfully processed', icon: '✅', color: 'text-green-600 bg-green-50 border-green-100' },
            { label: 'Completion Rate', value: `${kpis.completionRate}%`, desc: `Leads completed ratio`, icon: '📈', color: 'text-blue-600 bg-blue-50 border-blue-100' },
          ].map((card, idx) => (
            <div key={idx} className="bg-white border border-zinc-200/50 rounded-2xl p-5 shadow-xs flex items-center justify-between transition-premium hover:-translate-y-0.5 hover:shadow-sm">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">{card.label}</p>
                <p className="text-2xl font-extrabold text-zinc-950 mt-1 tracking-tight">{card.value}</p>
                <p className="text-[11px] text-zinc-400 mt-0.5 font-medium">{card.desc}</p>
              </div>
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg border ${card.color}`}>
                {card.icon}
              </div>
            </div>
          ))}
        </div>

        {/* 🛠️ CRM SEARCH & FILTER BAR */}
        <div className="bg-white rounded-2xl border border-zinc-200/50 shadow-xs p-5 md:p-6 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
            
            {/* Fuzzy Text Search */}
            <div>
              <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1.5 ml-0.5">Search Query</label>
              <div className="relative">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Fuzzy search lead info..."
                  className="w-full border border-zinc-200 rounded-xl pl-9 pr-8 py-2 text-xs outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/10 transition-all duration-300 font-medium"
                />
                <svg className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                {searchQuery && (
                  <button onClick={() => setSearchQuery('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600">
                    ✕
                  </button>
                )}
              </div>
            </div>

            {/* Source Category Selector */}
            <div>
              <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1.5 ml-0.5">Source / Interest</label>
              <select
                value={sourceFilter}
                onChange={(e) => { setSourceFilter(e.target.value); setCurrentPage(1); }}
                className="w-full border border-zinc-200 rounded-xl px-3 py-2 text-xs outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/10 bg-white transition-all font-medium text-zinc-700"
              >
                <option value="all">All Sources</option>
                {uniqueSources.map(src => (
                  <option key={src} value={src}>{src}</option>
                ))}
              </select>
            </div>

            {/* Date limits */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1.5 ml-0.5">From</label>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => { setDateFrom(e.target.value); setCurrentPage(1); }}
                  className="w-full border border-zinc-200 rounded-xl px-3 py-1.5 text-xs outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/10 transition-all font-medium text-zinc-600"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1.5 ml-0.5">To</label>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => { setDateTo(e.target.value); setCurrentPage(1); }}
                  className="w-full border border-zinc-200 rounded-xl px-3 py-1.5 text-xs outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/10 transition-all font-medium text-zinc-600"
                />
              </div>
            </div>

            {/* Priority Toggle */}
            <div>
              <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1.5 ml-0.5">Priority Level</label>
              <div className="flex border border-zinc-200 rounded-xl overflow-hidden p-0.5 bg-zinc-50">
                {['all', 'high', 'normal'].map((level) => (
                  <button
                    key={level}
                    onClick={() => { setPriorityFilter(level); setCurrentPage(1); }}
                    className={`flex-1 py-1.5 text-[10px] font-bold uppercase rounded-lg transition-all ${
                      priorityFilter === level
                        ? level === 'high' 
                          ? 'bg-amber-500 text-white shadow-sm'
                          : 'bg-violet-600 text-white shadow-sm'
                        : 'text-zinc-500 hover:text-zinc-800 hover:bg-zinc-100/50'
                    }`}
                  >
                    {level}
                  </button>
                ))}
              </div>
            </div>

          </div>

          {/* Quick Date Selectors & Reset */}
          <div className="mt-4 pt-4 border-t border-zinc-100 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-1.5">
              {[
                { label: 'All Time', key: 'all' },
                { label: 'Today', key: 'today' },
                { label: 'Yesterday', key: 'yesterday' },
                { label: '7 Days', key: '7d' },
                { label: '30 Days', key: '30d' },
                { label: 'This Month', key: 'this-month' },
                { label: 'Last Month', key: 'last-month' },
              ].map((btn) => (
                <button
                  key={btn.key}
                  onClick={() => handleQuickFilter(btn.key)}
                  className={`px-3 py-1.5 text-[10px] font-bold rounded-lg border transition-all duration-300 ${
                    activeQuick === btn.key 
                      ? 'bg-zinc-100 border-zinc-300 text-zinc-800' 
                      : 'border-zinc-200 text-zinc-500 hover:bg-zinc-50 hover:border-zinc-300 hover:text-zinc-700'
                  }`}
                >
                  {btn.label}
                </button>
              ))}
            </div>

            <button
              onClick={() => {
                setSearchQuery('');
                setDateFrom('');
                setDateTo('');
                setPriorityFilter('all');
                setSourceFilter('all');
                setActiveQuick('all');
                setCurrentPage(1);
              }}
              className="px-3.5 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg text-[10px] font-bold transition-all border border-red-100 hover:border-red-200 active:scale-95"
            >
              Reset Filters
            </button>
          </div>
        </div>

        {/* 📭 ERROR AND EMPTY STATES */}
        {fetchError && (
          <div className="bg-red-50 border border-red-200 rounded-3xl p-8 text-center shadow-xs">
            <span className="text-4xl block mb-3">📡</span>
            <h3 className="text-base font-bold text-red-800">API Connection Offline</h3>
            <p className="text-red-600 text-xs mt-1.5 max-w-md mx-auto leading-relaxed">{fetchError}</p>
            <button
              onClick={fetchContacts}
              className="mt-5 px-6 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-xl transition-all shadow-md shadow-red-600/10 active:scale-95"
            >
              Retry Connection
            </button>
          </div>
        )}

        {!fetchError && loading && (
          /* SKELETON LOADER */
          <div className="bg-white rounded-3xl border border-zinc-200/50 shadow-xs overflow-hidden">
            <div className="p-6 border-b border-zinc-100 flex items-center justify-between">
              <div className="h-4 bg-zinc-100 animate-pulse w-32 rounded" />
              <div className="h-4 bg-zinc-100 animate-pulse w-24 rounded" />
            </div>
            <div className="p-6 space-y-4">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="flex gap-4 items-center">
                  <div className="h-10 bg-zinc-100 animate-pulse w-10 rounded-full" />
                  <div className="h-4 bg-zinc-100 animate-pulse flex-1 rounded" />
                  <div className="h-4 bg-zinc-100 animate-pulse w-20 rounded" />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Apple Segmented CRM Tabs */}
        {!fetchError && !loading && (
          <div className="flex border-b border-zinc-200 mb-6 bg-white rounded-2xl p-1 shadow-2xs border">
            <button
              onClick={() => { setStatusTab('pending'); setCurrentPage(1); }}
              className={`flex-1 py-3 text-xs font-bold rounded-xl transition-all ${
                statusTab === 'pending'
                  ? 'bg-violet-600 text-white shadow-sm'
                  : 'text-zinc-500 hover:text-zinc-800 hover:bg-zinc-50'
              }`}
            >
              Pending Leads ({contacts.filter(c => c.status !== 'completed').length})
            </button>
            <button
              onClick={() => { setStatusTab('completed'); setCurrentPage(1); }}
              className={`flex-1 py-3 text-xs font-bold rounded-xl transition-all ${
                statusTab === 'completed'
                  ? 'bg-violet-600 text-white shadow-sm'
                  : 'text-zinc-500 hover:text-zinc-800 hover:bg-zinc-50'
              }`}
            >
              Completed Leads ({contacts.filter(c => c.status === 'completed').length})
            </button>
          </div>
        )}

        {!fetchError && !loading && filteredContacts.length === 0 && (
          <div className="bg-white rounded-3xl border border-zinc-200/50 shadow-xs p-12 text-center">
            <span className="text-5xl mb-4 block">📭</span>
            <h2 className="text-lg font-bold text-zinc-950">No Inquiries Found</h2>
            <p className="text-zinc-500 text-xs mt-2 max-w-sm mx-auto leading-relaxed">
              We couldn't find any {statusTab} inquiries matching your filters or search keywords.
            </p>
          </div>
        )}

        {/* 📋 LEADS DATA TABLE & MOBILE STACKS */}
        {!fetchError && !loading && filteredContacts.length > 0 && (
          <>
            {/* Desktop Table View */}
            <div className="hidden md:block bg-white rounded-3xl border border-zinc-200/50 shadow-xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-zinc-50/50 border-b border-zinc-100 text-zinc-500 uppercase tracking-widest text-[9px] font-black">
                      <th className="text-left px-6 py-4.5 w-12">#</th>
                      <th className="text-left px-6 py-4.5 cursor-pointer hover:bg-zinc-100/50 transition-colors" onClick={() => handleSort('name')}>
                        Name {sortField === 'name' && (sortOrder === 'asc' ? '↑' : '↓')}
                      </th>
                      <th className="text-left px-6 py-4.5 cursor-pointer hover:bg-zinc-100/50 transition-colors" onClick={() => handleSort('interest')}>
                        Source/Interest {sortField === 'interest' && (sortOrder === 'asc' ? '↑' : '↓')}
                      </th>
                      <th className="text-left px-6 py-4.5">Message Summary</th>
                      <th className="text-left px-6 py-4.5 cursor-pointer hover:bg-zinc-100/50 transition-colors" onClick={() => handleSort('created_at')}>
                        Time {sortField === 'created_at' && (sortOrder === 'asc' ? '↑' : '↓')}
                      </th>
                      <th className="text-center px-6 py-4.5 w-44">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 font-medium text-zinc-700">
                    {paginatedContacts.map((contact, idx) => {
                      const absoluteIdx = (currentPage - 1) * pageSize + idx + 1;
                      const isHigh = contact.priority === 'high' && contact.status !== 'completed';
                      
                      return (
                        <tr
                          key={contact.id}
                          onClick={() => setSelectedLead(contact)}
                          className={`hover:bg-zinc-50/70 transition-colors cursor-pointer group ${isHigh ? 'bg-amber-50/15' : ''}`}
                        >
                          {/* Number index */}
                          <td className="px-6 py-4 font-mono text-zinc-400">
                            {isHigh ? <span className="text-amber-500 font-bold" title="High Priority">🔥</span> : absoluteIdx}
                          </td>
                          
                          {/* Customer Name & Priority Badge */}
                          <td className="px-6 py-4 font-bold text-zinc-900 whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              <span>{contact.name}</span>
                              {isHigh && (
                                <span className="text-[8px] font-black uppercase tracking-wider text-amber-600 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-full">
                                  Quote
                                </span>
                              )}
                              {contact.status === 'completed' && (
                                <span className="text-[8px] font-black uppercase tracking-wider text-emerald-600 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                                  ✓ Done
                                </span>
                              )}
                            </div>
                          </td>

                          {/* Source badge */}
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className="inline-block text-[9px] font-bold uppercase tracking-wider text-violet-600 bg-violet-50/50 border border-violet-100/50 px-2 py-0.5 rounded-full">
                              {getCleanSource(contact.interest)}
                            </span>
                          </td>

                          {/* Message snippet */}
                          <td className="px-6 py-4 text-zinc-500 max-w-xs truncate font-medium">
                            {contact.message || '—'}
                          </td>

                          {/* Relative Timestamp */}
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-zinc-800 font-semibold">{getRelativeTime(contact.created_at)}</div>
                            <div className="text-[9px] text-zinc-400 font-medium">
                              {new Date(contact.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                            </div>
                          </td>

                          {/* Quick Interactive Actions */}
                          <td className="px-6 py-4 text-center" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center justify-center gap-1.5">
                              {/* Direct Call */}
                              <a
                                href={`tel:${contact.phone}`}
                                className="w-8 h-8 rounded-lg bg-zinc-50 hover:bg-zinc-100 flex items-center justify-center border border-zinc-200/50 hover:border-zinc-300 text-zinc-600 transition-colors"
                                title={`Call: ${contact.phone}`}
                              >
                                📞
                              </a>

                              {/* WhatsApp Contact */}
                              <a
                                href={`https://wa.me/${contact.phone.replace(/[^0-9]/g, '')}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="w-8 h-8 rounded-lg bg-emerald-50/80 hover:bg-emerald-100/80 flex items-center justify-center border border-emerald-100/50 hover:border-emerald-200 text-emerald-600 transition-colors"
                                title="Chat on WhatsApp"
                              >
                                💬
                              </a>

                              {/* Action: Complete Lead (if pending) */}
                              {contact.status !== 'completed' ? (
                                <button
                                  onClick={() => setLeadToComplete(contact)}
                                  disabled={actionInProgress === `complete-${contact.id}`}
                                  className="w-8 h-8 rounded-lg bg-green-50 hover:bg-green-100 flex items-center justify-center border border-green-200/60 hover:border-green-300 text-green-600 transition-colors"
                                  title="Mark Completed"
                                >
                                  ✓
                                </button>
                              ) : (
                                <button
                                  onClick={() => reopenLead(contact.id)}
                                  disabled={actionInProgress === `complete-${contact.id}`}
                                  className="w-8 h-8 rounded-lg bg-violet-50 hover:bg-violet-100 flex items-center justify-center border border-violet-200/60 hover:border-violet-300 text-violet-600 transition-colors"
                                  title="Restore Lead"
                                >
                                  ↺
                                </button>
                              )}

                              {/* Action: Delete Lead */}
                              <button
                                onClick={() => setLeadToDelete(contact)}
                                disabled={actionInProgress === `delete-${contact.id}`}
                                className="w-8 h-8 rounded-lg bg-red-50 hover:bg-red-100 flex items-center justify-center border border-red-200/60 hover:border-red-300 text-red-600 transition-colors"
                                title="Delete Lead"
                              >
                                🗑️
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Mobile Stacked Card View */}
            <div className="md:hidden space-y-4">
              {paginatedContacts.map((contact, idx) => {
                const absoluteIdx = (currentPage - 1) * pageSize + idx + 1;
                const isHigh = contact.priority === 'high' && contact.status !== 'completed';
                
                return (
                  <div
                    key={contact.id}
                    onClick={() => setSelectedLead(contact)}
                    className={`bg-white rounded-2xl border border-zinc-200/50 p-5 shadow-xs relative flex flex-col justify-between gap-4 transition-all duration-300 active:scale-99 ${
                      isHigh ? 'border-l-4 border-l-amber-500 bg-amber-50/5' : ''
                    }`}
                  >
                    <div>
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-bold text-zinc-400 font-mono">#{absoluteIdx}</span>
                          <span className="inline-block text-[9px] font-bold uppercase tracking-wider text-violet-600 bg-violet-50/50 border border-violet-100/50 px-2 py-0.5 rounded-full">
                            {getCleanSource(contact.interest)}
                          </span>
                          {contact.status === 'completed' && (
                            <span className="text-[8px] font-black uppercase tracking-wider text-emerald-600 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-full">
                              ✓ Done
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-zinc-400 font-bold">{getRelativeTime(contact.created_at)}</span>
                      </div>

                      <h3 className="font-bold text-zinc-955 text-base leading-snug flex items-center gap-1.5">
                        {contact.name}
                        {isHigh && <span className="text-amber-500">🔥</span>}
                      </h3>

                      <p className="text-xs text-zinc-500 mt-2 line-clamp-2 leading-relaxed">
                        {contact.message || '—'}
                      </p>
                    </div>

                    <div className="flex items-center justify-between pt-3 border-t border-zinc-100" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-1.5">
                        <a href={`tel:${contact.phone}`} className="px-2.5 py-1.5 bg-zinc-50 hover:bg-zinc-100 rounded-lg text-[10px] font-bold text-zinc-700 border border-zinc-200/50">
                          Call
                        </a>
                        <a href={`https://wa.me/${contact.phone.replace(/[^0-9]/g, '')}`} target="_blank" rel="noopener noreferrer" className="px-2.5 py-1.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-lg text-[10px] font-bold border border-emerald-100">
                          WhatsApp
                        </a>
                      </div>
                      
                      <div className="flex items-center gap-1.5">
                        {/* Status Toggle */}
                        {contact.status !== 'completed' ? (
                          <button
                            onClick={() => setLeadToComplete(contact)}
                            disabled={actionInProgress === `complete-${contact.id}`}
                            className="px-2.5 py-1.5 bg-green-50 hover:bg-green-100 rounded-lg text-[10px] font-bold text-green-700 border border-green-200"
                          >
                            Complete
                          </button>
                        ) : (
                          <button
                            onClick={() => reopenLead(contact.id)}
                            disabled={actionInProgress === `complete-${contact.id}`}
                            className="px-2.5 py-1.5 bg-violet-50 hover:bg-violet-100 rounded-lg text-[10px] font-bold text-violet-700 border border-violet-200"
                          >
                            Reopen
                          </button>
                        )}
                        
                        {/* Delete */}
                        <button
                          onClick={() => setLeadToDelete(contact)}
                          disabled={actionInProgress === `delete-${contact.id}`}
                          className="px-2.5 py-1.5 bg-red-50 hover:bg-red-100 rounded-lg text-[10px] font-bold text-red-700 border border-red-200"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Pagination Controls */}
            <div className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-4">
              {/* Pagination Size Selector */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-zinc-400 font-medium">Rows per page:</span>
                <select
                  value={pageSize}
                  onChange={(e) => { setPageSize(parseInt(e.target.value, 10)); setCurrentPage(1); }}
                  className="border border-zinc-200 rounded-lg px-2.5 py-1 text-xs outline-none bg-white font-semibold text-zinc-700"
                >
                  {[5, 10, 25, 50, 100].map(size => (
                    <option key={size} value={size}>{size}</option>
                  ))}
                </select>
                <span className="text-xs text-zinc-400 font-medium ml-2">
                  Showing {(currentPage - 1) * pageSize + 1} - {Math.min(currentPage * pageSize, filteredContacts.length)} of {filteredContacts.length}
                </span>
              </div>

              {/* Page Buttons */}
              <div className="flex items-center gap-1">
                <button
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage(1)}
                  className="px-2.5 py-1.5 rounded-lg border border-zinc-200 text-xs font-semibold hover:bg-zinc-50 disabled:opacity-30 disabled:cursor-not-allowed bg-white"
                >
                  «
                </button>
                <button
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                  className="px-3 py-1.5 rounded-lg border border-zinc-200 text-xs font-semibold hover:bg-zinc-50 disabled:opacity-30 disabled:cursor-not-allowed bg-white"
                >
                  Prev
                </button>

                {[...Array(totalPages)].map((_, i) => {
                  const page = i + 1;
                  if (page === 1 || page === totalPages || Math.abs(page - currentPage) <= 1) {
                    return (
                      <button
                        key={page}
                        onClick={() => setCurrentPage(page)}
                        className={`px-3 py-1.5 rounded-lg border text-xs font-bold transition-all ${
                          currentPage === page
                            ? 'bg-violet-600 border-violet-600 text-white shadow-xs'
                            : 'border-zinc-200 bg-white hover:bg-zinc-50 text-zinc-700'
                        }`}
                      >
                        {page}
                      </button>
                    );
                  }
                  if (page === 2 || page === totalPages - 1) {
                    return <span key={page} className="px-1 text-zinc-400 font-medium">...</span>;
                  }
                  return null;
                })}

                <button
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                  className="px-3 py-1.5 rounded-lg border border-zinc-200 text-xs font-semibold hover:bg-zinc-50 disabled:opacity-30 disabled:cursor-not-allowed bg-white"
                >
                  Next
                </button>
                <button
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage(totalPages)}
                  className="px-2.5 py-1.5 rounded-lg border border-zinc-200 text-xs font-semibold hover:bg-zinc-50 disabled:opacity-30 disabled:cursor-not-allowed bg-white"
                >
                  »
                </button>
              </div>
            </div>
          </>
        )}

      </div>

      {/* ─── SLIDE-OUT PANEL (Bottom Sheet on mobile, Right Drawer on desktop) ─── */}
      <div 
        onClick={() => setSelectedLead(null)}
        className={`fixed inset-0 bg-black/35 backdrop-blur-xs z-[190] transition-opacity duration-300 ${selectedLead ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`} 
      />

      <div
        className={`fixed right-0 bottom-0 md:top-0 h-[80vh] md:h-screen w-full md:max-w-md bg-white border-t md:border-t-0 md:border-l border-zinc-200/50 shadow-2xl z-[200] transform transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] flex flex-col rounded-t-[28px] md:rounded-t-none pb-safe ${
          selectedLead ? 'translate-y-0 md:translate-x-0' : 'translate-y-full md:translate-x-full md:translate-y-0'
        }`}
      >
        {selectedLead && (
          <>
            {/* Header info */}
            <div className="p-6 border-b border-zinc-100 flex items-center justify-between">
              <div>
                <span className="text-[9px] font-black tracking-wider uppercase text-zinc-400">Lead Detail</span>
                <h2 className="text-xl font-bold text-zinc-950 mt-0.5 tracking-tight leading-snug">{selectedLead.name}</h2>
              </div>
              <button
                onClick={() => setSelectedLead(null)}
                className="w-8 h-8 rounded-full bg-zinc-50 border border-zinc-200 hover:bg-zinc-100 flex items-center justify-center text-zinc-500"
              >
                ✕
              </button>
            </div>

            {/* Scrollable specs log */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              
              {/* Category tags */}
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-bold uppercase text-zinc-400 block mb-1">Status Priority</span>
                  <div className="flex items-center gap-1.5">
                    <span className={`inline-block px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                      selectedLead.priority === 'high' 
                        ? 'bg-amber-50 text-amber-700 border border-amber-200' 
                        : 'bg-zinc-50 text-zinc-600 border border-zinc-200'
                    }`}>
                      {selectedLead.priority === 'high' ? '🔥 High Priority' : 'Normal'}
                    </span>
                    <span className={`inline-block px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                      selectedLead.status === 'completed' 
                        ? 'bg-green-50 text-green-700 border border-green-200' 
                        : 'bg-yellow-50 text-yellow-700 border border-yellow-200'
                    }`}>
                      {selectedLead.status === 'completed' ? '✓ Completed' : '⏳ Pending'}
                    </span>
                  </div>
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase text-zinc-400 block mb-1 text-right">Inquiry Date</span>
                  <span className="text-xs font-semibold text-zinc-800">
                    {new Date(selectedLead.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })}
                  </span>
                </div>
              </div>

              {/* Source (Interest) */}
              <div>
                <span className="text-[10px] font-bold uppercase text-zinc-400 block mb-1.5">Destination Interest</span>
                <div className="bg-violet-50/50 border border-violet-100 p-4 rounded-xl flex items-center gap-3">
                  <span className="text-2xl">🌍</span>
                  <div>
                    <h4 className="font-bold text-violet-900 text-sm">{getCleanSource(selectedLead.interest)}</h4>
                    <p className="text-[10px] text-violet-500 font-semibold uppercase tracking-wider mt-0.5">Original: {selectedLead.interest || 'General'}</p>
                  </div>
                </div>
              </div>

              {/* Phone Details */}
              <div>
                <span className="text-[10px] font-bold uppercase text-zinc-400 block mb-1.5">Phone Contact</span>
                <div className="bg-zinc-50 border border-zinc-200/50 rounded-xl p-4 flex items-center justify-between">
                  <span className="font-semibold text-zinc-800 text-sm">{selectedLead.phone}</span>
                  <button
                    onClick={() => handleCopy(selectedLead.phone, 'phone')}
                    className={`px-3 py-1.5 rounded-lg text-[10px] font-bold border transition-all ${
                      copiedKey === 'phone'
                        ? 'bg-green-50 border-green-200 text-green-700'
                        : 'bg-white border-zinc-200 hover:bg-zinc-100 text-zinc-600'
                    }`}
                  >
                    {copiedKey === 'phone' ? 'Copied ✓' : 'Copy'}
                  </button>
                </div>
              </div>

              {/* Email details */}
              <div>
                <span className="text-[10px] font-bold uppercase text-zinc-400 block mb-1.5">Email Address</span>
                <div className="bg-zinc-50 border border-zinc-200/50 rounded-xl p-4 flex items-center justify-between">
                  <span className="font-semibold text-zinc-800 text-sm truncate mr-4">{selectedLead.email}</span>
                  <button
                    onClick={() => handleCopy(selectedLead.email, 'email')}
                    className={`px-3 py-1.5 rounded-lg text-[10px] font-bold border transition-all ${
                      copiedKey === 'email'
                        ? 'bg-green-50 border-green-200 text-green-700'
                        : 'bg-white border-zinc-200 hover:bg-zinc-100 text-zinc-600'
                    }`}
                  >
                    {copiedKey === 'email' ? 'Copied ✓' : 'Copy'}
                  </button>
                </div>
              </div>

              {/* Text Message log */}
              <div>
                <span className="text-[10px] font-bold uppercase text-zinc-400 block mb-1.5">Special Notes / Message</span>
                <div className="bg-zinc-50 border border-zinc-200/50 rounded-xl p-4 text-xs font-semibold text-zinc-700 leading-relaxed whitespace-pre-line min-h-[100px]">
                  {selectedLead.message || 'No additional traveler specs provided.'}
                </div>
              </div>
            </div>

            {/* Bottom Actions Area */}
            <div className="p-6 border-t border-zinc-100 bg-zinc-50/50 flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-3">
                {/* WhatsApp direct link */}
                <a
                  href={`https://wa.me/${selectedLead.phone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent("Hello " + selectedLead.name + "! Connecting from Zurii Travels regarding your inquiry for " + getCleanSource(selectedLead.interest) + ".")}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs uppercase tracking-wide rounded-xl flex items-center justify-center gap-1.5 shadow-md shadow-emerald-600/10 transition-all active:scale-95 text-center"
                >
                  💬 WhatsApp
                </a>

                {/* Direct Mail */}
                <a
                  href={`mailto:${selectedLead.email}?subject=${encodeURIComponent("Zurii Travels Package Quote Inquiry — " + getCleanSource(selectedLead.interest))}`}
                  className="py-3 bg-zinc-950 hover:bg-zinc-800 text-white font-bold text-xs uppercase tracking-wide rounded-xl flex items-center justify-center gap-1.5 shadow-md transition-all active:scale-95 text-center"
                >
                  ✉️ Email Client
                </a>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {/* Status Toggle */}
                {selectedLead.status !== 'completed' ? (
                  <button
                    onClick={() => {
                      setSelectedLead(null);
                      completeLead(selectedLead.id);
                    }}
                    className="py-3 bg-green-600 hover:bg-green-700 text-white font-bold text-xs uppercase tracking-wide rounded-xl flex items-center justify-center gap-1.5 shadow-md transition-all active:scale-95 text-center"
                  >
                    ✓ Complete
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      setSelectedLead(null);
                      reopenLead(selectedLead.id);
                    }}
                    className="py-3 bg-violet-600 hover:bg-violet-700 text-white font-bold text-xs uppercase tracking-wide rounded-xl flex items-center justify-center gap-1.5 shadow-md transition-all active:scale-95 text-center"
                  >
                    ↺ Reopen Lead
                  </button>
                )}

                {/* Delete Inquiry */}
                <button
                  onClick={() => {
                    setLeadToDelete(selectedLead);
                  }}
                  className="py-3 bg-red-600 hover:bg-red-700 text-white font-bold text-xs uppercase tracking-wide rounded-xl flex items-center justify-center gap-1.5 shadow-md transition-all active:scale-95 text-center"
                >
                  🗑️ Delete Inquiry
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* ─── FLOATING TOAST / UNDO SNACKBAR ─── */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-[250] bg-zinc-900 text-white px-5 py-4 rounded-2xl shadow-xl flex items-center justify-between gap-5 border border-zinc-800/80 animate-in fade-in slide-in-from-bottom-5 duration-300">
          <div className="flex items-center gap-2 text-xs font-semibold">
            {toast.type === 'success' ? '✅' : '❌'}
            <span>{toast.message}</span>
          </div>
          {toast.action && (
            <button
              onClick={handleUndo}
              className="text-violet-400 hover:text-violet-300 text-xs font-bold uppercase tracking-wider px-2.5 py-1.5 bg-white/10 hover:bg-white/15 rounded-lg active:scale-95 transition-all"
            >
              Undo
            </button>
          )}
        </div>
      )}

      {/* ─── CONFIRMATION MODALS ─── */}
      {/* Complete Confirmation Modal */}
      {leadToComplete && (
        <div className="fixed inset-0 bg-black/45 backdrop-blur-xs flex items-center justify-center z-[300] p-4">
          <div className="bg-white rounded-3xl p-6 max-w-sm w-full shadow-2xl border border-zinc-200/50 transform transition-all duration-300 animate-in zoom-in-95">
            <h3 className="text-lg font-bold text-zinc-950">Complete Inquiry</h3>
            <p className="text-xs text-zinc-500 mt-2 leading-relaxed">
              Mark the inquiry from <span className="font-semibold text-zinc-800">{leadToComplete.name}</span> as completed?
            </p>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setLeadToComplete(null)}
                className="flex-1 py-2.5 bg-zinc-100 hover:bg-zinc-200/70 text-zinc-800 text-xs font-bold rounded-xl transition-all"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const id = leadToComplete.id;
                  setLeadToComplete(null);
                  completeLead(id);
                }}
                className="flex-1 py-2.5 bg-violet-600 hover:bg-violet-700 text-white text-xs font-bold rounded-xl transition-all shadow-md shadow-violet-500/10"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {leadToDelete && (
        <div className="fixed inset-0 bg-black/45 backdrop-blur-xs flex items-center justify-center z-[300] p-4">
          <div className="bg-white rounded-3xl p-6 max-w-sm w-full shadow-2xl border border-zinc-200/50 transform transition-all duration-300 animate-in zoom-in-95">
            <h3 className="text-lg font-bold text-zinc-950">Delete Inquiry</h3>
            <p className="text-xs text-zinc-500 mt-2 leading-relaxed">
              Are you sure you want to permanently delete the inquiry from <span className="font-semibold text-zinc-800">{leadToDelete.name}</span>? This action cannot be undone.
            </p>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setLeadToDelete(null)}
                className="flex-1 py-2.5 bg-zinc-100 hover:bg-zinc-200/70 text-zinc-800 text-xs font-bold rounded-xl transition-all"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const id = leadToDelete.id;
                  setLeadToDelete(null);
                  deleteLead(id);
                }}
                className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-xl transition-all shadow-md shadow-red-600/10"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default AdminInsights;
