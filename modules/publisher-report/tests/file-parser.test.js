'use strict';

const assert = require('assert');
const Parser = require('../js/file-parser.js');

(function testSupportedFormats() {
  assert(Parser.SUPPORTED_EXTENSIONS.includes('csv'));
  assert(Parser.SUPPORTED_EXTENSIONS.includes('xlsx'));
  assert(Parser.SUPPORTED_EXTENSIONS.includes('xls'));
  assert(Parser.SUPPORTED_EXTENSIONS.includes('xlsb'));
  assert(Parser.SUPPORTED_EXTENSIONS.includes('ods'));
  assert(Parser.SUPPORTED_EXTENSIONS.includes('numbers'));
  assert.strictEqual(Parser.isDelimited('CSV'), true);
  assert.strictEqual(Parser.isModernExcel('xlsx'), true);
  assert.strictEqual(Parser.requiresSheetJS('xls'), true);
})();

(function testQuotedCsv() {
  const text = [
    'Publisher,User Name FEE,Notes',
    'Consultant A,Shalini Balotra,"comma, inside"',
    'Consultant B,,"two lines\ninside one field"',
    'Consultant C,Ravi,"said ""yes"""'
  ].join('\r\n');
  const rows = Parser.parseDelimitedText(text, ',');
  assert.strictEqual(rows.length, 4);
  assert.deepStrictEqual(rows[1], ['Consultant A', 'Shalini Balotra', 'comma, inside']);
  assert.strictEqual(rows[2][2], 'two lines\ninside one field');
  assert.strictEqual(rows[3][2], 'said "yes"');
})();

(function testDelimiterDetection() {
  const semicolon = 'Publisher;User Name FEE;Status\nA;B;Yes\nC;;No';
  assert.strictEqual(Parser.detectDelimiter(semicolon, 'csv'), ';');
  const tabbed = 'Publisher\tUser Name FEE\tStatus\nA\tB\tYes';
  assert.strictEqual(Parser.detectDelimiter(tabbed, 'tsv'), '\t');
  const pipe = 'Publisher|User Name FEE|Status\nA|B|Yes';
  assert.strictEqual(Parser.detectDelimiter(pipe, 'txt'), '|');
})();

(function testWorkbookAdapter() {
  const workbook = Parser.createWorkbookModel([
    {
      name: 'Upload Data',
      rows: [
        [],
        ['Publisher', 'User Name FEE', 'Enrollment Status'],
        ['A', 'B', 'Yes'],
        ['', '', '']
      ]
    }
  ]);
  assert.strictEqual(workbook.worksheets.length, 1);
  const sheet = workbook.worksheets[0];
  assert.strictEqual(sheet.actualRowCount, 3);
  assert.strictEqual(sheet.actualColumnCount, 3);
  assert.strictEqual(sheet.getRow(2).getCell(1).text, 'Publisher');
  assert.strictEqual(sheet.getRow(3).getCell(3).value, 'Yes');
})();

(function testUtf16Decode() {
  const source = 'Publisher\tStatus\r\nA\tYes';
  const body = Buffer.from(source, 'utf16le');
  const bytes = Buffer.concat([Buffer.from([0xff, 0xfe]), body]);
  assert.strictEqual(Parser.decodeTextBuffer(bytes), source);
})();

(function testCsvToReportIntegration() {
  global.window = global;
  require('../js/reference-data.js');
  const Core = require('../js/core.js');
  const resolver = Core.buildReferenceResolver(global.REFERENCE_DATA);
  const csv = [
    'Publisher,Registration Fee Approval Date,User Name FEE,Enrollment Status,User Name Token Fee',
    'A2Z EDUCATION,2026-07-20,Shalini Balotra,Yes,Shalini Balotra',
    'A2Z EDUCATION,,,,',
    'WhatsApp Lead,2026-07-21,Shalini Balotra,Yes,Shalini Balotra'
  ].join('\n');
  const rows = Parser.parseDelimitedText(csv, ',');
  const records = rows.slice(1).map((row, index) => ({
    sourceRow: index + 2,
    publisher: row[0],
    registrationApproval: row[1],
    feeUser: row[2],
    enrollmentStatus: row[3],
    tokenUser: row[4]
  }));
  const report = Core.processReport(records, { resolver });
  assert.deepStrictEqual(report.totals, { enquiry: 3, registration: 2, admission: 2 });
  const shalini = report.rows.find((row) => row.name.toLowerCase() === 'shalini balotra');
  assert(shalini, 'fee/token-only owner should appear in report');
  assert.strictEqual(shalini.enquiry, 0);
  assert.strictEqual(shalini.registration, 2);
  assert.strictEqual(shalini.admission, 2);
})();

console.log('All file parser tests passed.');
