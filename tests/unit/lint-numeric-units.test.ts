import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { IDENTIFIER_WHITELIST, UNIT_SUFFIXES } from '../../src/tools/serializers.js';

const TOOLS_DIR = resolve(process.cwd(), 'src/tools');

function hasUnitSuffix(name: string): boolean {
  for (const s of UNIT_SUFFIXES) {
    if (name.endsWith(s)) return true;
  }
  return false;
}

// Strip leading _ and normalise: 'epoch_seconds' → 'seconds', 'percents' → 'percent'.
function unitWord(suffix: string): string {
  const s = suffix.replace(/^_/, '');
  if (s === 'epoch_seconds') return 'seconds';
  if (s === 'percents') return 'percent';
  return s;
}

function toolFiles(): Array<{ name: string; src: string }> {
  return readdirSync(TOOLS_DIR)
    .filter((f) => f.endsWith('.ts'))
    .map((f) => ({ name: f, src: readFileSync(resolve(TOOLS_DIR, f), 'utf8') }));
}

describe('IDENTIFIER_WHITELIST invariants', () => {
  it('accumulated_water_savings is NOT in the whitelist (it is wrapped as {value, unit})', () => {
    expect(IDENTIFIER_WHITELIST.has('accumulated_water_savings')).toBe(false);
  });
  it('period_number IS in the whitelist (ordinal index, not a physical measurement)', () => {
    expect(IDENTIFIER_WHITELIST.has('period_number')).toBe(true);
  });
});

describe('numeric field naming lint', () => {
  it('every z.number() Zod input in src/tools/*.ts has a unit suffix or is whitelisted', () => {
    const violations: string[] = [];
    for (const { name, src } of toolFiles()) {
      // Bare z.number() fields
      for (const match of src.matchAll(/(\w+):\s*z\.number\b/g)) {
        const field = match[1]!;
        if (!hasUnitSuffix(field) && !IDENTIFIER_WHITELIST.has(field)) {
          violations.push(`${name}: '${field}' has no unit suffix and is not whitelisted`);
        }
      }
      // z.array(z.number()) fields
      for (const match of src.matchAll(/(\w+):\s*z\.array\(\s*z\.number\b/g)) {
        const field = match[1]!;
        if (!hasUnitSuffix(field) && !IDENTIFIER_WHITELIST.has(field)) {
          violations.push(`${name}: '${field}' (array) has no unit suffix and is not whitelisted`);
        }
      }
    }
    if (violations.length > 0) {
      expect.fail(`Numeric Zod input fields missing unit suffix:\n${violations.join('\n')}`);
    }
  });

  it('every z.number() field with a unit suffix also has .describe() mentioning the unit', () => {
    const violations: string[] = [];
    for (const { name, src } of toolFiles()) {
      // Capture field name and the full value chain up to the end of the line.
      // Covers both bare z.number() and z.array(z.number()) patterns.
      for (const match of src.matchAll(/(\w+):\s*(z\.(?:number|array)\b.*)/g)) {
        const field = match[1]!;
        const chain = match[2]!;
        if (!hasUnitSuffix(field)) continue;
        // Find the matching suffix (longest-match first to prefer 'epoch_seconds' over 'seconds').
        const matchedSuffix = Array.from(UNIT_SUFFIXES)
          .sort((a, b) => b.length - a.length)
          .find((s) => field.endsWith(s))!;
        const expected = unitWord(matchedSuffix);
        if (!chain.includes('.describe(')) {
          violations.push(`${name}: '${field}' has suffix '${matchedSuffix}' but no .describe()`);
        } else if (!chain.includes(expected)) {
          violations.push(`${name}: '${field}' .describe() does not mention '${expected}'`);
        }
      }
    }
    if (violations.length > 0) {
      expect.fail(`Numeric Zod inputs with suffix but missing/wrong .describe():\n${violations.join('\n')}`);
    }
  });
});
