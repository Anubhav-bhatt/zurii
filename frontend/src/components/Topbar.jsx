import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import ContactModal from './ContactModal';
import CustomTripModal from './CustomTripModal';
import { useNavigate } from 'react-router-dom';
import {
  domesticDestinations as staticDomesticData,
  internationalFallback,
  bestSellerTrips as staticBestSellers,
  getAllTrips
} from '../data';

const menuItems = [
  { label: 'International Tours', icon: '🌍', path: '/explore/international' },
  { label: 'Domestic Tours', icon: '🇮🇳', path: '/explore/domestic' },
  { label: 'Adventure', icon: '🏔️', path: '/explore/adventure' },
  { label: 'Beach', icon: '🏖️', path: '/explore/beach' }
];

const Topbar = () => {
  const [contactOpen, setContactOpen] = useState(false);
  const [customTripOpen, setCustomTripOpen] = useState(false);
  const navigate = useNavigate();
  const [isScrolled, setIsScrolled] = useState(false);
  
  // Search States
  const [searchFocused, setSearchFocused] = useState(false);
  const [isMobileSearchActive, setIsMobileSearchActive] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [activeSearchIdx, setActiveSearchIdx] = useState(-1);
  const [recentSearches, setRecentSearches] = useState([]);

  // Mega-menu States
  const [exploreOpen, setExploreOpen] = useState(false);
  const [domesticOpen, setDomesticOpen] = useState(false);
  const [internationalOpen, setInternationalOpen] = useState(false);
  const [bestSellersOpen, setBestSellersOpen] = useState(false);
  
  // Mobile Menu States
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mobileExpanded, setMobileExpanded] = useState(null);

  const internationalDestinations = internationalFallback;
  const [activeIntlRegion, setActiveIntlRegion] = useState(internationalFallback[0]);
  const bestSellerTrips = staticBestSellers;
  const [selectedDomestic, setSelectedDomestic] = useState(staticDomesticData[0]);

  const dropdownRef = useRef(null);
  const domesticRef = useRef(null);
  const internationalRef = useRef(null);
  const bestSellersRef = useRef(null);
  const searchBarRef = useRef(null);
  const searchInputRef = useRef(null);

  // Monitor Scroll position to trigger sticky resizing
  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Prevent body scroll when mobile menu is open
  useEffect(() => {
    document.body.style.overflow = mobileMenuOpen ? 'hidden' : 'unset';
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [mobileMenuOpen]);

  // Load recent searches from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem('zurii_recent_searches');
      if (saved) {
        setRecentSearches(JSON.parse(saved));
      }
    } catch (e) {
      console.error('Failed to load recent searches:', e);
    }
  }, []);

  // Save query to recent searches
  const saveSearchQuery = useCallback((query) => {
    if (!query || query.trim().length < 2) return;
    const cleanQuery = query.trim();
    setRecentSearches(prev => {
      const filtered = prev.filter(q => q.toLowerCase() !== cleanQuery.toLowerCase());
      const updated = [cleanQuery, ...filtered].slice(0, 5);
      localStorage.setItem('zurii_recent_searches', JSON.stringify(updated));
      return updated;
    });
  }, []);

  // Clear specific recent search
  const clearRecentItem = useCallback((e, query) => {
    e.stopPropagation();
    setRecentSearches(prev => {
      const updated = prev.filter(q => q !== query);
      localStorage.setItem('zurii_recent_searches', JSON.stringify(updated));
      return updated;
    });
  }, []);

  // Clear all recent searches
  const clearAllRecent = useCallback((e) => {
    e.stopPropagation();
    setRecentSearches([]);
    localStorage.removeItem('zurii_recent_searches');
  }, []);

  // Client-Side Debounced Live Search Experience
  useEffect(() => {
    if (searchTerm.trim().length < 2) {
      setSearchResults([]);
      setActiveSearchIdx(-1);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    const debounceTimer = setTimeout(() => {
      const query = searchTerm.toLowerCase().trim();
      
      // 1. Filter Packages/Tours
      const tours = getAllTrips().filter(t =>
        t.title.toLowerCase().includes(query) ||
        (t.subtitle && t.subtitle.toLowerCase().includes(query)) ||
        (t.location && t.location.toLowerCase().includes(query)) ||
        (t.tagline && t.tagline.toLowerCase().includes(query)) ||
        (t.overview && t.overview.toLowerCase().includes(query))
      ).map(t => ({
        id: t.id,
        title: t.title,
        subtitle: t.subtitle || t.category || 'Tour Package',
        image: t.heroImage || t.image,
        price: t.price,
        duration: t.duration,
        result_type: 'package'
      }));

      // 2. Filter Domestic States
      const domestic = staticDomesticData.filter(d =>
        d.state.toLowerCase().includes(query) ||
        (d.highlight && d.highlight.toLowerCase().includes(query))
      ).map(d => ({
        id: d.state,
        title: d.state,
        subtitle: d.highlight || 'State in India',
        image: d.thumbnail,
        result_type: 'destination'
      }));

      // 3. Filter International Countries
      const international = [];
      internationalFallback.forEach(area => {
        area.countries.forEach(c => {
          if (
            c.country.toLowerCase().includes(query) ||
            c.cities.some(city => city.toLowerCase().includes(query))
          ) {
            international.push({
              id: c.country,
              title: c.country,
              subtitle: area.region,
              image: c.thumbnail,
              result_type: 'destination'
            });
          }
        });
      });

      // Combine and filter duplicates
      const merged = [...tours, ...domestic, ...international];
      const seenIds = new Set();
      const uniqueResults = merged.filter(item => {
        const key = `${item.result_type}-${item.id}`;
        if (seenIds.has(key)) return false;
        seenIds.add(key);
        return true;
      }).slice(0, 8); // Max 8-10 Spotlight results

      setSearchResults(uniqueResults);
      setActiveSearchIdx(-1);
      setIsLoading(false);
    }, 250);

    return () => clearTimeout(debounceTimer);
  }, [searchTerm]);

  // Click Outside Hook Setup
  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) setExploreOpen(false);
      if (domesticRef.current && !domesticRef.current.contains(e.target)) setDomesticOpen(false);
      if (internationalRef.current && !internationalRef.current.contains(e.target)) setInternationalOpen(false);
      if (bestSellersRef.current && !bestSellersRef.current.contains(e.target)) setBestSellersOpen(false);
      if (searchBarRef.current && !searchBarRef.current.contains(e.target)) setSearchFocused(false);
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  // Keyboard shortcut listener ('/') to focus search
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === '/' && document.activeElement !== searchInputRef.current) {
        e.preventDefault();
        setSearchFocused(true);
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <>
      <nav className={`fixed top-0 left-0 right-0 w-full z-50 transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] ${
        isScrolled 
          ? 'bg-white/75 backdrop-blur-xl border-b border-zinc-200/40 shadow-[0_2px_15px_rgba(0,0,0,0.02)] py-2' 
          : 'bg-white/95 border-b border-transparent py-4'
      }`}>
        <div className="max-w-7xl mx-auto px-6 flex items-center justify-between gap-6 relative">
          
          {isMobileSearchActive ? (
            /* Mobile Active Search Header overlay */
            <div className="flex lg:hidden items-center justify-between w-full gap-3 animate-in fade-in duration-200">
              <div className="relative flex-1 flex items-center bg-zinc-100 rounded-full border border-transparent focus-within:bg-white focus-within:border-zinc-300 focus-within:ring-4 focus-within:ring-violet-500/5 transition-all">
                <div className="pl-3.5 text-zinc-400">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
                <input
                  type="text"
                  autoFocus
                  placeholder="Search destinations, packages..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  onFocus={() => setSearchFocused(true)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      setIsMobileSearchActive(false);
                      setSearchFocused(false);
                      setSearchTerm('');
                    }
                    if (e.key === 'Enter' && searchResults.length > 0) {
                      const trip = searchResults[0];
                      saveSearchQuery(searchTerm);
                      setIsMobileSearchActive(false);
                      setSearchFocused(false);
                      setSearchTerm('');
                      navigate(trip.result_type === 'package' ? `/trip/${trip.id}` : `/destination/${trip.title}`);
                    }
                  }}
                  className="w-full bg-transparent border-none outline-none py-2 pl-2 pr-8 text-xs font-semibold text-zinc-800 placeholder-zinc-400 h-10"
                />
                {searchTerm && (
                  <button
                    onClick={() => setSearchTerm('')}
                    className="absolute right-3 text-zinc-300 hover:text-zinc-500"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
              <button
                onClick={() => {
                  setIsMobileSearchActive(false);
                  setSearchFocused(false);
                  setSearchTerm('');
                }}
                className="text-xs font-bold text-violet-600 active:scale-95 transition-all px-1.5 py-2 shrink-0 touch-target"
              >
                Cancel
              </button>
            </div>
          ) : (
            <>
              {/* Logo (Apple-style left align) */}
              <div className="flex items-center flex-shrink-0 cursor-pointer" onClick={() => navigate('/')}>
                <img
                  src="/zurii-logo.png"
                  alt="Zurii Travels"
                  className="h-8 md:h-9 w-auto object-contain transition-transform duration-300 active:scale-95"
                />
              </div>
            </>
          )}

          {/* Center Navigation Links (Apple-style middle align) */}
          <div className="hidden lg:flex items-center gap-1">
            
            {/* Explore Dropdown */}
            <div
              ref={dropdownRef}
              className="relative"
              onMouseEnter={() => setExploreOpen(true)}
              onMouseLeave={() => setExploreOpen(false)}
            >
              <button
                className={`flex items-center gap-1 px-3.5 py-1.5 text-xs font-semibold rounded-full transition-all duration-300 ${
                  exploreOpen ? 'bg-zinc-100 text-zinc-900' : 'text-zinc-600 hover:text-zinc-950 hover:bg-zinc-50'
                }`}
              >
                <span>Explore</span>
                <svg className={`w-3 h-3 transition-transform duration-300 ${exploreOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {exploreOpen && (
                <div className="absolute top-full left-0 mt-0 pt-2.5 w-[220px] z-50 animate-in fade-in slide-in-from-top-2 duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]">
                  <div className="bg-white/90 backdrop-blur-xl border border-zinc-200/50 rounded-2xl p-3 shadow-lg shadow-black/5 flex flex-col gap-0.5">
                    {menuItems.map((item, idx) => (
                      <button
                        key={idx}
                        onClick={() => {
                          setExploreOpen(false);
                          if (item.path.startsWith('#')) {
                            const target = document.getElementById(item.path.substring(1));
                            if (target) target.scrollIntoView({ behavior: 'smooth' });
                            else navigate('/');
                          } else {
                            navigate(item.path);
                          }
                        }}
                        className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-[11.5px] text-zinc-600 font-semibold hover:text-violet-600 hover:bg-zinc-50 transition-all text-left"
                      >
                        <span className="text-[13px] w-4">{item.icon}</span>
                        <span>{item.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Best Sellers Dropdown */}
            <div
              ref={bestSellersRef}
              className="relative"
              onMouseEnter={() => setBestSellersOpen(true)}
              onMouseLeave={() => setBestSellersOpen(false)}
            >
              <button
                className={`flex items-center gap-1 px-3.5 py-1.5 text-xs font-semibold rounded-full transition-all duration-300 ${
                  bestSellersOpen ? 'bg-zinc-100 text-zinc-900' : 'text-zinc-600 hover:text-zinc-950 hover:bg-zinc-50'
                }`}
              >
                <span>Best Sellers</span>
                <svg className={`w-3 h-3 transition-transform duration-300 ${bestSellersOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {bestSellersOpen && (
                <div className="absolute top-full left-1/2 -translate-x-1/2 mt-0 pt-2.5 w-[560px] z-50 animate-in fade-in slide-in-from-top-2 duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]">
                  <div className="bg-white/95 backdrop-blur-xl border border-zinc-200/50 rounded-3xl shadow-xl shadow-black/5 flex overflow-hidden min-h-[220px]">
                    <div className="w-[150px] bg-zinc-50 border-r border-zinc-200/50 p-5 flex flex-col justify-between flex-shrink-0">
                      <div>
                        <span className="text-[8px] font-black text-zinc-400 uppercase tracking-[0.2em] mb-1.5 block">Handpicked</span>
                        <h3 className="text-zinc-900 font-bold text-[14px] leading-tight">Trending Deals</h3>
                        <p className="text-zinc-500 text-[10px] mt-1.5 leading-relaxed">Curated trips loved by travelers</p>
                      </div>
                      <button
                        onClick={() => { setBestSellersOpen(false); navigate('/best-sellers'); }}
                        className="py-1.5 bg-zinc-900 hover:bg-zinc-800 rounded-lg text-[9px] font-bold text-white uppercase tracking-widest transition-all text-center"
                      >
                        All Deals
                      </button>
                    </div>
                    <div className="flex-1 p-5 grid grid-cols-2 gap-4">
                      {bestSellerTrips.slice(0, 2).map((_, colIdx) => (
                        <div key={colIdx} className="flex flex-col gap-1.5">
                          <p className="text-[9px] font-black text-violet-600 uppercase tracking-[0.18em] pb-1 border-b border-zinc-100">
                            {colIdx === 0 ? 'Trending' : 'Top Picks'}
                          </p>
                          {bestSellerTrips.slice(colIdx * 4, (colIdx + 1) * 4).map((trip) => (
                            <button
                              key={trip.id}
                              onClick={() => { setBestSellersOpen(false); navigate(`/trip/${trip.id}`); }}
                              className="text-[11px] text-zinc-500 font-semibold hover:text-zinc-900 transition-all text-left leading-tight py-0.5"
                            >
                              {trip.title}
                            </button>
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Domestic Mega Menu */}
            <div
              ref={domesticRef}
              className="relative"
              onMouseEnter={() => setDomesticOpen(true)}
              onMouseLeave={() => setDomesticOpen(false)}
            >
              <button
                className={`flex items-center gap-1 px-3.5 py-1.5 text-xs font-semibold rounded-full transition-all duration-300 ${
                  domesticOpen ? 'bg-zinc-100 text-zinc-900' : 'text-zinc-600 hover:text-zinc-950 hover:bg-zinc-50'
                }`}
              >
                <span>Domestic</span>
                <svg className={`w-3 h-3 transition-transform duration-300 ${domesticOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {domesticOpen && (
                <div className="absolute top-full left-1/2 -translate-x-[40%] mt-0 pt-2.5 w-[760px] z-50 animate-in fade-in slide-in-from-top-2 duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]">
                  <div className="bg-white/95 backdrop-blur-xl border border-zinc-200/50 rounded-3xl shadow-xl shadow-black/5 flex overflow-hidden min-h-[300px]">
                    <div className="w-[160px] bg-zinc-50 border-r border-zinc-200/50 py-3 flex flex-col gap-0.5 flex-shrink-0">
                      <p className="text-[8px] font-black text-zinc-400 uppercase tracking-[0.2em] px-4 pb-2 pt-1">Destinations</p>
                      <div className="max-h-[260px] overflow-y-auto scrollbar-hide px-2">
                        {staticDomesticData.map((dest, idx) => (
                          <div
                            key={idx}
                            onMouseEnter={() => setSelectedDomestic(dest)}
                            onClick={() => { setDomesticOpen(false); navigate(`/destination/${dest.state}`); }}
                            className={`cursor-pointer px-3 py-2 rounded-xl transition-all ${
                              selectedDomestic?.state === dest.state ? 'bg-white shadow-xs font-semibold text-violet-600' : 'text-zinc-600 hover:bg-zinc-100'
                            }`}
                          >
                            <p className="text-[11px] font-bold">{dest.state}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                    
                    <div className="flex-1 p-5 flex flex-col">
                      {selectedDomestic && (
                        <div className="flex flex-col h-full">
                          <div className="flex justify-between items-center mb-3">
                            <div>
                              <span className="text-[9px] font-black text-violet-500 uppercase tracking-[0.2em]">{selectedDomestic.state}</span>
                              <h3 className="text-base font-bold text-zinc-900">{selectedDomestic.state} Experiences</h3>
                            </div>
                            <button
                              onClick={() => { setDomesticOpen(false); navigate('/all-domestic-destinations'); }}
                              className="text-[10px] font-bold text-violet-600 hover:text-indigo-600 transition-colors uppercase tracking-widest border-b border-violet-100 hover:border-indigo-200 pb-0.5"
                            >
                              View All
                            </button>
                          </div>
                          
                          <div className="grid grid-cols-5 gap-5 flex-1">
                            <div className="col-span-2 flex flex-col gap-2">
                              <div className="relative aspect-[16/10] rounded-2xl overflow-hidden border border-zinc-200/40 shadow-xs">
                                {selectedDomestic.thumbnail && <img src={selectedDomestic.thumbnail} className="w-full h-full object-cover" alt="" />}
                              </div>
                              <p className="text-[10.5px] text-zinc-500 leading-relaxed line-clamp-3">
                                {selectedDomestic.about || 'Curated family journeys.'}
                              </p>
                            </div>
                            <div className="col-span-3 flex flex-col gap-2">
                              <p className="text-[8px] font-black text-zinc-400 uppercase tracking-[0.15em] border-b border-zinc-100 pb-1">Featured Itineraries</p>
                              <div className="flex flex-col gap-2">
                                {selectedDomestic.tours.slice(0, 3).map((tour, tIdx) => (
                                  <div
                                    key={tIdx}
                                    onClick={() => {
                                      setDomesticOpen(false);
                                      if (tour.id) navigate(`/trip/${tour.id}`);
                                      else navigate(`/destination/${selectedDomestic.state}`);
                                    }}
                                    className="cursor-pointer bg-zinc-50 hover:bg-violet-50/50 p-2.5 rounded-xl border border-transparent hover:border-violet-100/50 transition-all duration-300"
                                  >
                                    <h4 className="text-[11px] font-bold text-zinc-800 hover:text-violet-600">{tour.name}</h4>
                                    <p className="text-[9.5px] text-zinc-400 mt-0.5 line-clamp-1">{tour.detail || 'Explore hidden gems.'}</p>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* International Mega Menu */}
            <div
              ref={internationalRef}
              className="relative"
              onMouseEnter={() => setInternationalOpen(true)}
              onMouseLeave={() => setInternationalOpen(false)}
            >
              <button
                className={`flex items-center gap-1 px-3.5 py-1.5 text-xs font-semibold rounded-full transition-all duration-300 ${
                  internationalOpen ? 'bg-zinc-100 text-zinc-900' : 'text-zinc-600 hover:text-zinc-950 hover:bg-zinc-50'
                }`}
              >
                <span>International</span>
                <svg className={`w-3 h-3 transition-transform duration-300 ${internationalOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {internationalOpen && (
                <div className="absolute top-full left-1/2 -translate-x-[45%] mt-0 pt-2.5 w-[760px] z-50 animate-in fade-in slide-in-from-top-2 duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]">
                  <div className="bg-white/95 backdrop-blur-xl border border-zinc-200/50 rounded-3xl shadow-xl shadow-black/5 flex overflow-hidden min-h-[300px]">
                    <div className="w-[160px] bg-zinc-50 border-r border-zinc-200/50 py-3 flex flex-col gap-0.5 flex-shrink-0">
                      <p className="text-[8px] font-black text-zinc-400 uppercase tracking-[0.2em] px-4 pb-2 pt-1">Region</p>
                      {internationalDestinations.map((area, idx) => (
                        <div
                          key={idx}
                          onMouseEnter={() => setActiveIntlRegion(area)}
                          className={`cursor-pointer px-3 py-2 mx-2 rounded-xl transition-all ${
                            activeIntlRegion?.region === area.region ? 'bg-white shadow-xs text-indigo-600 font-semibold' : 'text-zinc-600 hover:bg-zinc-100'
                          }`}
                        >
                          <p className="text-[11px] font-bold">{area.region}</p>
                        </div>
                      ))}
                    </div>
                    
                    <div className="flex-1 p-5 flex flex-col">
                      {activeIntlRegion && (
                        <>
                          <p className="text-[9px] font-black text-indigo-500 uppercase tracking-[0.18em] mb-3">{activeIntlRegion.region}</p>
                          <div className="grid grid-cols-3 gap-x-5 gap-y-3.5 flex-1">
                            {activeIntlRegion.countries.slice(0, 9).map((country, idx) => (
                              <div key={idx} className="flex flex-col gap-1">
                                <h4
                                  className="text-[11.5px] font-bold text-zinc-800 cursor-pointer hover:text-indigo-600 transition-colors"
                                  onClick={() => { setInternationalOpen(false); navigate(`/destination/${country.country}`); }}
                                >
                                  {country.country}
                                </h4>
                                {country.cities.map((city, cIdx) => (
                                  <button
                                    key={cIdx}
                                    onClick={() => { setInternationalOpen(false); navigate(`/destination/${city}`); }}
                                    className="text-[10px] text-zinc-400 hover:text-indigo-600 transition-all text-left leading-tight py-0.5"
                                  >
                                    {city}
                                  </button>
                                ))}
                              </div>
                            ))}
                          </div>
                        </>
                      )}
                      <div className="pt-3 mt-3 border-t border-zinc-100 flex items-center justify-between">
                        <p className="text-[9.5px] text-zinc-400">Explore premium packages worldwide</p>
                        <button
                          onClick={() => { setInternationalOpen(false); navigate('/international'); }}
                          className="px-4 py-1.5 bg-gradient-to-r from-violet-600 to-indigo-600 text-white rounded-lg text-[9px] font-bold uppercase tracking-widest shadow-xs hover:brightness-110 transition-all"
                        >
                          All Countries &rarr;
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

          </div>

          {/* Right Section: Search & CTA (Apple-style right align) */}
          <div className="flex items-center gap-3.5 flex-1 justify-end">
            
            {/* Apple-Inspired Search Box */}
            <div ref={searchBarRef} className="relative hidden md:block">
              <div className={`relative flex items-center rounded-full transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                searchFocused 
                  ? 'w-[180px] sm:w-[260px] lg:w-[280px] bg-white border-zinc-300 ring-4 ring-violet-500/5' 
                  : 'w-[140px] sm:w-[190px] bg-zinc-100 hover:bg-zinc-200/70 border-transparent'
              } border`}>
                
                {/* Search Icon */}
                <div className="pl-3.5 flex items-center pointer-events-none text-zinc-400">
                  <svg className={`w-3.5 h-3.5 transition-colors ${searchFocused ? 'text-violet-500' : 'text-zinc-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
                
                {/* Input text */}
                <input
                  ref={searchInputRef}
                  type="text"
                  placeholder={searchFocused ? 'Where to next?' : 'Search...'}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  onFocus={() => setSearchFocused(true)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') { 
                      setSearchFocused(false); 
                      setSearchTerm(''); 
                      searchInputRef.current?.blur(); 
                    }
                    if (e.key === 'ArrowDown' && searchResults.length > 0) {
                      e.preventDefault();
                      setActiveSearchIdx(prev => Math.min(prev + 1, searchResults.length - 1));
                    }
                    if (e.key === 'ArrowUp') {
                      e.preventDefault();
                      setActiveSearchIdx(prev => Math.max(prev - 1, -1));
                    }
                    if (e.key === 'Enter') {
                      if (activeSearchIdx >= 0 && searchResults[activeSearchIdx]) {
                        const trip = searchResults[activeSearchIdx];
                        saveSearchQuery(searchTerm);
                        setSearchFocused(false);
                        setSearchTerm('');
                        navigate(trip.result_type === 'package' ? `/trip/${trip.id}` : `/destination/${trip.title}`);
                      } else if (searchTerm.trim().length >= 2) {
                        saveSearchQuery(searchTerm);
                        // trigger default search page or route if needed
                      }
                    }
                  }}
                  className="w-full bg-transparent border-none outline-none py-1.5 pl-2 pr-8 text-[11.5px] font-medium text-zinc-800 placeholder-zinc-400"
                />

                {/* Loading / Clear Indicator */}
                <div className="absolute right-2.5 flex items-center gap-1.5">
                  {isLoading && (
                    <span className="w-3.5 h-3.5 border-2 border-violet-500/20 border-t-violet-600 rounded-full animate-spin" />
                  )}
                  {searchTerm && !isLoading && (
                    <button
                      onClick={() => { setSearchTerm(''); setActiveSearchIdx(-1); }}
                      className="text-zinc-300 hover:text-zinc-500 transition-colors"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                  {!searchFocused && !searchTerm && (
                    <kbd className="hidden sm:inline-block text-[9px] text-zinc-300 font-mono bg-white border border-zinc-200 px-1 py-0.5 rounded shadow-2xs pointer-events-none">/</kbd>
                  )}
                </div>
              </div>

              {/* Spotlight-Style Floating Search Panel */}
              {searchFocused && (
                <div className="absolute top-full right-0 mt-3.5 w-[360px] max-w-[calc(100vw-32px)] bg-white/95 backdrop-blur-xl border border-zinc-200/50 rounded-3xl shadow-2xl shadow-black/10 z-[100] overflow-hidden transition-all duration-300 animate-in fade-in slide-in-from-top-3">
                  
                  {/* Query results list */}
                  {searchTerm.trim().length >= 2 ? (
                    searchResults.length > 0 ? (
                      <div className="p-2">
                        <p className="px-3 pt-2 pb-1.5 text-[8.5px] font-bold uppercase tracking-widest text-zinc-400">
                          {searchResults.length} Match{searchResults.length !== 1 ? 'es' : ''} Found
                        </p>
                        <div className="max-h-[350px] overflow-y-auto scrollbar-hide flex flex-col gap-0.5">
                          {searchResults.map((item, idx) => (
                            <div
                              key={`${item.result_type}-${item.id}`}
                              onClick={() => {
                                saveSearchQuery(searchTerm);
                                setSearchFocused(false);
                                setSearchTerm('');
                                navigate(item.result_type === 'package' ? `/trip/${item.id}` : `/destination/${item.title}`);
                              }}
                              onMouseEnter={() => setActiveSearchIdx(idx)}
                              className={`flex items-center gap-3 p-2.5 rounded-2xl cursor-pointer transition-all ${
                                activeSearchIdx === idx ? 'bg-zinc-50 text-violet-600' : 'hover:bg-zinc-50/50 text-zinc-700'
                              }`}
                            >
                              {/* Thumbnail */}
                              <div className="w-10 h-10 rounded-xl overflow-hidden flex-shrink-0 border border-zinc-200/40 bg-zinc-50 shadow-2xs">
                                {item.image ? (
                                  <img src={item.image} alt="" className="w-full h-full object-cover" />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center text-sm bg-gradient-to-br from-violet-100 to-indigo-100">🌍</div>
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <h4 className="text-[11.5px] font-bold truncate leading-tight flex items-center gap-1.5">
                                  {item.title}
                                  <span className={`text-[7.5px] px-1.5 py-0.5 rounded font-black uppercase tracking-wider ${
                                    item.result_type === 'package' ? 'bg-violet-50 text-violet-600 border border-violet-100' : 'bg-zinc-100 text-zinc-500 border border-zinc-200/50'
                                  }`}>
                                    {item.result_type}
                                  </span>
                                </h4>
                                <p className="text-[9.5px] text-zinc-400 mt-0.5 truncate">{item.subtitle}</p>
                              </div>
                              {item.price && (
                                <span className="text-[10px] font-bold text-violet-600 shrink-0">{item.price}</span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      // Empty Search State
                      <div className="p-8 text-center flex flex-col items-center">
                        <span className="text-2xl mb-2 text-zinc-300">🔍</span>
                        <h4 className="text-[12px] font-bold text-zinc-700">No destinations found</h4>
                        <p className="text-[10px] text-zinc-400 mt-0.5 max-w-[200px] leading-relaxed">Try looking for "Bali", "Oman", "Sikkim", or "Kashmir".</p>
                      </div>
                    )
                  ) : (
                    // Default State (Recent & Popular Searches)
                    <div className="p-4 flex flex-col gap-4">
                      
                      {/* Recent searches */}
                      {recentSearches.length > 0 && (
                        <div>
                          <div className="flex justify-between items-center mb-2 px-1">
                            <span className="text-[8.5px] font-black uppercase tracking-widest text-zinc-400">Recent Searches</span>
                            <button onClick={clearAllRecent} className="text-[9.5px] font-semibold text-zinc-400 hover:text-zinc-600">Clear All</button>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {recentSearches.map((q, idx) => (
                              <div
                                key={idx}
                                onClick={() => setSearchTerm(q)}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-zinc-50 hover:bg-zinc-100 border border-zinc-200/40 text-[10.5px] font-semibold text-zinc-600 hover:text-zinc-800 cursor-pointer transition-all"
                              >
                                <span>{q}</span>
                                <button
                                  onClick={(e) => clearRecentItem(e, q)}
                                  className="text-zinc-300 hover:text-zinc-500"
                                >
                                  <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                  </svg>
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Popular / Trending Tags */}
                      <div>
                        <span className="text-[8.5px] font-black uppercase tracking-widest text-zinc-400 px-1 block mb-2">Popular Destinations</span>
                        <div className="flex flex-wrap gap-1.5">
                          {['Kashmir', 'Bali', 'Oman', 'Spiti Valley', 'Kerala'].map((tag) => (
                            <button
                              key={tag}
                              onClick={() => setSearchTerm(tag)}
                              className="px-3 py-1.5 rounded-full bg-zinc-50 hover:bg-violet-50 hover:border-violet-200/50 border border-zinc-200/40 text-[10.5px] font-semibold text-zinc-600 hover:text-violet-600 transition-all"
                            >
                              {tag}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Spotlight Keyboard Navigation Footer */}
                  <div className="p-3 border-t border-zinc-100 bg-zinc-50/50 flex justify-center text-[9px] text-zinc-400 font-medium">
                    <span>Use <kbd className="font-mono bg-white border border-zinc-200 px-1 py-0.5 rounded shadow-2xs">↑↓</kbd> keys to cycle, <kbd className="font-mono bg-white border border-zinc-200 px-1 py-0.5 rounded shadow-2xs">enter</kbd> to view</span>
                  </div>
                </div>
              )}
            </div>

            {/* Right Section: Search & CTA (Apple-style right align) */}
            {!isMobileSearchActive && (
              <div className="flex items-center gap-2.5 sm:gap-3.5 flex-1 justify-end">
                
                {/* Custom Trip Button (Tactile Apple style) */}
                <button
                  onClick={() => setCustomTripOpen(true)}
                  className="hidden lg:flex items-center gap-1.5 px-4 py-2.5 bg-zinc-50 hover:bg-zinc-100 border border-zinc-200/50 text-zinc-800 text-[11px] font-bold rounded-full transition-all active:scale-[0.98] shadow-2xs"
                >
                  <span>✨</span>
                  <span>Custom Trip</span>
                </button>

                {/* Main CTA: Get in Touch */}
                <button
                  id="get-in-touch-btn"
                  onClick={() => setContactOpen(true)}
                  className="hidden lg:flex items-center gap-1.5 px-4.5 py-2.5 bg-gradient-to-r from-violet-600 to-indigo-600 hover:brightness-105 active:scale-[0.98] transition-all text-white text-[11px] font-bold rounded-full shadow-md shadow-violet-500/10"
                >
                  <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                  </svg>
                  <span>Get in Touch</span>
                </button>

                {/* Mobile Search Icon Toggle */}
                <button
                  onClick={() => {
                    setIsMobileSearchActive(true);
                    setSearchFocused(true);
                  }}
                  className="lg:hidden p-2 text-zinc-600 hover:text-violet-600 bg-zinc-50 rounded-full hover:bg-violet-50 transition-colors touch-target flex items-center justify-center"
                  aria-label="Search"
                >
                  <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </button>

                {/* Mobile Menu Icon */}
                <button
                  onClick={() => setMobileMenuOpen(true)}
                  className="lg:hidden p-2 text-zinc-600 hover:text-violet-600 bg-zinc-50 rounded-full hover:bg-violet-50 transition-colors touch-target flex items-center justify-center"
                  aria-label="Open Menu"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                  </svg>
                </button>

              </div>
            )}

          </div>

          {/* Spotlight-Style Floating Search Panel (Global Placement) */}
          {isMobileSearchActive && searchFocused && (
            <div className="absolute top-full right-6 mt-3.5 w-[360px] max-w-[calc(100vw-48px)] bg-white/95 backdrop-blur-xl border border-zinc-200/50 rounded-3xl shadow-2xl shadow-black/10 z-[100] overflow-hidden transition-all duration-300 animate-in fade-in slide-in-from-top-3">
              
              {/* Query results list */}
              {searchTerm.trim().length >= 2 ? (
                searchResults.length > 0 ? (
                  <div className="p-2">
                    <p className="px-3 pt-2 pb-1.5 text-[8.5px] font-bold uppercase tracking-widest text-zinc-400">
                      {searchResults.length} Match{searchResults.length !== 1 ? 'es' : ''} Found
                    </p>
                    <div className="max-h-[300px] overflow-y-auto scrollbar-hide flex flex-col gap-0.5">
                      {searchResults.map((item, idx) => (
                        <div
                          key={`${item.result_type}-${item.id}`}
                          onClick={() => {
                            saveSearchQuery(searchTerm);
                            setSearchFocused(false);
                            setIsMobileSearchActive(false);
                            setSearchTerm('');
                            navigate(item.result_type === 'package' ? `/trip/${item.id}` : `/destination/${item.title}`);
                          }}
                          onMouseEnter={() => setActiveSearchIdx(idx)}
                          className={`flex items-center gap-3 p-2.5 rounded-2xl cursor-pointer transition-all ${
                            activeSearchIdx === idx ? 'bg-zinc-50 text-violet-600' : 'hover:bg-zinc-50/50 text-zinc-700'
                          }`}
                        >
                          {/* Thumbnail */}
                          <div className="w-10 h-10 rounded-xl overflow-hidden flex-shrink-0 border border-zinc-200/40 bg-zinc-50 shadow-2xs">
                            {item.image ? (
                              <img src={item.image} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-sm bg-gradient-to-br from-violet-100 to-indigo-100">🌍</div>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <h4 className="text-[11.5px] font-bold truncate leading-tight flex items-center gap-1.5">
                              {item.title}
                              <span className={`text-[7.5px] px-1.5 py-0.5 rounded font-black uppercase tracking-wider ${
                                item.result_type === 'package' ? 'bg-violet-50 text-violet-600 border border-violet-100' : 'bg-zinc-100 text-zinc-500 border border-zinc-200/50'
                              }`}>
                                {item.result_type}
                              </span>
                            </h4>
                            <p className="text-[9.5px] text-zinc-400 mt-0.5 truncate">{item.subtitle}</p>
                          </div>
                          {item.price && (
                            <span className="text-[10px] font-bold text-violet-600 shrink-0">{item.price}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  // Empty Search State
                  <div className="p-8 text-center flex flex-col items-center">
                    <span className="text-2xl mb-2 text-zinc-300">🔍</span>
                    <h4 className="text-[12px] font-bold text-zinc-700">No destinations found</h4>
                    <p className="text-[10px] text-zinc-400 mt-0.5 max-w-[200px] leading-relaxed">Try looking for "Bali", "Oman", "Sikkim", or "Kashmir".</p>
                  </div>
                )
              ) : (
                // Default State (Recent & Popular Searches)
                <div className="p-4 flex flex-col gap-4">
                  
                  {/* Recent searches */}
                  {recentSearches.length > 0 && (
                    <div>
                      <div className="flex justify-between items-center mb-2 px-1">
                        <span className="text-[8.5px] font-black uppercase tracking-widest text-zinc-400">Recent Searches</span>
                        <button onClick={clearAllRecent} className="text-[9.5px] font-semibold text-zinc-400 hover:text-zinc-600">Clear All</button>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {recentSearches.map((q, idx) => (
                          <div
                            key={idx}
                            onClick={() => setSearchTerm(q)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-zinc-50 hover:bg-zinc-100 border border-zinc-200/40 text-[10.5px] font-semibold text-zinc-600 hover:text-zinc-800 cursor-pointer transition-all"
                          >
                            <span>{q}</span>
                            <button
                              onClick={(e) => clearRecentItem(e, q)}
                              className="text-zinc-300 hover:text-zinc-500"
                            >
                              <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Popular / Trending Tags */}
                  <div>
                    <span className="text-[8.5px] font-black uppercase tracking-widest text-zinc-400 px-1 block mb-2">Popular Destinations</span>
                    <div className="flex flex-wrap gap-1.5">
                      {['Kashmir', 'Bali', 'Oman', 'Spiti Valley', 'Kerala'].map((tag) => (
                        <button
                          key={tag}
                          onClick={() => setSearchTerm(tag)}
                          className="px-3 py-1.5 rounded-full bg-zinc-50 hover:bg-violet-50 hover:border-violet-200/50 border border-zinc-200/40 text-[10.5px] font-semibold text-zinc-600 hover:text-violet-600 transition-all"
                        >
                          {tag}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Spotlight Keyboard Navigation Footer */}
              <div className="p-3 border-t border-zinc-100 bg-zinc-50/50 flex justify-center text-[9px] text-zinc-400 font-medium">
                <span>Use <kbd className="font-mono bg-white border border-zinc-200 px-1 py-0.5 rounded shadow-2xs">↑↓</kbd> keys to cycle, <kbd className="font-mono bg-white border border-zinc-200 px-1 py-0.5 rounded shadow-2xs">enter</kbd> to view</span>
              </div>
            </div>
          )}

        </div>
      </nav>

      {/* Apple-Inspired Slide-In Mobile Navigation Drawer */}
      <div 
        className={`fixed inset-0 z-[100] lg:hidden transition-opacity duration-500 ${
          mobileMenuOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
      >
        {/* Backdrop overlay */}
        <div 
          onClick={() => setMobileMenuOpen(false)}
          className="absolute inset-0 bg-black/30 backdrop-blur-xs transition-opacity duration-500"
        />

        {/* Sliding Panel */}
        <div 
          className={`absolute top-0 right-0 bottom-0 w-[85%] max-w-[380px] bg-white shadow-2xl flex flex-col p-6 pt-safe pb-safe transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] ${
            mobileMenuOpen ? 'translate-x-0' : 'translate-x-full'
          }`}
        >
          {/* Top Panel Actions */}
          <div className="flex items-center justify-between mb-6 pb-4 border-b border-zinc-100">
            <img src="/zurii-logo.png" alt="Zurii Travels" className="h-7 w-auto object-contain" />
            <button 
              onClick={() => setMobileMenuOpen(false)} 
              className="p-2 text-zinc-400 bg-zinc-50 rounded-full hover:bg-zinc-100 active:scale-90 transition-all touch-target flex items-center justify-center"
              aria-label="Close Menu"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Drawer Search field */}
          <div className="relative mb-6">
            <div className="flex items-center rounded-2xl bg-zinc-100 border border-transparent focus-within:border-zinc-300 focus-within:bg-white focus-within:ring-4 focus-within:ring-violet-500/5 transition-all duration-300">
              <div className="pl-3.5 text-zinc-400">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <input
                type="text"
                placeholder="Search tours, destinations..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-transparent border-none outline-none py-2.5 pl-2 pr-8 text-[12px] font-medium text-zinc-800 placeholder-zinc-400"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="absolute right-3 text-zinc-300 hover:text-zinc-500"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>

            {/* Mobile inline results */}
            {searchTerm.trim().length >= 2 && (
              <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-zinc-200/50 rounded-2xl shadow-xl z-50 p-2 max-h-[220px] overflow-y-auto">
                {searchResults.length > 0 ? (
                  searchResults.map((item) => (
                    <div
                      key={`${item.result_type}-${item.id}`}
                      onClick={() => {
                        setSearchFocused(false);
                        setSearchTerm('');
                        setMobileMenuOpen(false);
                        navigate(item.result_type === 'package' ? `/trip/${item.id}` : `/destination/${item.title}`);
                      }}
                      className="flex items-center gap-2.5 p-2 rounded-xl hover:bg-zinc-50 cursor-pointer"
                    >
                      <div className="w-8 h-8 rounded-lg overflow-hidden shrink-0 border border-zinc-200/30">
                        {item.image ? <img src={item.image} className="w-full h-full object-cover" alt="" /> : <div className="w-full h-full bg-zinc-100 flex items-center justify-center text-[10px]">🌍</div>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] font-bold text-zinc-800 truncate leading-tight">{item.title}</p>
                        <p className="text-[9px] text-zinc-400 truncate">{item.subtitle}</p>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-[10px] text-zinc-400 p-3 text-center">No results matched.</p>
                )}
              </div>
            )}
          </div>

          {/* Navigation Links Accordions */}
          <div className="flex-1 overflow-y-auto pr-1 flex flex-col gap-3">
            
            {/* Domestic Accordion */}
            <div>
              <button
                onClick={() => setMobileExpanded(mobileExpanded === 'domestic' ? null : 'domestic')}
                className="w-full flex items-center justify-between text-[13px] font-bold text-zinc-800 py-2.5 border-b border-zinc-100 touch-target"
              >
                <span>Domestic Tours</span>
                <svg className={`w-3.5 h-3.5 transition-transform ${mobileExpanded === 'domestic' ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {mobileExpanded === 'domestic' && (
                <div className="flex flex-col gap-2.5 pl-3 border-l border-violet-200/60 ml-2 py-2 animate-in fade-in duration-200">
                  {staticDomesticData.map((dest, idx) => (
                    <button
                      key={idx}
                      onClick={() => { setMobileMenuOpen(false); navigate(`/destination/${dest.state}`); }}
                      className="text-left text-[11.5px] font-bold text-zinc-500 hover:text-violet-600 transition-colors py-1.5 touch-target"
                    >
                      {dest.state}
                    </button>
                  ))}
                  <button
                    onClick={() => { setMobileMenuOpen(false); navigate('/all-domestic-destinations'); }}
                    className="text-left text-[11.5px] font-extrabold text-violet-600 mt-1 py-1.5 touch-target"
                  >
                    View All Domestic &rarr;
                  </button>
                </div>
              )}
            </div>

            {/* International Accordion */}
            <div>
              <button
                onClick={() => setMobileExpanded(mobileExpanded === 'intl' ? null : 'intl')}
                className="w-full flex items-center justify-between text-[13px] font-bold text-zinc-800 py-2.5 border-b border-zinc-100 touch-target"
              >
                <span>International Tours</span>
                <svg className={`w-3.5 h-3.5 transition-transform ${mobileExpanded === 'intl' ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {mobileExpanded === 'intl' && (
                <div className="flex flex-col gap-3 pl-3 border-l border-indigo-200/60 ml-2 py-2 animate-in fade-in duration-200">
                  {internationalDestinations.map((area, idx) => (
                    <div key={idx} className="flex flex-col gap-1.5">
                      <span className="text-[9px] font-black text-indigo-400 uppercase tracking-wider">{area.region}</span>
                      {area.countries.slice(0, 3).map((country, cIdx) => (
                        <button
                          key={cIdx}
                          onClick={() => { setMobileMenuOpen(false); navigate(`/destination/${country.country}`); }}
                          className="text-left text-[11px] font-semibold text-zinc-500 hover:text-indigo-600 py-1.5 touch-target"
                        >
                          {country.country}
                        </button>
                      ))}
                    </div>
                  ))}
                  <button
                    onClick={() => { setMobileMenuOpen(false); navigate('/international'); }}
                    className="text-left text-[11px] font-extrabold text-indigo-600 mt-1 py-1.5 touch-target"
                  >
                    View All International &rarr;
                  </button>
                </div>
              )}
            </div>

            {/* Best Sellers Link */}
            <button
              onClick={() => { setMobileMenuOpen(false); navigate('/best-sellers'); }}
              className="w-full text-left text-[13px] font-bold text-zinc-800 py-3 border-b border-zinc-100 touch-target"
            >
              Best Sellers
            </button>

          </div>

          {/* Bottom Drawer Actions */}
          <div className="mt-auto pt-4 border-t border-zinc-100 flex flex-col gap-2.5">
            <button
              onClick={() => { setMobileMenuOpen(false); setCustomTripOpen(true); }}
              className="w-full py-3.5 bg-zinc-50 hover:bg-zinc-100 text-zinc-800 rounded-2xl text-[11px] font-bold flex items-center justify-center gap-1.5 shadow-2xs active:scale-98 transition-all touch-target"
            >
              <span>✨</span> Custom Trip
            </button>
            <button
              onClick={() => { setMobileMenuOpen(false); setContactOpen(true); }}
              className="w-full py-3.5 bg-gradient-to-r from-violet-600 to-indigo-600 text-white rounded-2xl text-[11px] font-bold flex items-center justify-center gap-1.5 shadow-md shadow-violet-500/10 active:scale-98 transition-all touch-target"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
              </svg>
              Get in Touch
            </button>
          </div>

        </div>
      </div>

      <ContactModal
        isOpen={contactOpen}
        onClose={() => setContactOpen(false)}
        source="Topbar CTA"
      />
      <CustomTripModal
        isOpen={customTripOpen}
        onClose={() => setCustomTripOpen(false)}
      />
    </>
  );
};

export default Topbar;
