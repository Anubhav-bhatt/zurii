import { useParams, useNavigate } from 'react-router-dom';
import { getGuideBySlug, guides } from '../data';

/**
 * Render `**bold**` as <strong>, and nothing else, as HTML.
 *
 * The three dangerouslySetInnerHTML calls below exist only to support that one
 * markdown-ish flourish. Escaping first means any other markup in the source —
 * a stray <script>, an onerror attribute — renders as visible text instead of
 * executing. Today this content is developer-authored (src/data), so there is
 * no live injection path; the escape is what keeps that true if guides ever
 * become database- or admin-supplied.
 */
const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const boldOnly = (text) =>
  String(text ?? '')
    .replace(/[&<>"']/g, (c) => ESCAPES[c])
    .replace(/\*\*(.*?)\*\*/g, '<strong class="text-gray-800 dark:text-zinc-50">$1</strong>');

const BlogDetail = () => {
  const { slug } = useParams();
  const navigate = useNavigate();
  const blog = getGuideBySlug(slug);

  if (!blog) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <span className="text-5xl">📝</span>
        <h1 className="text-2xl font-black text-gray-800 dark:text-zinc-50">Blog not found</h1>
        <p className="text-gray-500 dark:text-zinc-400">The article you're looking for doesn't exist.</p>
        <button onClick={() => navigate('/blogs')} className="px-6 py-3 bg-violet-600 text-white rounded-xl font-bold">
          Back to Blogs
        </button>
      </div>
    );
  }

  // Related blogs (same category or random)
  const related = guides
    .filter(g => g.slug !== slug && (g.category === blog.category || g.tags?.some(t => blog.tags?.includes(t))))
    .slice(0, 3);

  return (
    <article className="min-h-screen bg-gray-50 dark:bg-zinc-950">
      {/* Hero */}
      <div className="relative h-[55vh] overflow-hidden">
        <img src={blog.image} alt={blog.title} className="w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
        <button
          onClick={() => navigate(-1)}
          className="absolute top-24 md:top-28 left-6 z-10 w-10 h-10 bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center text-white hover:bg-white/40 transition"
        >
          ←
        </button>
        <div className="absolute bottom-10 left-6 right-6 max-w-4xl mx-auto text-white">
          <div className="flex items-center gap-3 mb-3">
            <span className="px-3 py-1 bg-violet-600 text-white text-[10px] font-bold uppercase tracking-wider rounded-full">
              {blog.category}
            </span>
            <span className="text-white/70 text-xs">{blog.date}</span>
            <span className="text-white/70 text-xs">·</span>
            <span className="text-white/70 text-xs">{blog.time}</span>
          </div>
          <h1 className="text-3xl md:text-5xl font-black leading-tight">{blog.title}</h1>
          <p className="text-white/70 mt-3 text-lg max-w-2xl">{blog.subtitle}</p>
          <div className="flex items-center gap-2 mt-4">
            <div className="w-8 h-8 bg-violet-500 rounded-full flex items-center justify-center text-sm font-bold">Z</div>
            <span className="text-sm font-semibold">{blog.author}</span>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-6 py-12">
        {/* Tags */}
        {blog.tags && (
          <div className="flex flex-wrap gap-2 mb-8">
            {blog.tags.map(tag => (
              <span key={tag} className="px-3 py-1.5 bg-violet-50 dark:bg-violet-950/30 text-violet-700 dark:text-violet-400 rounded-full text-xs font-bold">
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Blog Body */}
        <div className="prose prose-lg max-w-none prose-headings:text-gray-900 dark:prose-headings:text-zinc-50 prose-headings:font-black prose-p:text-gray-600 dark:prose-p:text-zinc-300 prose-p:leading-relaxed prose-li:text-gray-600 dark:prose-li:text-zinc-300 prose-strong:text-gray-800 dark:prose-strong:text-zinc-50">
          {blog.content?.split('\n\n').map((block, i) => {
            const trimmed = block.trim();
            if (trimmed.startsWith('## ')) {
              return <h2 key={i} className="text-2xl font-black text-gray-900 dark:text-zinc-50 mt-10 mb-4">{trimmed.replace('## ', '')}</h2>;
            }
            if (trimmed.startsWith('### ')) {
              return <h3 key={i} className="text-xl font-bold text-gray-800 dark:text-zinc-50 mt-8 mb-3">{trimmed.replace('### ', '')}</h3>;
            }
            if (trimmed.startsWith('- ')) {
              const items = trimmed.split('\n').filter(l => l.startsWith('- '));
              return (
                <ul key={i} className="space-y-2 my-4">
                  {items.map((item, j) => (
                    <li key={j} className="flex gap-2 text-gray-600 dark:text-zinc-300 leading-relaxed">
                      <span className="text-violet-500 dark:text-violet-400 mt-1.5 flex-shrink-0">•</span>
                      <span dangerouslySetInnerHTML={{ __html: boldOnly(item.replace('- ', '')) }} />
                    </li>
                  ))}
                </ul>
              );
            }
            if (/^\d+\.\s/.test(trimmed)) {
              const items = trimmed.split('\n').filter(l => /^\d+\.\s/.test(l));
              return (
                <ol key={i} className="space-y-2 my-4 list-decimal list-inside">
                  {items.map((item, j) => (
                    <li key={j} className="text-gray-600 dark:text-zinc-300 leading-relaxed" dangerouslySetInnerHTML={{ __html: boldOnly(item.replace(/^\d+\.\s/, '')) }} />
                  ))}
                </ol>
              );
            }
            return <p key={i} className="text-gray-600 dark:text-zinc-300 leading-relaxed my-4" dangerouslySetInnerHTML={{ __html: boldOnly(trimmed) }} />;
          })}
        </div>

        {/* CTA */}
        <div className="mt-12 bg-gradient-to-r from-violet-600 to-indigo-600 rounded-3xl p-8 text-center text-white">
          <h3 className="text-2xl font-black mb-2">Ready to Book Your Trip?</h3>
          <p className="text-violet-200 mb-6">Let our travel experts create the perfect itinerary for you.</p>
          <button
            onClick={() => navigate('/contact-us')}
            className="px-8 py-3 bg-white text-violet-700 font-bold rounded-xl hover:bg-violet-50 transition"
          >
            Get in Touch
          </button>
        </div>

        {/* Related Blogs */}
        {related.length > 0 && (
          <div className="mt-16">
            <h2 className="text-2xl font-black text-gray-900 dark:text-zinc-50 mb-6">Related Articles</h2>
            <div className="grid md:grid-cols-3 gap-6">
              {related.map(post => (
                <div
                  key={post.slug}
                  onClick={() => navigate(`/blog/${post.slug}`)}
                  className="group bg-white dark:bg-zinc-900 rounded-2xl overflow-hidden border border-gray-100 dark:border-zinc-800 shadow-sm hover:shadow-lg cursor-pointer transition"
                >
                  <img src={post.image} alt={post.title} className="h-40 w-full object-cover group-hover:scale-105 transition duration-500" />
                  <div className="p-5">
                    <span className="text-[10px] font-bold text-violet-500 dark:text-violet-400 uppercase tracking-wider">{post.category}</span>
                    <h3 className="text-sm font-bold text-gray-900 dark:text-zinc-50 mt-1 line-clamp-2 group-hover:text-violet-600 transition">{post.title}</h3>
                    <p className="text-xs text-gray-400 dark:text-zinc-500 mt-2">{post.date} · {post.time}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </article>
  );
};

export default BlogDetail;
