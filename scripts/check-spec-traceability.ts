#!/usr/bin/env bun
// Verifies every active case in docs/spec/test_cases.csv has at least one mapping in
// docs/spec/test_traceability.csv.
// Exits 1 with a list of unmapped cases. Used by `bun run spec:check`.

import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const ROOT = resolve(import.meta.dir, '..');
const CASES = resolve(ROOT, 'docs/spec/test_cases.csv');
const TRACE = resolve(ROOT, 'docs/spec/test_traceability.csv');

function parseCsv(path: string): Record<string, string>[] {
  const txt = readFileSync(path, 'utf8').trim();
  const [header, ...lines] = txt.split('\n');
  const cols = header.split(',');
  return lines.map((line) => {
    const cells = splitCsvLine(line);
    return Object.fromEntries(cols.map((c, i) => [c, cells[i] ?? '']));
  });
}

function splitCsvLine(line: string): string[] {
  // Minimal CSV splitter: respects double-quoted fields with embedded commas.
  const out: string[] = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      inQ = !inQ;
      continue;
    }
    if (c === ',' && !inQ) {
      out.push(cur);
      cur = '';
      continue;
    }
    cur += c;
  }
  out.push(cur);
  return out;
}

function main() {
  if (!existsSync(CASES)) {
    console.error(`Missing ${CASES}`);
    process.exit(2);
  }
  if (!existsSync(TRACE)) {
    console.error(`Missing ${TRACE}`);
    process.exit(2);
  }

  const cases = parseCsv(CASES).filter((c) => c.status === 'active');
  const trace = parseCsv(TRACE);
  const traced = new Set(trace.map((t) => t.case_id));

  const unmapped = cases.filter((c) => !traced.has(c.case_id));
  const total = cases.length;
  const covered = total - unmapped.length;
  const pct = total === 0 ? 100 : Math.round((covered / total) * 1000) / 10;

  console.log(`Spec coverage: ${covered}/${total} = ${pct}%`);

  if (pct < 90) {
    console.error(`Below 90% threshold. Unmapped cases:`);
    for (const u of unmapped) {
      console.error(`  - ${u.case_id} ${u.title}`);
    }
    process.exit(1);
  }

  // Detect orphans (traceability rows pointing to deleted/renamed cases)
  const caseIds = new Set(cases.map((c) => c.case_id));
  const orphans = trace.filter((t) => !caseIds.has(t.case_id));
  if (orphans.length > 0) {
    console.warn(`Orphaned traceability rows (case removed?):`);
    for (const o of orphans) {
      console.warn(`  - ${o.case_id} → ${o.test_file}`);
    }
  }
}

main();
