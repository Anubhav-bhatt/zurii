import { useNavigate } from "react-router-dom";
import { bestSellerTrips, badgeColors } from "../data";

const BestSellersPage = () => {
  const navigate = useNavigate();
  return (
    <section className="py-20 px-6 max-w-7xl mx-auto min-h-screen">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-black text-gray-900 mb-2">Best Seller Deals</h1>
        <p className="text-gray-500 text-lg max-w-xl mx-auto">Handpicked trips loved by thousands of travelers. Explore our top-rated, trending, and most-loved adventures — all in one place.</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
        {bestSellerTrips.map((trip) => (
          <div key={trip.id} className="bg-white rounded-3xl shadow-lg border border-gray-100 overflow-hidden flex flex-col">
            <div className="relative h-56 overflow-hidden">
              <img src={trip.image} alt={trip.title} className="w-full h-full object-cover" />
              <span className={`absolute top-4 left-4 px-3 py-1 text-xs font-bold rounded-full text-white bg-gradient-to-r ${badgeColors[trip.badge] || 'from-violet-500 to-indigo-600'}`}>{trip.badge}</span>
            </div>
            <div className="p-6 flex-1 flex flex-col">
              <h2 className="text-xl font-bold text-gray-900 mb-1">{trip.title}</h2>
              <p className="text-sm text-gray-500 mb-2">{trip.location}</p>
              <div className="flex items-center gap-2 text-xs text-yellow-500 mb-2">
                <span>⭐ {trip.rating}</span>
                <span className="text-gray-400">({trip.reviews} reviews)</span>
              </div>
              <div className="flex items-center gap-3 mb-2">
                <span className="text-violet-600 font-bold text-lg">{trip.price}</span>
                <span className="text-xs text-gray-400 line-through">{trip.originalPrice}</span>
                <span className="text-xs text-emerald-600 font-bold">Save {trip.save}</span>
              </div>
              <div className="text-xs text-gray-400 mb-4">{trip.duration}</div>
              <button
                onClick={() => navigate(`/trip/${trip.id}`)}
                className="mt-auto px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-full font-bold text-sm transition"
              >
                View Details
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};

export default BestSellersPage;
