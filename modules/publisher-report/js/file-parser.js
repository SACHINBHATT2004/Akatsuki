(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.SpreadsheetInput = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const MODERN_EXCEL_EXTENSIONS = new Set(['xlsx', 'xlsm', 'xltx', 'xltm']);
  const DELIMITED_EXTENSIONS = new Set(['csv', 'tsv', 'txt']);
  const SHEETJS_EXTENSIONS = new Set([
    'xls', 'xlsb', 'xlt', 'ods', 'fods', 'numbers', 'xml', 'slk', 'sylk',
    'dif', 'dbf', 'wk1', 'wk3', 'wks', '123', 'html', 'htm'
  ]);
  const SUPPORTED_EXTENSIONS = new Set([
    ...MODERN_EXCEL_EXTENSIONS,
    ...DELIMITED_EXTENSIONS,
    ...SHEETJS_EXTENSIONS
  ]);

  const SUPPORTED_MIME_TYPES = new Set([
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel.sheet.macroenabled.12',
    'application/vnd.ms-excel.template.macroenabled.12',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.template',
    'application/vnd.ms-excel',
    'application/vnd.ms-excel.sheet.binary.macroenabled.12',
    'application/vnd.oasis.opendocument.spreadsheet',
    'text/csv',
    'text/tab-separated-values',
    'text/plain'
  ]);

  function getExtension(filename) {
    const clean = String(filename || '').trim();
    const dot = clean.lastIndexOf('.');
    return dot >= 0 ? clean.slice(dot + 1).toLowerCase() : '';
  }

  function isSupportedFile(file) {
    const extension = getExtension(file && file.name);
    if (SUPPORTED_EXTENSIONS.has(extension)) return true;
    const mime = String(file && file.type || '').toLowerCase();
    return SUPPORTED_MIME_TYPES.has(mime);
  }

  function isModernExcel(extension) {
    return MODERN_EXCEL_EXTENSIONS.has(String(extension || '').toLowerCase());
  }

  function isDelimited(extension) {
    return DELIMITED_EXTENSIONS.has(String(extension || '').toLowerCase());
  }

  function requiresSheetJS(extension) {
    return SHEETJS_EXTENSIONS.has(String(extension || '').toLowerCase());
  }

  function isMeaningful(value) {
    if (value === null || value === undefined) return false;
    if (typeof value === 'string') return value.trim() !== '';
    return true;
  }

  function valueToCellText(value) {
    if (value === null || value === undefined) return '';
    if (value instanceof Date) {
      if (Number.isNaN(value.getTime())) return '';
      return value.toISOString();
    }
    if (typeof value === 'object') {
      if (Object.prototype.hasOwnProperty.call(value, 'result')) return valueToCellText(value.result);
      if (Array.isArray(value.richText)) return value.richText.map((part) => part && part.text || '').join('');
      if (Object.prototype.hasOwnProperty.call(value, 'text')) return valueToCellText(value.text);
      if (Object.prototype.hasOwnProperty.call(value, 'hyperlink')) return valueToCellText(value.text || value.hyperlink);
    }
    return String(value);
  }

  function normalizeRows(rows) {
    const safeRows = Array.isArray(rows) ? rows.map((row) => Array.isArray(row) ? row.slice() : []) : [];
    let lastRowIndex = -1;
    let maxColumnCount = 0;
    const rowColumnCounts = [];

    safeRows.forEach((row, rowIndex) => {
      let lastColumnIndex = -1;
      for (let columnIndex = 0; columnIndex < row.length; columnIndex += 1) {
        if (isMeaningful(row[columnIndex])) lastColumnIndex = columnIndex;
      }
      const columnCount = lastColumnIndex + 1;
      rowColumnCounts[rowIndex] = columnCount;
      if (columnCount > 0) lastRowIndex = rowIndex;
      if (columnCount > maxColumnCount) maxColumnCount = columnCount;
    });

    if (lastRowIndex < 0) {
      return { rows: [], rowColumnCounts: [], actualColumnCount: 0 };
    }

    return {
      rows: safeRows.slice(0, lastRowIndex + 1),
      rowColumnCounts: rowColumnCounts.slice(0, lastRowIndex + 1),
      actualColumnCount: maxColumnCount
    };
  }

  function createWorksheetModel(name, id, rows) {
    const normalized = normalizeRows(rows);
    const worksheet = {
      id,
      name: String(name || `Sheet ${id}`),
      actualRowCount: normalized.rows.length,
      rowCount: normalized.rows.length,
      actualColumnCount: normalized.actualColumnCount,
      getRow(rowNumber) {
        const index = Math.max(0, Number(rowNumber || 1) - 1);
        const source = normalized.rows[index] || [];
        const cellCount = normalized.rowColumnCounts[index] || 0;
        return {
          number: index + 1,
          cellCount,
          getCell(columnNumber) {
            const columnIndex = Math.max(0, Number(columnNumber || 1) - 1);
            const value = columnIndex < source.length ? source[columnIndex] : null;
            return { value, text: valueToCellText(value) };
          }
        };
      }
    };
    return worksheet;
  }

  function uniqueSheetName(rawName, usedNames, fallbackIndex) {
    const baseRaw = String(rawName || `Sheet ${fallbackIndex}`).trim() || `Sheet ${fallbackIndex}`;
    const base = baseRaw.slice(0, 80);
    let candidate = base;
    let suffix = 2;
    while (usedNames.has(candidate.toLowerCase())) {
      candidate = `${base.slice(0, 72)} (${suffix})`;
      suffix += 1;
    }
    usedNames.add(candidate.toLowerCase());
    return candidate;
  }

  function createWorkbookModel(sheetDefinitions) {
    const usedNames = new Set();
    const worksheets = (Array.isArray(sheetDefinitions) ? sheetDefinitions : []).map((sheet, index) => (
      createWorksheetModel(
        uniqueSheetName(sheet && sheet.name, usedNames, index + 1),
        index + 1,
        sheet && sheet.rows
      )
    ));
    return { worksheets };
  }

  function countReplacementCharacters(text) {
    const matches = String(text || '').match(/\uFFFD/g);
    return matches ? matches.length : 0;
  }

  function decodeWith(label, bytes) {
    try {
      return new TextDecoder(label, { fatal: false }).decode(bytes);
    } catch (_) {
      return '';
    }
  }

  function decodeTextBuffer(buffer) {
    const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer || 0);
    if (!bytes.length) return '';

    if (bytes.length >= 2 && bytes[0] === 0xFF && bytes[1] === 0xFE) {
      return decodeWith('utf-16le', bytes.subarray(2)).replace(/^\uFEFF/, '');
    }
    if (bytes.length >= 2 && bytes[0] === 0xFE && bytes[1] === 0xFF) {
      const decoded = decodeWith('utf-16be', bytes.subarray(2));
      if (decoded) return decoded.replace(/^\uFEFF/, '');
      const swapped = new Uint8Array(bytes.length - 2);
      for (let index = 2; index + 1 < bytes.length; index += 2) {
        swapped[index - 2] = bytes[index + 1];
        swapped[index - 1] = bytes[index];
      }
      return decodeWith('utf-16le', swapped).replace(/^\uFEFF/, '');
    }

    const sampleLength = Math.min(bytes.length, 4096);
    let evenZeros = 0;
    let oddZeros = 0;
    for (let index = 0; index < sampleLength; index += 1) {
      if (bytes[index] !== 0) continue;
      if (index % 2 === 0) evenZeros += 1;
      else oddZeros += 1;
    }
    const pairs = Math.max(1, Math.floor(sampleLength / 2));
    if (oddZeros / pairs > 0.25) return decodeWith('utf-16le', bytes).replace(/^\uFEFF/, '');
    if (evenZeros / pairs > 0.25) {
      const decoded = decodeWith('utf-16be', bytes);
      if (decoded) return decoded.replace(/^\uFEFF/, '');
    }

    const utf8 = decodeWith('utf-8', bytes).replace(/^\uFEFF/, '');
    const replacements = countReplacementCharacters(utf8);
    if (replacements > Math.max(2, utf8.length * 0.002)) {
      const legacy = decodeWith('windows-1252', bytes).replace(/^\uFEFF/, '');
      if (legacy && countReplacementCharacters(legacy) < replacements) return legacy;
    }
    return utf8;
  }

  function countDelimiterOutsideQuotes(line, delimiter) {
    let count = 0;
    let inQuotes = false;
    const text = String(line || '');
    for (let index = 0; index < text.length; index += 1) {
      const character = text[index];
      if (character === '"') {
        if (inQuotes && text[index + 1] === '"') index += 1;
        else inQuotes = !inQuotes;
      } else if (!inQuotes && character === delimiter) {
        count += 1;
      }
    }
    return count;
  }

  function detectDelimiter(text, preferredExtension) {
    const extension = String(preferredExtension || '').toLowerCase();
    if (extension === 'tsv') return '\t';

    const candidates = [',', '\t', ';', '|'];
    const physicalLines = String(text || '').split(/\r\n|\n|\r/).filter((line) => line.trim()).slice(0, 30);
    if (!physicalLines.length) return extension === 'txt' ? '\t' : ',';

    let winner = ',';
    let winningScore = -1;
    candidates.forEach((candidate) => {
      const counts = physicalLines.map((line) => countDelimiterOutsideQuotes(line, candidate));
      const positive = counts.filter((count) => count > 0);
      if (!positive.length) return;
      const frequency = new Map();
      positive.forEach((count) => frequency.set(count, (frequency.get(count) || 0) + 1));
      let modeCount = 0;
      let modeFrequency = 0;
      frequency.forEach((value, key) => {
        if (value > modeFrequency || (value === modeFrequency && key > modeCount)) {
          modeFrequency = value;
          modeCount = key;
        }
      });
      const coverage = positive.length / physicalLines.length;
      const consistency = modeFrequency / positive.length;
      const score = (modeCount * 12) + (coverage * 8) + (consistency * 10);
      if (score > winningScore) {
        winner = candidate;
        winningScore = score;
      }
    });

    return winner;
  }

  function parseDelimitedText(text, delimiter) {
    const source = String(text || '').replace(/^\uFEFF/, '');
    const separator = delimiter || detectDelimiter(source, 'csv');
    const rows = [];
    let row = [];
    let field = '';
    let inQuotes = false;

    for (let index = 0; index < source.length; index += 1) {
      const character = source[index];
      if (inQuotes) {
        if (character === '"') {
          if (source[index + 1] === '"') {
            field += '"';
            index += 1;
          } else {
            inQuotes = false;
          }
        } else {
          field += character;
        }
        continue;
      }

      if (character === '"' && field === '') {
        inQuotes = true;
      } else if (character === separator) {
        row.push(field);
        field = '';
      } else if (character === '\r' || character === '\n') {
        row.push(field);
        field = '';
        rows.push(row);
        row = [];
        if (character === '\r' && source[index + 1] === '\n') index += 1;
      } else {
        field += character;
      }
    }

    if (field !== '' || row.length || source.length === 0) {
      row.push(field);
      rows.push(row);
    }
    return rows;
  }

  async function readDelimitedFile(file, extension) {
    const buffer = await file.arrayBuffer();
    const text = decodeTextBuffer(buffer);
    const delimiter = detectDelimiter(text, extension);
    const rows = parseDelimitedText(text, delimiter);
    const name = String(file && file.name || '').replace(/\.[^.]+$/, '') || 'CSV Data';
    return createWorkbookModel([{ name, rows }]);
  }

  function sheetJSToWorkbookModel(sheetWorkbook, XLSX) {
    if (!sheetWorkbook || !Array.isArray(sheetWorkbook.SheetNames)) {
      throw new Error('The spreadsheet does not contain readable worksheets.');
    }
    const sheetDefinitions = sheetWorkbook.SheetNames.map((name) => {
      const sheet = sheetWorkbook.Sheets && sheetWorkbook.Sheets[name];
      const rows = sheet
        ? XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: null, blankrows: true })
        : [];
      return { name, rows };
    });
    return createWorkbookModel(sheetDefinitions);
  }

  async function readWithSheetJS(file, XLSX) {
    if (!XLSX || typeof XLSX.read !== 'function') {
      throw new Error('The universal spreadsheet reader is not available.');
    }
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, {
      type: 'array',
      cellDates: true,
      cellFormula: true,
      cellText: true,
      dense: true
    });
    return sheetJSToWorkbookModel(workbook, XLSX);
  }

  return {
    SUPPORTED_EXTENSIONS: [...SUPPORTED_EXTENSIONS],
    getExtension,
    isSupportedFile,
    isModernExcel,
    isDelimited,
    requiresSheetJS,
    createWorksheetModel,
    createWorkbookModel,
    decodeTextBuffer,
    detectDelimiter,
    parseDelimitedText,
    readDelimitedFile,
    sheetJSToWorkbookModel,
    readWithSheetJS
  };
});
