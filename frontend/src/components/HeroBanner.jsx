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
    <section className="pt-20 sm:pt-24 pb-0 section-padding">
      <div className="max-content bg-white rounded-3xl overflow-hidden shadow-[0_8px_30px_rgba(0,0,0,0.04)] border border-zinc-200/40">
        <div ref={sectionRef} className="relative w-full h-[60vh] sm:h-[70vh] md:h-[80vh] lg:h-[85vh] overflow-hidden rounded-3xl">

          {/* Image Slides */}
          {slides.map((slide, index) => (
            <div
              key={slide.id}
              className="absolute inset-0"
              style={{
                opacity: current === index ? 1 : 0,
                transform: current === index ? 'scale(1)' : 'scale(1.06)',
                transition: 'opacity 1600ms cubic-bezier(0.16, 1, 0.3, 1), transform 8000ms cubic-bezier(0.16, 1, 0.3, 1)',
              }}
            >
              <img
                src={slide.image}
                alt={slide.location}
                loading={index === 0 ? 'eager' : 'lazy'}
                className="w-full h-full object-cover"
              />
            </div>
          ))}

          {/* Gradient Overlays */}
          <div className="absolute inset-0 bg-black/35" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />

          {/* Content */}
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6 z-10">
            {/* Location Tag */}
            <div 
              className="mb-5 px-4 py-1.5 bg-white/10 backdrop-blur-md border border-white/20 rounded-full cursor-pointer hover:bg-white/20 transition-all duration-300 active:scale-[0.98]"
              onClick={() => navigate(`/trip/${slides[current].id}`)}
            >
              <p className="text-white text-[10px] font-bold tracking-widest uppercase">
                📍 Now Showing — {slides[current].location}
              </p>
            </div>

            {/* Main Heading */}
            <h1 className="text-fluid-hero font-extrabold text-white tracking-tight max-w-4xl">
              Where every trip ends
              <br />
              <span className="bg-gradient-to-r from-amber-300 via-orange-300 to-rose-300 bg-clip-text text-transparent">
                with a story
              </span>
            </h1>

            {/* Dynamic tagline from current destination */}
            <p className="mt-5 sm:mt-6 text-white text-fluid-body max-w-2xl leading-relaxed tracking-wide font-medium">
              <span className="text-amber-300 font-bold">{slides[current].tagline}</span>
              <span className="text-white/80"> — curated & personalized just for you.</span>
            </p>

            {/* Floating Decorative Glow */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] bg-violet-600/15 blur-[120px] rounded-full z-0 pointer-events-none animate-pulse" />

            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row items-center gap-3 mt-7 sm:mt-9 w-full sm:w-auto px-4 sm:px-0">
              <button 
                onClick={() => navigate(`/trip/${slides[current].id}`)}
                className="touch-target w-full sm:w-auto px-7 py-3.5 bg-gradient-to-r from-violet-500 to-indigo-600 text-white text-xs sm:text-sm font-bold rounded-2xl shadow-lg shadow-violet-500/20 hover:shadow-xl hover:shadow-violet-500/35 hover:brightness-105 active:scale-[0.97] transition-all duration-300"
              >
                Explore This Trip
              </button>
              <button 
                onClick={() => navigate('/all-domestic-destinations')}
                className="touch-target w-full sm:w-auto px-7 py-3.5 bg-white/10 backdrop-blur-md border border-white/20 text-white text-xs sm:text-sm font-bold rounded-2xl hover:bg-white/20 active:scale-[0.97] transition-all duration-300"
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
