// Run with: node tests/core.test.js
const assert = require('assert');
const C = require('../js/core.js');
let n = 0;
const t = (name, fn) => { fn(); n++; console.log('ok -', name); };

t('norm ignores case and spaces', () => assert.strictEqual(C.norm(' MER 102 '), 'mer102'));
t('parseIds splits on comma/newline/tab and dedupes', () => {
  const r = C.parseIds('1021, 1022\n1023\t1021,, ,"1024"');
  assert.deepStrictEqual(r.ids, ['1021', '1022', '1023', '1024']);
  assert.deepStrictEqual(r.dupes, ['1021']);
});
t('voice: english number words + comma', () =>
  assert.strictEqual(C.voiceToText('one zero two one comma one zero two two'), '1021, 1022'));
t('voice: user example "one comma two comma three"', () =>
  assert.strictEqual(C.voiceToText('one comma two comma three'), '1, 2, 3'));
t('voice: split digits get joined', () => assert.strictEqual(C.voiceToText('10 21, 10 22'), '1021, 1022'));
t('voice: double/triple', () => assert.strictEqual(C.voiceToText('double five comma triple 0 7'), '55, 0007'));
t('voice: hindi words and devanagari digits', () =>
  assert.strictEqual(C.voiceToText('एक दो कॉमा तीन चार कोमा १०२५'), '12, 34, 1025'));
t('voice: hindi engine writing english numbers, comma heard as गोवा', () =>
  assert.strictEqual(C.voiceToText('वन गोवा टू गोवा थ्री'), '1, 2, 3'));
t('voice: alphanumeric IDs keep letters', () => assert.strictEqual(C.voiceToText('MER 102 comma MER 103.'), 'MER 102, MER 103'));
t('voice: trailing comma keeps separator', () => assert.strictEqual(C.voiceToText('1021 comma'), '1021, '));
t('joinBase', () => {
  assert.strictEqual(C.joinBase('1021', '1022'), '1021, 1022');
  assert.strictEqual(C.joinBase('1021, ', '1022'), '1021, 1022');
  assert.strictEqual(C.joinBase('', '1022'), '1022');
});
t('excel serial', () => {
  assert.strictEqual(C.toExcelSerial({ y: 2026, m: 10, d: 7 }), 46302);
  assert.strictEqual(C.toExcelSerial({ y: 1900, m: 3, d: 1 }), 61);
});
t('parseISO rejects impossible dates', () => {
  assert.deepStrictEqual(C.parseISO('2026-10-07'), { y: 2026, m: 10, d: 7 });
  assert.strictEqual(C.parseISO('2026-02-30'), null);
});
t('formatDate', () => {
  const d = { y: 2026, m: 10, d: 7 };
  assert.strictEqual(C.formatDate(d, 'dd-mm-yyyy'), '07-10-2026');
  assert.strictEqual(C.formatDate(d, 'dd-mmm-yyyy'), '07-Oct-2026');
  assert.strictEqual(C.weekday(d), 'Wednesday');
});
console.log(`\n${n} tests passed`);
