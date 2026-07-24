'use strict';

const assert = require('assert');
global.window = global;
require('../js/reference-data.js');
const Core = require('../js/core.js');

const resolver = Core.buildReferenceResolver(global.REFERENCE_DATA);

assert.strictEqual(resolver.stats.uniqueNames, 357, 'unique reference name count');
assert.strictEqual(resolver.resolve('Arabjeet Kaur').detailedType, 'ODL', 'center mapping must override complete detailed type');
assert.strictEqual(resolver.resolve('A2Z EDUCATION').detailedType, 'Consultant', 'complete consultant mapping');
assert.strictEqual(resolver.resolve('CGS Kotdwar').detailedType, 'CGS', 'compact-name matching');
assert.strictEqual(resolver.resolve('Dr. Shwetank Avikal').detailedType, 'Bareilly', 'honorific/punctuation matching');

const records = [
  {
    sourceRow: 2,
    publisher: 'A2Z EDUCATION',
    registrationApproval: '2026-07-01',
    feeUser: 'Rakesh Ranjan',
    enrollmentStatus: 'Yes',
    tokenUser: 'CGS Kotdwar'
  },
  {
    sourceRow: 3,
    publisher: 'A2Z EDUCATION',
    registrationApproval: '',
    feeUser: '',
    enrollmentStatus: 'No',
    tokenUser: ''
  },
  {
    sourceRow: 4,
    publisher: 'Rakesh Ranjan',
    registrationApproval: 'approved',
    feeUser: '',
    enrollmentStatus: 'Y',
    tokenUser: ''
  }
];

const result = Core.processReport(records, {
  resolver,
  admissionAcceptedValues: 'Yes, Y',
  manualTypeOverrides: {}
});

const byName = Object.fromEntries(result.rows.map((row) => [row.name, row]));
assert.strictEqual(result.totals.enquiry, 3, 'all publishers count as enquiries');
assert.strictEqual(result.totals.registration, 2, 'non-empty approval date counts registration');
assert.strictEqual(result.totals.admission, 2, 'accepted status values count admission');
assert.strictEqual(byName['A2Z EDUCATION'].enquiry, 2, 'publisher enquiry aggregation');
assert.strictEqual(byName['A2Z EDUCATION'].registration, 0, 'registration moved to FEE user');
assert.strictEqual(byName['Rakesh Ranjan'].registration, 2, 'FEE override plus publisher fallback');
assert.strictEqual(byName['CGSKotdwar'].admission, 1, 'Token Fee override');
assert.strictEqual(byName['Rakesh Ranjan'].admission, 1, 'blank token user falls back to publisher');

// Cross-owner attribution: the enquiry Publisher must keep only the enquiry.
// Registration and admission belong to the FEE/Token users across the entire sheet,
// even when those users never appear in the Publisher column.
const crossOwner = Core.processReport([
  {
    sourceRow: 2,
    publisher: 'A2Z EDUCATION',
    registrationApproval: '2026-07-10',
    feeUser: 'Shalini Bahotra',
    enrollmentStatus: 'Yes',
    tokenUser: 'Shalini Bahotra'
  },
  {
    sourceRow: 3,
    publisher: 'ADMISSION SHALA',
    registrationApproval: '2026-07-11',
    feeUser: 'Shalini Bahotra',
    enrollmentStatus: 'Yes',
    tokenUser: 'Rakesh Ranjan'
  },
  {
    sourceRow: 4,
    publisher: 'A2Z EDUCATION',
    registrationApproval: '2026-07-12',
    feeUser: '',
    enrollmentStatus: 'Yes',
    tokenUser: ''
  }
], {
  resolver,
  admissionAcceptedValues: 'Yes'
});

const crossByName = Object.fromEntries(crossOwner.rows.map((row) => [row.name, row]));
assert.strictEqual(crossByName['A2Z EDUCATION'].enquiry, 2, 'publisher keeps all of its enquiries');
assert.strictEqual(crossByName['A2Z EDUCATION'].registration, 1, 'publisher gets only blank-FEE registration fallback');
assert.strictEqual(crossByName['A2Z EDUCATION'].admission, 1, 'publisher gets only blank-token admission fallback');
assert.strictEqual(crossByName['ADMISSION SHALA'].enquiry, 1, 'second publisher keeps its enquiry');
assert.strictEqual(crossByName['ADMISSION SHALA'].registration, 0, 'registration moves away from enquiry publisher');
assert.strictEqual(crossByName['ADMISSION SHALA'].admission, 0, 'admission moves away from enquiry publisher');
assert.strictEqual(crossByName['Shalini Bahotra'].enquiry, 0, 'FEE/Token-only counsellor is included with zero enquiries');
assert.strictEqual(crossByName['Shalini Bahotra'].registration, 2, 'all qualifying FEE rows are counted for Shalini across publishers');
assert.strictEqual(crossByName['Shalini Bahotra'].admission, 1, 'all qualifying Token rows are counted for Shalini across publishers');
assert.strictEqual(crossByName['Rakesh Ranjan'].enquiry, 0, 'Token-only counsellor is included with zero enquiries');
assert.strictEqual(crossByName['Rakesh Ranjan'].admission, 1, 'Token owner receives admission from another publisher');


// Blank-marker safety: NA/N/A approval is not a registration. A blank-marker
// FEE/Token owner falls back to Publisher only after the row qualifies.
const blankMarkers = Core.processReport([
  {
    sourceRow: 2,
    publisher: 'A2Z EDUCATION',
    registrationApproval: 'NA',
    feeUser: 'Shalini Bahotra',
    enrollmentStatus: 'No',
    tokenUser: 'Shalini Bahotra'
  },
  {
    sourceRow: 3,
    publisher: 'A2Z EDUCATION',
    registrationApproval: '2026-07-13',
    feeUser: 'N/A',
    enrollmentStatus: 'Yes',
    tokenUser: '(blank)'
  }
], {
  resolver,
  admissionAcceptedValues: 'Yes'
});
const blankByName = Object.fromEntries(blankMarkers.rows.map((row) => [row.name, row]));
assert.strictEqual(blankMarkers.totals.registration, 1, 'NA approval marker is not counted as registration');
assert.strictEqual(blankByName['A2Z EDUCATION'].registration, 1, 'blank-marker FEE falls back to Publisher');
assert.strictEqual(blankByName['A2Z EDUCATION'].admission, 1, 'blank-marker Token Fee falls back to Publisher');
assert.ok(!blankByName['Shalini Bahotra'], 'non-qualifying row does not create FEE/Token activity');

const unmapped = Core.processReport([
  { sourceRow: 2, publisher: 'New Partner XYZ', registrationApproval: '', feeUser: '', enrollmentStatus: 'No', tokenUser: '' }
], { resolver });
assert.strictEqual(unmapped.unmappedRows.length, 1, 'unmapped publisher tracked');
const key = unmapped.unmappedRows[0].key;
const overridden = Core.processReport([
  { sourceRow: 2, publisher: 'New Partner XYZ', registrationApproval: '', feeUser: '', enrollmentStatus: 'No', tokenUser: '' }
], { resolver, manualTypeOverrides: { [key]: 'Consultant' } });
assert.strictEqual(overridden.unmappedRows.length, 0, 'manual detailed-type override applied');
assert.strictEqual(overridden.rows[0].type, 'Consultant');

assert.strictEqual(Core.sanitizeFilename('test/report'), 'test_report.xlsx');

const broadTypeSummary = Core.buildBroadTypeSummary([
  { broadType: 'Consultant', enquiry: 2, registration: 1, admission: 0 },
  { broadType: 'Councellor', enquiry: 3, registration: 0, admission: 2 },
  { broadType: 'Consultant', enquiry: 1, registration: 1, admission: 1 },
  { broadType: '', enquiry: 0, registration: 5, admission: 0 }
]);
const broadByType = Object.fromEntries(broadTypeSummary.rows.map((row) => [row.type, row]));
assert.strictEqual(broadTypeSummary.totals.enquiry, 6, 'broad type total enquiries');
assert.strictEqual(broadTypeSummary.totals.registration, 7, 'broad type total registrations');
assert.strictEqual(broadTypeSummary.totals.admission, 3, 'broad type total admissions');
assert.strictEqual(broadTypeSummary.totals.total, 16, 'broad type grand total');
assert.strictEqual(broadByType.Consultant.enquiry, 3, 'consultant enquiry rollup');
assert.strictEqual(broadByType.Consultant.registration, 2, 'consultant registration rollup');
assert.strictEqual(broadByType.Consultant.admission, 1, 'consultant admission rollup');
assert.strictEqual(broadByType['Not Mapped'].registration, 5, 'blank broad type rolls into Not Mapped');

assert.strictEqual(Core.columnLetter(28), 'AB');

console.log('All core tests passed.');
