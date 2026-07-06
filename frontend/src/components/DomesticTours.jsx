import { useNavigate } from "react-router-dom";
import { ScrollFade } from "./ScrollFade";
import { domesticDestinations } from "../data";

const DomesticTours = () => {
  const navigate = useNavigate();

  return (
    <section className="px-6 py-10 md:px-12 md:py-14 max-content bg-gray-50/50 rounded-[32px] my-6 sm:my-10">

      {/* HEADER */}
      <ScrollFade>
        <div className="flex flex-col items-center mb-10 sm:mb-16 text-center">
          <span className="text-violet-600 font-bold text-xs uppercase tracking-[0.2em] mb-3">
            Domestic Getaways
          </span>

          <h2 className="text-fluid-section font-black text-gray-900 mb-4">
            Explore India, State by State
          </h2>

          <div className="w-12 h-1 bg-gradient-to-r from-violet-500 to-indigo-600 rounded-full" />

          <p className="mt-6 text-gray-500 max-w-2xl text-fluid-body font-medium">
            Discover curated travel experiences across India.
          </p>
        </div>
      </ScrollFade>

      {/* CARDS */}
      <div className="flex md:grid md:grid-cols-2 lg:grid-cols-3 gap-8 overflow-x-auto md:overflow-x-visible scrollbar-hide snap-x snap-mandatory px-4 -mx-4 md:px-0 md:mx-0 py-2 h-[420px] md:h-auto">

        {domesticDestinations.map((item, idx) => (
          <ScrollFade key={idx} delay={idx * 50} className="w-[82vw] sm:w-[50vw] md:w-auto shrink-0 snap-center h-[390px] md:h-105">

            <div
              onClick={() => navigate(`/destination/${item.state}`)}
              className="group relative bg-white rounded-3xl overflow-hidden shadow-sm hover:shadow-[0_12px_30px_rgba(0,0,0,0.04)] border border-zinc-200/20 transition-all duration-500 h-full cursor-pointer"
            >

              {/* IMAGE */}
              <div className="absolute inset-0">
                {item.thumbnail ? (
                  <img
                    src={item.thumbnail}
                    loading="lazy"
                    className="w-full h-full object-cover group-hover:scale-104 transition duration-700"
                    alt=""
                  />
                ) : (
                  <div className="w-full h-full bg-linear-to-br from-violet-500 to-indigo-700 flex items-center justify-center">
                    <span className="text-6xl opacity-30">🏔️</span>
                  </div>
                )}

                <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-transparent" />
              </div>

              {/* CONTENT */}
              <div className="absolute inset-0 p-6 flex flex-col justify-end text-white">

                <h3 className="text-2xl font-bold mb-2.5 tracking-tight">
                  {item.state}
                </h3>

                <div className="flex flex-wrap gap-1.5 z-10">
                  {item.tours.slice(0, 4).map((tour) => (
                    <span
                      key={tour.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/trip/${tour.id}`);
                      }}
                      className="text-[10px] font-semibold bg-white/20 hover:bg-white/30 px-2.5 py-1 rounded-full cursor-pointer transition-all duration-200 active:scale-95 border border-white/10"
                    >
                      {tour.name}
                    </span>
                  ))}
                </div>

              </div>

              {/* TRENDING TAG */}
              {idx < 2 && (
                <div className="absolute top-4 right-4 bg-rose-500 text-white text-[9px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full shadow-xs">
                  Trending
                </div>
              )}

            </div>

          </ScrollFade>
        ))}

      </div>

      {/* CTA */}
      <div className="mt-12 sm:mt-16 flex justify-center">
        <button 
          onClick={() => navigate('/all-domestic-destinations')}
          className="touch-target px-8 py-4 bg-gray-900 text-white rounded-2xl hover:bg-violet-600 transition-colors duration-300 font-semibold"
        >
          View All Domestic Trips
        </button>
      </div>

    </section>
  );
};

export default DomesticTours;
