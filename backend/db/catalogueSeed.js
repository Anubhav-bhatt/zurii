/**
 * Catalogue seeding from the versioned artifact db/catalogue/catalogue.v2.json.
 *
 * The artifact replaces the old runtime dependency on frontend/src/data: the
 * backend initialises the catalogue from a stable, reviewed JSON file that
 * ships with the backend (and its Docker build context). The frontend data is
 * only read by scripts/catalogue-export.mjs, by hand, to produce a new version.
 *
 * Seeding is deterministic and idempotent:
 *   - records are written in artifact order, in ONE transaction;
 *   - a slug with no row and no ledger entry is INSERTED;
 *   - a row the seeder created and nobody has touched since is UPDATED only
 *     when the artifact content for it changed (e.g. Phase 2 image paths);
 *   - a row that was edited after seeding, deleted after seeding, or existed
 *     before the seeder (no ledger entry) is NEVER written — it is reported;
 *   - running the same artifact twice changes nothing.
 *
 * Schema creation is not this module's business: it requires the migrated
 * schema (0003_catalogue_seed_ledger) and refuses otherwise.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// The artifact that gets seeded. v1 (remote image URLs, straight from the
// frontend data) is kept as the input v2 is derived from; v2 is v1 with image
// references pointed at locally hosted assets — scripts/catalogue-localize.mjs.
const ARTIFACT_FILE = path.join(__dirname, 'catalogue', 'catalogue.v2.json');
const ARTIFACT_NAME = 'zurii-travel-catalogue';

const DESTINATION_COLUMNS = Object.freeze([
  'legacy_id', 'name', 'slug', 'country', 'region', 'kind', 'short_description', 'description',
  'image', 'gallery', 'featured', 'active', 'metadata',
]);
const PACKAGE_COLUMNS = Object.freeze([
  'legacy_id', 'title', 'slug', 'destination_id', 'subtitle', 'short_description', 'description',
  'duration_days', 'duration_nights', 'duration_text', 'price', 'original_price', 'currency',
  'cover_image', 'gallery', 'highlights', 'itinerary', 'inclusions', 'exclusions', 'batches', 'tags',
  'trip_type', 'rating', 'reviews_count', 'group_size', 'difficulty', 'featured', 'popular', 'status', 'metadata',
]);
const JSON_COLUMNS = new Set(['gallery', 'highlights', 'itinerary', 'inclusions', 'exclusions', 'batches', 'tags', 'metadata']);
const PACKAGE_ARRAY_COLUMNS = ['gallery', 'highlights', 'itinerary', 'inclusions', 'exclusions', 'batches', 'tags'];
const NUMERIC_COLUMNS = new Set(['price', 'original_price', 'rating']);

/** Hash of a row as stored, excluding the surrogate key and bookkeeping timestamps. */
const ROW_HASH_SQL = `md5((to_jsonb(t) - 'id' - 'created_at' - 'updated_at')::text)`;

/** Stable JSON: object keys sorted at every depth, so equal content hashes equally. */
function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

const sha256 = (text) => crypto.createHash('sha256').update(text, 'utf8').digest('hex');
const artifactHash = (record) => sha256(canonicalJson(record));

/**
 * An image reference the deployed site can load from any machine: an http(s)
 * URL (a photo still served remotely) or a site-relative path such as
 * /assets/travel/v1/<asset-id>/1280.jpg (the locally hosted assets, catalogue
 * v2 onwards). Absolute machine paths, file: and data: URIs are
 * rejected so a developer's filesystem can never leak into the catalogue.
 */
function isPortableImageRef(value) {
  if (value === null || value === undefined) return true;
  if (typeof value !== 'string' || value.trim() === '' || value !== value.trim()) return false;
  if (/^https?:\/\/\S+$/i.test(value)) return true;
  return (
    /^\/(?!\/)[A-Za-z0-9._~%\-/]+$/.test(value) &&
    !/^\/(Users|home|private|var|tmp|Volumes|mnt|opt|etc|root|srv|usr)\//.test(value)
  );
}

function validateArtifact(artifact) {
  const problems = [];
  if (artifact?.artifact !== ARTIFACT_NAME) problems.push(`"artifact" must be "${ARTIFACT_NAME}"`);
  if (!Number.isInteger(artifact?.version) || artifact.version < 1) problems.push('"version" must be a positive integer');
  if (!Array.isArray(artifact?.destinations) || !Array.isArray(artifact?.packages)) {
    problems.push('"destinations" and "packages" must be arrays');
    return problems;
  }
  if (artifact.counts?.destinations !== artifact.destinations.length) problems.push('counts.destinations does not match the array');
  if (artifact.counts?.packages !== artifact.packages.length) problems.push('counts.packages does not match the array');

  const destinationSlugs = new Set();
  for (const d of artifact.destinations) {
    const label = `destination ${d?.slug ?? '(no slug)'}`;
    for (const col of DESTINATION_COLUMNS) if (!(col in d)) problems.push(`${label}: missing "${col}"`);
    if (typeof d.slug !== 'string' || !d.slug) problems.push(`${label}: slug required`);
    if (destinationSlugs.has(d.slug)) problems.push(`${label}: duplicate slug`);
    destinationSlugs.add(d.slug);
    if (typeof d.name !== 'string' || !d.name) problems.push(`${label}: name required`);
    if (!['domestic', 'international'].includes(d.kind)) problems.push(`${label}: kind must be domestic|international`);
    if (typeof d.featured !== 'boolean' || typeof d.active !== 'boolean') problems.push(`${label}: featured/active must be booleans`);
    if (!Array.isArray(d.gallery)) problems.push(`${label}: gallery must be an array`);
    if (!d.metadata || typeof d.metadata !== 'object' || Array.isArray(d.metadata)) problems.push(`${label}: metadata must be an object`);
    for (const ref of [d.image, ...(Array.isArray(d.gallery) ? d.gallery : [])]) {
      if (!isPortableImageRef(ref)) problems.push(`${label}: non-portable image reference`);
    }
  }

  const packageSlugs = new Set();
  for (const p of artifact.packages) {
    const label = `package ${p?.slug ?? '(no slug)'}`;
    for (const col of PACKAGE_COLUMNS) {
      if (col !== 'destination_id' && !(col in p)) problems.push(`${label}: missing "${col}"`);
    }
    if (!('destination_slug' in p)) problems.push(`${label}: missing "destination_slug"`);
    else if (p.destination_slug !== null && !destinationSlugs.has(p.destination_slug)) {
      problems.push(`${label}: destination_slug "${p.destination_slug}" is not in the artifact`);
    }
    if (typeof p.slug !== 'string' || !p.slug) problems.push(`${label}: slug required`);
    if (packageSlugs.has(p.slug)) problems.push(`${label}: duplicate slug`);
    packageSlugs.add(p.slug);
    if (typeof p.title !== 'string' || !p.title) problems.push(`${label}: title required`);
    if (!['DRAFT', 'PUBLISHED', 'ARCHIVED'].includes(p.status)) problems.push(`${label}: invalid status`);
    for (const col of ['price', 'original_price']) {
      if (p[col] !== null && !(typeof p[col] === 'number' && Number.isFinite(p[col]) && p[col] >= 0)) {
        problems.push(`${label}: ${col} must be null or a non-negative number`);
      }
    }
    for (const col of PACKAGE_ARRAY_COLUMNS) if (!Array.isArray(p[col])) problems.push(`${label}: ${col} must be an array`);
    if (!p.metadata || typeof p.metadata !== 'object' || Array.isArray(p.metadata)) problems.push(`${label}: metadata must be an object`);
    if (typeof p.featured !== 'boolean' || typeof p.popular !== 'boolean') problems.push(`${label}: featured/popular must be booleans`);
    for (const ref of [p.cover_image, ...(Array.isArray(p.gallery) ? p.gallery : [])]) {
      if (!isPortableImageRef(ref)) problems.push(`${label}: non-portable image reference`);
    }
  }
  return problems;
}

function loadArtifact(file = ARTIFACT_FILE) {
  const artifact = JSON.parse(fs.readFileSync(file, 'utf8'));
  const problems = validateArtifact(artifact);
  if (problems.length > 0) {
    throw new Error(`Catalogue artifact ${path.basename(file)} is invalid:\n  - ${problems.join('\n  - ')}`);
  }
  return artifact;
}

const counters = () => ({ inserted: 0, updated: 0, unchanged: 0, edited: 0, deleted: 0, unmanaged: 0 });

async function rowHash(client, table, slug) {
  const { rows } = await client.query(`SELECT ${ROW_HASH_SQL} AS hash FROM ${table} t WHERE slug = $1`, [slug]);
  return rows[0]?.hash ?? null;
}

async function recordLedger(client, entity, slug, version, aHash, rHash) {
  await client.query(
    `INSERT INTO catalogue_seed_ledger (entity_type, slug, artifact_version, artifact_hash, row_hash)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (entity_type, slug) DO UPDATE
        SET artifact_version = EXCLUDED.artifact_version,
            artifact_hash    = EXCLUDED.artifact_hash,
            row_hash         = EXCLUDED.row_hash,
            seeded_at        = NOW()`,
    [entity, slug, version, aHash, rHash]
  );
}

/** Insert / update / skip one record according to the rules in the header. */
async function applyRecord(client, { entity, table, columns, values, record, version, ledger, counts, skipped }) {
  const slug = values.slug;
  const key = `${entity}:${slug}`;
  const aHash = artifactHash(record);
  const params = columns.map((c) => (JSON_COLUMNS.has(c) ? JSON.stringify(values[c]) : values[c]));
  const cast = (c, i) => `$${i + 1}${JSON_COLUMNS.has(c) ? '::jsonb' : ''}`;
  const current = await rowHash(client, table, slug);
  const entry = ledger.get(key);

  if (current === null) {
    if (entry) {
      counts.deleted += 1;
      skipped.push(`${key}: deleted after it was seeded — not re-created`);
      return;
    }
    await client.query(
      `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns.map(cast).join(', ')})`,
      params
    );
    await recordLedger(client, entity, slug, version, aHash, await rowHash(client, table, slug));
    counts.inserted += 1;
    return;
  }
  if (!entry) {
    counts.unmanaged += 1;
    skipped.push(`${key}: existed before seeding (not created by the seeder) — left untouched`);
    return;
  }
  if (current !== String(entry.row_hash).trim()) {
    counts.edited += 1;
    skipped.push(`${key}: edited since it was seeded — left untouched`);
    return;
  }
  if (String(entry.artifact_hash).trim() === aHash) {
    counts.unchanged += 1;
    return;
  }
  const assignments = columns.map((c, i) => `${c} = ${cast(c, i)}`).join(', ');
  const slugParam = columns.indexOf('slug') + 1;
  await client.query(
    `UPDATE ${table} SET ${assignments}, updated_at = CURRENT_TIMESTAMP WHERE slug = $${slugParam}`,
    params
  );
  await recordLedger(client, entity, slug, version, aHash, await rowHash(client, table, slug));
  counts.updated += 1;
}

/**
 * Seed (or re-seed) the catalogue. `client` must already be a verified
 * connection (scripts/db.mjs, the test runner).
 *
 * @returns {Promise<{artifactVersion: number, dryRun: boolean, destinations: object, packages: object, skipped: string[]}>}
 */
async function seedCatalogue(client, { artifact = loadArtifact(), dryRun = false } = {}) {
  const { rows } = await client.query(`SELECT to_regclass('public.catalogue_seed_ledger') IS NOT NULL AS ready`);
  if (!rows[0].ready) {
    throw new Error('catalogue_seed_ledger is missing — apply the migrations first (0003_catalogue_seed_ledger).');
  }
  const summary = {
    artifactVersion: artifact.version,
    dryRun,
    destinations: counters(),
    packages: counters(),
    skipped: [],
  };

  await client.query('BEGIN');
  try {
    const ledgerRows = await client.query('SELECT entity_type, slug, artifact_hash, row_hash FROM catalogue_seed_ledger');
    const ledger = new Map(ledgerRows.rows.map((r) => [`${r.entity_type}:${r.slug}`, r]));

    for (const d of artifact.destinations) {
      const values = Object.fromEntries(DESTINATION_COLUMNS.map((c) => [c, d[c]]));
      await applyRecord(client, {
        entity: 'destination', table: 'destinations', columns: DESTINATION_COLUMNS, values, record: d,
        version: artifact.version, ledger, counts: summary.destinations, skipped: summary.skipped,
      });
    }

    const ids = new Map((await client.query('SELECT slug, id FROM destinations')).rows.map((r) => [r.slug, r.id]));
    for (const p of artifact.packages) {
      let destinationId = null;
      if (p.destination_slug !== null) {
        destinationId = ids.get(p.destination_slug);
        if (destinationId === undefined) {
          throw new Error(`package ${p.slug}: destination "${p.destination_slug}" is not in the database`);
        }
      }
      const values = Object.fromEntries(PACKAGE_COLUMNS.map((c) => [c, c === 'destination_id' ? destinationId : p[c]]));
      await applyRecord(client, {
        entity: 'package', table: 'packages', columns: PACKAGE_COLUMNS, values, record: p,
        version: artifact.version, ledger, counts: summary.packages, skipped: summary.skipped,
      });
    }

    await client.query(dryRun ? 'ROLLBACK' : 'COMMIT');
    return summary;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  }
}

/** Equality between a stored value and the artifact value it came from. */
function sameValue(column, stored, expected) {
  if (NUMERIC_COLUMNS.has(column)) {
    return (stored === null && expected === null) || (stored !== null && expected !== null && Number(stored) === Number(expected));
  }
  if (JSON_COLUMNS.has(column)) return canonicalJson(stored) === canonicalJson(expected);
  return stored === expected;
}

/**
 * Read-only integrity checks of the catalogue against the artifact.
 * `failures` must be empty for a database seeded only from this artifact.
 */
async function verifyCatalogue(client, artifact = loadArtifact()) {
  const failures = [];
  const notes = [];
  const q = async (sql, params) => (await client.query(sql, params)).rows;

  const [{ destinations, packages, published, ledger_rows: ledgerRows }] = await q(
    `SELECT (SELECT COUNT(*)::int FROM destinations) AS destinations,
            (SELECT COUNT(*)::int FROM packages) AS packages,
            (SELECT COUNT(*)::int FROM packages WHERE status = 'PUBLISHED') AS published,
            (SELECT COUNT(*)::int FROM catalogue_seed_ledger) AS ledger_rows`
  );
  if (destinations !== artifact.destinations.length) failures.push(`destinations: ${destinations} rows, artifact has ${artifact.destinations.length}`);
  if (packages !== artifact.packages.length) failures.push(`packages: ${packages} rows, artifact has ${artifact.packages.length}`);

  for (const [table] of [['destinations'], ['packages']]) {
    const dupes = await q(`SELECT slug FROM ${table} GROUP BY slug HAVING COUNT(*) > 1`);
    if (dupes.length) failures.push(`${table}: duplicate slugs ${dupes.map((r) => r.slug).join(', ')}`);
  }
  const orphans = await q(
    `SELECT p.slug FROM packages p
      WHERE p.destination_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM destinations d WHERE d.id = p.destination_id)`
  );
  if (orphans.length) failures.push(`packages with a dangling destination_id: ${orphans.map((r) => r.slug).join(', ')}`);

  const badJson = await q(
    `SELECT slug FROM packages
      WHERE jsonb_typeof(gallery) <> 'array' OR jsonb_typeof(highlights) <> 'array' OR jsonb_typeof(itinerary) <> 'array'
         OR jsonb_typeof(inclusions) <> 'array' OR jsonb_typeof(exclusions) <> 'array' OR jsonb_typeof(batches) <> 'array'
         OR jsonb_typeof(tags) <> 'array' OR jsonb_typeof(metadata) <> 'object'
     UNION ALL
     SELECT slug FROM destinations WHERE jsonb_typeof(gallery) <> 'array' OR jsonb_typeof(metadata) <> 'object'`
  );
  if (badJson.length) failures.push(`rows with malformed JSONB: ${badJson.map((r) => r.slug).join(', ')}`);

  // Field-by-field equality with the artifact, including package → destination links.
  const destRows = new Map((await q(`SELECT to_jsonb(t) AS row FROM destinations t`)).map((r) => [r.row.slug, r.row]));
  const pkgRows = new Map(
    (await q(
      `SELECT to_jsonb(t) || jsonb_build_object('destination_slug', d.slug) AS row
         FROM packages t LEFT JOIN destinations d ON d.id = t.destination_id`
    )).map((r) => [r.row.slug, r.row])
  );
  const mismatches = [];
  for (const d of artifact.destinations) {
    const row = destRows.get(d.slug);
    if (!row) { mismatches.push(`destination ${d.slug}: missing`); continue; }
    for (const c of DESTINATION_COLUMNS) if (!sameValue(c, row[c], d[c])) mismatches.push(`destination ${d.slug}.${c}`);
  }
  for (const p of artifact.packages) {
    const row = pkgRows.get(p.slug);
    if (!row) { mismatches.push(`package ${p.slug}: missing`); continue; }
    for (const c of PACKAGE_COLUMNS) {
      if (c === 'destination_id') continue;
      if (!sameValue(c, row[c], p[c])) mismatches.push(`package ${p.slug}.${c}`);
    }
    if ((row.destination_slug ?? null) !== p.destination_slug) mismatches.push(`package ${p.slug}.destination`);
  }
  if (mismatches.length) {
    failures.push(`${mismatches.length} field(s) differ from the artifact: ${mismatches.slice(0, 10).join(', ')}${mismatches.length > 10 ? ', …' : ''}`);
  }

  const edited = await q(
    `SELECT 'destination:' || l.slug AS key FROM catalogue_seed_ledger l
       JOIN destinations t ON t.slug = l.slug
      WHERE l.entity_type = 'destination' AND ${ROW_HASH_SQL} <> l.row_hash
     UNION ALL
     SELECT 'package:' || l.slug FROM catalogue_seed_ledger l
       JOIN packages t ON t.slug = l.slug
      WHERE l.entity_type = 'package' AND ${ROW_HASH_SQL} <> l.row_hash`
  );
  if (edited.length) notes.push(`${edited.length} seeded row(s) edited since seeding: ${edited.map((r) => r.key).join(', ')}`);
  const deleted = await q(
    `SELECT l.entity_type || ':' || l.slug AS key FROM catalogue_seed_ledger l
      WHERE (l.entity_type = 'destination' AND NOT EXISTS (SELECT 1 FROM destinations d WHERE d.slug = l.slug))
         OR (l.entity_type = 'package' AND NOT EXISTS (SELECT 1 FROM packages p WHERE p.slug = l.slug))`
  );
  if (deleted.length) notes.push(`${deleted.length} seeded row(s) deleted since seeding: ${deleted.map((r) => r.key).join(', ')}`);

  return {
    failures,
    notes,
    counts: { destinations, packages, published, ledgerRows },
    packagesWithoutDestination: artifact.packages.filter((p) => p.destination_slug === null).map((p) => p.slug),
  };
}

/** Every image reference in the catalogue, in a stable order (read-only). */
async function imageInventory(client) {
  const { rows } = await client.query(
    `WITH refs AS (
       SELECT 'destination' AS entity, slug, 'image' AS field, 0 AS position, image AS reference
         FROM destinations WHERE image IS NOT NULL
       UNION ALL
       SELECT 'destination', d.slug, 'gallery', (g.ord - 1)::int, g.value
         FROM destinations d, jsonb_array_elements_text(d.gallery) WITH ORDINALITY AS g(value, ord)
       UNION ALL
       SELECT 'package', slug, 'cover_image', 0, cover_image
         FROM packages WHERE cover_image IS NOT NULL
       UNION ALL
       SELECT 'package', p.slug, 'gallery', (g.ord - 1)::int, g.value
         FROM packages p, jsonb_array_elements_text(p.gallery) WITH ORDINALITY AS g(value, ord)
       UNION ALL
       SELECT 'destination', d.slug, 'metadata', 0, m.value #>> '{}'
         FROM destinations d, jsonb_path_query(d.metadata, 'strict $.** ? (@.type() == "string" && @ like_regex "^https?://")') AS m(value)
       UNION ALL
       SELECT 'package', p.slug, 'metadata', 0, m.value #>> '{}'
         FROM packages p, jsonb_path_query(p.metadata, 'strict $.** ? (@.type() == "string" && @ like_regex "^https?://")') AS m(value)
     )
     SELECT entity, slug, field, position, reference FROM refs
      ORDER BY entity, slug, field, position, reference`
  );
  return rows.map((r) => {
    let host = '';
    try {
      host = new URL(r.reference).host;
    } catch {
      host = '';
    }
    return { ...r, host, kind: /^https?:\/\//i.test(r.reference) ? 'remote' : 'local' };
  });
}

module.exports = {
  ARTIFACT_FILE,
  ARTIFACT_NAME,
  DESTINATION_COLUMNS,
  PACKAGE_COLUMNS,
  canonicalJson,
  artifactHash,
  isPortableImageRef,
  validateArtifact,
  loadArtifact,
  seedCatalogue,
  verifyCatalogue,
  imageInventory,
};
