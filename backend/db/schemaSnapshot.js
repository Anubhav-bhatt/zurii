/**
 * Describe a database schema precisely enough to prove two databases match,
 * and compare two descriptions.
 *
 * Used for two decisions that must never be made on trust:
 *   - that 0001_baseline_schema reproduces exactly what the pre-ledger boot path
 *     builds (db/schema/0001_baseline_schema.snapshot.json was captured from it);
 *   - that an EXISTING database (e.g. production, in a later approved phase) is
 *     identical to the baseline before it is adopted into the migration ledger.
 *
 * Read-only: catalogue queries only.
 */

/** Infrastructure tables owned by the migration/seed tooling, not the app. */
const TOOLING_TABLES = new Set(['schema_migrations', 'catalogue_seed_ledger']);
/** Abandoned pre-catalogue tables renamed out of the way by the old boot path. */
const LEGACY_TABLE = /^legacy_/;

async function describeSchema(client, { schema = 'public' } = {}) {
  const keep = (table) => !TOOLING_TABLES.has(table) && !LEGACY_TABLE.test(table);

  const tables = await client.query(
    `SELECT c.relname AS name
       FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = $1 AND c.relkind IN ('r', 'p')
      ORDER BY 1`,
    [schema]
  );
  const columns = await client.query(
    `SELECT c.relname AS table, a.attnum AS position, a.attname AS name,
            format_type(a.atttypid, a.atttypmod) AS type, a.attnotnull AS not_null,
            pg_get_expr(d.adbin, d.adrelid) AS default_value
       FROM pg_attribute a
       JOIN pg_class c ON c.oid = a.attrelid
       JOIN pg_namespace n ON n.oid = c.relnamespace
       LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
      WHERE n.nspname = $1 AND c.relkind IN ('r', 'p') AND a.attnum > 0 AND NOT a.attisdropped
      ORDER BY c.relname, a.attnum`,
    [schema]
  );
  const constraints = await client.query(
    `SELECT c.relname AS table, con.conname AS name, con.contype AS type,
            pg_get_constraintdef(con.oid, true) AS definition
       FROM pg_constraint con
       JOIN pg_class c ON c.oid = con.conrelid
       JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = $1
      ORDER BY c.relname, con.conname`,
    [schema]
  );
  const indexes = await client.query(
    `SELECT tablename AS table, indexname AS name, indexdef AS definition
       FROM pg_indexes WHERE schemaname = $1
      ORDER BY tablename, indexname`,
    [schema]
  );

  const out = {};
  for (const { name } of tables.rows) {
    if (keep(name)) out[name] = { columns: [], constraints: [], indexes: [] };
  }
  // Positions are re-numbered densely so a dropped column elsewhere in a
  // table's history does not make two equivalent tables look different.
  const seen = {};
  for (const col of columns.rows) {
    if (!out[col.table]) continue;
    seen[col.table] = (seen[col.table] || 0) + 1;
    out[col.table].columns.push({
      position: seen[col.table],
      name: col.name,
      type: col.type,
      notNull: col.not_null,
      default: col.default_value,
    });
  }
  for (const con of constraints.rows) {
    if (out[con.table]) out[con.table].constraints.push({ name: con.name, type: con.type, definition: con.definition });
  }
  for (const idx of indexes.rows) {
    if (out[idx.table]) out[idx.table].indexes.push({ name: idx.name, definition: idx.definition });
  }
  return { schema, tables: out };
}

/**
 * One spelling for a CHECK definition whose text depends on how the constraint
 * reached the database, not on what it means.
 *
 * `status IN ('A', 'B')` on a varchar column, created from SQL, is reported by
 * pg_get_constraintdef as
 *     ANY (ARRAY['A'::character varying, 'B'::character varying]::text[])
 * A pg_dump / pg_restore round trip re-parses that text and PostgreSQL pushes
 * the cast into each element:
 *     ANY (ARRAY['A'::character varying::text, 'B'::character varying::text])
 * The constraint is the same, but the text differs, so without this every
 * restored copy — the staging rehearsal of a production adoption, and any
 * disaster-recovery restore — failed `verify` and was refused adoption
 * (found in the Phase 7 upgrade rehearsal). Both spellings become
 *     ANY (ARRAY['A'::text, 'B'::text])
 * Only varchar→text casts of string literals inside ARRAY[...] are rewritten:
 * the values, the operator and the column are compared exactly as before, so a
 * constraint that accepts a different set of values still differs.
 */
function canonicalConstraint(definition) {
  return String(definition)
    .replace(/ARRAY\[((?:'(?:[^']|'')*'::character varying(?:, )?)+)\]::text\[\]/g,
      (_, inner) => `ARRAY[${inner.replace(/::character varying(?=, |$)/g, '::text')}]`)
    .replace(/('(?:[^']|'')*')::character varying::text/g, '$1::text');
}

/**
 * Differences between an expected and an actual description, as readable lines.
 * An empty array means "identical" under the given options.
 *
 * @param {object} expected
 * @param {object} actual
 * @param {object} [options]
 * @param {boolean} [options.ignoreColumnOrder]  compare columns by name only
 * @param {string[]} [options.allowExtraIndexes]  index names a LATER migration
 *        creates idempotently; their presence does not block adoption
 */
function compareSchemas(expected, actual, { ignoreColumnOrder = false, allowExtraIndexes = [] } = {}) {
  const diffs = [];
  const allowed = new Set(allowExtraIndexes);
  const exp = expected.tables;
  const act = actual.tables;

  for (const table of Object.keys(exp)) {
    if (!act[table]) diffs.push(`missing table ${table}`);
  }
  for (const table of Object.keys(act)) {
    if (!exp[table]) diffs.push(`unexpected table ${table}`);
  }

  for (const table of Object.keys(exp)) {
    const e = exp[table];
    const a = act[table];
    if (!a) continue;

    const byName = (list) => new Map(list.map((x) => [x.name, x]));
    const ec = byName(e.columns);
    const ac = byName(a.columns);
    for (const [name, col] of ec) {
      const other = ac.get(name);
      if (!other) {
        diffs.push(`${table}: missing column ${name}`);
        continue;
      }
      for (const field of ['type', 'notNull', 'default']) {
        if (col[field] !== other[field]) {
          diffs.push(`${table}.${name}: ${field} is ${JSON.stringify(other[field])}, expected ${JSON.stringify(col[field])}`);
        }
      }
      if (!ignoreColumnOrder && col.position !== other.position) {
        diffs.push(`${table}.${name}: position ${other.position}, expected ${col.position}`);
      }
    }
    for (const name of ac.keys()) {
      if (!ec.has(name)) diffs.push(`${table}: unexpected column ${name}`);
    }

    const ek = byName(e.constraints);
    const ak = byName(a.constraints);
    for (const [name, con] of ek) {
      const other = ak.get(name);
      if (!other) diffs.push(`${table}: missing constraint ${name}`);
      else if (canonicalConstraint(other.definition) !== canonicalConstraint(con.definition) || other.type !== con.type) {
        diffs.push(`${table}: constraint ${name} is "${other.definition}", expected "${con.definition}"`);
      }
    }
    for (const name of ak.keys()) {
      if (!ek.has(name)) diffs.push(`${table}: unexpected constraint ${name}`);
    }

    const ei = byName(e.indexes);
    const ai = byName(a.indexes);
    for (const [name, idx] of ei) {
      const other = ai.get(name);
      if (!other) diffs.push(`${table}: missing index ${name}`);
      else if (other.definition !== idx.definition) {
        diffs.push(`${table}: index ${name} is "${other.definition}", expected "${idx.definition}"`);
      }
    }
    for (const name of ai.keys()) {
      if (!ei.has(name) && !allowed.has(name)) diffs.push(`${table}: unexpected index ${name}`);
    }
  }
  return diffs;
}

module.exports = { describeSchema, compareSchemas, canonicalConstraint, TOOLING_TABLES, LEGACY_TABLE };
