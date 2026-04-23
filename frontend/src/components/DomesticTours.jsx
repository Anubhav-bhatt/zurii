import { useNavigate } from "react-router-dom";
import { ScrollFade } from "./ScrollFade";
import { domesticDestinations } from "../data";

const DomesticTours = () => {
  const navigate = useNavigate();

  return (
    <section className="py-16 px-6 max-w-7xl mx-auto bg-gray-50/50 rounded-[50px] my-10">

      {/* HEADER */}
      <ScrollFade>
        <div className="flex flex-col items-center mb-16 text-center">
          <span className="text-violet-600 font-bold text-xs uppercase tracking-[0.2em] mb-3">
            Domestic Getaways
          </span>

          <h2 className="text-4xl font-black text-gray-900 mb-4">
            Explore India, State by State
          </h2>

          <div className="w-12 h-1 bg-linear-to-r from-violet-500 to-indigo-600 rounded-full" />

          <p className="mt-6 text-gray-500 max-w-2xl text-lg font-medium">
            Discover curated travel experiences across India.
          </p>
        </div>
      </ScrollFade>

      {/* CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">

        {domesticDestinations.map((item, idx) => (
          <ScrollFade key={idx} delay={idx * 50}>

            <div
              onClick={() => navigate(`/destination/${item.state}`)}
              className="group relative bg-white rounded-[40px] overflow-hidden shadow-xl hover:shadow-2xl transition-all duration-500 h-105 cursor-pointer"
            >

              {/* IMAGE */}
              <div className="absolute inset-0">
                {item.thumbnail ? (
                  <img
                    src={item.thumbnail}
                    className="w-full h-full object-cover group-hover:scale-110 transition duration-700"
                  />
                ) : (
                  <div className="w-full h-full bg-linear-to-br from-violet-500 to-indigo-700 flex items-center justify-center">
                    <span className="text-6xl opacity-30">🏔️</span>
                  </div>
                )}

                <div className="absolute inset-0 bg-linear-to-t from-black/90 to-transparent" />
              </div>

              {/* CONTENT */}
              <div className="absolute inset-0 p-6 flex flex-col justify-end text-white">

                <h3 className="text-2xl font-bold mb-2">
                  {item.state}
                </h3>

                <div className="flex flex-wrap gap-2">
                  {item.tours.slice(0, 4).map((tour) => (
                    <span
                      key={tour.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/trip/${tour.id}`);
                      }}
                      className="text-xs bg-white/20 px-2 py-1 rounded cursor-pointer"
                    >
                      {tour.name}
                    </span>
                  ))}
                </div>

              </div>

              {/* TRENDING TAG */}
              {idx < 2 && (
                <div className="absolute top-4 right-4 bg-rose-500 text-white text-xs px-2 py-1 rounded">
                  Trending
                </div>
              )}

            </div>

          </ScrollFade>
        ))}

      </div>

      {/* CTA */}
      <div className="mt-16 flex justify-center">
        <button 
          onClick={() => navigate('/all-domestic-destinations')}
          className="px-8 py-4 bg-gray-900 text-white rounded-xl hover:bg-violet-600 transition-colors"
        >
          View All Domestic Trips
        </button>
      </div>

    </section>
  );
};

export default DomesticTours;
