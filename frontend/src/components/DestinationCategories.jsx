import { ScrollFade } from "./ScrollFade";
import { useNavigate } from "react-router-dom";
import { categories } from "../data";

const DestinationCategories = () => {
  const navigate = useNavigate();

  return (
    <section className="section-gap section-padding max-content">

      {/* HEADER */}
      <ScrollFade>
        <div className="flex flex-col items-center mb-10 sm:mb-12 text-center">
          <span className="text-violet-600 font-bold text-xs uppercase tracking-[0.2em] mb-3">
            Explore Categories
          </span>

          <h2 className="text-fluid-section font-black text-gray-900 mb-4">
            Choose Your Vibe
          </h2>

          <div className="w-12 h-1 bg-gradient-to-r from-violet-500 to-indigo-600 rounded-full" />
        </div>
      </ScrollFade>

      {/* GRID */}
      <div className="flex md:grid md:grid-cols-3 gap-6 overflow-x-auto md:overflow-x-visible scrollbar-hide snap-x snap-mandatory px-4 -mx-4 md:px-0 md:mx-0 py-2 h-[310px] md:h-auto md:auto-rows-[250px]">

        {categories.map((cat) => (
          <ScrollFade key={cat.id} className={`${cat.span || ""} w-[82vw] sm:w-[50vw] md:w-auto shrink-0 snap-center h-[280px] md:h-full`}>

            <div
              onClick={() => navigate(`/explore/${cat.title.toLowerCase().replace(/\s+/g, "-")}`)}
              className="group relative w-full h-full rounded-[28px] overflow-hidden cursor-pointer shadow-sm hover:shadow-[0_12px_30px_rgba(0,0,0,0.04)] border border-zinc-200/20 transition-all duration-500"
            >

              {/* IMAGE */}
              <img
                src={cat.image}
                alt={cat.title}
                className="absolute inset-0 w-full h-full object-cover group-hover:scale-104 transition duration-1000"
              />

              {/* OVERLAY */}
              <div className={`absolute inset-0 bg-gradient-to-br ${cat.gradient} opacity-30 group-hover:opacity-50 transition`} />

              {/* CONTENT */}
              <div className="absolute inset-x-4 bottom-4 p-5 bg-white/10 backdrop-blur-xl border border-white/20 rounded-[20px] transition-premium">

                <span className="text-white/80 text-[9px] uppercase font-bold tracking-wider">
                  {cat.subtitle}
                </span>

                <h3 className="text-xl font-bold text-white leading-tight mt-0.5">
                  {cat.title}
                </h3>

                {/* ITEMS */}
                <div className="flex flex-wrap gap-1.5 mt-2.5 opacity-0 group-hover:opacity-100 transition duration-300">
                  {cat.items.map((item, i) => (
                    <span
                      key={i}
                      className="px-2.5 py-0.5 bg-white/20 rounded-full text-[9px] text-white font-medium"
                    >
                      {item}
                    </span>
                  ))}
                </div>

                {/* ARROW */}
                <div className="absolute top-4 right-4 w-9 h-9 bg-white rounded-full flex items-center justify-center text-zinc-800 font-bold group-hover:bg-violet-500 group-hover:text-white transition duration-300 text-sm">
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
