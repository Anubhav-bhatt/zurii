const CorporateTours = () => (
  <section className="py-20 px-6 max-w-4xl mx-auto min-h-screen">
    <h1 className="text-3xl font-black mb-4">Corporate Tours</h1>
    <p className="text-gray-600 mb-8">Tailored tours for teams and organizations. Boost morale, foster teamwork, and create lasting memories with our corporate travel solutions.</p>
    <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-8">
      {tours.map((tour, i) => (
        <div key={i} className="bg-white rounded-2xl shadow p-4 flex flex-col items-center">
          <img src={tour.image} alt={tour.title} className="w-full h-40 object-cover rounded-xl mb-4" />
          <h2 className="text-lg font-bold mb-2">{tour.title}</h2>
          <p className="text-gray-500 text-sm mb-2 text-center">{tour.desc}</p>
        </div>
      ))}
    </div>
  </section>
);

export default CorporateTours;

const tours = [
  {
    title: "Team Building in Manali",
    desc: "Adventure activities, bonfire nights, and leadership workshops in the Himalayas.",
    image: "https://images.unsplash.com/photo-1464013778555-8e723c2f01f8?w=800"
  },
  {
    title: "Goa Offsite Retreat",
    desc: "Beachside resorts, strategy sessions, and water sports for your corporate team.",
    image: "https://images.unsplash.com/photo-1512453979798-5ea266f8880c?w=800"
  },
  {
    title: "Jaipur Heritage Conference",
    desc: "Palace venues, cultural evenings, and guided city tours for a memorable business event.",
    image: "https://images.unsplash.com/photo-1531366936337-7c912a4589a7?w=800"
  }
];
