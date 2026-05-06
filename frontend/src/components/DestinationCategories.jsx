import { ScrollFade } from "./ScrollFade";
import { useNavigate } from "react-router-dom";
import { categories } from "../data";

const DestinationCategories = () => {
  const navigate = useNavigate();

  return (
    <section className="py-10 px-6 max-w-7xl mx-auto">

      {/* HEADER */}
      <ScrollFade>
        <div className="flex flex-col items-center mb-12 text-center">
          <span className="text-violet-600 font-bold text-xs uppercase tracking-[0.2em] mb-3">
            Explore Categories
          </span>

          <h2 className="text-4xl font-black text-gray-900 mb-4">
            Choose Your Vibe
          </h2>

          <div className="w-12 h-1 bg-gradient-to-r from-violet-500 to-indigo-600 rounded-full" />
        </div>
      </ScrollFade>

      {/* GRID */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 auto-rows-[250px]">

        {categories.map((cat) => (
          <ScrollFade key={cat.id} className={cat.span}>

            <div
              onClick={() => navigate(`/explore/${cat.title.toLowerCase().replace(/\s+/g, "-")}`)}
              className="group relative w-full h-full rounded-[32px] overflow-hidden cursor-pointer shadow-xl hover:shadow-2xl transition-all duration-500"
            >

              {/* IMAGE */}
              <img
                src={cat.image}
                alt={cat.title}
                className="absolute inset-0 w-full h-full object-cover group-hover:scale-110 transition duration-1000"
              />

              {/* OVERLAY */}
              <div className={`absolute inset-0 bg-gradient-to-br ${cat.gradient} opacity-40 group-hover:opacity-60 transition`} />

              {/* CONTENT */}
              <div className="absolute inset-x-4 bottom-4 p-6 bg-white/10 backdrop-blur-xl border border-white/20 rounded-[24px]">

                <span className="text-white/70 text-[10px] uppercase font-bold">
                  {cat.subtitle}
                </span>

                <h3 className="text-2xl font-black text-white">
                  {cat.title}
                </h3>

                {/* ITEMS */}
                <div className="flex flex-wrap gap-2 mt-3 opacity-0 group-hover:opacity-100 transition">
                  {cat.items.map((item, i) => (
                    <span
                      key={i}
                      className="px-3 py-1 bg-white/20 rounded-full text-[10px] text-white"
                    >
                      {item}
                    </span>
                  ))}
                </div>

                {/* ARROW */}
                <div className="absolute top-4 right-4 w-10 h-10 bg-white rounded-full flex items-center justify-center group-hover:bg-violet-500 transition">
                  →
                </div>

              </div>
            </div>

          </ScrollFade>
        ))}

      </div>

    </section>
  );
};

export default DestinationCategories;
