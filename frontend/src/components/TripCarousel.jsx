import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { carouselTrips as trips } from "../data";
import GetQuoteModal from "./GetQuoteModal";
import TravelCard from "./TravelCard";

const CARD_WIDTH = 320;
const GAP = 24;

const TripCarousel = () => {
  const [currentIndex, setCurrentIndex] = useState(Math.floor(trips.length / 2));
  const [isAutoPlaying, setIsAutoPlaying] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const trackRef = useRef(null);
  const navigate = useNavigate();
  const [quoteTrip, setQuoteTrip] = useState(null);

  // Detect mobile viewport
  useEffect(() => {
    const checkViewport = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkViewport();
    window.addEventListener("resize", checkViewport);
    return () => window.removeEventListener("resize", checkViewport);
  }, []);

  // Auto play — cycles through all cards continuously (only on desktop)
  useEffect(() => {
    if (!isAutoPlaying || isMobile) return;
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % trips.length);
    }, 3000);
    return () => clearInterval(interval);
  }, [isAutoPlaying, isMobile]);

  const goTo = useCallback((index) => {
    setCurrentIndex(index);
    setIsAutoPlaying(false);
    if (isMobile && trackRef.current) {
      const activeChild = trackRef.current.children[index];
      if (activeChild) {
        const scrollAmount = activeChild.offsetLeft - (trackRef.current.offsetWidth - activeChild.offsetWidth) / 2;
        trackRef.current.scrollTo({ left: scrollAmount, behavior: "smooth" });
      }
    }
    setTimeout(() => setIsAutoPlaying(true), 6000);
  }, [isMobile]);

  const handlePrev = useCallback(() => {
    setIsAutoPlaying(false);
    setCurrentIndex((prev) => (prev - 1 + trips.length) % trips.length);
    setTimeout(() => setIsAutoPlaying(true), 6000);
  }, []);

  const handleNext = useCallback(() => {
    setIsAutoPlaying(false);
    setCurrentIndex((prev) => (prev + 1) % trips.length);
    setTimeout(() => setIsAutoPlaying(true), 6000);
  }, []);

  // Calculate the translateX so the active card is always centered
  const getTranslateX = () => {
    return -(currentIndex * (CARD_WIDTH + GAP));
  };

  // Scroll handler for mobile to update dots dynamically
  const handleScroll = (e) => {
    if (!isMobile) return;
    const scrollLeft = e.target.scrollLeft;
    const containerWidth = e.target.offsetWidth;
    const children = e.target.children;
    
    let closestIndex = 0;
    let minDistance = Infinity;
    
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      const childCenter = child.offsetLeft + child.offsetWidth / 2;
      const containerCenter = scrollLeft + containerWidth / 2;
      const distance = Math.abs(childCenter - containerCenter);
      
      if (distance < minDistance) {
        minDistance = distance;
        closestIndex = i;
      }
    }
    
    if (closestIndex !== currentIndex) {
      setCurrentIndex(closestIndex);
    }
  };

  return (
    <section className="section-gap overflow-hidden relative bg-white">
      
      {/* HEADER */}
      <div className="text-center mb-10 sm:mb-16 max-content section-padding">
        <span className="text-violet-600 font-bold text-xs uppercase tracking-[0.25em] mb-3 block">
          Curated Deals
        </span>
        <h2 className="text-fluid-section font-black text-zinc-950 tracking-tight">
          Trending Trips ✈️
        </h2>
        <p className="text-zinc-500 text-fluid-body mt-3 max-w-md mx-auto leading-relaxed">
          Discover handpicked luxury packages and experiences loved by global adventurers.
        </p>
      </div>

      {/* CAROUSEL WRAPPER WITH HOVER SIDES */}
      <div 
        className="relative max-content section-padding group/carousel"
        onMouseEnter={() => setIsAutoPlaying(false)}
        onMouseLeave={() => setIsAutoPlaying(true)}
      >
        
        {/* Soft vignetting fades at edges (desktop only) */}
        <div className="absolute left-0 top-0 bottom-0 w-32 bg-gradient-to-r from-white to-transparent pointer-events-none z-10 hidden md:block" />
        <div className="absolute right-0 top-0 bottom-0 w-32 bg-gradient-to-l from-white to-transparent pointer-events-none z-10 hidden md:block" />

        {/* Side Chevrons Navigation */}
        <button
          onClick={handlePrev}
          className="touch-target absolute left-4 sm:left-8 top-1/2 -translate-y-1/2 z-20 w-11 h-11 rounded-full bg-white/90 backdrop-blur-md border border-zinc-200/50 hover:bg-white text-zinc-700 hover:text-zinc-950 flex items-center justify-center shadow-md active:scale-95 opacity-0 group-hover/carousel:opacity-100 transition-all duration-300 hidden md:flex"
          aria-label="Previous Slide"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>

        <button
          onClick={handleNext}
          className="touch-target absolute right-4 sm:right-8 top-1/2 -translate-y-1/2 z-20 w-11 h-11 rounded-full bg-white/90 backdrop-blur-md border border-zinc-200/50 hover:bg-white text-zinc-700 hover:text-zinc-950 flex items-center justify-center shadow-md active:scale-95 opacity-0 group-hover/carousel:opacity-100 transition-all duration-300 hidden md:flex"
          aria-label="Next Slide"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>

        {/* Dynamic sliding track */}
        <div className="overflow-hidden py-4 -mx-8 px-8 md:-mx-6 md:px-6">
          <div
            ref={trackRef}
            onScroll={handleScroll}
            className={`flex gap-5 sm:gap-6 scroll-smooth pb-4 ${
              isMobile 
                ? "overflow-x-auto snap-x snap-mandatory scrollbar-hide px-6" 
                : "transition-transform duration-700 ease-[cubic-bezier(0.16,1,0.3,1)]"
            }`}
            style={
              !isMobile
                ? {
                    transform: `translateX(calc(50% - ${CARD_WIDTH / 2}px + ${getTranslateX()}px))`,
                  }
                : undefined
            }
          >
            {trips.map((trip, index) => {
              const isActive = currentIndex === index;

              return (
                <div
                  key={trip.id}
                  className={`w-[75vw] sm:w-[300px] md:w-[320px] shrink-0 transition-all duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] cursor-pointer snap-center ${
                    isActive 
                      ? "scale-100 opacity-100" 
                      : isMobile 
                        ? "scale-95 opacity-70" 
                        : "scale-92 opacity-45 hover:opacity-60"
                  }`}
                  onClick={() => {
                    goTo(index);
                    if (isActive || isMobile) navigate(`/trip/${trip.id}`);
                  }}
                >
                  <TravelCard
                    trip={trip}
                    onGetQuote={setQuoteTrip}
                  />
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* DOT INDICATORS */}
      <div className="flex justify-center gap-1.5 mt-8">
        {trips.map((_, index) => (
          <button
            key={index}
            onClick={() => goTo(index)}
            className={`h-1.5 rounded-full transition-all duration-300 ${
              currentIndex === index
                ? "bg-violet-600 w-6"
                : "bg-gray-200 hover:bg-gray-300"
            }`}
            aria-label={`Go to slide ${index + 1}`}
          />
        ))}
      </div>

      {/* Get Quote Modal */}
      <GetQuoteModal
        isOpen={!!quoteTrip}
        onClose={() => setQuoteTrip(null)}
        tripName={quoteTrip?.title || ""}
      />
    </section>
  );
};

export default TripCarousel;
