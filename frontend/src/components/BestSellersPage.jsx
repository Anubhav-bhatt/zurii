import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { bestSellerTrips } from "../data";
import GetQuoteModal from "./GetQuoteModal";
import TravelCard from "./TravelCard";

const BestSellersPage = () => {
  const navigate = useNavigate();
  const [quoteTrip, setQuoteTrip] = useState(null);
  return (
    <section className="py-20 px-6 max-w-7xl mx-auto min-h-screen">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-black text-gray-900 mb-2">Best Seller Deals</h1>
        <p className="text-gray-500 text-lg max-w-xl mx-auto">Handpicked trips loved by thousands of travelers. Explore our top-rated, trending, and most-loved adventures — all in one place.</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
        {bestSellerTrips.map((trip) => (
          <TravelCard
            key={trip.id}
            trip={trip}
            onGetQuote={setQuoteTrip}
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

export default BestSellersPage;
