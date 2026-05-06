import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { carouselTrips as trips } from "../data";
import GetQuoteModal from "./GetQuoteModal";

const CARD_WIDTH = 300;
const GAP = 24;

const TripCarousel = () => {
  const [currentIndex, setCurrentIndex] = useState(Math.floor(trips.length / 2));
  const [isAutoPlaying, setIsAutoPlaying] = useState(true);
  const trackRef = useRef(null);
  const navigate = useNavigate();
  const [quoteTrip, setQuoteTrip] = useState(null);

  // Auto play — cycles through all cards continuously
  useEffect(() => {
    if (!isAutoPlaying) return;
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % trips.length);
    }, 1500);
    return () => clearInterval(interval);
  }, [isAutoPlaying]);

  const goTo = useCallback((index) => {
    setCurrentIndex(index);
    setIsAutoPlaying(false);
    setTimeout(() => setIsAutoPlaying(true), 5000);
  }, []);

  // Calculate the translateX so the active card is always centered
  const getTranslateX = () => {
    return -(currentIndex * (CARD_WIDTH + GAP));
  };

  return (
    <section className="pt-10 pb-16 px-6">

      {/* HEADER */}
      <div className="text-center mb-10">
        <h2 className="text-3xl font-bold">Trending Trips ✈️</h2>
        <p className="text-gray-400 text-sm mt-2">
          Discover popular destinations
        </p>
      </div>

      {/* CAROUSEL */}
      <div
        className="overflow-hidden"
        onMouseEnter={() => setIsAutoPlaying(false)}
        onMouseLeave={() => setIsAutoPlaying(true)}
      >
        <div
          ref={trackRef}
          className="flex gap-6 transition-transform duration-700 ease-in-out"
          style={{
            transform: `translateX(calc(50% - ${CARD_WIDTH / 2}px + ${getTranslateX()}px))`,
          }}
        >
          {trips.map((trip, index) => {
            const isActive = currentIndex === index;

            return (
              <div
                key={trip.id}
                onClick={() => {
                  goTo(index);
                  if (isActive) navigate(`/trip/${trip.id}`);
                }}
                className={`w-[300px] shrink-0 transition-all duration-500 cursor-pointer ${
                  isActive ? "scale-105 opacity-100" : "scale-90 opacity-50"
                }`}
              >
                <div className="bg-white rounded-3xl overflow-hidden shadow-lg">

                  <img
                    src={trip.image}
                    className="h-60 w-full object-cover"
                  />

                  <div className="p-4">
                    <span className="text-xs text-violet-500">
                      {trip.duration}
                    </span>

                    <h3 className="font-bold text-lg mt-1">
                      {trip.title}
                    </h3>

                    <p className="text-sm text-gray-500">
                      {trip.subtitle}
                    </p>

                    <div className="mt-3 flex justify-between items-center">
                      <span className="font-bold">
                        {trip.price}
                      </span>
                      ⭐ {trip.rating}
                    </div>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setQuoteTrip(trip);
                      }}
                      className="mt-3 w-full py-2 bg-gradient-to-r from-emerald-500 to-teal-600 text-white text-xs font-bold rounded-full hover:brightness-110 active:scale-[0.97] transition-all shadow-md shadow-emerald-500/20"
                    >
                      💰 Get Quote
                    </button>
                  </div>

                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* DOTS */}
      <div className="flex justify-center gap-2 mt-6">
        {trips.map((_, index) => (
          <button
            key={index}
            onClick={() => goTo(index)}
            className={`w-2 h-2 rounded-full transition-all duration-300 ${
              currentIndex === index
                ? "bg-violet-600 w-6"
                : "bg-gray-300 hover:bg-gray-400"
            }`}
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
