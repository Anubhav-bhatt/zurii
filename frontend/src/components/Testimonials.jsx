import { useState, useEffect, useRef } from "react";
import { ScrollFade } from "./ScrollFade";
import { testimonials } from "../data";

const StarRating = ({ rating }) => (
  <div className="flex items-center gap-0.5">
    {[...Array(rating)].map((_, i) => (
      <svg key={i} className="w-4 h-4 text-amber-400" fill="currentColor" viewBox="0 0 20 20">
        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
      </svg>
    ))}
  </div>
);

const TestimonialCard = ({ t, featured = false }) => (
  <div
    className={`group relative rounded-2xl border transition-all duration-500 hover:-translate-y-1 ${
      featured
        ? "bg-gradient-to-br from-violet-600 via-indigo-600 to-purple-700 border-violet-500/30 shadow-xl shadow-violet-500/20 text-white p-8"
        : "bg-white border-gray-100 shadow-md hover:shadow-xl hover:border-violet-200/60 p-6"
    }`}
  >
    {/* Decorative corner accent */}
    {featured && (
      <div className="absolute top-0 right-0 w-24 h-24 overflow-hidden rounded-tr-2xl">
        <div className="absolute top-3 right-3 w-16 h-16 bg-white/10 rounded-full blur-xl" />
      </div>
    )}

    {/* Quote icon */}
    <div className={`mb-4 ${featured ? "text-white/30" : "text-violet-200"}`}>
      <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24">
        <path d="M14.017 21v-7.391c0-5.704 3.731-9.57 8.983-10.609l.995 2.151c-2.432.917-3.995 3.638-3.995 5.849h4v10H14.017zM0 21v-7.391c0-5.704 3.731-9.57 8.983-10.609l.995 2.151C7.546 6.068 5.983 8.789 5.983 11H10v10H0z" />
      </svg>
    </div>

    {/* Stars */}
    <div className="mb-3">
      <StarRating rating={t.rating} />
    </div>

    {/* Review text */}
    <p className={`text-sm leading-relaxed mb-5 ${
      featured ? "text-white/90" : "text-gray-600"
    }`}>
      "{t.text}"
    </p>

    {/* Divider */}
    <div className={`h-px mb-4 ${featured ? "bg-white/20" : "bg-gray-100"}`} />

    {/* Author */}
    <div className="flex items-center gap-3">
      <div className={`relative w-11 h-11 rounded-full overflow-hidden ring-2 ${
        featured ? "ring-white/30" : "ring-violet-100"
      }`}>
        <img src={t.image} alt={t.name} className="w-full h-full object-cover" />
      </div>
      <div className="flex-1 min-w-0">
        <h4 className={`font-semibold text-sm ${featured ? "text-white" : "text-gray-900"}`}>
          {t.name}
        </h4>
        <p className={`text-xs ${featured ? "text-white/60" : "text-gray-400"}`}>
          {t.city}
        </p>
      </div>
      {t.trip && (
        <span className={`shrink-0 text-xs px-2.5 py-1 rounded-full font-medium ${
          featured
            ? "bg-white/15 text-white/90"
            : "bg-violet-50 text-violet-600"
        }`}>
          {t.trip}
        </span>
      )}
    </div>
  </div>
);

const Testimonials = () => {
  const scrollRef = useRef(null);
  const [activeSlide, setActiveSlide] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  // Split testimonials into columns for masonry
  const col1 = testimonials.filter((_, i) => i % 3 === 0);
  const col2 = testimonials.filter((_, i) => i % 3 === 1);
  const col3 = testimonials.filter((_, i) => i % 3 === 2);

  // Mobile auto-slide
  useEffect(() => {
    if (isPaused) return;
    const timer = setInterval(() => {
      setActiveSlide((prev) => (prev + 1) % testimonials.length);
    }, 4500);
    return () => clearInterval(timer);
  }, [isPaused]);

  return (
    <section className="py-20 px-6 overflow-hidden relative">
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-b from-gray-50/50 via-white to-gray-50/50 pointer-events-none" />
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-20 left-1/4 w-96 h-96 bg-violet-100/40 rounded-full blur-3xl" />
        <div className="absolute bottom-20 right-1/4 w-80 h-80 bg-indigo-100/30 rounded-full blur-3xl" />
      </div>

      <div className="max-w-6xl mx-auto relative">
        {/* HEADER */}
        <ScrollFade>
          <div className="flex flex-col items-center mb-16 text-center">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-gradient-to-r from-violet-50 to-indigo-50 border border-violet-200/50 mb-5 shadow-sm">
              <div className="flex -space-x-1.5">
                {testimonials.slice(0, 4).map((t, i) => (
                  <img
                    key={i}
                    src={t.image}
                    alt=""
                    className="w-5 h-5 rounded-full ring-2 ring-white"
                  />
                ))}
              </div>
              <span className="text-violet-600 text-xs font-bold uppercase tracking-wider">
                10,000+ Happy Travelers
              </span>
            </div>

            <h2 className="text-4xl md:text-5xl font-black text-gray-900 tracking-tight">
              Loved by Travelers
              <span className="block text-transparent bg-clip-text bg-gradient-to-r from-violet-600 to-indigo-600 mt-1">
                Across India & Beyond
              </span>
            </h2>

            <p className="text-gray-500 mt-4 max-w-md text-base leading-relaxed">
              Real stories from families, couples, and adventurers who trusted Zurii with their dream trips.
            </p>

            {/* Stats strip */}
            <div className="flex items-center gap-6 mt-6">
              <div className="flex items-center gap-1.5">
                <div className="flex items-center gap-0.5">
                  {[...Array(5)].map((_, i) => (
                    <svg key={i} className="w-4 h-4 text-amber-400" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                  ))}
                </div>
                <span className="text-sm font-bold text-gray-700">4.9</span>
              </div>
              <div className="w-px h-4 bg-gray-200" />
              <span className="text-sm text-gray-500"><strong className="text-gray-700">2,400+</strong> Reviews</span>
              <div className="w-px h-4 bg-gray-200 hidden sm:block" />
              <span className="text-sm text-gray-500 hidden sm:block"><strong className="text-gray-700">50+</strong> Destinations</span>
            </div>
          </div>
        </ScrollFade>

        {/* DESKTOP — Masonry Grid */}
        <div className="hidden md:grid md:grid-cols-3 gap-5">
          <div className="space-y-5">
            {col1.map((t, i) => (
              <TestimonialCard key={t.id} t={t} featured={i === 0} />
            ))}
          </div>
          <div className="space-y-5 mt-8">
            {col2.map((t, i) => (
              <TestimonialCard key={t.id} t={t} featured={i === 1} />
            ))}
          </div>
          <div className="space-y-5 mt-3">
            {col3.map((t) => (
              <TestimonialCard key={t.id} t={t} />
            ))}
          </div>
        </div>

        {/* MOBILE — Swipeable Carousel */}
        <div
          className="md:hidden"
          onMouseEnter={() => setIsPaused(true)}
          onMouseLeave={() => setIsPaused(false)}
        >
          <div className="overflow-hidden rounded-2xl">
            <div
              className="flex transition-transform duration-700 ease-out"
              style={{ transform: `translateX(-${activeSlide * 100}%)` }}
            >
              {testimonials.map((t) => (
                <div key={t.id} className="min-w-full px-1">
                  <TestimonialCard t={t} />
                </div>
              ))}
            </div>
          </div>

          {/* Mobile dots */}
          <div className="flex justify-center gap-1.5 mt-6">
            {testimonials.map((_, i) => (
              <button
                key={i}
                onClick={() => setActiveSlide(i)}
                className={`h-2 rounded-full transition-all duration-300 ${
                  activeSlide === i
                    ? "w-6 bg-gradient-to-r from-violet-500 to-indigo-500"
                    : "w-2 bg-gray-200"
                }`}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default Testimonials;
