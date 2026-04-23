import { useState, useEffect } from 'react';

const ADMIN_ID = 'zurii_admin';
const ADMIN_PASSWORD = 'zurii@2026';

const AdminInsights = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loginForm, setLoginForm] = useState({ id: '', password: '' });
  const [loginError, setLoginError] = useState('');
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [activeQuick, setActiveQuick] = useState('all');

  // Check if there's a saved session
  useEffect(() => {
    const session = sessionStorage.getItem('zurii_admin_auth');
    if (session === 'true') setIsAuthenticated(true);
  }, []);

  const handleLogin = (e) => {
    e.preventDefault();
    if (loginForm.id === ADMIN_ID && loginForm.password === ADMIN_PASSWORD) {
      setIsAuthenticated(true);
      setLoginError('');
      sessionStorage.setItem('zurii_admin_auth', 'true');
    } else {
      setLoginError('Invalid credentials. Please try again.');
    }
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    sessionStorage.removeItem('zurii_admin_auth');
    setContacts([]);
  };

  // Fetch data only after authentication
  useEffect(() => {
    if (!isAuthenticated) return;
    const fetchContacts = async () => {
      setLoading(true);
      try {
        const response = await fetch('http://localhost:5001/api/contact');
        const data = await response.json();
        if (data.success) {
          setContacts(data.data);
        }
      } catch (err) {
        console.error("Failed to fetch insights:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchContacts();
  }, [isAuthenticated]);

  // ── Login Gate ──
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6" 
           style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #0f172a 100%)' }}>
        
        {/* Decorative */}
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-violet-600/15 rounded-full blur-[120px] pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-indigo-500/15 rounded-full blur-[100px] pointer-events-none" />

        <div className="relative w-full max-w-md">
          {/* Glow border */}
          <div className="absolute -inset-1 bg-gradient-to-br from-violet-500 to-indigo-600 rounded-[28px] blur opacity-25" />
          
          <div className="relative bg-[#1a1f35]/90 backdrop-blur-xl border border-white/10 rounded-[28px] p-8 md:p-10 shadow-2xl">
            
            {/* Header */}
            <div className="text-center mb-8">
              <div className="w-16 h-16 mx-auto mb-5 rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-violet-500/30">
                <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <h1 className="text-2xl font-black text-white tracking-tight">Admin Access</h1>
              <p className="text-gray-400 text-sm mt-2">Enter your credentials to view insights</p>
            </div>

            <form onSubmit={handleLogin} className="space-y-5">
              {/* ID */}
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2 ml-1">Admin ID</label>
                <input
                  type="text"
                  value={loginForm.id}
                  onChange={(e) => { setLoginForm({ ...loginForm, id: e.target.value }); setLoginError(''); }}
                  placeholder="Enter admin ID"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-5 py-3.5 text-sm text-white placeholder-gray-500 outline-none focus:border-violet-400 focus:bg-white/10 transition-all font-medium"
                  autoFocus
                />
              </div>

              {/* Password */}
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2 ml-1">Password</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={loginForm.password}
                    onChange={(e) => { setLoginForm({ ...loginForm, password: e.target.value }); setLoginError(''); }}
                    placeholder="Enter password"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-5 py-3.5 text-sm text-white placeholder-gray-500 outline-none focus:border-violet-400 focus:bg-white/10 transition-all font-medium pr-12"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition text-sm"
                  >
                    {showPassword ? '🙈' : '👁️'}
                  </button>
                </div>
              </div>

              {/* Error */}
              {loginError && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-red-400 text-sm font-medium text-center">
                  {loginError}
                </div>
              )}

              {/* Submit  */}
              <button
                type="submit"
                className="w-full py-4 bg-gradient-to-r from-violet-600 to-indigo-600 hover:brightness-110 text-white font-black uppercase tracking-widest rounded-xl transition-all shadow-xl shadow-violet-500/20 text-sm"
              >
                Access Dashboard
              </button>
            </form>

            <p className="text-center text-gray-600 text-xs mt-6">
              Authorized personnel only
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ── Dashboard (after login) ──
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center pt-20">
        <div className="flex items-center gap-3">
          <span className="w-5 h-5 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-gray-500 font-semibold text-lg">Loading Insights...</p>
        </div>
      </div>
    );
  }


  const filteredContacts = contacts.filter((c) => {
    const createdDate = new Date(c.created_at);
    if (dateFrom && createdDate < new Date(dateFrom)) return false;
    if (dateTo) {
      const end = new Date(dateTo);
      end.setHours(23, 59, 59, 999);
      if (createdDate > end) return false;
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const blob = `${c.name} ${c.email} ${c.phone} ${c.interest || ''} ${c.message || ''}`.toLowerCase();
      if (!blob.includes(q)) return false;
    }
    if (priorityFilter === 'high' && c.priority !== 'high') return false;
    if (priorityFilter === 'normal' && c.priority === 'high') return false;
    return true;
  });

  const setQuickFilter = (days) => {
    if (days === 'all') {
      setDateFrom('');
      setDateTo('');
      return;
    }
    const now = new Date();
    const from = new Date();
    from.setDate(now.getDate() - days);
    setDateFrom(from.toISOString().split('T')[0]);
    setDateTo(now.toISOString().split('T')[0]);
  };

  return (
    <div className="min-h-screen bg-gray-50 pt-28 pb-20 px-6">
      <div className="max-w-7xl mx-auto">
        
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-8 gap-4">
          <div>
            <span className="inline-block text-xs font-semibold uppercase tracking-widest text-violet-500 bg-violet-50 px-4 py-1.5 rounded-full mb-3">
              Admin Panel
            </span>
            <h1 className="text-4xl sm:text-5xl font-black text-gray-900 mb-2">Customer Insights</h1>
            <p className="text-gray-500 text-lg">
              {filteredContacts.length} of {contacts.length} lead{contacts.length !== 1 ? 's' : ''}
            </p>
          </div>
          <button
            onClick={handleLogout}
            className="px-5 py-2.5 bg-gray-100 hover:bg-red-50 text-gray-600 hover:text-red-600 font-bold text-sm rounded-xl transition-colors border border-gray-200 hover:border-red-200"
          >
            🔒 Logout
          </button>
        </div>

        {/* Filters Bar */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-6">
          <div className="flex flex-col lg:flex-row gap-4 items-end">

            {/* Search */}
            <div className="flex-1 min-w-[200px]">
              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Search</label>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Name, email, phone..."
                className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm outline-none focus:border-violet-400 transition"
              />
            </div>

            {/* Date From */}
            <div className="min-w-[160px]">
              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">From</label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm outline-none focus:border-violet-400 transition"
              />
            </div>

            {/* Date To */}
            <div className="min-w-[160px]">
              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">To</label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm outline-none focus:border-violet-400 transition"
              />
            </div>

            {/* Quick Filters */}
            <div className="flex gap-2 shrink-0 flex-wrap">
              {[
                { label: '🔥 Top Priority', key: 'priority', action: () => setPriorityFilter(priorityFilter === 'high' ? 'all' : 'high'), isActive: priorityFilter === 'high' },
                { label: 'Today', key: 'today', action: () => { setQuickFilter(0); setActiveQuick('today'); } },
                { label: '7 Days', key: '7d', action: () => { setQuickFilter(7); setActiveQuick('7d'); } },
                { label: '30 Days', key: '30d', action: () => { setQuickFilter(30); setActiveQuick('30d'); } },
                { label: 'All', key: 'all', action: () => { setQuickFilter('all'); setPriorityFilter('all'); setActiveQuick('all'); } },
              ].map((btn) => {
                const active = btn.key === 'priority' ? btn.isActive : activeQuick === btn.key;
                return (
                  <button
                    key={btn.label}
                    onClick={btn.action}
                    className={`px-3.5 py-2.5 text-xs font-bold rounded-lg border transition-colors ${
                      active 
                        ? btn.key === 'priority' 
                          ? 'bg-amber-50 border-amber-300 text-amber-600' 
                          : 'bg-violet-50 border-violet-300 text-violet-600'
                        : 'border-gray-200 hover:bg-violet-50 hover:border-violet-200 hover:text-violet-600'
                    }`}
                  >
                    {btn.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Table */}
        {filteredContacts.length === 0 ? (
          <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-12 text-center">
            <span className="text-5xl mb-4 block">📭</span>
            <h2 className="text-xl font-bold text-gray-800">No results</h2>
            <p className="text-gray-500 mt-2">
              {contacts.length === 0 
                ? 'When users reach out through any form, their details will appear here.'
                : 'Try adjusting your filters or search query.'}
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="text-left px-5 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">#</th>
                    <th className="text-left px-5 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Name</th>
                    <th className="text-left px-5 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Email</th>
                    <th className="text-left px-5 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Phone</th>
                    <th className="text-left px-5 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Source</th>
                    <th className="text-left px-5 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest min-w-[200px]">Message</th>
                    <th className="text-left px-5 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filteredContacts.map((contact, idx) => (
                    <tr key={contact.id} className={`hover:bg-violet-50/30 transition-colors ${contact.priority === 'high' ? 'bg-amber-50/40' : ''}`}>
                      <td className="px-5 py-4 text-gray-400 font-mono text-xs">
                        {contact.priority === 'high' && <span className="mr-1" title="Top Priority">🔥</span>}
                        {idx + 1}
                      </td>
                      <td className="px-5 py-4 font-bold text-gray-900 whitespace-nowrap">
                        {contact.name}
                        {contact.priority === 'high' && <span className="ml-2 text-[9px] font-black uppercase tracking-wider text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded">Priority</span>}
                      </td>
                      <td className="px-5 py-4">
                        <a href={`mailto:${contact.email}`} className="text-gray-600 hover:text-violet-600 hover:underline">{contact.email}</a>
                      </td>
                      <td className="px-5 py-4">
                        <a href={`tel:${contact.phone}`} className="text-gray-600 hover:text-violet-600 hover:underline whitespace-nowrap">{contact.phone}</a>
                      </td>
                      <td className="px-5 py-4">
                        <span className="inline-block text-[10px] font-bold uppercase tracking-wide text-violet-600 bg-violet-50 px-2.5 py-1 rounded-md whitespace-nowrap">
                          {contact.interest || 'General'}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-gray-500 text-xs min-w-[200px] whitespace-pre-line">
                        {contact.message || '—'}
                      </td>
                      <td className="px-5 py-4 text-gray-400 text-xs whitespace-nowrap">
                        {new Date(contact.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                        <br />
                        <span className="text-[10px] text-gray-300">
                          {new Date(contact.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminInsights;
