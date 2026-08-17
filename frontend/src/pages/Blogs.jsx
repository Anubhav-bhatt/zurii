import { useNavigate } from 'react-router-dom';
import { guides } from '../data';

const Blogs = () => {
  const navigate = useNavigate();
  const featured = guides.find(g => g.featured);
  const rest = guides.filter(g => !g.featured);

  return (
    <section className="min-h-screen bg-gray-50 dark:bg-zinc-950 pt-28 pb-20 px-6">
      <div className="max-w-6xl mx-auto">

        {/* Header */}
        <div className="text-center mb-14">
          <span className="inline-block text-xs font-semibold uppercase tracking-widest text-violet-500 dark:text-violet-400 bg-violet-50 dark:bg-violet-950/30 px-3 py-1 rounded-full mb-3">
            Blog
          </span>
          <h1 className="text-4xl sm:text-5xl font-black text-gray-900 dark:text-zinc-50 mb-4">Travel Guides & Stories</h1>
          <p className="text-gray-500 dark:text-zinc-400 text-lg max-w-xl mx-auto leading-relaxed">
            Real stories, honest tips, and insider guides from our travels around India and the world.
          </p>
        </div>

        {/* Featured Post */}
        {featured && (
          <div
            onClick={() => navigate(`/blog/${featured.slug}`)}
            className="group relative rounded-3xl overflow-hidden cursor-pointer mb-12 shadow-xl hover:shadow-2xl transition-all duration-500"
          >
            <div className="relative h-[380px] md:h-[440px]">
              <img src={featured.image} alt={featured.title} className="w-full h-full object-cover group-hover:scale-105 transition duration-1000" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
              <div className="absolute top-5 left-5 flex items-center gap-2">
                <span className="px-3 py-1 bg-violet-600 text-white text-[10px] font-bold uppercase tracking-wider rounded-full">Featured</span>
                <span className="px-3 py-1 bg-white/20 backdrop-blur-md text-white text-[10px] font-bold uppercase tracking-wider rounded-full">{featured.category}</span>
              </div>
              <div className="absolute bottom-0 left-0 right-0 p-8 md:p-10">
                <div className="flex items-center gap-3 text-white/70 text-xs mb-3">
                  <span>{featured.author}</span>
                  <span className="w-1 h-1 bg-white/50 rounded-full" />
                  <span>{featured.date}</span>
                  <span className="w-1 h-1 bg-white/50 rounded-full" />
                  <span>{featured.time}</span>
                </div>
                <h2 className="text-2xl md:text-3xl font-black text-white leading-tight max-w-2xl">{featured.title}</h2>
                <p className="text-white/70 mt-3 text-sm max-w-xl leading-relaxed line-clamp-2">{featured.subtitle}</p>
                <div className="flex items-center gap-3 mt-5">
                  {featured.tags?.slice(0, 3).map(tag => (
                    <span key={tag} className="px-3 py-1 bg-white/10 backdrop-blur-md border border-white/20 text-white text-[10px] font-semibold rounded-full">{tag}</span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {rest.map(blog => (
            <div
              key={blog.slug}
              onClick={() => navigate(`/blog/${blog.slug}`)}
              className="group bg-white dark:bg-zinc-900 rounded-[28px] overflow-hidden border border-gray-100 dark:border-zinc-800 shadow-sm hover:shadow-xl transition-all duration-500 cursor-pointer h-full flex flex-col"
            >
              <div className="relative h-52 overflow-hidden">
                {/* Grid below the featured card. The featured image above stays
                    eager because it is this page's LCP element. */}
                <img src={blog.image} alt={blog.title} loading="lazy" decoding="async" className="w-full h-full object-cover group-hover:scale-110 transition duration-1000" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />
                <div className="absolute top-4 left-4">
                  <span className="px-3 py-1 bg-white/90 backdrop-blur-sm text-[10px] font-bold uppercase tracking-wider text-gray-800 rounded-full">{blog.category}</span>
                </div>
                <div className="absolute top-4 right-4">
                  <span className="px-3 py-1 bg-black/40 backdrop-blur-sm text-[10px] font-bold text-white rounded-full">{blog.time}</span>
                </div>
              </div>
              <div className="p-6 flex flex-col flex-1">
                <div className="flex items-center gap-2 text-xs text-gray-400 dark:text-zinc-500 mb-3">
                  <span className="font-semibold text-violet-500 dark:text-violet-400">{blog.author}</span>
                  <span className="w-1 h-1 bg-gray-300 dark:bg-zinc-700 rounded-full" />
                  <span>{blog.date}</span>
                </div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-zinc-50 leading-snug group-hover:text-violet-600 transition">{blog.title}</h3>
                <p className="text-sm text-gray-500 dark:text-zinc-400 mt-2 leading-relaxed line-clamp-2 flex-1">{blog.subtitle}</p>
                {blog.tags && (
                  <div className="flex flex-wrap gap-2 mt-4">
                    {blog.tags.slice(0, 3).map(tag => (
                      <span key={tag} className="px-2.5 py-1 bg-gray-100 dark:bg-zinc-800 text-[10px] font-semibold text-gray-500 dark:text-zinc-400 rounded-full">{tag}</span>
                    ))}
                  </div>
                )}
                <div className="mt-4 pt-4 border-t border-gray-100 dark:border-zinc-800 flex items-center justify-between">
                  <span className="text-sm font-bold text-gray-900 dark:text-zinc-50 group-hover:text-violet-600 transition">Read Article</span>
                  <span className="w-8 h-8 bg-gray-100 dark:bg-zinc-800 group-hover:bg-violet-600 rounded-full flex items-center justify-center transition">
                    <span className="text-gray-400 dark:text-zinc-500 group-hover:text-white text-sm transition">→</span>
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Blogs;
