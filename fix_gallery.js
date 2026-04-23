const fs = require('fs');
let code = fs.readFileSync('frontend/src/data/index.js', 'utf8');

const replacementGalleries = [
  "['https://images.unsplash.com/photo-1512343879784-a960bf40e7f2?w=800', 'https://images.unsplash.com/photo-1537996194471-e657df975ab4?w=800', 'https://images.unsplash.com/photo-1514282401047-d79a71a590e8?w=800', 'https://images.unsplash.com/photo-1593693397690-362cb9666fc2?w=800']",
  "['https://images.unsplash.com/photo-1596895111956-bf1cf0599ce5?w=800', 'https://images.unsplash.com/photo-1598971488118-2081d68a2f4a?w=800', 'https://images.unsplash.com/photo-1566837945700-30057527ade0?w=800', 'https://images.unsplash.com/photo-1626621341517-bbf3d9990a23?w=800']",
  "['https://images.unsplash.com/photo-1581793745862-99fde7fa73d2?w=800', 'https://images.unsplash.com/photo-1544085311-11a028465b03?w=800', 'https://images.unsplash.com/photo-1599661046289-e31887846eac?w=800', 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=800']",
  "['https://images.unsplash.com/photo-1537996194471-e657df975ab4?w=800', 'https://images.unsplash.com/photo-1626621341517-bbf3d9990a23?w=800', 'https://images.unsplash.com/photo-1596895111956-bf1cf0599ce5?w=800', 'https://images.unsplash.com/photo-1528181304800-2f14081989ec?w=800']"
];

let counter = 0;
code = code.replace(/gallery:\s*\[\s*\]/g, () => {
    const replacement = `gallery: ${replacementGalleries[counter % replacementGalleries.length]}`;
    counter++;
    return replacement;
});

fs.writeFileSync('frontend/src/data/index.js', code);
console.log('Fixed ', counter, ' empty galleries');
