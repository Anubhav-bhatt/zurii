/**
 * Safe, Idempotent Demo Data Seed Script for Zurii.
 *
 *   node scripts/seed-zurii-demo.mjs              # Insert/Update demo seed
 *   node scripts/seed-zurii-demo.mjs --dry-run    # Report operations without modifying DB
 *   SEED_DEMO_BOOKINGS=true node scripts/seed-zurii-demo.mjs  # Also seed optional demo enquiries
 */
import pkg from '../db/pool.js';
const { getPool } = pkg;

const isDryRun = process.argv.includes('--dry-run');
const seedBookings = process.env.SEED_DEMO_BOOKINGS === 'true' || process.argv.includes('--seed-bookings');

const DEMO_METADATA = {
  demo: true,
  seedSource: 'zurii-v1-demo',
};

const DEMO_DESTINATIONS = [
  {
    name: 'Bali',
    slug: 'bali',
    country: 'Indonesia',
    region: 'Southeast Asia',
    kind: 'international',
    short_description: 'Island of the Gods featuring lush rice terraces, vibrant culture, and golden beaches.',
    description: 'Discover Bali\'s serene temples in Ubud, pristine beaches in Uluwatu, and rich cultural heritage. Perfect for romantic getaways and tropical adventures.',
    image: 'https://images.unsplash.com/photo-1537996194471-e657df975ab4?auto=format&fit=crop&w=1200&q=80',
    gallery: [
      'https://images.unsplash.com/photo-1537996194471-e657df975ab4?auto=format&fit=crop&w=1200&q=80',
      'https://images.unsplash.com/photo-1552465011-b4e21bf6e79a?auto=format&fit=crop&w=1200&q=80',
    ],
    featured: true,
    active: true,
  },
  {
    name: 'Dubai',
    slug: 'dubai',
    country: 'United Arab Emirates',
    region: 'Middle East',
    kind: 'international',
    short_description: 'Futuristic architecture, desert safaris, luxury shopping, and world-class entertainment.',
    description: 'Experience ultra-modern skyscrapers including Burj Khalifa, thrilling desert dunes, luxury shopping festivals, and tranquil Arabian Gulf shorelines.',
    image: 'https://images.unsplash.com/photo-1512453979798-5ea266f8880c?auto=format&fit=crop&w=1200&q=80',
    gallery: [
      'https://images.unsplash.com/photo-1512453979798-5ea266f8880c?auto=format&fit=crop&w=1200&q=80',
      'https://images.unsplash.com/photo-1546412414-8035e1776c9a?auto=format&fit=crop&w=1200&q=80',
    ],
    featured: true,
    active: true,
  },
  {
    name: 'Maldives',
    slug: 'maldives',
    country: 'Maldives',
    region: 'Indian Ocean',
    kind: 'international',
    short_description: 'Overwater bungalows, crystal clear turquoise lagoons, and vibrant coral reefs.',
    description: 'Unwind in idyllic island resorts with private water villas, world-class snorkeling, sunset cruises, and unrivaled luxury in the heart of the Indian Ocean.',
    image: 'https://images.unsplash.com/photo-1514282401047-d79a71a590e8?auto=format&fit=crop&w=1200&q=80',
    gallery: [
      'https://images.unsplash.com/photo-1514282401047-d79a71a590e8?auto=format&fit=crop&w=1200&q=80',
    ],
    featured: true,
    active: true,
  },
  {
    name: 'Kashmir',
    slug: 'kashmir',
    country: 'India',
    region: 'North India',
    kind: 'domestic',
    short_description: 'Paradise on Earth with snow-capped Himalayas, Dal Lake houseboats, and tulip gardens.',
    description: 'Journey through Srinagar, Gulmarg, and Pahalgam. Enjoy shikara rides on Dal Lake, gondola cable cars above snow meadows, and warm Kashmiri hospitality.',
    image: 'https://images.unsplash.com/photo-1595815771614-ade9d652a65d?w=800',
    gallery: [
      'https://images.unsplash.com/photo-1595815771614-ade9d652a65d?w=800',
    ],
    featured: true,
    active: true,
  },
  {
    name: 'Thailand',
    slug: 'thailand',
    country: 'Thailand',
    region: 'Southeast Asia',
    kind: 'international',
    short_description: 'Tropical beaches, opulent royal palaces, ancient ruins, and world-famous street food.',
    description: 'Explore the vibrant energy of Bangkok, historical temples of Chiang Mai, and sun-drenched islands of Phuket and Krabi.',
    image: 'https://images.unsplash.com/photo-1552465011-b4e21bf6e79a?auto=format&fit=crop&w=1200&q=80',
    gallery: [
      'https://images.unsplash.com/photo-1552465011-b4e21bf6e79a?auto=format&fit=crop&w=1200&q=80',
    ],
    featured: false,
    active: true,
  },
];

const DEMO_PACKAGES = [
  {
    title: 'Bali Romantic Escape',
    slug: 'bali-romantic-escape',
    destination_slug: 'bali',
    subtitle: 'Private Pool Villa, Candlelight Dinner & Spa Treatment',
    short_description: 'Intimate 5-day romantic holiday in Ubud and Seminyak featuring private luxury villas and sunset dinners.',
    description: 'Experience Bali at its most romantic. Stay in private pool villas amidst Ubud rice fields, enjoy traditional Balinese couple spa sessions, explore Tanah Lot sunset temple, and relax along Seminyak beach.',
    duration_days: 5,
    duration_nights: 4,
    duration_text: '5 Days / 4 Nights',
    price: 42999.00,
    original_price: 52000.00,
    currency: 'INR',
    cover_image: 'https://images.unsplash.com/photo-1537996194471-e657df975ab4?auto=format&fit=crop&w=1200&q=80',
    gallery: [
      'https://images.unsplash.com/photo-1537996194471-e657df975ab4?auto=format&fit=crop&w=1200&q=80',
      'https://images.unsplash.com/photo-1552465011-b4e21bf6e79a?auto=format&fit=crop&w=1200&q=80',
    ],
    highlights: [
      'Private Pool Villa stay in Ubud',
      'Candlelight beachside dinner in Jimbaran',
      'Traditional Balinese spa treatment for two',
      'Guided tour of Tanah Lot & Tegallalang Rice Terrace',
      'Airport luxury transfers included',
    ],
    itinerary: [
      { day: 1, title: 'Arrival in Bali & Villa Check-in', description: 'Welcome at Denpasar airport, private transfer to your Ubud pool villa. Relax and enjoy evening leisure.' },
      { day: 2, title: 'Ubud Cultural & Nature Exploration', description: 'Visit Tegallalang Rice Terraces, Monkey Forest, and Ubud Art Market. Enjoy an evening Balinese spa.' },
      { day: 3, title: 'Transfer to Seminyak & Sunset Dinner', description: 'Check into beach resort at Seminyak. Evening romantic candlelight seafood dinner on Jimbaran Beach.' },
      { day: 4, title: 'Tanah Lot & Watersports', description: 'Morning optional watersports at Tanjung Benoa. Afternoon visit to iconic Tanah Lot Sea Temple.' },
      { day: 5, title: 'Souvenir Shopping & Departure', description: 'Free time for last-minute shopping before private transfer to Denpasar Airport.' },
    ],
    inclusions: ['Accommodation with Daily Breakfast', 'Private Airport & Inter-hotel Transfers', 'Romantic Candlelight Dinner', 'Balinese Spa Session', 'English-speaking Tour Guide'],
    exclusions: ['International Flights', 'Personal Expenses & Tips', 'Travel Insurance', 'Visa Fees (VOA if applicable)'],
    tags: ['Honeymoon', 'Couple', 'Beach', 'International', 'Luxury'],
    trip_type: 'Honeymoon',
    rating: 4.9,
    reviews_count: 42,
    group_size: '2 Travellers',
    difficulty: 'Easy',
    featured: true,
    popular: true,
    status: 'PUBLISHED',
  },
  {
    title: 'Bali Adventure & Culture',
    slug: 'bali-adventure-culture',
    destination_slug: 'bali',
    subtitle: 'Mount Batur Sunrise Trek, White Water Rafting & Waterfall Hunt',
    short_description: 'An action-packed 6-day expedition through Bali\'s volcanoes, rivers, waterfalls, and island beaches.',
    description: 'Designed for active travellers and thrill-seekers! Hike up Mount Batur for an unforgettable sunrise, raft through Ayung River gorges, discover hidden jungle waterfalls, and explore Nusa Penida island.',
    duration_days: 6,
    duration_nights: 5,
    duration_text: '6 Days / 5 Nights',
    price: 38999.00,
    original_price: 45000.00,
    currency: 'INR',
    cover_image: 'https://images.unsplash.com/photo-1518548419970-58e3b4079ab2?auto=format&fit=crop&w=1200&q=80',
    gallery: [
      'https://images.unsplash.com/photo-1518548419970-58e3b4079ab2?auto=format&fit=crop&w=1200&q=80',
    ],
    highlights: [
      'Mount Batur early morning volcano trek',
      'White water rafting on Ayung River',
      'Full-day Nusa Penida island day trip (Kelingking Beach & Broken Beach)',
      'Visit Sekumpul and Tegenungan Waterfalls',
    ],
    itinerary: [
      { day: 1, title: 'Arrival & Ubud Setup', description: 'Arrive in Bali, transfer to hotel in Ubud.' },
      { day: 2, title: 'Ayung River Rafting & Waterfall Trail', description: 'Thrill-filled morning rafting followed by jungle waterfall discovery.' },
      { day: 3, title: 'Mount Batur Sunrise Trekking', description: 'Early 3 AM departure for Mount Batur trek. Enjoy breakfast at the summit overlooking crater lake.' },
      { day: 4, title: 'Nusa Penida Island Speedboat Excursion', description: 'Speedboat to Nusa Penida. Visit Kelingking T-Rex cliff and Angel\'s Billabong.' },
      { day: 5, title: 'Beach Club & Surfing Lesson', description: 'Canggu beach vibe, optional beginner surf lesson and sunset at Finns Beach Club.' },
      { day: 6, title: 'Departure', description: 'Transfer to Denpasar airport.' },
    ],
    inclusions: ['Hotels with Breakfast', 'Guided Mount Batur Trek with Equipment', 'Ayung River Rafting with Lunch', 'Nusa Penida Speedboat & Island Transport'],
    exclusions: ['Flights', 'Personal Expenses', 'Visa Fees'],
    tags: ['Adventure', 'Group', 'Mountains', 'Beach', 'International'],
    trip_type: 'Adventure',
    rating: 4.8,
    reviews_count: 29,
    group_size: 'Group / Solo / Friends',
    difficulty: 'Moderate',
    featured: false,
    popular: true,
    status: 'PUBLISHED',
  },
  {
    title: 'Dubai Luxury Escape',
    slug: 'dubai-luxury-escape',
    destination_slug: 'dubai',
    subtitle: 'Burj Khalifa 124th Floor, Desert Safari & Marina Yacht Cruise',
    short_description: 'Experience pure opulence with 5 days of icon sightseeing, desert adventure, and luxury cruising.',
    description: 'Immerse yourself in Dubai\'s grand architecture and entertainment. Ascend Burj Khalifa, cruise along Dubai Marina on a private luxury yacht, ride 4x4 dunes into the Arabian desert, and explore the Future Museum.',
    duration_days: 5,
    duration_nights: 4,
    duration_text: '5 Days / 4 Nights',
    price: 65999.00,
    original_price: 78000.00,
    currency: 'INR',
    cover_image: 'https://images.unsplash.com/photo-1512453979798-5ea266f8880c?auto=format&fit=crop&w=1200&q=80',
    gallery: [
      'https://images.unsplash.com/photo-1512453979798-5ea266f8880c?auto=format&fit=crop&w=1200&q=80',
      'https://images.unsplash.com/photo-1546412414-8035e1776c9a?auto=format&fit=crop&w=1200&q=80',
    ],
    highlights: [
      'Burj Khalifa 124th & 125th Floor Observatory Entry',
      'Premium Desert Safari with Dune Bashing & BBQ Dinner',
      'Dubai Marina Sunset Yacht Cruise with Drinks',
      'Museum of the Future Fast-Track Entry',
      'Shopping tour of Dubai Mall & Gold Souk',
    ],
    itinerary: [
      { day: 1, title: 'Arrival in Dubai & Marina Walk', description: 'Private luxury transfer from DXB Airport to 5-star hotel. Evening leisure at Dubai Marina.' },
      { day: 2, title: 'Modern Dubai & Burj Khalifa', description: 'Visit Dubai Frame, Museum of the Future, and watch Dubai Fountain show from Burj Khalifa observatory.' },
      { day: 3, title: 'Desert Safari with VIP BBQ', description: '4x4 Dune bashing, camel riding, sandboarding, henna painting, and live Tanoura & Belly Dance show with BBQ dinner.' },
      { day: 4, title: 'Palm Jumeirah & Marina Yacht Cruise', description: 'Explore Atlantis The Palm, View at The Palm, and board sunset luxury yacht cruise.' },
      { day: 5, title: 'Gold Souk & Departure', description: 'Morning shopping at Old Dubai Spice & Gold Souks. Airport transfer.' },
    ],
    inclusions: ['5-Star Hotel Stay with Breakfast', 'All Sightseeing Entry Tickets', 'Desert Safari with BBQ Dinner', 'Private Yacht Cruise', 'Airport Transfers'],
    exclusions: ['Flights', 'Tourism Dirham Fee', 'UAE Visa'],
    tags: ['Family', 'International', 'Luxury', 'Shopping'],
    trip_type: 'Family',
    rating: 4.95,
    reviews_count: 58,
    group_size: 'Family / Couple',
    difficulty: 'Easy',
    featured: true,
    popular: true,
    status: 'PUBLISHED',
  },
  {
    title: 'Maldives Island Retreat',
    slug: 'maldives-island-retreat',
    destination_slug: 'maldives',
    subtitle: 'All-Inclusive Overwater Villa with Speedboat Transfers',
    short_description: '4 days of heavenly bliss in an all-inclusive tropical island resort surrounded by turquoise lagoon.',
    description: 'Escape to paradise. Stay in an iconic overwater villa featuring direct lagoon access, enjoy unlimited gourmet dining and beverages, dive with manta rays, and savor magical Indian Ocean sunsets.',
    duration_days: 4,
    duration_nights: 3,
    duration_text: '4 Days / 3 Nights',
    price: 52999.00,
    original_price: 68000.00,
    currency: 'INR',
    cover_image: 'https://images.unsplash.com/photo-1514282401047-d79a71a590e8?auto=format&fit=crop&w=1200&q=80',
    gallery: [
      'https://images.unsplash.com/photo-1514282401047-d79a71a590e8?auto=format&fit=crop&w=1200&q=80',
    ],
    highlights: [
      'Overwater Bungalow Stay with Ocean Views',
      'All-Inclusive Meal Plan (Breakfast, Lunch, Dinner & Drinks)',
      'Complimentary Snorkeling Gear & Kayaking',
      'Sunset Dolphin Cruise Excursion',
      'Roundtrip Speedboat Airport Transfers',
    ],
    itinerary: [
      { day: 1, title: 'Speedboat Arrival & Villa Check-in', description: 'Welcome at Male Airport, speedboat transfer to island resort. Check into overwater villa.' },
      { day: 2, title: 'Snorkeling & Coral Reef Exploration', description: 'Explore house reef coral gardens. Complimentary kayaking and ocean swimming.' },
      { day: 3, title: 'Sunset Dolphin Cruise', description: 'Relax by infinity pool. Late afternoon sunset boat cruise to spot wild spinner dolphins.' },
      { day: 4, title: 'Farewell Paradise', description: 'Breakfast with ocean view before speedboat transfer back to Male Airport.' },
    ],
    inclusions: ['Overwater Villa Accommodation', 'All-Inclusive Meals & Selected Drinks', 'Roundtrip Speedboat Transfers', 'Dolphin Cruise', 'Green Tax'],
    exclusions: ['International Flights', 'Spa Treatments', 'Motorized Watersports'],
    tags: ['Honeymoon', 'Beach', 'International', 'Luxury'],
    trip_type: 'Honeymoon',
    rating: 5.0,
    reviews_count: 36,
    group_size: '2 Travellers',
    difficulty: 'Easy',
    featured: true,
    popular: false,
    status: 'PUBLISHED',
  },
  {
    title: 'Kashmir Scenic Escape',
    slug: 'kashmir-scenic-escape',
    destination_slug: 'kashmir',
    subtitle: 'Houseboat Stay, Gulmarg Gondola & Pahalgam Valleys',
    short_description: '6-day serene journey across Srinagar, Gulmarg snow peaks, and Pahalgam river valleys.',
    description: 'Immerse in the breathtaking beauty of Kashmir. Sleep on a luxury wooden houseboat on Dal Lake, ride the highest cable car in Gulmarg, walk through Betaab Valley in Pahalgam, and sample authentic Wazwan cuisine.',
    duration_days: 6,
    duration_nights: 5,
    duration_text: '6 Days / 5 Nights',
    price: 28999.00,
    original_price: 36000.00,
    currency: 'INR',
    cover_image: 'https://images.unsplash.com/photo-1595815771614-ade9d652a65d?w=800',
    gallery: [
      'https://images.unsplash.com/photo-1566837497312-7be7830ae9b1?w=800',
    ],
    highlights: [
      'Luxury Houseboat Stay on Dal Lake with Shikara Ride',
      'Gulmarg Gondola Ride (Phase 1 Included)',
      'Excursion to Pahalgam (Betaab Valley & Aru Valley)',
      'Mughal Gardens Tour (Nishat & Shalimar Bagh)',
      'Private Cab throughout the itinerary',
    ],
    itinerary: [
      { day: 1, title: 'Arrival Srinagar & Dal Lake Shikara', description: 'Pick up at Srinagar Airport. Check into houseboat. Enjoy 1-hour sunset Shikara ride.' },
      { day: 2, title: 'Srinagar to Gulmarg Snow Meadows', description: 'Drive to Gulmarg. Take the Gondola cable car ride to snow peaks.' },
      { day: 3, title: 'Gulmarg to Pahalgam Valley of Shepherds', description: 'Scenic drive to Pahalgam along saffron fields. Visit Lidder River bank.' },
      { day: 4, title: 'Pahalgam Valleys Exploration', description: 'Visit Betaab Valley, Aru Valley, and Chandanwari by local union cab.' },
      { day: 5, title: 'Return to Srinagar & Mughal Gardens', description: 'Drive back to Srinagar. Tour Nishat Bagh, Shalimar Bagh, and Shankaracharya Temple.' },
      { day: 6, title: 'Departure', description: 'Transfer to Srinagar Airport.' },
    ],
    inclusions: ['1 Night Houseboat + 4 Nights Hotel', 'Daily Breakfast & Dinner', 'Private Cab for Transfers & Sightseeing', '1 Hour Shikara Ride', 'Gulmarg Gondola Phase 1 Ticket'],
    exclusions: ['Airfare', 'Union Cabs in Pahalgam/Sonmarg', 'Personal Pony/Sledge Rides'],
    tags: ['Family', 'Mountains', 'Domestic', 'Nature'],
    trip_type: 'Family',
    rating: 4.85,
    reviews_count: 64,
    group_size: 'Family / Group',
    difficulty: 'Easy',
    featured: false,
    popular: true,
    status: 'PUBLISHED',
  },
  {
    title: 'Thailand Beach & City',
    slug: 'thailand-beach-city',
    destination_slug: 'thailand',
    subtitle: 'Bangkok Temples, Shopping & Phuket Phi Phi Island Speedboat Cruise',
    short_description: '7-day classic Thailand combo featuring Bangkok nightlife & culture with Phuket tropical island hopping.',
    description: 'The ultimate Thailand experience! Begin in energetic Bangkok with temple visits and night market shopping, then fly to island paradise Phuket for Phi Phi Island snorkeling, James Bond rock, and pristine beaches.',
    duration_days: 7,
    duration_nights: 6,
    duration_text: '7 Days / 6 Nights',
    price: 46999.00,
    original_price: 55000.00,
    currency: 'INR',
    cover_image: 'https://images.unsplash.com/photo-1552465011-b4e21bf6e79a?auto=format&fit=crop&w=1200&q=80',
    gallery: [
      'https://images.unsplash.com/photo-1552465011-b4e21bf6e79a?auto=format&fit=crop&w=1200&q=80',
    ],
    highlights: [
      'Grand Palace & Wat Pho Golden Reclining Buddha Tour',
      'Chao Phraya Princess Dinner Cruise in Bangkok',
      'Phi Phi Islands & Maya Bay Day Trip by Speedboat with Lunch',
      'Phuket City Tour & Big Buddha Viewpoint',
      'All airport & hotel transfers included',
    ],
    itinerary: [
      { day: 1, title: 'Arrival in Bangkok & Dinner Cruise', description: 'Arrive in Bangkok. Check in hotel. Evening Chao Phraya River dinner cruise.' },
      { day: 2, title: 'Bangkok Temples & Shopping', description: 'Guided tour of Wat Pho and Wat Arun. Free afternoon for shopping at Platinum Mall & ICONSIAM.' },
      { day: 3, title: 'Fly to Phuket', description: 'Flight to Phuket. Check into beach resort in Patong.' },
      { day: 4, title: 'Phi Phi Islands & Maya Bay Speedboat Tour', description: 'Full day speedboat tour to Maya Bay, Monkey Beach, Viking Cave, and Khai Island.' },
      { day: 5, title: 'Phuket Sightseeing & Sunset', description: 'Visit Phuket Big Buddha, Wat Chalong, and Promthep Cape sunset point.' },
      { day: 6, title: 'Beach Day at Leisure', description: 'Relax at Kata Beach or enjoy optional Simon Cabaret show.' },
      { day: 7, title: 'Departure from Phuket', description: 'Transfer to Phuket Airport.' },
    ],
    inclusions: ['4-Star Hotels with Breakfast', 'Bangkok Dinner Cruise', 'Phi Phi Island Tour with Buffet Lunch', 'Inter-city Transfers'],
    exclusions: ['International & Domestic Flights', 'National Park Fees', 'Visa Fees'],
    tags: ['Group', 'Beach', 'International', 'Nightlife'],
    trip_type: 'Group',
    rating: 4.75,
    reviews_count: 48,
    group_size: 'Group / Friends / Couple',
    difficulty: 'Easy',
    featured: false,
    popular: true,
    status: 'PUBLISHED',
  },
];

const DEMO_ENQUIRIES = [
  {
    package_slug: 'bali-romantic-escape',
    name: 'Demo Traveller Aisha',
    email: 'demo.aisha@example.com',
    phone: '+91 98765 43210',
    travel_date: '2026-10-15',
    travellers: 2,
    departure_city: 'Delhi',
    message: 'Planning our honeymoon trip to Bali. Looking for quiet villa recommendations.',
    status: 'NEW',
    admin_notes: 'Demo lead for package enquiry testing.',
    demo_ref: 'ZURII_DEMO_BOOKING_001',
  },
  {
    package_slug: null, // General Plan My Trip enquiry!
    name: 'Demo Traveller Rahul',
    email: 'demo.rahul@example.com',
    phone: '+91 91234 56789',
    travel_date: '2026-11-01',
    travellers: 4,
    departure_city: 'Mumbai',
    message: 'Destination: Maldives | Budget: ₹1,00,000 – ₹2,00,000\n\nPlanning a family anniversary vacation in November.',
    status: 'CONTACTED',
    admin_notes: 'Demo lead for general Plan My Trip testing.',
    demo_ref: 'ZURII_DEMO_BOOKING_002',
  },
];

export async function seedDemoData(pool) {
  const client = await pool.connect();
  const summary = {
    destinations: { inserted: 0, updated: 0, skipped: 0 },
    packages: { inserted: 0, updated: 0, skipped: 0 },
    bookings: { inserted: 0, updated: 0, skipped: 0 },
  };

  try {
    if (!isDryRun) await client.query('BEGIN');

    // ── 1. DESTINATIONS ───────────────────────────────────────────
    for (const d of DEMO_DESTINATIONS) {
      const metadata = JSON.stringify({ ...DEMO_METADATA });
      const gallery = JSON.stringify(d.gallery);

      const check = await client.query('SELECT id, metadata FROM destinations WHERE slug = $1', [d.slug]);
      if (check.rows.length > 0) {
        const existing = check.rows[0];
        const isDemoOwned = existing.metadata?.seedSource === 'zurii-v1-demo';

        if (!isDemoOwned) {
          summary.destinations.skipped++;
          continue;
        }

        if (!isDryRun) {
          await client.query(
            `UPDATE destinations
                SET name = $1, country = $2, region = $3, kind = $4,
                    short_description = $5, description = $6, image = $7,
                    gallery = $8, featured = $9, active = $10, metadata = $11,
                    updated_at = CURRENT_TIMESTAMP
              WHERE slug = $12`,
            [d.name, d.country, d.region, d.kind, d.short_description, d.description, d.image, gallery, d.featured, d.active, metadata, d.slug]
          );
        }
        summary.destinations.updated++;
      } else {
        if (!isDryRun) {
          await client.query(
            `INSERT INTO destinations (name, slug, country, region, kind, short_description, description, image, gallery, featured, active, metadata)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
            [d.name, d.slug, d.country, d.region, d.kind, d.short_description, d.description, d.image, gallery, d.featured, d.active, metadata]
          );
        }
        summary.destinations.inserted++;
      }
    }

    // Map destination slug -> id
    const destMap = new Map();
    if (!isDryRun) {
      const { rows: destRows } = await client.query('SELECT id, slug FROM destinations');
      destRows.forEach((r) => destMap.set(r.slug, r.id));
    }

    // ── 2. PACKAGES ───────────────────────────────────────────────
    for (const p of DEMO_PACKAGES) {
      const destId = destMap.get(p.destination_slug) ?? null;
      const metadata = JSON.stringify({ ...DEMO_METADATA });
      const gallery = JSON.stringify(p.gallery);
      const highlights = JSON.stringify(p.highlights);
      const itinerary = JSON.stringify(p.itinerary);
      const inclusions = JSON.stringify(p.inclusions);
      const exclusions = JSON.stringify(p.exclusions);
      const tags = JSON.stringify(p.tags);

      const check = await client.query('SELECT id, metadata FROM packages WHERE slug = $1', [p.slug]);
      if (check.rows.length > 0) {
        const existing = check.rows[0];
        const isDemoOwned = existing.metadata?.seedSource === 'zurii-v1-demo';

        if (!isDemoOwned) {
          summary.packages.skipped++;
          continue;
        }

        if (!isDryRun) {
          await client.query(
            `UPDATE packages
                SET title = $1, destination_id = $2, subtitle = $3, short_description = $4,
                    description = $5, duration_days = $6, duration_nights = $7, duration_text = $8,
                    price = $9, original_price = $10, currency = $11, cover_image = $12,
                    gallery = $13, highlights = $14, itinerary = $15, inclusions = $16,
                    exclusions = $17, tags = $18, trip_type = $19, rating = $20,
                    reviews_count = $21, group_size = $22, difficulty = $23, featured = $24,
                    popular = $25, status = $26, metadata = $27, updated_at = CURRENT_TIMESTAMP
              WHERE slug = $28`,
            [
              p.title, destId, p.subtitle, p.short_description,
              p.description, p.duration_days, p.duration_nights, p.duration_text,
              p.price, p.original_price, p.currency, p.cover_image,
              gallery, highlights, itinerary, inclusions,
              exclusions, tags, p.trip_type, p.rating,
              p.reviews_count, p.group_size, p.difficulty, p.featured,
              p.popular, p.status, metadata, p.slug,
            ]
          );
        }
        summary.packages.updated++;
      } else {
        if (!isDryRun) {
          await client.query(
            `INSERT INTO packages (
               title, slug, destination_id, subtitle, short_description, description,
               duration_days, duration_nights, duration_text, price, original_price,
               currency, cover_image, gallery, highlights, itinerary, inclusions,
               exclusions, tags, trip_type, rating, reviews_count, group_size,
               difficulty, featured, popular, status, metadata
             ) VALUES (
               $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
               $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28
             )`,
            [
              p.title, p.slug, destId, p.subtitle, p.short_description, p.description,
              p.duration_days, p.duration_nights, p.duration_text, p.price, p.original_price,
              p.currency, p.cover_image, gallery, highlights, itinerary, inclusions,
              exclusions, tags, p.trip_type, p.rating, p.reviews_count, p.group_size,
              p.difficulty, p.featured, p.popular, p.status, metadata,
            ]
          );
        }
        summary.packages.inserted++;
      }
    }

    // ── 3. OPTIONAL DEMO BOOKINGS ─────────────────────────────────
    if (seedBookings) {
      const pkgMap = new Map();
      if (!isDryRun) {
        const { rows: pkgRows } = await client.query('SELECT id, slug FROM packages');
        pkgRows.forEach((r) => pkgMap.set(r.slug, r.id));
      }

      for (const b of DEMO_ENQUIRIES) {
        const pkgId = b.package_slug ? pkgMap.get(b.package_slug) ?? null : null;

        // Check if exists by demo_ref or email+message
        const check = await client.query(
          `SELECT id FROM bookings WHERE message LIKE $1 OR (email = $2 AND name = $3)`,
          [`%${b.demo_ref}%`, b.email, b.name]
        );

        if (check.rows.length > 0) {
          summary.bookings.skipped++;
        } else {
          if (!isDryRun) {
            await client.query(
              `INSERT INTO bookings (package_id, name, email, phone, travel_date, travellers, departure_city, message, status, admin_notes, source)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'Demo Seed')`,
              [pkgId, b.name, b.email, b.phone, b.travel_date, b.travellers, b.departure_city, `${b.message}\n[${b.demo_ref}]`, b.status, b.admin_notes]
            );
          }
          summary.bookings.inserted++;
        }
      }
    }

    if (!isDryRun) await client.query('COMMIT');
    return summary;
  } catch (err) {
    if (!isDryRun) await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const pool = getPool();
  try {
    console.log(`── Demo Data Seed (Zurii V1) ${isDryRun ? '[DRY RUN]' : ''} ──`);
    const summary = await seedDemoData(pool);
    console.log(`Destinations : ${summary.destinations.inserted} inserted, ${summary.destinations.updated} updated, ${summary.destinations.skipped} skipped`);
    console.log(`Packages     : ${summary.packages.inserted} inserted, ${summary.packages.updated} updated, ${summary.packages.skipped} skipped`);
    if (seedBookings) {
      console.log(`Bookings     : ${summary.bookings.inserted} inserted, ${summary.bookings.updated} updated, ${summary.bookings.skipped} skipped`);
    } else {
      console.log(`Bookings     : skipped (set SEED_DEMO_BOOKINGS=true to seed optional enquiries)`);
    }
    console.log('✓ Demo data seed completed successfully.');
  } catch (err) {
    console.error('✗ Demo data seed failed:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
