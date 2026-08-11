/**
 * Image relevance corrections for destinations and packages.
 *
 *   node scripts/fixTravelImages.mjs --dry-run   # print the resolved plan
 *   node scripts/fixTravelImages.mjs             # apply, in one transaction
 *
 * WHY THIS EXISTS
 * A visual audit of every image in the database (149 unique URLs, all
 * downloaded and inspected on contact sheets) found ~34 genuinely wrong
 * entries: a programmer's desk on a Kashmir package, a circuit board on Ha
 * Long Bay, a Porsche / a honey jar / a suburban house in the Bruges gallery,
 * a carton of eggs on North Sikkim, a café interior reused five times across
 * Uttarakhand packages, a "YOUR IDEAS MATTER" sign on Cappadocia, a camper
 * van as the Varanasi cover, plus wrong-place photos (Maldives villas on
 * Uttarakhand, NYC on Seoul, African savanna on Mongolia…) and one URL that
 * 404s.
 *
 * EVERY replacement URL below was downloaded and looked at before being
 * assigned — several plausible-looking candidates turned out to be a Paris
 * photo, or worse, and were discarded. Where no honestly-relevant image was
 * available the gallery entry is REMOVED rather than papered over with
 * something unrelated (galleries stay ≥3 images).
 *
 * The same corrections must exist in the two seed sources —
 * frontend/src/data/index.js (migration source for the original 68 packages)
 * and scripts/seed-zurii-demo.mjs (source of the 6 demo extras) — or a reseed
 * would reintroduce the bad images. Those patches accompany this script.
 *
 * Idempotent: each step matches on the CURRENT bad URL; once replaced, the
 * match fails and the step reports `already-fixed`.
 */
import poolModule from '../db/pool.js';

const { getPool } = poolModule;

const U = (id) => `https://images.unsplash.com/photo-${id}?w=800`;

/**
 * Verified replacement pool. Comments say what the photo actually shows —
 * confirmed by eye, not inferred from the URL.
 */
const IMG = {
  dalLake:        U('1595815771614-ade9d652a65d'), // Srinagar houseboats, Dal Lake, snow peaks
  tulipGarden:    U('1566837497312-7be7830ae9b1'), // Srinagar tulip garden, mountains behind
  pahalgamMeadow: U('1598091383021-15ddea10925d'), // horse in a green Kashmir valley
  himachalValley: U('1593181629936-11c609b8db9b'), // snowy Himachal valley
  manaliForest:   U('1626621331169-5f34be280ed9'), // snow-dusted Manali forest ridge
  nainitalLake:   U('1610715936287-6c2ad208cdbf'), // Nainital lake, boats, green hills
  balloons:       U('1641128324972-af3212f0f6bd'), // Cappadocia hot-air balloons
  bruges:         U('1491557345352-5929e343eb89'), // Bruges canal houses
  mbsAerial:      U('1525625293386-3f8f99389edd'), // Marina Bay Sands aerial
  merlionNight:   U('1565967511849-76a60a516170'), // Merlion + MBS at night
  seoulStreet:    U('1517154421773-0529f29ea451'), // Seoul street, hangul signage
  // Already in the dataset and verified good:
  euroOldTown:    'https://images.unsplash.com/photo-1467269204594-9661b134dd2b?w=800', // Bavarian/European old town street
  tealMountains:  'https://images.unsplash.com/photo-1605649487212-47bdab064df7?w=800', // jagged teal mountain range
  mistyPeaks:     'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800', // misty high peaks
  snowRiver:      'https://images.unsplash.com/photo-1544085311-11a028465b03?w=800',    // snowy forest river
  alpineLake:     'https://images.unsplash.com/photo-1501785888041-af3ef285b470?w=800', // alpine lake with boat (Alps)
  bigMountains:   'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=800', // big snow mountains
  alpenglow:      'https://images.unsplash.com/photo-1585409677983-0f6c41ca9c3b?w=800', // alpenglow on peaks
  snowVillage:    'https://images.unsplash.com/photo-1626621341517-bbf3d9990a23?w=1200', // snowy Himalayan village
  hillTown:       'https://images.unsplash.com/photo-1597074866923-dc0589150358?w=800', // colourful hill town
  duneCamel:      'https://images.unsplash.com/photo-1579193219623-8ef5f1baa518?w=800', // desert dunes with camel
  camelSunset:    'https://plus.unsplash.com/premium_photo-1661962428918-6a57ab674e23?w=800', // camel silhouette at sunset
  hawaMahal:      'https://images.unsplash.com/photo-1477587458883-47145ed94245?w=800', // Hawa Mahal, Rajasthan
  goldenFort:     'https://images.unsplash.com/photo-1599661046289-e31897846e41?w=800', // golden fort wall, Rajasthan
  pushkarLake:    'https://images.unsplash.com/photo-1583261429112-e0e7fe037a49?w=800', // lake with ghats and hills
  keralaBoat:     'https://images.unsplash.com/photo-1593693397690-362cb9666fc2?w=800', // Kerala backwater houseboat
  teaTerraces:    'https://images.unsplash.com/photo-1559628233-100c798642d4?w=800',    // green tea terraces
  thaiLagoon:     'https://images.unsplash.com/photo-1504214208698-ea1916a2195a?w=800', // Thai karst lagoon, longtail boat
  halongBay:      'https://images.unsplash.com/photo-1528127269322-539801943592?w=800', // Ha Long Bay karsts
  amsCanal:       'https://images.unsplash.com/photo-1534351590666-13e3e96b5017?w=800', // Amsterdam canal houses
  amsCanalDusk:   'https://images.unsplash.com/photo-1512470876302-972faa2aa9a4?w=800', // canal at dusk
  canalSunset:    'https://images.unsplash.com/photo-1524492412937-b28074a5d7da?w=800', // canal sunset
  blueMosque:     'https://images.unsplash.com/photo-1541432901042-2d8bd64b4a9b?w=800', // Blue Mosque, Istanbul
  prayerFlags:    'https://images.unsplash.com/photo-1571401835393-8c5f35328320?w=800', // prayer flags, snow peak
  andamanBeach:   'https://images.unsplash.com/photo-1512343879784-a960bf40e7f2?w=800', // Andaman beach
  clearBeach:     'https://images.unsplash.com/photo-1519046904884-53103b34b206?w=800', // white-sand beach
  rishikeshRiver: 'https://plus.unsplash.com/premium_photo-1697730398251-40cd8dc57e0b?w=800', // river, bridge, green hills
  lakeSunset:     'https://images.unsplash.com/photo-1586348943529-beaae6c28db9?w=800', // sunset lake silhouette
  overwater:      'https://images.unsplash.com/photo-1514282401047-d79a71a590e8?auto=format&fit=crop&w=1200&q=80', // Maldives overwater villas
  dubaiSkyline:   'https://images.unsplash.com/photo-1512453979798-5ea266f8880c?auto=format&fit=crop&w=1200&q=80', // Dubai skyline
  keralaDest:     'https://images.unsplash.com/photo-1602216056096-3b40cc0c9944?w=800', // Kerala backwaters (dest)
};

/**
 * The plan. `match` is a substring of the CURRENT (bad) URL — the photo id —
 * so a re-run finds nothing left to fix. `to: null` removes a gallery entry.
 */
const DESTINATION_FIXES = [
  { slug: 'himachal-pradesh', field: 'image', match: '1558618666', to: IMG.himachalValley, was: 'man in a workshop' },
  { slug: 'uttarakhand',      field: 'image', match: '1590523277543', to: IMG.nainitalLake, was: 'Maldives overwater villas' },
  { slug: 'mongolia',         field: 'image', match: '1614531341773', to: IMG.duneCamel,    was: 'African savanna' },
  { slug: 'kazakhstan',       field: 'image', match: '1605101100278', to: IMG.tealMountains, was: 'European canal' },
  { slug: 'belgium',          field: 'image', match: '1499856871958', to: IMG.bruges,       was: 'Paris bridge' },
  { slug: 'singapore',        field: 'image', match: '1525596662741', to: IMG.mbsAerial,    was: 'person among palms' },
  { slug: 'switzerland',      field: 'image', match: '1531366936337', to: IMG.alpineLake,   was: 'aurora (not Alps)' },
  { slug: 'bhutan',           field: 'image', match: '1553856622',    to: IMG.prayerFlags,  was: 'generic river sunset' },
];

const COVER_FIXES = [
  { slug: 'kashmir-scenic-escape',  match: '1566837945700', to: IMG.dalLake,        was: 'desk with code on monitors' },
  { slug: 'kashmir-family',         match: '1570168007204', to: IMG.pahalgamMeadow, was: 'India Gate, not Kashmir' },
  { slug: 'shimla-manali-family',   match: '1558618666',    to: IMG.manaliForest,   was: 'man in a workshop' },
  { slug: 'germany-bavaria',        match: '1528360983277', to: IMG.euroOldTown,    was: 'East-Asian neon alley' },
  { slug: 'kazakhstan-almaty',      match: '1605101100278', to: IMG.tealMountains,  was: 'Amsterdam canal' },
  { slug: 'luxembourg-vianden',     match: '1563492065599', to: IMG.euroOldTown,    was: 'Thai golden shrine' },
  { slug: 'kerala-heights',         match: '1559592413',    to: IMG.keralaBoat,     was: 'Golden Hands Bridge (Vietnam)' },
  { slug: 'spiti-gateway',          match: '1499856871958', to: IMG.hillTown,       was: 'Paris bridge' },
  { slug: 'singapore-city',         match: '1545569341',    to: IMG.mbsAerial,      was: 'Japanese pagoda in autumn' },
  { slug: 'singapore-family',       match: '1565018054866', to: IMG.merlionNight,   was: 'European palace' },
  { slug: 'manali-weekend',         match: '1512470876302', to: IMG.manaliForest,   was: 'Amsterdam at dusk' },
  { slug: 'udaipur-mountabu-family', match: '1587474260584', to: IMG.hawaMahal,     was: 'India Gate, not Udaipur' },
  { slug: 'udaipur-lakes-palaces',  match: '1565967511849', to: IMG.goldenFort,     was: 'Singapore Merlion' },
  { slug: 'thailand-beach-bliss',   match: '1559628233',    to: IMG.thaiLagoon,     was: 'tea terraces, not a beach' },
  { slug: 'munnar-tea-gardens',     match: '1593693397690', to: IMG.teaTerraces,    was: 'backwater houseboat, not tea hills' },
  { slug: 'vietnam-halong-bay',     match: '1562408590',    to: IMG.halongBay,      was: 'circuit board' },
  { slug: 'varanasi-heritage',      match: '1561361513',    to: null,               was: 'camper van (use gallery ghats image)', useGallery: 1 },
  { slug: 'sikkim-silk',            match: '1600618528240', to: IMG.snowVillage,    was: 'person meditating indoors' },
  { slug: 'rishikesh-mussoorie-family', match: '1592639296346', to: IMG.rishikeshRiver, was: 'Delhi Rajpath' },
  { slug: 'mussoorie-nainital-rishikesh-family', match: '1586348943529', to: IMG.nainitalLake, was: 'generic sunset silhouette' },
  { slug: 'swiss-alps',             match: '1531366936337', to: IMG.alpineLake,     was: 'aurora (not Alps)' },
  { slug: 'turkey-cappadocia',      match: '1541432901042', to: IMG.balloons,       was: 'Blue Mosque (title says Cappadocia)' },
  { slug: 'belgium-bruges',         match: '1499856871958', to: IMG.bruges,         was: 'Paris bridge' },
  { slug: 'maldives-budget-escape',  match: '1573843981267', to: IMG.overwater, was: 'hand writing on paper' },
  { slug: 'mongolia-gobi',           match: '1614531341773', to: IMG.duneCamel, was: 'African savanna' },
];

/**
 * Gallery corrections: slug + array index, matched against the bad URL.
 * `to: null` deletes the entry (used when nothing honest is available and the
 * gallery keeps ≥3 images).
 */
const GALLERY_FIXES = [
  { slug: 'kashmir-family',   index: 1, match: '1566837945700', to: IMG.tulipGarden,   was: 'desk with monitors' },
  { slug: 'kashmir-paradise', index: 1, match: '1566837945700', to: IMG.dalLake,       was: 'desk with monitors' },
  { slug: 'kashmir-paradise', index: 3, match: '1551882547',    to: IMG.pahalgamMeadow, was: 'HTTP 404' },
  { slug: 'kashmir-scenic-escape', index: 0, match: '1566837945700', to: IMG.tulipGarden, was: 'desk with monitors' },

  { slug: 'belgium-bruges', index: 0, match: '1592853625511', to: IMG.amsCanal,     was: 'Porsche sports car' },
  { slug: 'belgium-bruges', index: 1, match: '1558642452',    to: IMG.amsCanalDusk, was: 'honey jar close-up' },
  { slug: 'belgium-bruges', index: 2, match: '1570129477492', to: IMG.canalSunset,  was: 'American suburban house' },

  { slug: 'belgium-bruges', index: 2, match: '1499856871958', to: IMG.euroOldTown, was: 'Paris bridge inside gallery' },
  { slug: 'luxembourg-vianden', index: 2, match: '1558618666', to: IMG.amsCanalDusk, was: 'man in a workshop' },

  { slug: 'jaisalmer-desert-safari', index: 1, match: '1574267432553', to: IMG.duneCamel, was: 'cinema seats' },

  { slug: 'sikkim-north', index: 1, match: '1600618528240', to: IMG.alpenglow,  was: 'person meditating indoors' },
  { slug: 'sikkim-north', index: 3, match: '1569288052389', to: IMG.mistyPeaks, was: 'carton of eggs' },

  { slug: 'kazakhstan-almaty', index: 1, match: '1584433144859', to: IMG.bigMountains, was: 'phone with padlock stock photo' },
  { slug: 'kazakhstan-almaty', index: 3, match: '1580060839134', to: IMG.mistyPeaks,   was: 'unrelated city aerial' },

  { slug: 'luxembourg-vianden', index: 1, match: '1593978301851', to: IMG.bruges,      was: 'clouds only' },
  { slug: 'luxembourg-vianden', index: 3, match: '1563911892437', to: IMG.canalSunset, was: 'jars of dried herbs' },

  { slug: 'netherlands-amsterdam', index: 3, match: '1576153192396', to: IMG.amsCanal, was: 'architectural sketches' },

  { slug: 'turkey-cappadocia', index: 1, match: '1589561253831', to: IMG.blueMosque, was: '"YOUR IDEAS MATTER" sign' },

  { slug: 'kedarnath-spiritual',                index: 2, match: '1549488344', to: IMG.snowRiver,      was: 'café interior' },
  { slug: 'mussoorie-nainital-rishikesh-family', index: 3, match: '1549488344', to: IMG.rishikeshRiver, was: 'café interior' },
  { slug: 'rishikesh-mussoorie-family',          index: 3, match: '1549488344', to: IMG.lakeSunset,     was: 'café interior' },

  { slug: 'south-korea-seoul', index: 1, match: '1534430480872', to: IMG.seoulStreet, was: 'New York skyline' },

  { slug: 'spiti-gateway', index: 1, match: '1540202404', to: IMG.bigMountains, was: 'Maldives overwater villas' },
  { slug: 'spiti-circuit', index: 2, match: '1614082242765', to: IMG.bigMountains, was: 'tropical beach shacks' },

  { slug: 'andaman-heritage', index: 1, match: '1558862107', to: IMG.andamanBeach, was: 'Fushimi Inari gates (Japan)' },
  { slug: 'andaman-heritage', index: 3, match: '1588416936097', to: IMG.clearBeach, was: 'European palace' },
  { slug: 'andaman-explorer', index: 1, match: '1559592413',    to: IMG.andamanBeach, was: 'Golden Hands Bridge (Vietnam)' },

  { slug: 'dubai-luxury', index: 3, match: '1546587348', to: IMG.camelSunset, was: 'alpine lake, not Dubai' },

  { slug: 'bhutan-clouds', index: 2, match: '1564507592333', to: IMG.mistyPeaks, was: 'Taj Mahal (India)' },

  { slug: 'pushkar-cultural', index: 1, match: '1590075865003', to: IMG.hawaMahal,  was: 'Abu Dhabi mosque' },
  { slug: 'pushkar-cultural', index: 2, match: '1548013146',    to: IMG.goldenFort, was: 'Taj Mahal (Agra)' },

  { slug: 'udaipur-lakes-palaces', index: 1, match: '1561361513', to: IMG.pushkarLake, was: 'camper van' },

  { slug: 'vietnam-halong-bay', index: 0, match: '1562408590', to: IMG.halongBay, was: 'circuit board' },

  { slug: 'singapore-city',   index: 2, match: '1565018054866', to: IMG.merlionNight, was: 'European palace' },
  { slug: 'singapore-family', index: 0, match: '1565018054866', to: IMG.mbsAerial,    was: 'European palace' },

  // ── second pass: hits found by the post-apply completeness sweep ──
  { slug: 'germany-bavaria',   index: 1, match: '1528360983277', to: IMG.mistyPeaks,  was: 'East-Asian neon alley (Bavaria has Alps)' },
  { slug: 'germany-bavaria',   index: 3, match: '1570129477492', to: IMG.alpineLake,  was: 'American suburban house' },
  { slug: 'mongolia-gobi',     index: 0, match: '1614531341773', to: IMG.camelSunset, was: 'African savanna' },
  { slug: 'udaipur-mountabu-family', index: 0, match: '1561361513', to: IMG.goldenFort, was: 'camper van' },
  { slug: 'varanasi-heritage', index: 0, match: '1561361513', to: null,               was: 'camper van (ghats images remain)' },
  { slug: 'turkey-cappadocia', index: 2, match: '1558642452',  to: null,              was: 'honey jar close-up' },
  { slug: 'manali-weekend',    index: 1, match: '1558618666',  to: IMG.manaliForest,  was: 'man in a workshop' },
  { slug: 'munnar-tea-gardens', index: 1, match: '1549488344', to: IMG.keralaBoat,    was: 'café interior' },
  { slug: 'rishikesh-adventure', index: 3, match: '1549488344', to: IMG.lakeSunset,   was: 'café interior' },
  { slug: 'singapore-family',  index: 1, match: '1563492065599', to: null,            was: 'Thai golden shrine' },

  { slug: 'bhutan-happiness',  index: 2, match: '1564507592333', to: IMG.snowRiver, was: 'Taj Mahal (India)' },
  { slug: 'italy-rome-florence-venice', index: 1, match: '1499856871958', to: null, was: 'Paris bridge on an Italy trip' },
  { slug: 'kazakhstan-almaty', index: 0, match: '1605101100278', to: null, was: 'Amsterdam-style canal' },
  { slug: 'mongolia-gobi',     index: 3, match: '1580060839134', to: null, was: 'unrelated city aerial' },

  // Nothing honest available → remove (galleries keep ≥3 entries).
  { slug: 'santorini',               index: 2, match: '1504214208698', to: null, was: 'Thai lagoon on a Greek trip' },
  { slug: 'iceland-northern-lights', index: 3, match: '1488646953014', to: null, was: 'flat-lay of camera gear' },
  { slug: 'srilanka-essence',        index: 2, match: '1439066615861', to: null, was: 'temperate lake pier' },
];

/** The writing-hand photo is junk wherever it appears; map per destination. */
const GLOBAL_JUNK = [
  {
    match: '1573843981267',
    was: 'hand writing on paper',
    perDestination: { Maldives: IMG.overwater, default: IMG.clearBeach },
  },
];

const dryRun = process.argv.includes('--dry-run');

async function apply(pool) {
  const client = await pool.connect();
  const report = { fixed: 0, alreadyFixed: 0, removed: 0, missed: [] };

  const log = (kind, what) => console.log(`  ${kind.padEnd(14)} ${what}`);

  try {
    await client.query('BEGIN');

    for (const fix of DESTINATION_FIXES) {
      const { rows } = await client.query('SELECT image FROM destinations WHERE slug = $1', [fix.slug]);
      if (!rows.length) { report.missed.push(`dest ${fix.slug}: no such row`); continue; }
      if (!rows[0].image?.includes(fix.match)) { report.alreadyFixed++; log('already-fixed', `dest ${fix.slug}`); continue; }
      log(dryRun ? 'would-fix' : 'fixed', `dest ${fix.slug}.image — was: ${fix.was}`);
      if (!dryRun) {
        await client.query('UPDATE destinations SET image = $1, updated_at = CURRENT_TIMESTAMP WHERE slug = $2', [fix.to, fix.slug]);
      }
      report.fixed++;
    }

    for (const fix of COVER_FIXES) {
      const { rows } = await client.query('SELECT cover_image, gallery FROM packages WHERE slug = $1', [fix.slug]);
      if (!rows.length) { report.missed.push(`pkg ${fix.slug}: no such row`); continue; }
      const current = rows[0].cover_image ?? '';
      if (!current.includes(fix.match)) { report.alreadyFixed++; log('already-fixed', `pkg ${fix.slug} cover`); continue; }

      // varanasi-heritage: promote its own (correct) ghats gallery image.
      const replacement = fix.to ?? rows[0].gallery?.[fix.useGallery];
      if (!replacement) { report.missed.push(`pkg ${fix.slug}: no gallery[${fix.useGallery}] to promote`); continue; }

      log(dryRun ? 'would-fix' : 'fixed', `pkg ${fix.slug}.cover_image — was: ${fix.was}`);
      if (!dryRun) {
        await client.query('UPDATE packages SET cover_image = $1, updated_at = CURRENT_TIMESTAMP WHERE slug = $2', [replacement, fix.slug]);
      }
      report.fixed++;
    }

    for (const fix of GALLERY_FIXES) {
      const { rows } = await client.query('SELECT gallery FROM packages WHERE slug = $1', [fix.slug]);
      if (!rows.length) { report.missed.push(`pkg ${fix.slug}: no such row`); continue; }
      const gallery = rows[0].gallery ?? [];
      const current = gallery[fix.index] ?? '';
      if (!current.includes(fix.match)) {
        // Index may have shifted after an earlier removal — search by match.
        const at = gallery.findIndex((g) => g?.includes(fix.match));
        if (at === -1) { report.alreadyFixed++; log('already-fixed', `pkg ${fix.slug} gallery[${fix.index}]`); continue; }
        fix.index = at;
      }

      const next = [...gallery];
      if (fix.to === null) {
        next.splice(fix.index, 1);
        report.removed++;
        log(dryRun ? 'would-remove' : 'removed', `pkg ${fix.slug} gallery[${fix.index}] — was: ${fix.was} (gallery ${gallery.length}→${next.length})`);
      } else {
        next[fix.index] = fix.to;
        report.fixed++;
        log(dryRun ? 'would-fix' : 'fixed', `pkg ${fix.slug} gallery[${fix.index}] — was: ${fix.was}`);
      }
      if (!dryRun) {
        await client.query('UPDATE packages SET gallery = $1, updated_at = CURRENT_TIMESTAMP WHERE slug = $2',
          [JSON.stringify(next), fix.slug]);
      }
    }

    for (const junk of GLOBAL_JUNK) {
      const { rows } = await client.query(
        `SELECT p.slug, p.gallery, d.name AS dest FROM packages p
           LEFT JOIN destinations d ON d.id = p.destination_id
          WHERE p.gallery::text LIKE $1`, [`%${junk.match}%`]);
      for (const row of rows) {
        const replacement = junk.perDestination[row.dest] ?? junk.perDestination.default;
        const next = row.gallery.map((g) => (g?.includes(junk.match) ? replacement : g));
        log(dryRun ? 'would-fix' : 'fixed', `pkg ${row.slug} gallery — was: ${junk.was} (dest ${row.dest ?? '—'})`);
        if (!dryRun) {
          await client.query('UPDATE packages SET gallery = $1, updated_at = CURRENT_TIMESTAMP WHERE slug = $2',
            [JSON.stringify(next), row.slug]);
        }
        report.fixed++;
      }
    }

    if (dryRun) {
      await client.query('ROLLBACK');
    } else {
      await client.query('COMMIT');
    }
    return report;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

const pool = getPool();
try {
  console.log(dryRun ? '── DRY RUN — nothing will be written ──' : '── Applying image corrections ──');
  const report = await apply(pool);
  console.log(`\nfixed: ${report.fixed}  removed: ${report.removed}  already-fixed: ${report.alreadyFixed}  missed: ${report.missed.length}`);
  report.missed.forEach((m) => console.log(`  MISSED: ${m}`));
  if (report.missed.length > 0) process.exitCode = 1;
} catch (err) {
  console.error('✗ rolled back:', err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
