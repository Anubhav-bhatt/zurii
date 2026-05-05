import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { tripDetails } from '../data';

// Pick a curated set of diverse destinations for the hero
const HERO_TRIP_IDS = [
  'kashmir-paradise',
  'bali',
  'santorini',
  'spiti-valley',
  'swiss-alps',
  'dubai-luxury',
  'kerala-backwaters',
];

const HeroBanner = () => {
  const [current, setCurrent] = useState(0);
  const sectionRef = useRef(null);
  const navigate = useNavigate();

  // Build slides from real destination data
  const slides = useMemo(() => {
    return HERO_TRIP_IDS
      .map((id) => {
        const trip = tripDetails[id];
        if (!trip || !trip.heroImage) return null;
        return {
          id,
          image: trip.heroImage.includes('?') ? trip.heroImage : trip.heroImage + '?q=80&w=2000&auto=format&fit=crop',
          location: trip.title,
          tagline: trip.tagline,
        };
      })
      .filter(Boolean);
  }, []);

  // Auto-rotate slides
  useEffect(() => {
    if (slides.length === 0) return;
    const timer = setInterval(() => {
      setCurrent((prev) => (prev + 1) % slides.length);
    }, 5000);
    return () => clearInterval(timer);
  }, [slides.length]);

  if (slides.length === 0) return null;

  return (
    <section className="pt-24 pb-0 px-4 sm:px-6">
      <div className="max-w-7xl mx-auto bg-white rounded-3xl overflow-hidden shadow-xl shadow-black/5 border border-gray-100/50">
        <div ref={sectionRef} className="relative w-full h-[70vh] sm:h-[85vh] overflow-hidden rounded-3xl">

          {/* Image Slides */}
          {slides.map((slide, index) => (
            <div
              key={slide.id}
              className="absolute inset-0 transition-all duration-1200 ease-in-out"
              style={{
                opacity: current === index ? 1 : 0,
                transform: current === index ? 'scale(1)' : 'scale(1.08)',
              }}
            >
              <img
                src={slide.image}
                alt={slide.location}
                className="w-full h-full object-cover"
              />
            </div>
          ))}

          {/* Gradient Overlays */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-black/10" />
          <div className="absolute inset-0 bg-gradient-to-r from-black/30 to-transparent" />

          {/* Content */}
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6">
            {/* Location Tag */}
            <div 
              className="mb-4 px-4 py-1.5 bg-white/15 backdrop-blur-md border border-white/20 rounded-full cursor-pointer hover:bg-white/25 transition-all"
              onClick={() => navigate(`/trip/${slides[current].id}`)}
            >
              <p className="text-white/90 text-xs font-medium tracking-wider uppercase">
                📍 Now Showing — {slides[current].location}
              </p>
            </div>

            {/* Main Heading */}
            <h1 className="text-3xl sm:text-5xl md:text-6xl lg:text-7xl font-black text-white leading-[1.1] tracking-tight max-w-4xl">
              Where every trip ends
              <br />
              <span className="bg-gradient-to-r from-amber-300 via-orange-300 to-rose-300 bg-clip-text text-transparent">
                with a story
              </span>
            </h1>

            {/* Dynamic tagline from current destination */}
            <p className="mt-6 text-white text-sm sm:text-base md:text-xl max-w-2xl leading-relaxed tracking-wide font-medium drop-shadow-[0_2px_8px_rgba(0,0,0,0.5)]">
              <span className="text-amber-300 font-bold">{slides[current].tagline}</span>
              <span className="text-white/70"> — curated & personalized just for you.</span>
            </p>

            {/* Floating Decorative Glow */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] bg-violet-600/20 blur-[120px] rounded-full z-0 pointer-events-none animate-pulse" />

            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row items-center gap-3 mt-8 w-full sm:w-auto px-4 sm:px-0">
              <button 
                onClick={() => navigate(`/trip/${slides[current].id}`)}
                className="w-full sm:w-auto px-6 py-3 bg-gradient-to-r from-violet-500 to-indigo-600 text-white text-sm font-semibold rounded-[14px] shadow-xl shadow-violet-500/30 hover:shadow-violet-500/50 hover:brightness-110 active:scale-[0.97] transition-all duration-200"
              >
                Explore This Trip
              </button>
              <button 
                onClick={() => navigate('/all-domestic-destinations')}
                className="w-full sm:w-auto px-6 py-3 bg-white/15 backdrop-blur-md border border-white/25 text-white text-sm font-semibold rounded-[14px] hover:bg-white/25 transition-all duration-200"
              >
                View All Destinations
              </button>
            </div>
          </div>

          {/* Slide Indicators */}
          <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-2">
            {slides.map((_, index) => (
              <button
                key={index}
                onClick={() => setCurrent(index)}
                className={`h-1.5 rounded-full transition-all duration-500 ${
                  current === index
                    ? 'w-8 bg-white'
                    : 'w-2 bg-white/40 hover:bg-white/60'
                }`}
              />
            ))}
          </div>

        </div>
      </div>
    </section>
  );
};

export default HeroBanner;
