import { randomInt } from 'node:crypto';

// A per-run suffix of plain words for post bodies, so a test never depends on data an earlier run left behind.
// No digits: a long digit run (a timestamp) is a phone number to the PII-1 rule. Three words from a list of 48 make
// a repeat unlikely, and they keep two runs' bodies below the 90% word overlap of the repeat rule (DET-4).

const WORDS = [
  'amber birch cedar delta ember fjord grove harbor island jasper kestrel lagoon',
  'maple nectar orchid pebble quartz river saffron tundra umber valley willow yarrow',
  'acorn bramble canyon dune estuary fern glacier heath iris juniper kelp lichen',
  'meadow nimbus oasis prairie quill reef sierra thistle upland violet wren zephyr',
]
  .join(' ')
  .split(' ');

export function uniqueWords(count = 3): string {
  return Array.from({ length: count }, () => WORDS[randomInt(WORDS.length)]).join(' ');
}
