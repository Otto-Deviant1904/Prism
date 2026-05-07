import { scoreMatch } from '@vogue/shared';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

type Row = {
  raw_title: string;
  canonical_brand: string;
  canonical_name: string;
  canonical_volume: string;
  expected_match: '0' | '1';
};

function parseCsv(content: string): Row[] {
  const [header, ...lines] = content.trim().split('\n');
  const keys = header.split(',');
  return lines.map((line) => {
    const values = line.split(',');
    const obj: Record<string, string> = {};
    keys.forEach((k, i) => {
      obj[k] = values[i] ?? '';
    });
    return obj as Row;
  });
}

function main(): void {
  const threshold = Number(process.argv[2] ?? 0.72);
  const csv = readFileSync(join(process.cwd(), 'scripts', 'matching-golden.csv'), 'utf-8');
  const rows = parseCsv(csv);

  let tp = 0;
  let fp = 0;
  let fn = 0;

  for (const row of rows) {
    const score = scoreMatch(row.raw_title, {
      brand: row.canonical_brand,
      name: row.canonical_name,
      volume: row.canonical_volume,
      shade: null
    });
    const predicted = score.score >= threshold ? 1 : 0;
    const expected = Number(row.expected_match);

    if (predicted === 1 && expected === 1) tp += 1;
    if (predicted === 1 && expected === 0) fp += 1;
    if (predicted === 0 && expected === 1) fn += 1;

    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ title: row.raw_title, score: score.score, predicted, expected, breakdown: score.breakdown }));
  }

  const precision = tp / Math.max(tp + fp, 1);
  const recall = tp / Math.max(tp + fn, 1);

  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ threshold, tp, fp, fn, precision, recall }, null, 2));
}

main();
