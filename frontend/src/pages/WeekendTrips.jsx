import { useState } from "react";

const WeekendTrips = () => {
  const [fullscreenImg, setFullscreenImg] = useState(null);
  return (
    <section className="py-20 px-6 max-w-4xl mx-auto min-h-screen">
      <h1 className="text-3xl font-black mb-4">Weekend Trips</h1>
      <p className="text-gray-600 mb-8">Discover curated weekend getaways for a quick escape from routine. Handpicked destinations, easy itineraries, and great value for your next short break.</p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-8">
        {trips.map((trip, i) => (
          <div key={i} className="bg-white rounded-3xl shadow-xl hover:shadow-2xl transition-all duration-500 overflow-hidden flex flex-col group cursor-pointer">
            <div className="relative h-48 overflow-hidden">
              <img src={trip.image} alt={trip.title} className="w-full h-full object-cover group-hover:scale-110 transition duration-700" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
              <div className="absolute bottom-3 left-3 bg-white/80 px-3 py-1 rounded-full text-xs font-bold text-violet-700 shadow">Weekend</div>
            </div>
            <div className="p-5 flex-1 flex flex-col justify-between">
              <h2 className="text-xl font-black text-gray-900 mb-2 group-hover:text-violet-600 transition">{trip.title}</h2>
              <p className="text-gray-500 text-sm mb-4 flex-1">{trip.desc}</p>
              <button className="mt-auto px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-full font-bold text-sm transition">View Details</button>
            </div>
          </div>
        ))}
      </div>
      {fullscreenImg && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80" onClick={() => setFullscreenImg(null)}>
          <img src={fullscreenImg} alt="Full screen" className="max-w-3xl max-h-[90vh] rounded-2xl shadow-2xl border-4 border-white cursor-zoom-out" />
          <button className="absolute top-8 right-8 text-white text-3xl font-bold bg-black/60 rounded-full w-12 h-12 flex items-center justify-center hover:bg-black/80 transition" onClick={() => setFullscreenImg(null)}>&times;</button>
        </div>
      )}
    </section>
  );
};

export default WeekendTrips;

const trips = [
  {
    title: "Rishikesh Adventure",
    desc: "White water rafting, camping by the Ganges, and yoga sessions for a rejuvenating weekend.",
    image: "https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=800"
  },
  {
    title: "Goa Beach Escape",
    desc: "Sun, sand, and sea — unwind at Goa’s best beaches with curated nightlife and water sports.",
    image: "https://images.unsplash.com/photo-1467269204594-9661b134dd2b?w=800"
  },
  {
    title: "Jaipur Heritage Walk",
    desc: "Explore the Pink City’s forts, palaces, and vibrant bazaars in a quick royal getaway.",
    image: "https://images.unsplash.com/photo-1502602898657-3e91760cbb34?w=800"
  }
];
