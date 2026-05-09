/**
 * Probe the live Hydrawise GraphQL endpoint via standard introspection,
 * write the canonical SDL to `schema/hydrawise.live.graphql`, and report
 * what's new vs the cached pydrawise schema we developed against.
 *
 * Run: `npx tsx scripts/probe-schema.ts [--no-write]`
 *
 * Requires `HYDRAWISE_USERNAME` and `HYDRAWISE_PASSWORD` in `.env`.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { config as loadDotenv } from 'dotenv';
import {
  buildClientSchema,
  getIntrospectionQuery,
  printSchema,
  type IntrospectionQuery,
} from 'graphql';
import { GraphQLClient } from 'graphql-request';
import { Auth } from '../src/hydrawise/auth.js';
import { loadConfig } from '../src/config.js';

const GRAPHQL_URL = 'https://app.hydrawise.com/api/v2/graph';
const CACHED_SCHEMA_PATH = '/tmp/hydrawise.graphql';
const OUT_PATH = 'schema/hydrawise.live.graphql';

interface MutField {
  name: string;
  args: { name: string }[];
}

async function main(): Promise<void> {
  const writeOutput = !process.argv.includes('--no-write');

  if (existsSync('.env')) loadDotenv();
  const cfg = loadConfig();
  const auth = new Auth(cfg.username, cfg.password);
  const header = await auth.getAuthHeader();
  const client = new GraphQLClient(GRAPHQL_URL, { headers: { Authorization: header } });

  process.stderr.write('fetching live schema via introspection...\n');
  const live = (await client.request(getIntrospectionQuery({ descriptions: true }))) as
    | { __schema: IntrospectionQuery['__schema'] }
    | IntrospectionQuery;
  const introspection: IntrospectionQuery = '__schema' in live ? (live as IntrospectionQuery) : live;

  // SDL output
  const schema = buildClientSchema(introspection);
  const sdl = printSchema(schema);
  const header_text = [
    `# Live Hydrawise GraphQL schema, captured via introspection on ${new Date().toISOString()}`,
    `# Endpoint: ${GRAPHQL_URL}`,
    `# Captured by: scripts/probe-schema.ts`,
    `#`,
    `# This file is the authoritative reference for queries and mutations we hand-write.`,
    `# Re-run \`npx tsx scripts/probe-schema.ts\` after any user-visible Hydrawise feature`,
    `# change to refresh it.`,
    ``,
  ].join('\n');

  if (writeOutput) {
    mkdirSync(dirname(OUT_PATH), { recursive: true });
    writeFileSync(OUT_PATH, header_text + sdl + '\n', 'utf8');
    process.stderr.write(`wrote ${OUT_PATH} (${sdl.length} chars)\n`);
  }

  // Diff against cached schema
  if (!existsSync(CACHED_SCHEMA_PATH)) {
    process.stderr.write(`cached schema not found at ${CACHED_SCHEMA_PATH}; skipping diff\n`);
    return;
  }
  const cachedSDL = readFileSync(CACHED_SCHEMA_PATH, 'utf8');

  const cachedTypeNames = new Set<string>();
  for (const m of cachedSDL.matchAll(/^(?:type|interface|enum|input|scalar)\s+(\w+)/gm)) {
    cachedTypeNames.add(m[1]!);
  }
  const mutationBlockMatch = cachedSDL.match(/^type Mutation\s*\{([\s\S]*?)^\}/m);
  const cachedMutationNames = new Set<string>();
  const cachedMutationArgs = new Map<string, Set<string>>();
  if (mutationBlockMatch) {
    const block = mutationBlockMatch[1]!;
    for (const m of block.matchAll(/^\s+(\w+)\s*\(([^)]*)\)/gm)) {
      const name = m[1]!;
      const argsRaw = m[2]!;
      cachedMutationNames.add(name);
      const argNames = new Set<string>();
      for (const a of argsRaw.matchAll(/(\w+)\s*:/g)) argNames.add(a[1]!);
      cachedMutationArgs.set(name, argNames);
    }
    for (const m of block.matchAll(/^\s+(\w+)\s*:/gm)) {
      cachedMutationNames.add(m[1]!);
    }
  }

  const liveTypeNames = new Set(introspection.__schema.types.map((t) => t.name));
  const newTypes = [...liveTypeNames]
    .filter((n) => !cachedTypeNames.has(n) && !n.startsWith('__'))
    .sort();

  const liveMutationType = introspection.__schema.types.find(
    (t) => t.name === introspection.__schema.mutationType?.name,
  );
  // Object types have a `fields` array; cast as needed.
  const liveMutationFields: MutField[] =
    (liveMutationType && 'fields' in liveMutationType
      ? (liveMutationType.fields as unknown as MutField[])
      : []) ?? [];

  const liveMutationByName = new Map(liveMutationFields.map((f) => [f.name, f]));
  const newMutations = [...liveMutationByName.keys()]
    .filter((n) => !cachedMutationNames.has(n))
    .sort();

  const argDiffs: { name: string; added: string[] }[] = [];
  for (const liveMut of liveMutationFields) {
    const cachedArgs = cachedMutationArgs.get(liveMut.name);
    if (!cachedArgs) continue;
    const liveArgs = liveMut.args.map((a) => a.name);
    const added = liveArgs.filter((a) => !cachedArgs.has(a));
    if (added.length > 0) argDiffs.push({ name: liveMut.name, added });
  }

  console.log("## Live API has these TYPES we don't cache");
  console.log('---');
  if (newTypes.length === 0) console.log('(none)');
  else for (const n of newTypes) console.log(`- ${n}`);
  console.log();
  console.log("## Live API has these MUTATIONS we don't cache");
  console.log('---');
  if (newMutations.length === 0) console.log('(none)');
  else
    for (const n of newMutations) {
      const m = liveMutationByName.get(n);
      const args = (m?.args ?? []).map((a) => a.name).join(', ');
      console.log(`- ${n}(${args})`);
    }
  console.log();
  console.log('## Mutation argument ADDITIONS per known mutation');
  console.log('---');
  if (argDiffs.length === 0) console.log('(none)');
  else for (const d of argDiffs) console.log(`- ${d.name}: added ${d.added.join(', ')}`);
}

void main().catch((err) => {
  process.stderr.write(
    `probe failed: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`,
  );
  process.exit(1);
});
