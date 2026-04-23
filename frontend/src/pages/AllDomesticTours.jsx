import { useNavigate } from "react-router-dom";
import { domesticDestinations } from "../data";

const AllDomesticDestinations = () => {
  const navigate = useNavigate();
  return (
    <section className="py-20 px-6 max-w-7xl mx-auto min-h-screen">
      <h1 className="text-4xl font-black text-gray-900 mb-2">All Domestic Destinations</h1>
      <p className="text-gray-500 text-lg max-w-2xl mb-10">Browse all Indian destinations we offer. Click any destination to see its tours and details.</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-8">
        {domesticDestinations.map((dest, i) => (
          <div key={i} className="bg-white rounded-3xl shadow-xl hover:shadow-2xl transition-all duration-500 overflow-hidden flex flex-col group cursor-pointer">
            <div className="relative h-40 overflow-hidden" onClick={() => navigate(`/destination/${dest.state}`)}>
              <img src={dest.thumbnail || "https://images.unsplash.com/photo-1464013778555-8e723c2f01f8?w=800"} alt={dest.state} className="w-full h-full object-cover group-hover:scale-110 transition duration-700" />
              <div className="absolute bottom-2 left-2 bg-white/80 px-3 py-1 rounded-full text-xs font-bold text-violet-700 shadow">{dest.state}</div>
            </div>
            <div className="p-5 flex-1 flex flex-col justify-between">
              <h2 className="text-lg font-bold text-gray-900 mb-1 group-hover:text-violet-600 transition">{dest.state}</h2>
              <p className="text-gray-500 text-xs mb-2 flex-1">{dest.about ? dest.about.substring(0, 100) + "..." : "A wonderful experience awaits you."}</p>
              <div className="flex flex-col gap-2 mt-2">
                {(dest.tours || []).map((tour, idx) => (
                  <button
                    key={idx}
                    className="w-full px-3 py-2 bg-violet-50 hover:bg-violet-100 text-violet-700 rounded-lg text-xs font-bold text-left transition border border-violet-100 hover:border-violet-300"
                    onClick={() => navigate(tour.id ? `/trip/${tour.id}` : `/destination/${dest.state}`)}
                  >
                    {tour.name}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};

export default AllDomesticDestinations;
