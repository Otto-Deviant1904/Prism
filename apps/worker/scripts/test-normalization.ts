import { normalizeTitle } from '@vogue/shared';

const cases = [
  ['Lakme Lumi Cream 30 ML', 'LAKME', '30ml'],
  ['Cetaphil Gentle Cleanser 125 millilitre', 'CETAPHIL', '125ml'],
  ['Maybelline Fit Me 30 g', 'MAYBELLINE', '30g']
];

let failed = 0;
for (const [title, brand, volume] of cases) {
  const out = normalizeTitle(title);
  if (out.brand !== brand || out.volume !== volume) {
    failed += 1;
    // eslint-disable-next-line no-console
    console.error('failed', { title, out, expected: { brand, volume } });
  }
}

if (failed > 0) process.exit(1);
// eslint-disable-next-line no-console
console.log('normalization tests passed');
