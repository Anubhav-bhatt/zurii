import { useState, useRef, useEffect } from 'react';
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
  const [searchFocused, setSearchFocused] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [activeSearchIdx, setActiveSearchIdx] = useState(-1);
  const [exploreOpen, setExploreOpen] = useState(false);
  const [domesticOpen, setDomesticOpen] = useState(false);
  const [internationalOpen, setInternationalOpen] = useState(false);
  const [bestSellersOpen, setBestSellersOpen] = useState(false);
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

  // Search Logic (local)
  useEffect(() => {
    if (searchTerm.length < 2) {
      setSearchResults([]);
      setActiveSearchIdx(-1);
      return;
    }
    const query = searchTerm.toLowerCase();
    const allTrips = getAllTrips();
    const results = allTrips.filter(t =>
      t.title.toLowerCase().includes(query) ||
      (t.subtitle && t.subtitle.toLowerCase().includes(query)) ||
      (t.location && t.location.toLowerCase().includes(query)) ||
      (t.tagline && t.tagline.toLowerCase().includes(query)) ||
      (t.overview && t.overview.toLowerCase().includes(query))
    ).map(t => ({ ...t, result_type: 'package' }));
    setSearchResults(results);
    setActiveSearchIdx(-1);
  }, [searchTerm]);

  useEffect(() => {
    const handleClick = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setExploreOpen(false);
      }
      if (domesticRef.current && !domesticRef.current.contains(e.target)) {
        setDomesticOpen(false);
      }
      if (internationalRef.current && !internationalRef.current.contains(e.target)) {
        setInternationalOpen(false);
      }
      if (bestSellersRef.current && !bestSellersRef.current.contains(e.target)) {
        setBestSellersOpen(false);
      }
      if (searchBarRef.current && !searchBarRef.current.contains(e.target)) {
        setSearchFocused(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  return (
    <>
      <nav className="fixed top-2 left-1/2 -translate-x-1/2 w-[98%] md:w-[96%] max-w-6xl z-50">
        <div
          className="bg-white/70 backdrop-blur-2xl border border-gray-200/50 rounded-[20px] px-5 py-2.5"
          style={{ boxShadow: '0 4px 30px rgba(0, 0, 0, 0.06), 0 1px 3px rgba(0, 0, 0, 0.04)' }}
        >
          <div className="flex items-center justify-between gap-4">
            {/* Left: Logo */}
            <div className="flex items-center flex-shrink-0 cursor-pointer" onClick={() => navigate('/')}>
              <img
                src="/zurii-logo.png"
                alt="Zurii Travels"
                className="h-8 md:h-10 w-auto object-contain"
              />
            </div>

            {/* Center: Navigation Buttons */}
            <div className="hidden lg:flex items-center gap-1">
              {/* Explore Dropdown */}
              <div
                ref={dropdownRef}
                className="relative group"
                onMouseEnter={() => setExploreOpen(true)}
                onMouseLeave={() => setExploreOpen(false)}
              >
                <button
                  className={`flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-[10px] transition-all duration-200 ${exploreOpen ? 'bg-violet-50 text-violet-600' : 'text-gray-600 hover:bg-gray-100/70'
                    }`}
                >
                  <span>Explore</span>
                  <svg className={`w-3 h-3 transition-transform duration-200 ${exploreOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {exploreOpen && (
                  <div className="absolute top-full left-0 mt-0 pt-3 w-[440px] z-50 animate-in fade-in zoom-in-95 duration-150">
                    <div className="bg-white border border-gray-100 rounded-[20px] p-5 shadow-xl shadow-gray-200/60 flex flex-col gap-2">
                      <p className="text-[9px] font-black text-violet-500 uppercase tracking-[0.18em] pb-1.5 border-b border-violet-50">Quick Links</p>
                      {menuItems.map((item, idx) => (
                        <button
                          key={idx}
                          onClick={() => {
                            setExploreOpen(false);
                            if (item.path.startsWith('#')) {
                              const target = document.getElementById(item.path.substring(1));
                              if (target) target.scrollIntoView({ behavior: 'smooth' });
                              else navigate('/');
                            } else { navigate(item.path); }
                          }}
                          className="flex items-center gap-2 py-1 text-[11.5px] text-gray-500 font-semibold hover:text-violet-600 hover:translate-x-1 transition-all text-left"
                        >
                          <span className="text-[13px] w-4">{item.icon}</span>
                          <span>{item.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Best Sellers Mega Menu */}
              <div
                ref={bestSellersRef}
                className="relative group"
                onMouseEnter={() => setBestSellersOpen(true)}
                onMouseLeave={() => setBestSellersOpen(false)}
              >
                <button
                  className={`flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-[10px] transition-all duration-200 ${bestSellersOpen ? 'bg-violet-50 text-violet-600' : 'text-gray-600 hover:bg-gray-100/70'
                    }`}
                >
                  <span>Best Sellers</span>
                  <svg className={`w-3 h-3 transition-transform duration-200 ${bestSellersOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {bestSellersOpen && (
                  <div className="absolute top-full left-1/2 -translate-x-[35%] mt-0 pt-3 w-[680px] z-50 animate-in fade-in zoom-in-95 duration-150">
                    <div className="bg-white border border-gray-100 rounded-[20px] shadow-xl shadow-gray-200/60 flex overflow-hidden min-h-[280px]">
                      {/* Left accent panel */}
                      <div className="w-[160px] bg-gradient-to-b from-violet-600 to-indigo-700 p-5 flex flex-col justify-between flex-shrink-0">
                        <div>
                          <p className="text-[9px] font-black text-violet-200 uppercase tracking-[0.18em] mb-3">Handpicked</p>
                          <h3 className="text-white font-black text-[15px] leading-snug">Best<br />Sellers</h3>
                          <p className="text-violet-200 text-[10px] mt-2 leading-relaxed">Curated trips loved by thousands of travelers</p>
                        </div>
                        <button
                          onClick={() => { setBestSellersOpen(false); navigate('/best-sellers'); }}
                          className="mt-4 w-full py-2 bg-white/20 hover:bg-white/30 rounded-lg text-[9px] font-black text-white uppercase tracking-widest transition-all border border-white/20"
                        >
                          See All Deals
                        </button>
                      </div>
                      {/* Right content */}
                      <div className="flex-1 p-5 grid grid-cols-2 gap-5">
                        {bestSellerTrips.length > 0 ? (
                          bestSellerTrips.slice(0, 2).map((_, colIdx) => (
                            <div key={colIdx} className="flex flex-col gap-2">
                              <p className="text-[9px] font-black text-violet-500 uppercase tracking-[0.18em] pb-1.5 border-b border-violet-50">
                                {colIdx === 0 ? 'Trending' : 'Top Picks'}
                              </p>
                              {bestSellerTrips.slice(colIdx * 4, (colIdx + 1) * 4).map((trip) => (
                                <button
                                  key={trip.id}
                                  onClick={() => { setBestSellersOpen(false); navigate(`/trip/${trip.id}`); }}
                                  className="text-[11.5px] text-gray-500 font-semibold hover:text-violet-600 hover:translate-x-1 transition-all text-left leading-tight py-0.5"
                                >
                                  {trip.title}
                                </button>
                              ))}
                            </div>
                          ))
                        ) : (
                          <div className="col-span-2 flex items-center justify-center">
                            <p className="text-sm text-gray-300 italic">No best sellers yet.</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Domestic Mega Menu */}
              <div
                ref={domesticRef}
                className="relative group"
                onMouseEnter={() => setDomesticOpen(true)}
                onMouseLeave={() => setDomesticOpen(false)}
              >
                <button
                  className={`flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-[10px] transition-all duration-200 ${domesticOpen ? 'bg-violet-50 text-violet-600' : 'text-gray-600 hover:bg-gray-100/70'
                    }`}
                >
                  <span>Domestic</span>
                  <svg className={`w-3 h-3 transition-transform duration-200 ${domesticOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {domesticOpen && (
                  <div>
                    <div className="absolute top-full left-0 right-0 h-[30px] bg-transparent z-40" />
                    <div className="fixed top-[60px] left-1/2 -translate-x-1/2 mt-0 pt-3 w-[880px] max-w-[96vw] z-50 animate-in fade-in zoom-in-95 duration-150">
                      <div className="bg-white border border-gray-100 rounded-[20px] shadow-xl shadow-gray-200/60 flex overflow-hidden min-h-[380px]">

                        {/* Left Sidebar - Destinations */}
                        <div className="w-[180px] bg-gray-50 border-r border-gray-100 py-3 flex flex-col gap-0.5 flex-shrink-0">
                          <p className="text-[9px] font-black text-gray-400 uppercase tracking-[0.18em] px-4 pb-2 pt-1">Destinations</p>
                          <div className="max-h-[340px] overflow-y-auto custom-scrollbar">
                            {staticDomesticData.map((dest, idx) => (
                              <div
                                key={idx}
                                onMouseEnter={() => setSelectedDomestic(dest)}
                                onClick={() => { setDomesticOpen(false); navigate(`/destination/${dest.state}`); }}
                                className={`cursor-pointer mx-2 px-3 py-2.5 rounded-lg transition-all ${selectedDomestic?.state === dest.state
                                  ? 'bg-white shadow-sm'
                                  : 'hover:bg-gray-100'
                                  }`}
                              >
                                <p className={`text-[11px] font-bold ${selectedDomestic?.state === dest.state ? 'text-violet-600' : 'text-gray-500'
                                  }`}>{dest.state}</p>
                                {selectedDomestic?.state === dest.state && (
                                  <div className="mt-1 h-0.5 w-8 rounded-full bg-gradient-to-r from-violet-500 to-indigo-500" />
                                )}
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Right Panel - Rich Details */}
                        <div className="flex-1 p-6 flex flex-col bg-white overflow-hidden">
                          {selectedDomestic && (
                            <div className="flex flex-col h-full">
                              <div className="flex justify-between items-start mb-4">
                                <div>
                                  <div className="flex items-center gap-2 mb-1">
                                    <span className="text-[9px] font-black text-violet-500 uppercase tracking-[0.2em]">{selectedDomestic.state}</span>
                                    <div className="w-1 h-1 rounded-full bg-gray-300" />
                                    <span className="text-[9px] font-bold text-gray-400 uppercase tracking-[0.1em]">{selectedDomestic.highlight}</span>
                                  </div>
                                  <h3 className="text-xl font-black text-gray-900 tracking-tight">{selectedDomestic.state} Experiences</h3>
                                </div>
                                <button
                                  onClick={() => { setDomesticOpen(false); navigate('/all-domestic-destinations'); }}
                                  className="text-[10px] font-black text-violet-600 hover:text-indigo-600 transition-colors uppercase tracking-widest border-b-2 border-violet-100 hover:border-indigo-200 pb-0.5"
                                >
                                  View All
                                </button>
                              </div>

                              <div className="grid grid-cols-5 gap-6 flex-1">
                                {/* About Section */}
                                <div className="col-span-2 flex flex-col gap-3">
                                  <div className="relative aspect-[4/3] rounded-xl overflow-hidden shadow-lg border border-gray-100">
                                    {selectedDomestic.thumbnail ? (
                                      <img src={selectedDomestic.thumbnail} className="w-full h-full object-cover" alt="" />
                                    ) : (
                                       <div className="w-full h-full bg-gradient-to-br from-violet-100 to-indigo-100 flex items-center justify-center">
                                          <span className="text-4xl opacity-20">🏔️</span>
                                       </div>
                                    )}
                                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                                    <p className="absolute bottom-2 left-3 text-[10px] font-black text-white uppercase tracking-widest">{selectedDomestic.state} Souls</p>
                                  </div>
                                  <p className="text-[11px] text-gray-500 leading-relaxed font-medium">
                                    {selectedDomestic.about ? (selectedDomestic.about.length > 180 
                                      ? selectedDomestic.about.substring(0, 180) + "..." 
                                      : selectedDomestic.about) : "No description available."}
                                  </p>
                                </div>

                                {/* Tours Section */}
                                <div className="col-span-3 flex flex-col gap-4">
                                  <p className="text-[9px] font-black text-gray-400 uppercase tracking-[0.15em] border-b border-gray-50 pb-2">Featured Itineraries</p>
                                  <div className="flex flex-col gap-4">
                                    {selectedDomestic.tours.map((tour, tIdx) => (
                                      <div 
                                        key={tIdx}
                                        onClick={() => { 
                                          setDomesticOpen(false); 
                                          if (tour.id) navigate(`/trip/${tour.id}`);
                                          else navigate(`/destination/${selectedDomestic.state}`);
                                        }}
                                        className="group/tour cursor-pointer bg-gray-50/50 hover:bg-violet-50/50 p-3 rounded-xl border border-transparent hover:border-violet-100 transition-all duration-300"
                                      >
                                        <div className="flex items-center gap-2 mb-1.5">
                                          <div className="w-1.5 h-1.5 rounded-full bg-violet-400 group-hover/tour:scale-125 transition-transform" />
                                          <h4 className="text-[11.5px] font-black text-gray-800 group-hover/tour:text-violet-600 transition-colors">{tour.name}</h4>
                                        </div>
                                        <p className="text-[10px] text-gray-400 line-clamp-2 leading-snug group-hover/tour:text-gray-500 transition-colors">
                                          {tour.detail || "Explore the unseen beauty and hidden cultural gems of this magnificent destination with our curated plan."}
                                        </p>
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
                  </div>
                )}
              </div>

                {/* International Mega Menu */}
                <div
                  ref={internationalRef}
                  className="relative group"
                  onMouseEnter={() => setInternationalOpen(true)}
                  onMouseLeave={() => setInternationalOpen(false)}
                >
                  <button
                    className={`flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-[10px] transition-all duration-200 ${internationalOpen ? 'bg-violet-50 text-violet-600' : 'text-gray-600 hover:bg-gray-100/70'
                      }`}
                  >
                    <span>International</span>
                    <svg className={`w-3 h-3 transition-transform duration-200 ${internationalOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {internationalOpen && (
                    <div>
                      <div className="absolute top-full left-0 right-0 h-[30px] bg-transparent z-40" />
                      <div className="fixed top-[60px] left-1/2 -translate-x-1/2 mt-0 pt-3 w-[800px] max-w-[96vw] z-50 animate-in fade-in zoom-in-95 duration-150">
                        <div className="bg-white border border-gray-100 rounded-[20px] shadow-xl shadow-gray-200/60 flex overflow-hidden min-h-[300px]">

                          {/* Left Sidebar */}
                          <div className="w-[170px] bg-gray-50 border-r border-gray-100 py-3 flex flex-col gap-0.5 flex-shrink-0">
                            <p className="text-[9px] font-black text-gray-400 uppercase tracking-[0.18em] px-4 pb-2 pt-1">Region</p>
                            {internationalDestinations.map((area, idx) => (
                              <div
                                key={idx}
                                onMouseEnter={() => setActiveIntlRegion(area)}
                                className={`cursor-pointer mx-2 px-3 py-2.5 rounded-lg transition-all ${activeIntlRegion?.region === area.region
                                  ? 'bg-white shadow-sm'
                                  : 'hover:bg-gray-100'
                                  }`}
                              >
                                <p className={`text-[11px] font-bold ${activeIntlRegion?.region === area.region ? 'text-indigo-600' : 'text-gray-500'
                                  }`}>{area.region}</p>
                                {activeIntlRegion?.region === area.region && (
                                  <div className="mt-1 h-0.5 w-8 rounded-full bg-gradient-to-r from-violet-500 to-indigo-500" />
                                )}
                              </div>
                            ))}
                          </div>

                          {/* Right Panel */}
                          <div className="flex-1 p-5 flex flex-col">
                            {activeIntlRegion && (
                              <>
                                <p className="text-[9px] font-black text-indigo-500 uppercase tracking-[0.18em] mb-4">{activeIntlRegion.region}</p>
                                <div className="grid grid-cols-3 gap-x-6 gap-y-4 flex-1">
                                  {activeIntlRegion.countries.slice(0, 9).map((country, idx) => (
                                    <div key={idx} className="flex flex-col gap-1.5">
                                      {country.thumbnail && (
                                        <div
                                          className="w-full h-16 rounded-lg bg-cover bg-center mb-1 cursor-pointer hover:opacity-80 transition-opacity"
                                          style={{ backgroundImage: `url(${country.thumbnail})` }}
                                          onClick={() => { setInternationalOpen(false); navigate(`/destination/${country.country}`); }}
                                        />
                                      )}
                                      <h4 
                                        className="text-[11.5px] font-black text-gray-800 cursor-pointer hover:text-indigo-600 transition-colors"
                                        onClick={() => { setInternationalOpen(false); navigate(`/destination/${country.country}`); }}
                                      >
                                        {country.country}
                                      </h4>
                                      <div className="w-6 h-0.5 rounded-full bg-gradient-to-r from-violet-400 to-indigo-400 mb-1" />
                                      {country.cities.map((city, cIdx) => (
                                        <button
                                          key={cIdx}
                                          onClick={() => { setInternationalOpen(false); navigate(`/destination/${city}`); }}
                                          className="text-[11px] text-gray-400 font-medium hover:text-indigo-600 hover:translate-x-1 transition-all text-left leading-tight"
                                        >
                                          {city}
                                        </button>
                                      ))}
                                    </div>
                                  ))}
                                </div>
                              </>
                            )}
                            <div className="pt-3 mt-3 border-t border-gray-100 flex items-center justify-between">
                              <p className="text-[10px] text-gray-400">Discover destinations across the globe</p>
                              <button
                                onClick={() => { setInternationalOpen(false); navigate('/international'); }}
                                className="px-5 py-1.5 bg-gradient-to-r from-violet-600 to-indigo-600 text-white rounded-lg text-[9px] font-black uppercase tracking-widest shadow-md shadow-violet-500/20 hover:brightness-110 transition-all"
                              >
                                See All International &rarr;
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Right Section */}
              <div className="flex items-center gap-2 sm:gap-3 flex-1 justify-end">
                <div ref={searchBarRef} className="flex-shrink-0">
                  {/* Search Input */}
                  <div className={`relative transition-all duration-300 ${searchFocused ? 'w-[180px] sm:w-[260px] lg:w-[300px]' : 'w-[140px] sm:w-[200px]'}`}>
                    <input
                      type="text"
                      placeholder={searchFocused ? 'Search destinations, trips...' : 'Search trips...'}
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      onFocus={() => setSearchFocused(true)}
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') { setSearchFocused(false); setSearchTerm(''); e.target.blur(); }
                        if (e.key === 'ArrowDown' && searchResults.length > 0) {
                          e.preventDefault();
                          setActiveSearchIdx((prev) => Math.min(prev + 1, searchResults.length - 1));
                        }
                        if (e.key === 'ArrowUp') {
                          e.preventDefault();
                          setActiveSearchIdx((prev) => Math.max(prev - 1, -1));
                        }
                        if (e.key === 'Enter' && activeSearchIdx >= 0 && searchResults[activeSearchIdx]) {
                          const trip = searchResults[activeSearchIdx];
                          setSearchFocused(false); setSearchTerm('');
                          navigate(trip.result_type === 'package' ? `/trip/${trip.id}` : `/destination/${trip.title}`);
                        }
                      }}
                      className={`w-full pl-9 pr-8 py-2 rounded-[12px] text-[11px] outline-none transition-all duration-300 font-medium ${
                        searchFocused 
                          ? 'bg-white border-violet-300 shadow-lg shadow-violet-500/10 ring-2 ring-violet-100' 
                          : 'bg-gray-100/70 border-gray-200/50 hover:bg-gray-100'
                      } border`}
                    />
                    {/* Search icon */}
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <svg className={`w-3.5 h-3.5 transition-colors duration-200 ${searchFocused ? 'text-violet-500' : 'text-gray-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                    </div>
                    {/* Clear button */}
                    {searchTerm && (
                      <button 
                        onClick={() => { setSearchTerm(''); setActiveSearchIdx(-1); }}
                        className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-300 hover:text-gray-500 transition"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                    {/* Keyboard shortcut hint */}
                    {!searchFocused && !searchTerm && (
                      <div className="absolute inset-y-0 right-0 pr-2.5 flex items-center pointer-events-none">
                        <kbd className="text-[9px] text-gray-300 font-mono bg-gray-50 border border-gray-200 px-1.5 py-0.5 rounded">/</kbd>
                      </div>
                    )}
                  </div>

                  {/* Search Dropdown */}
                  {searchFocused && (
                    <div className="absolute top-full right-0 mt-2 w-[340px] max-w-[calc(100vw-24px)] bg-white border border-gray-100 rounded-[18px] shadow-2xl shadow-black/10 z-[100] overflow-hidden"
                         style={{ animation: 'fadeSlideIn 0.2s ease-out' }}>
                      
                      {isLoading ? (
                        <div className="p-6 text-center">
                          <div className="w-6 h-6 border-2 border-violet-500/30 border-t-violet-600 rounded-full animate-spin mx-auto mb-2" />
                          <p className="text-[10px] text-gray-400 font-medium">Searching...</p>
                        </div>
                      ) : searchResults.length > 0 ? (
                        <div>
                          <p className="px-4 pt-3 pb-1.5 text-[10px] font-black uppercase tracking-widest text-gray-400">
                            {searchResults.length} Result{searchResults.length !== 1 ? 's' : ''}
                          </p>
                          <div className="max-h-[340px] overflow-y-auto px-2 pb-2">
                            {searchResults.map((trip, idx) => (
                              <div
                                key={`${trip.result_type}-${trip.id}`}
                                onClick={() => {
                                  setSearchFocused(false); setSearchTerm('');
                                  navigate(trip.result_type === 'package' ? `/trip/${trip.id}` : `/destination/${trip.title}`);
                                }}
                                onMouseEnter={() => setActiveSearchIdx(idx)}
                                className={`flex items-center gap-3 p-2.5 rounded-[14px] cursor-pointer transition-all group ${
                                  activeSearchIdx === idx ? 'bg-violet-50' : 'hover:bg-gray-50'
                                }`}
                              >
                                <div className="w-12 h-12 rounded-xl overflow-hidden flex-shrink-0 bg-gradient-to-br from-violet-100 to-indigo-100 shadow-sm">
                                  {(trip.heroImage || trip.image) ? (
                                    <img src={trip.heroImage || trip.image} alt="" className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                                  ) : (
                                    <div className="w-full h-full flex items-center justify-center">
                                      <span className="text-lg">🌍</span>
                                    </div>
                                  )}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-[12px] font-bold text-gray-800 truncate leading-tight flex items-center gap-1.5">
                                    {trip.title}
                                    {trip.result_type !== 'package' && (
                                      <span className="text-[8px] px-1.5 py-0.5 bg-violet-100 text-violet-600 rounded uppercase tracking-wider">{trip.result_type}</span>
                                    )}
                                  </p>
                                  <p className="text-[10px] text-gray-400 font-medium truncate mt-0.5">
                                    {trip.result_type === 'country' ? trip.subtitle : (trip.subtitle || trip.category)}
                                  </p>
                                  {trip.price && (
                                    <p className="text-[10px] font-bold text-violet-600 mt-0.5">{trip.price}</p>
                                  )}
                                </div>
                                <svg className={`w-3.5 h-3.5 text-gray-300 flex-shrink-0 transition-all ${activeSearchIdx === idx ? 'text-violet-400 translate-x-0.5' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                                </svg>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : searchTerm.length >= 2 ? (
                        <div className="p-8 text-center">
                          <span className="text-3xl mb-3 block">🔍</span>
                          <p className="text-sm font-bold text-gray-700">No results found</p>
                          <p className="text-[11px] text-gray-400 mt-1">Try "Bali", "Kashmir", or "Dubai"</p>
                        </div>
                      ) : (
                        /* Trending / Quick Picks when search is empty */
                        <div>
                          <p className="px-4 pt-3 pb-1.5 text-[10px] font-black uppercase tracking-widest text-gray-400">🔥 Trending Destinations</p>
                          <div className="px-2 pb-2">
                            {[
                              { name: 'Kashmir', emoji: '🏔️', sub: 'Paradise on Earth' },
                              { name: 'Bali', emoji: '🌴', sub: 'Island of Gods' },
                              { name: 'Dubai', emoji: '🏙️', sub: 'Luxury Escape' },
                              { name: 'Spiti Valley', emoji: '🏜️', sub: 'Cold Desert Adventure' },
                              { name: 'Kerala', emoji: '🌿', sub: 'Backwater Bliss' },
                            ].map((d) => (
                              <button
                                key={d.name}
                                onClick={() => setSearchTerm(d.name)}
                                className="w-full flex items-center gap-3 p-2.5 rounded-[14px] hover:bg-violet-50 transition-all text-left group"
                              >
                                <div className="w-9 h-9 rounded-lg bg-gray-50 flex items-center justify-center text-lg group-hover:scale-110 transition-transform">{d.emoji}</div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-[12px] font-bold text-gray-700 group-hover:text-violet-600 transition-colors">{d.name}</p>
                                  <p className="text-[10px] text-gray-400">{d.sub}</p>
                                </div>
                                <svg className="w-3 h-3 text-gray-200 group-hover:text-violet-400 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                                </svg>
                              </button>
                            ))}
                          </div>
                          <div className="px-4 pb-3 border-t border-gray-50 pt-2.5">
                            <p className="text-[9px] text-gray-300 text-center">
                              <kbd className="font-mono bg-gray-50 border border-gray-100 px-1 py-0.5 rounded text-gray-400">↑↓</kbd> navigate · 
                              <kbd className="font-mono bg-gray-50 border border-gray-100 px-1 py-0.5 rounded text-gray-400 ml-1">↵</kbd> select · 
                              <kbd className="font-mono bg-gray-50 border border-gray-100 px-1 py-0.5 rounded text-gray-400 ml-1">esc</kbd> close
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <button
                  onClick={() => setCustomTripOpen(true)}
                  className="hidden lg:flex relative items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-amber-500 to-orange-500 text-white text-xs font-bold rounded-[10px] shadow-md shadow-amber-500/25 hover:shadow-lg hover:shadow-amber-500/35 hover:brightness-110 active:scale-[0.97] transition-all duration-200 overflow-hidden group whitespace-nowrap"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
                  <span>✨</span>
                  <span>Custom Trip</span>
                </button>

                <button
                  id="get-in-touch-btn"
                  onClick={() => setContactOpen(true)}
                  className="hidden lg:flex relative items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-violet-600 to-indigo-600 text-white text-xs font-bold rounded-[10px] shadow-md shadow-violet-500/25 hover:shadow-lg hover:shadow-violet-500/35 hover:brightness-110 active:scale-[0.97] transition-all duration-200 overflow-hidden group whitespace-nowrap"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
                  <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                  </svg>
                  <span>Get in Touch</span>
                </button>


              {/* Mobile Menu Toggle */}
              <button
                onClick={() => setMobileMenuOpen(true)}
                className="lg:hidden p-1.5 text-gray-600 hover:text-violet-600 bg-gray-50 hover:bg-violet-50 rounded-lg transition-colors"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </nav>

        {/* Mobile Menu Overlay */}
        <div className={`fixed inset-0 bg-white z-[100] transition-transform duration-300 ${mobileMenuOpen ? 'translate-x-0' : 'translate-x-full'} lg:hidden overflow-y-auto`}>
          <div className="p-5 flex flex-col h-full">
            <div className="flex items-center justify-between mb-8">
              <img src="/zurii-logo.png" alt="Zurii Travels" className="h-8 w-auto object-contain" />
              <button onClick={() => setMobileMenuOpen(false)} className="p-2 text-gray-500 bg-gray-50 rounded-full hover:bg-gray-100">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto pb-8">
              <div className="flex flex-col gap-4">
                <button 
                  onClick={() => { setMobileExpanded(mobileExpanded === 'domestic' ? null : 'domestic'); }} 
                  className="flex items-center justify-between text-lg font-bold text-gray-800 py-2 border-b border-gray-100"
                >
                  Domestic Tours
                  <svg className={`w-4 h-4 transition-transform ${mobileExpanded === 'domestic' ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
                </button>
                {mobileExpanded === 'domestic' && (
                  <div className="flex flex-col gap-3 pl-4 border-l-2 border-violet-100 ml-2 py-2">
                    {staticDomesticData.map((dest, idx) => (
                      <button key={idx} onClick={() => { setMobileMenuOpen(false); navigate(`/destination/${dest.state}`); }} className="text-left text-sm font-semibold text-gray-600 hover:text-violet-600">
                        {dest.state}
                      </button>
                    ))}
                    <button onClick={() => { setMobileMenuOpen(false); navigate('/all-domestic-destinations'); }} className="text-left text-sm font-bold text-violet-600 mt-2">
                      View All Domestic &rarr;
                    </button>
                  </div>
                )}

                <button 
                  onClick={() => { setMobileExpanded(mobileExpanded === 'international' ? null : 'international'); }} 
                  className="flex items-center justify-between text-lg font-bold text-gray-800 py-2 border-b border-gray-100"
                >
                  International Tours
                  <svg className={`w-4 h-4 transition-transform ${mobileExpanded === 'international' ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
                </button>
                {mobileExpanded === 'international' && (
                  <div className="flex flex-col gap-3 pl-4 border-l-2 border-indigo-100 ml-2 py-2">
                    {internationalDestinations.map((area, idx) => (
                      <div key={idx} className="flex flex-col gap-2">
                        <p className="text-xs font-black text-indigo-400 uppercase tracking-wider mt-1">{area.region}</p>
                        {area.countries.slice(0, 3).map((country, cIdx) => (
                          <button key={cIdx} onClick={() => { setMobileMenuOpen(false); navigate(`/destination/${country.country}`); }} className="text-left text-sm font-semibold text-gray-600 hover:text-indigo-600">
                            {country.country}
                          </button>
                        ))}
                      </div>
                    ))}
                    <button onClick={() => { setMobileMenuOpen(false); navigate('/international'); }} className="text-left text-sm font-bold text-indigo-600 mt-2">
                      View All International &rarr;
                    </button>
                  </div>
                )}

                <button 
                  onClick={() => { setMobileMenuOpen(false); navigate('/best-sellers'); }} 
                  className="flex items-center justify-between text-lg font-bold text-gray-800 py-2 border-b border-gray-100"
                >
                  Best Sellers
                </button>
              </div>
            </div>

            <div className="mt-auto flex flex-col gap-3 pt-4 border-t border-gray-100">
              <button
                onClick={() => { setMobileMenuOpen(false); setCustomTripOpen(true); }}
                className="w-full py-3.5 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg shadow-amber-500/25 active:scale-95 transition-all"
              >
                <span>✨</span> Custom Trip
              </button>
              <button
                id="get-in-touch-btn-mobile"
                onClick={() => { setMobileMenuOpen(false); setContactOpen(true); }}
                className="w-full py-3.5 bg-gradient-to-r from-violet-600 to-indigo-600 text-white rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg shadow-violet-500/25 active:scale-95 transition-all"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
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
