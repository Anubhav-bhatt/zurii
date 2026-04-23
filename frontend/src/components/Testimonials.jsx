import { useState, useEffect } from "react";
import { ScrollFade } from "./ScrollFade";
import { testimonials } from "../data";

const Testimonials = () => {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  // Auto slide
  useEffect(() => {
    if (paused) return;

    const timer = setInterval(() => {
      setIndex((prev) => (prev + 1) % testimonials.length);
    }, 4000);

    return () => clearInterval(timer);
  }, [paused]);

  return (
    <section className="py-16 px-6 max-w-7xl mx-auto overflow-hidden">

      {/* HEADER */}
      <ScrollFade>
        <div className="flex flex-col items-center mb-16 text-center">
          <span className="text-violet-600 text-xs font-bold uppercase tracking-widest">
            Social Proof
          </span>

          <h2 className="text-4xl font-black text-gray-900 mt-2">
            What Our Travelers Say
          </h2>

          <div className="flex items-center gap-1 mt-2">
            {[...Array(5)].map((_, i) => (
              <span key={i}>⭐</span>
            ))}
            <span className="text-sm text-gray-400 ml-2">
              4.9/5 Reviews
            </span>
          </div>
        </div>
      </ScrollFade>

      {/* SLIDER */}
      <div
        className="relative max-w-4xl mx-auto"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
      >

        <div
          className="flex transition-transform duration-700"
          style={{ transform: `translateX(-${index * 100}%)` }}
        >
          {testimonials.map((t) => (
            <div key={t.id} className="min-w-full px-4">
              <div className="bg-white p-10 rounded-3xl shadow-xl text-center">

                <img
                  src={t.image}
                  className="w-20 h-20 rounded-full mx-auto mb-4"
                />

                <p className="text-lg italic mb-6">
                  "{t.text}"
                </p>

                <h4 className="font-bold">{t.name}</h4>
                <p className="text-sm text-violet-500">{t.city}</p>

              </div>
            </div>
          ))}
        </div>

        {/* DOTS */}
        <div className="flex justify-center gap-3 mt-6">
          {testimonials.map((_, i) => (
            <button
              key={i}
              onClick={() => setIndex(i)}
              className={`h-3 rounded-full transition-all ${
                index === i
                  ? "w-8 bg-violet-600"
                  : "w-3 bg-gray-300"
              }`}
            />
          ))}
        </div>

      </div>
    </section>
  );
};

export default Testimonials;
