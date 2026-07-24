(function () {
  'use strict';

  const Core = window.ReportCore;
  const Input = window.SpreadsheetInput;
  const referenceData = window.REFERENCE_DATA || {};
  const resolver = Core.buildReferenceResolver(referenceData);

  const FIELD_DEFINITIONS = [
    {
      key: 'publisher',
      label: 'Publisher',
      required: true,
      badge: 'Required',
      help: 'Each row = enquiry for this Publisher.',
      aliases: ['publisher', 'publisher counsellor', 'publisher counselor', 'publisher name', 'source publisher', 'lead publisher']
    },
    {
      key: 'registrationApproval',
      label: 'Registration Fee Approval Date / Approval Date',
      required: true,
      badge: 'Required',
      help: 'Filled approval date = registration.',
      aliases: [
        'registration fee approval date', 'registration fee approved date', 'registration approval date',
        'reg fee approval date', 'registration approved date', 'approval date'
      ]
    },
    {
      key: 'feeUser',
      label: 'User Name FEE / APP Fee',
      required: true,
      badge: 'Required',
      help: 'Registration owner; blank uses Publisher.',
      aliases: [
        'user name fee', 'username fee', 'fee user name', 'fee username', 'user fee',
        'counsellor fee', 'counselor fee', 'fee counsellor', 'fee counselor',
        'user name app fee', 'username app fee', 'app fee user name', 'app fee username',
        'application fee user name', 'application fee username', 'application fee counsellor', 'application fee counselor'
      ]
    },
    {
      key: 'enrollmentStatus',
      label: 'Enrollment Status / Admission Status',
      required: true,
      badge: 'Required',
      help: 'Accepted status value = admission.',
      aliases: [
        'enrollment status', 'enrolment status', 'admission status', 'enrolled status',
        'enrollment fee status', 'enrolment fee status', 'is enrolled', 'admitted', 'enrollment fee'
      ]
    },
    {
      key: 'tokenUser',
      label: 'User Name Token Fee',
      required: true,
      badge: 'Required',
      help: 'Admission owner; blank uses Publisher.',
      aliases: [
        'user name token fee', 'username token fee', 'user name token', 'username token',
        'token fee user name', 'token fee username', 'token user name', 'token username',
        'user token fee'
      ]
    }
  ];

  const state = {
    file: null,
    workbook: null,
    worksheet: null,
    headers: [],
    rawRows: [],
    headerRowNumber: 1,
    mapping: {},
    processRecords: [],
    result: null,
    searchTerm: '',
    manualTypeOverrides: loadManualOverrides(),
    excelPromise: null,
    sheetPromise: null
  };

  const els = {};

  document.addEventListener('DOMContentLoaded', init);

  function init() {
    cacheElements();
    bindEvents();
    applyStoredTheme();
    renderReferenceStatus();
    populateKnownTypeDatalist();
    setDefaultFilename();
    renderEmptyState();
  }

  function cacheElements() {
    [
      'themeToggle', 'uploadZone', 'fileInput', 'browseButton', 'fileInfo', 'fileName', 'fileMeta',
      'removeFileButton', 'downloadTemplateButton', 'mappingSection', 'sheetSelect', 'headerRowInput',
      'reReadButton', 'mappingGrid', 'mappingStatus', 'acceptedValuesInput', 'includeAuditCheckbox',
      'outputFilenameInput', 'generateButton', 'resetButton', 'resultsSection', 'metricRows',
      'metricNames', 'metricEnquiries', 'metricRegistrations', 'metricAdmissions', 'metricUnmapped',
      'resultSearch', 'downloadExcelButton', 'previewBody', 'previewCount', 'previewEmpty',
      'issuesPanel', 'issuesList', 'unmappedPanel', 'unmappedList', 'clearOverridesButton',
      'knownTypes', 'referenceStatus', 'libraryStatus', 'toastRegion', 'engineNotice'
    ].forEach((id) => { els[id] = document.getElementById(id); });
  }

  function bindEvents() {
    els.themeToggle.addEventListener('click', toggleTheme);
    els.browseButton.addEventListener('click', () => els.fileInput.click());
    els.uploadZone.addEventListener('click', (event) => {
      if (event.target.closest('button')) return;
      els.fileInput.click();
    });
    els.fileInput.addEventListener('change', (event) => {
      const file = event.target.files && event.target.files[0];
      if (file) loadWorkbook(file);
    });

    ['dragenter', 'dragover'].forEach((eventName) => {
      els.uploadZone.addEventListener(eventName, (event) => {
        event.preventDefault();
        els.uploadZone.classList.add('is-dragging');
      });
    });
    ['dragleave', 'drop'].forEach((eventName) => {
      els.uploadZone.addEventListener(eventName, (event) => {
        event.preventDefault();
        els.uploadZone.classList.remove('is-dragging');
      });
    });
    els.uploadZone.addEventListener('drop', (event) => {
      const file = event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0];
      if (file) loadWorkbook(file);
    });

    els.removeFileButton.addEventListener('click', resetUpload);
    els.resetButton.addEventListener('click', resetUpload);
    els.sheetSelect.addEventListener('change', selectWorksheet);
    els.reReadButton.addEventListener('click', applyHeaderRow);
    els.headerRowInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') applyHeaderRow();
    });
    els.mappingGrid.addEventListener('change', handleMappingChange);
    els.generateButton.addEventListener('click', () => generateReport(true));
    els.resultSearch.addEventListener('input', () => {
      state.searchTerm = Core.normalizeBasic(els.resultSearch.value);
      renderPreviewTable();
    });
    els.downloadExcelButton.addEventListener('click', downloadExcelReport);
    els.downloadTemplateButton.addEventListener('click', downloadUploadTemplate);
    els.unmappedList.addEventListener('change', handleManualTypeChange);
    els.clearOverridesButton.addEventListener('click', clearManualOverrides);
  }

  function renderReferenceStatus() {
    const stats = resolver.stats;
    els.referenceStatus.textContent = `${stats.uniqueNames.toLocaleString()} mapped names`;
    els.libraryStatus.textContent = `${stats.detailedTypes.length} types · mapping ready`;
  }

  function populateKnownTypeDatalist() {
    els.knownTypes.innerHTML = '';
    resolver.stats.detailedTypes.forEach((type) => {
      const option = document.createElement('option');
      option.value = type;
      els.knownTypes.appendChild(option);
    });
  }

  function setDefaultFilename() {
    const now = new Date();
    const date = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join('-');
    els.outputFilenameInput.value = `Publisher_Counsellor_Report_${date}.xlsx`;
  }

  async function ensureExcelJS() {
    if (window.ExcelJS) return window.ExcelJS;
    if (state.excelPromise) return state.excelPromise;

    const sources = [
      './vendor/exceljs.min.js',
      'https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js',
      'https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js',
      'https://unpkg.com/exceljs@4.4.0/dist/exceljs.min.js'
    ];

    state.excelPromise = loadLibraryFromSources({
      sources,
      ready: () => Boolean(window.ExcelJS),
      label: 'Excel export engine'
    }).then(() => window.ExcelJS);

    try {
      return await state.excelPromise;
    } catch (error) {
      state.excelPromise = null;
      throw error;
    }
  }

  async function ensureSheetJS() {
    if (window.XLSX) return window.XLSX;
    if (state.sheetPromise) return state.sheetPromise;

    const sources = [
      './vendor/xlsx.full.min.js',
      'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js',
      'https://cdn.sheetjs.com/xlsx-latest/package/dist/xlsx.full.min.js'
    ];

    state.sheetPromise = loadLibraryFromSources({
      sources,
      ready: () => Boolean(window.XLSX),
      label: 'universal spreadsheet reader'
    }).then(() => window.XLSX);

    try {
      return await state.sheetPromise;
    } catch (error) {
      state.sheetPromise = null;
      throw error;
    }
  }

  async function loadLibraryFromSources(options) {
    const sources = options.sources || [];
    const ready = options.ready || (() => false);
    const label = options.label || 'spreadsheet engine';
    els.engineNotice.hidden = false;

    for (const source of sources) {
      try {
        await loadScript(source, ready);
        if (ready()) {
          els.engineNotice.hidden = true;
          return;
        }
      } catch (_) {
        // Try the next pinned source.
      }
    }

    els.engineNotice.hidden = false;
    throw new Error(`${label} could not be loaded. Check the internet connection and try again.`);
  }

  function loadScript(src, ready) {
    return new Promise((resolve, reject) => {
      if (ready()) {
        resolve();
        return;
      }

      const absoluteSrc = new URL(src, window.location.href).href;
      const existing = [...document.scripts].find((script) => script.src === absoluteSrc);
      if (existing) {
        if (ready()) {
          resolve();
        } else if (existing.dataset.failed === 'true') {
          reject(new Error(`Unable to load ${src}`));
        } else {
          const onLoad = () => {
            if (ready()) resolve();
            else {
              existing.dataset.failed = 'true';
              reject(new Error(`${src} loaded without the expected library.`));
            }
          };
          existing.addEventListener('load', onLoad, { once: true });
          existing.addEventListener('error', () => reject(new Error(`Unable to load ${src}`)), { once: true });
        }
        return;
      }

      const script = document.createElement('script');
      script.src = src;
      script.async = true;
      script.onload = () => {
        if (ready()) resolve();
        else {
          script.dataset.failed = 'true';
          reject(new Error(`${src} loaded without the expected library.`));
        }
      };
      script.onerror = () => {
        script.dataset.failed = 'true';
        script.remove();
        reject(new Error(`Unable to load ${src}`));
      };
      document.head.appendChild(script);
    });
  }

  async function readModernExcelWorkbook(file) {
    const ExcelJS = await ensureExcelJS();
    const workbook = new ExcelJS.Workbook();
    const buffer = await file.arrayBuffer();
    await workbook.xlsx.load(buffer);
    return workbook;
  }

  async function readInputWorkbook(file, extension) {
    if (!Input) throw new Error('Spreadsheet input module is missing.');

    if (Input.isDelimited(extension)) {
      return Input.readDelimitedFile(file, extension);
    }

    if (Input.isModernExcel(extension)) {
      try {
        return await readModernExcelWorkbook(file);
      } catch (modernError) {
        // Some generated/template workbooks are more readable through the universal parser.
        try {
          const XLSX = await ensureSheetJS();
          return await Input.readWithSheetJS(file, XLSX);
        } catch (_) {
          throw modernError;
        }
      }
    }

    const XLSX = await ensureSheetJS();
    return Input.readWithSheetJS(file, XLSX);
  }

  async function loadWorkbook(file) {
    const extension = Input ? Input.getExtension(file.name) : (file.name.split('.').pop() || '').toLowerCase();
    if (!Input || !Input.isSupportedFile(file)) {
      showToast('Unsupported file. Upload XLSX, XLS, XLSM, XLSB, CSV, TSV, ODS or another spreadsheet format.', 'error');
      return;
    }

    if (file.size > 80 * 1024 * 1024) {
      showToast('This file is very large. Use a spreadsheet under 80 MB for reliable browser processing.', 'error');
      return;
    }

    setBusy(els.browseButton, true, 'Reading file…');
    try {
      const workbook = await readInputWorkbook(file, extension);
      const usableSheets = workbook.worksheets.filter((sheet) => sheet.actualRowCount > 0 && sheet.actualColumnCount > 0);
      if (!usableSheets.length) throw new Error('No readable data sheet was found in this file.');

      state.file = file;
      state.workbook = workbook;
      state.result = null;
      state.processRecords = [];
      displayFileInfo(file);
      populateSheetSelect(usableSheets);
      state.worksheet = usableSheets[0];
      els.sheetSelect.value = String(state.worksheet.id);
      prepareWorksheet(true);
      els.mappingSection.hidden = false;
      els.resultsSection.hidden = true;
      showToast(`${extension ? extension.toUpperCase() : 'Spreadsheet'} loaded. Check columns and generate.`, 'success');
      els.mappingSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (error) {
      console.error(error);
      const message = /password|encrypted/i.test(String(error && error.message || ''))
        ? 'Password-protected spreadsheets cannot be read. Remove the password and try again.'
        : (error.message || 'The spreadsheet could not be read.');
      showToast(message, 'error');
      resetUpload(false);
    } finally {
      setBusy(els.browseButton, false);
      els.fileInput.value = '';
    }
  }

  function displayFileInfo(file) {
    els.fileInfo.hidden = false;
    els.fileName.textContent = file.name;
    els.fileMeta.textContent = `${formatBytes(file.size)} • ${new Date(file.lastModified).toLocaleString()}`;
    els.uploadZone.classList.add('has-file');
  }

  function populateSheetSelect(sheets) {
    els.sheetSelect.innerHTML = '';
    sheets.forEach((sheet) => {
      const option = document.createElement('option');
      option.value = String(sheet.id);
      option.textContent = `${sheet.name} (${sheet.actualRowCount.toLocaleString()} rows)`;
      els.sheetSelect.appendChild(option);
    });
  }

  function selectWorksheet() {
    const id = Number(els.sheetSelect.value);
    state.worksheet = state.workbook.worksheets.find((sheet) => sheet.id === id) || state.workbook.worksheets[0];
    prepareWorksheet(true);
  }

  function prepareWorksheet(autoDetectHeader) {
    const sheet = state.worksheet;
    if (!sheet) return;

    const maxHeaderRow = Math.max(1, Math.min(sheet.actualRowCount || 1, 100));
    els.headerRowInput.max = String(maxHeaderRow);
    state.headerRowNumber = autoDetectHeader ? detectHeaderRow(sheet) : clampHeaderRow(els.headerRowInput.value);
    els.headerRowInput.value = String(state.headerRowNumber);

    state.headers = readHeaders(sheet, state.headerRowNumber);
    state.rawRows = readDataRows(sheet, state.headerRowNumber, state.headers);
    state.mapping = autoMapHeaders(state.headers);
    renderMappingGrid();
    updateMappingStatus();
    state.result = null;
    els.resultsSection.hidden = true;
  }

  function applyHeaderRow() {
    if (!state.worksheet) return;
    state.headerRowNumber = clampHeaderRow(els.headerRowInput.value);
    els.headerRowInput.value = String(state.headerRowNumber);
    state.headers = readHeaders(state.worksheet, state.headerRowNumber);
    state.rawRows = readDataRows(state.worksheet, state.headerRowNumber, state.headers);
    state.mapping = autoMapHeaders(state.headers);
    renderMappingGrid();
    updateMappingStatus();
    state.result = null;
    els.resultsSection.hidden = true;
    showToast(`Header row ${state.headerRowNumber} applied.`, 'success');
  }

  function clampHeaderRow(value) {
    const max = Number(els.headerRowInput.max || 100);
    return Math.max(1, Math.min(max, Number.parseInt(value, 10) || 1));
  }

  function detectHeaderRow(sheet) {
    const maxRows = Math.min(sheet.actualRowCount || 1, 20);
    let bestRow = 1;
    let bestScore = -1;

    for (let rowNumber = 1; rowNumber <= maxRows; rowNumber += 1) {
      const row = sheet.getRow(rowNumber);
      const headers = [];
      const maxColumns = Math.min(sheet.actualColumnCount || row.cellCount || 1, 250);
      for (let column = 1; column <= maxColumns; column += 1) {
        headers.push(cellToText(row.getCell(column)));
      }

      let score = 0;
      const matchedFields = new Set();
      headers.forEach((header) => {
        FIELD_DEFINITIONS.forEach((field) => {
          const fieldScore = headerMatchScore(header, field.aliases);
          if (fieldScore > 0) {
            score += fieldScore;
            matchedFields.add(field.key);
          }
        });
      });
      score += matchedFields.size * 20;
      if (matchedFields.has('publisher')) score += 30;

      if (score > bestScore) {
        bestScore = score;
        bestRow = rowNumber;
      }
    }
    return bestRow;
  }

  function readHeaders(sheet, headerRowNumber) {
    const row = sheet.getRow(headerRowNumber);
    const maxColumns = Math.min(Math.max(sheet.actualColumnCount || row.cellCount || 1, row.cellCount || 1), 500);
    const headers = [];
    for (let column = 1; column <= maxColumns; column += 1) {
      const raw = cellToText(row.getCell(column)).trim();
      headers.push({
        column,
        letter: Core.columnLetter(column),
        name: raw || `Unnamed column ${Core.columnLetter(column)}`,
        rawName: raw
      });
    }
    return headers;
  }

  function readDataRows(sheet, headerRowNumber, headers) {
    const rows = [];
    const lastRow = sheet.actualRowCount || sheet.rowCount || headerRowNumber;
    for (let rowNumber = headerRowNumber + 1; rowNumber <= lastRow; rowNumber += 1) {
      const row = sheet.getRow(rowNumber);
      const values = {};
      let hasValue = false;
      headers.forEach((header) => {
        const value = cellToValue(row.getCell(header.column));
        values[header.column] = value;
        if (!Core.isBlankValue(value)) hasValue = true;
      });
      if (hasValue) rows.push({ sourceRow: rowNumber, values });
    }
    return rows;
  }

  function cellToValue(cell) {
    const value = cell ? cell.value : null;
    if (value && typeof value === 'object') {
      if (Object.prototype.hasOwnProperty.call(value, 'result')) return value.result;
      if (Array.isArray(value.richText)) return value.richText.map((part) => part.text || '').join('');
      if (Object.prototype.hasOwnProperty.call(value, 'text')) return value.text;
      if (Object.prototype.hasOwnProperty.call(value, 'hyperlink')) return value.text || value.hyperlink;
    }
    return value;
  }

  function cellToText(cell) {
    if (!cell) return '';
    if (typeof cell.text === 'string' && cell.text.trim()) return cell.text.trim();
    return Core.valueToText(cellToValue(cell)).trim();
  }

  function autoMapHeaders(headers) {
    const mapping = {};
    const usedColumns = new Set();

    FIELD_DEFINITIONS.forEach((field) => {
      let best = null;
      headers.forEach((header) => {
        if (!header.rawName) return;
        const score = headerMatchScore(header.rawName, field.aliases);
        if (score > 0 && (!best || score > best.score)) best = { column: header.column, score };
      });
      if (best && (!usedColumns.has(best.column) || field.key === 'enrollmentStatus')) {
        mapping[field.key] = best.column;
        usedColumns.add(best.column);
      } else {
        mapping[field.key] = '';
      }
    });

    return mapping;
  }

  function headerMatchScore(headerValue, aliases) {
    const header = Core.normalizeBasic(headerValue);
    const compactHeader = header.replace(/\s+/g, '');
    if (!header) return 0;
    let best = 0;

    aliases.forEach((aliasValue) => {
      const alias = Core.normalizeBasic(aliasValue);
      const compactAlias = alias.replace(/\s+/g, '');
      if (header === alias) best = Math.max(best, 100);
      else if (compactHeader === compactAlias) best = Math.max(best, 96);
      else if (header.startsWith(alias) || header.endsWith(alias)) best = Math.max(best, 82);
      else if (header.includes(alias) || alias.includes(header)) best = Math.max(best, 66);
      else {
        const aliasTokens = alias.split(' ').filter(Boolean);
        const headerTokens = new Set(header.split(' ').filter(Boolean));
        const overlap = aliasTokens.filter((token) => headerTokens.has(token)).length;
        if (overlap >= Math.min(2, aliasTokens.length) && overlap / Math.max(aliasTokens.length, 1) >= 0.6) {
          best = Math.max(best, 40 + overlap * 4);
        }
      }
    });

    return best;
  }

  function renderMappingGrid() {
    els.mappingGrid.innerHTML = '';
    FIELD_DEFINITIONS.forEach((field) => {
      const card = document.createElement('div');
      card.className = 'mapping-item';
      card.dataset.field = field.key;

      const labelRow = document.createElement('div');
      labelRow.className = 'mapping-label-row';
      const label = document.createElement('label');
      label.htmlFor = `mapping-${field.key}`;
      label.textContent = field.label;
      const badge = document.createElement('span');
      badge.className = `mapping-badge ${field.required ? 'required' : 'override'}`;
      badge.textContent = field.badge;
      labelRow.append(label, badge);

      const select = document.createElement('select');
      select.id = `mapping-${field.key}`;
      select.dataset.field = field.key;
      select.className = 'select-control';
      const blank = document.createElement('option');
      blank.value = '';
      blank.textContent = field.required ? 'Select column…' : 'Publisher fallback';
      select.appendChild(blank);
      state.headers.forEach((header) => {
        const option = document.createElement('option');
        option.value = String(header.column);
        option.textContent = `${header.letter} — ${header.name}`;
        select.appendChild(option);
      });
      select.value = state.mapping[field.key] ? String(state.mapping[field.key]) : '';

      const help = document.createElement('p');
      help.className = 'mapping-help';
      help.textContent = field.help;

      const sample = document.createElement('p');
      sample.className = 'mapping-sample';
      sample.dataset.sampleFor = field.key;
      sample.textContent = getColumnSample(state.mapping[field.key]);

      card.append(labelRow, select, help, sample);
      els.mappingGrid.appendChild(card);
    });
  }

  function handleMappingChange(event) {
    const select = event.target.closest('select[data-field]');
    if (!select) return;
    const field = select.dataset.field;
    state.mapping[field] = select.value ? Number(select.value) : '';
    const sample = els.mappingGrid.querySelector(`[data-sample-for="${field}"]`);
    if (sample) sample.textContent = getColumnSample(state.mapping[field]);
    updateMappingStatus();
    state.result = null;
    els.resultsSection.hidden = true;
  }

  function getColumnSample(column) {
    if (!column) return 'Example: no column selected';
    const values = [];
    for (const row of state.rawRows) {
      const value = row.values[column];
      if (!Core.isBlankValue(value)) values.push(Core.cleanDisplayName(Core.valueToText(value)));
      if (values.length === 3) break;
    }
    return values.length ? `Example: ${values.join(' • ')}` : 'Example: no values found';
  }

  function updateMappingStatus() {
    const missing = FIELD_DEFINITIONS.filter((field) => field.required && !state.mapping[field.key]);
    const missingOverrides = FIELD_DEFINITIONS.filter((field) => !field.required && !state.mapping[field.key]);
    const rowCount = state.rawRows.length;

    if (missing.length) {
      els.mappingStatus.className = 'status-line error';
      els.mappingStatus.textContent = `Select: ${missing.map((field) => field.label).join(', ')}.`;
      els.generateButton.disabled = true;
    } else {
      els.mappingStatus.className = 'status-line success';
      els.mappingStatus.textContent = `${rowCount.toLocaleString()} rows ready${missingOverrides.length ? ' · Publisher fallback active' : ''}.`;
      els.generateButton.disabled = rowCount === 0;
    }
  }

  function buildProcessRecords() {
    return state.rawRows.map((row) => ({
      sourceRow: row.sourceRow,
      publisher: row.values[state.mapping.publisher],
      registrationApproval: row.values[state.mapping.registrationApproval],
      feeUser: state.mapping.feeUser ? row.values[state.mapping.feeUser] : '',
      enrollmentStatus: row.values[state.mapping.enrollmentStatus],
      tokenUser: state.mapping.tokenUser ? row.values[state.mapping.tokenUser] : ''
    }));
  }

  function generateReport(scrollToResults) {
    const missing = FIELD_DEFINITIONS.filter((field) => field.required && !state.mapping[field.key]);
    if (missing.length) {
      showToast('Map all required columns first.', 'error');
      return;
    }

    state.processRecords = buildProcessRecords();
    state.result = Core.processReport(state.processRecords, {
      resolver,
      admissionAcceptedValues: els.acceptedValuesInput.value,
      manualTypeOverrides: state.manualTypeOverrides
    });

    renderResults();
    els.resultsSection.hidden = false;
    if (scrollToResults) els.resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    showToast('Report ready.', 'success');
  }

  function renderResults() {
    if (!state.result) return;
    const { stats, totals } = state.result;
    els.metricRows.textContent = stats.sourceRows.toLocaleString();
    els.metricNames.textContent = stats.uniqueNames.toLocaleString();
    els.metricEnquiries.textContent = totals.enquiry.toLocaleString();
    els.metricRegistrations.textContent = totals.registration.toLocaleString();
    els.metricAdmissions.textContent = totals.admission.toLocaleString();
    els.metricUnmapped.textContent = stats.unmappedNames.toLocaleString();
    renderPreviewTable();
    renderIssues();
    renderUnmappedNames();
  }

  function renderPreviewTable() {
    els.previewBody.innerHTML = '';
    if (!state.result) {
      els.previewEmpty.hidden = false;
      els.previewCount.textContent = '0 rows';
      return;
    }

    const search = state.searchTerm;
    const filtered = state.result.rows.filter((row) => {
      if (!search) return true;
      return Core.normalizeBasic(`${row.type} ${row.name} ${row.broadType}`).includes(search);
    });
    const renderLimit = 1000;
    const visible = filtered.slice(0, renderLimit);

    visible.forEach((row) => {
      const tr = document.createElement('tr');
      if (row.type === 'Not Mapped') tr.classList.add('unmapped-row');
      tr.innerHTML = `
        <td><span class="type-pill${row.type === 'Not Mapped' ? ' warning' : ''}">${escapeHTML(row.type)}</span></td>
        <td class="name-cell">${escapeHTML(row.name)}</td>
        <td class="number-cell">${row.enquiry.toLocaleString()}</td>
        <td class="number-cell">${row.registration.toLocaleString()}</td>
        <td class="number-cell">${row.admission.toLocaleString()}</td>
      `;
      els.previewBody.appendChild(tr);
    });

    els.previewEmpty.hidden = visible.length > 0;
    const suffix = filtered.length > renderLimit ? ` • showing first ${renderLimit.toLocaleString()}` : '';
    els.previewCount.textContent = `${filtered.length.toLocaleString()} row${filtered.length === 1 ? '' : 's'}${suffix}`;
  }

  function renderIssues() {
    const result = state.result;
    const items = [];
    if (result.stats.blankPublisherRows) {
      items.push(`${result.stats.blankPublisherRows} source row(s) have a blank Publisher and could not receive an enquiry.`);
    }
    if (result.stats.unattributedRegistrations) {
      items.push(`${result.stats.unattributedRegistrations} registration row(s) had neither User Name FEE nor Publisher.`);
    }
    if (result.stats.unattributedAdmissions) {
      items.push(`${result.stats.unattributedAdmissions} admission row(s) had neither User Name Token Fee nor Publisher.`);
    }
    if (!state.mapping.feeUser) items.push('User Name FEE is not mapped, so every registration uses Publisher fallback.');
    if (!state.mapping.tokenUser) items.push('User Name Token Fee is not mapped, so every admission uses Publisher fallback.');

    els.issuesList.innerHTML = '';
    items.forEach((item) => {
      const li = document.createElement('li');
      li.textContent = item;
      els.issuesList.appendChild(li);
    });
    els.issuesPanel.hidden = items.length === 0;
  }

  function renderUnmappedNames() {
    const rows = state.result ? state.result.unmappedRows : [];
    els.unmappedList.innerHTML = '';
    rows.forEach((row) => {
      const item = document.createElement('div');
      item.className = 'unmapped-item';
      const activity = row.enquiry + row.registration + row.admission;
      item.innerHTML = `
        <div class="unmapped-name-wrap">
          <strong>${escapeHTML(row.name)}</strong>
          <span>${activity.toLocaleString()} total count • ${escapeHTML(row.roles.join(', ') || 'Source')}</span>
        </div>
        <label>
          <span class="sr-only">Detailed type for ${escapeHTML(row.name)}</span>
          <input class="text-control compact" list="knownTypes" data-override-key="${escapeAttribute(row.key)}" placeholder="Choose or type detailed type" value="${escapeAttribute(state.manualTypeOverrides[row.key] || '')}">
        </label>
      `;
      els.unmappedList.appendChild(item);
    });
    els.unmappedPanel.hidden = rows.length === 0;
  }

  function handleManualTypeChange(event) {
    const input = event.target.closest('[data-override-key]');
    if (!input) return;
    const key = input.dataset.overrideKey;
    const value = Core.cleanDisplayName(input.value);
    if (value) state.manualTypeOverrides[key] = value;
    else delete state.manualTypeOverrides[key];
    saveManualOverrides();
    generateReport(false);
  }

  function clearManualOverrides() {
    state.manualTypeOverrides = {};
    saveManualOverrides();
    if (state.processRecords.length) generateReport(false);
    showToast('Saved type overrides cleared.', 'success');
  }

  function loadManualOverrides() {
    try {
      const value = JSON.parse(localStorage.getItem('publisherReportTypeOverrides') || '{}');
      return value && typeof value === 'object' ? value : {};
    } catch (_) {
      return {};
    }
  }

  function saveManualOverrides() {
    try {
      localStorage.setItem('publisherReportTypeOverrides', JSON.stringify(state.manualTypeOverrides));
    } catch (_) {
      // Local storage is optional.
    }
  }

  async function downloadExcelReport() {
    if (!state.result || !state.result.rows.length) {
      showToast('Generate the report before downloading.', 'error');
      return;
    }

    setBusy(els.downloadExcelButton, true, 'Creating Excel…');
    try {
      const ExcelJS = await ensureExcelJS();
      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'Publisher & Counsellor Report Builder';
      workbook.lastModifiedBy = 'Publisher & Counsellor Report Builder';
      workbook.created = new Date();
      workbook.modified = new Date();

      const worksheet = workbook.addWorksheet('Publisher Summary', {
        views: [{ state: 'frozen', ySplit: 1 }],
        properties: { defaultRowHeight: 19 }
      });

      worksheet.columns = [
        { header: 'Type', key: 'type', width: 24 },
        { header: 'Publisher/Counsellor', key: 'name', width: 42 },
        { header: 'Enquiry', key: 'enquiry', width: 14 },
        { header: 'Registration', key: 'registration', width: 16 },
        { header: 'Admission', key: 'admission', width: 14 }
      ];

      state.result.rows.forEach((row) => {
        worksheet.addRow({
          type: row.type,
          name: row.name,
          enquiry: row.enquiry,
          registration: row.registration,
          admission: row.admission
        });
      });

      styleSummaryWorksheet(worksheet, state.result.rows.length);
      const broadTypeSummary = Core.buildBroadTypeSummary(state.result.rows);
      await addTypeSummaryWorksheet(workbook, broadTypeSummary);

      if (els.includeAuditCheckbox.checked) {
        addAuditWorksheet(workbook);
        if (state.result.unmappedRows.length) addUnmappedWorksheet(workbook);
      }

      const buffer = await workbook.xlsx.writeBuffer();
      const filename = Core.sanitizeFilename(els.outputFilenameInput.value, 'Publisher_Counsellor_Report.xlsx');
      saveBuffer(buffer, filename);
      showToast('Excel downloaded.', 'success');
    } catch (error) {
      console.error(error);
      showToast(error.message || 'The Excel report could not be created.', 'error');
    } finally {
      setBusy(els.downloadExcelButton, false);
    }
  }

  function styleSummaryWorksheet(worksheet, dataRowCount) {
    const lastRow = dataRowCount + 1;
    const blackBorder = { style: 'thin', color: { argb: 'FF000000' } };
    const header = worksheet.getRow(1);
    header.height = 24;
    header.eachCell((cell) => {
      cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF000000' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E2F3' } };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.border = { top: blackBorder, left: blackBorder, bottom: blackBorder, right: blackBorder };
    });

    for (let rowNumber = 2; rowNumber <= lastRow; rowNumber += 1) {
      const row = worksheet.getRow(rowNumber);
      row.height = 19;
      row.eachCell({ includeEmpty: true }, (cell, columnNumber) => {
        cell.font = { name: 'Calibri', size: 11, color: { argb: 'FF000000' } };
        cell.alignment = {
          vertical: 'middle',
          horizontal: columnNumber >= 3 ? 'center' : 'left',
          wrapText: columnNumber <= 2
        };
        cell.border = { top: blackBorder, left: blackBorder, bottom: blackBorder, right: blackBorder };
        if (columnNumber >= 3) cell.numFmt = '0';
      });
    }

    worksheet.autoFilter = `A1:E${Math.max(lastRow, 1)}`;
    worksheet.pageSetup = {
      orientation: 'landscape',
      paperSize: 9,
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.25, right: 0.25, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 },
      printTitlesRow: '1:1'
    };
    worksheet.pageSetup.printArea = `A1:E${Math.max(lastRow, 1)}`;
  }


  async function addTypeSummaryWorksheet(workbook, summary) {
    const worksheet = workbook.addWorksheet('Type Summary', {
      properties: { defaultRowHeight: 20 }
    });
    const rows = (summary && summary.rows) || [];
    const totals = (summary && summary.totals) || { enquiry: 0, registration: 0, admission: 0, total: 0 };
    const blackBorder = { style: 'thin', color: { argb: 'FF000000' } };

    worksheet.columns = [
      { width: 30 },
      { width: 14 },
      { width: 16 },
      { width: 14 },
      { width: 14 },
      { width: 12 },
      { width: 16 },
      { width: 16 },
      { width: 16 }
    ];

    worksheet.mergeCells('A1:F1');
    worksheet.getCell('A1').value = 'Type Wise Summary';
    worksheet.getCell('A1').font = { name: 'Calibri', size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
    worksheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF111827' } };
    worksheet.getCell('A1').alignment = { vertical: 'middle', horizontal: 'center' };
    worksheet.getCell('A1').border = { top: blackBorder, left: blackBorder, bottom: blackBorder, right: blackBorder };
    worksheet.getRow(1).height = 28;

    worksheet.mergeCells('A2:F2');
    worksheet.getCell('A2').value = 'Pie chart uses Total = Enquiry + Registration + Admission. Table below shows exact counts by broad Type.';
    worksheet.getCell('A2').font = { name: 'Calibri', size: 10, italic: true, color: { argb: 'FF4B5563' } };
    worksheet.getCell('A2').alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    worksheet.getRow(2).height = 24;

    const chartDataUrl = await createTypePieChartDataUrl(rows, totals);
    const chartImageId = workbook.addImage({ base64: chartDataUrl, extension: 'png' });
    worksheet.addImage(chartImageId, {
      tl: { col: 0, row: 3 },
      ext: { width: 900, height: 390 }
    });
    for (let rowNumber = 4; rowNumber <= 23; rowNumber += 1) {
      worksheet.getRow(rowNumber).height = 17;
    }

    const tableStartRow = 26;
    const headers = ['Type', 'Enquiry', 'Registration', 'Admission', 'Total', 'Share'];
    headers.forEach((header, index) => {
      const cell = worksheet.getCell(tableStartRow, index + 1);
      cell.value = header;
      cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F46E5' } };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.border = { top: blackBorder, left: blackBorder, bottom: blackBorder, right: blackBorder };
    });
    worksheet.getRow(tableStartRow).height = 24;

    rows.forEach((row, index) => {
      const rowNumber = tableStartRow + 1 + index;
      const values = [row.type, row.enquiry, row.registration, row.admission, row.total, row.share];
      values.forEach((value, columnIndex) => {
        const cell = worksheet.getCell(rowNumber, columnIndex + 1);
        cell.value = value;
        cell.font = { name: 'Calibri', size: 11, color: { argb: 'FF000000' } };
        cell.alignment = {
          vertical: 'middle',
          horizontal: columnIndex === 0 ? 'left' : 'center',
          wrapText: columnIndex === 0
        };
        cell.border = { top: blackBorder, left: blackBorder, bottom: blackBorder, right: blackBorder };
        if (columnIndex >= 1 && columnIndex <= 4) cell.numFmt = '0';
        if (columnIndex === 5) cell.numFmt = '0.00%';
      });
      if (index % 2 === 1) {
        for (let columnIndex = 1; columnIndex <= 6; columnIndex += 1) {
          worksheet.getCell(rowNumber, columnIndex).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
        }
      }
      worksheet.getRow(rowNumber).height = 20;
    });

    const totalRowNumber = tableStartRow + rows.length + 1;
    const totalValues = ['Total', totals.enquiry, totals.registration, totals.admission, totals.total, totals.total ? 1 : 0];
    totalValues.forEach((value, columnIndex) => {
      const cell = worksheet.getCell(totalRowNumber, columnIndex + 1);
      cell.value = value;
      cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF000000' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFE4C7' } };
      cell.alignment = { vertical: 'middle', horizontal: columnIndex === 0 ? 'left' : 'center' };
      cell.border = { top: blackBorder, left: blackBorder, bottom: blackBorder, right: blackBorder };
      if (columnIndex >= 1 && columnIndex <= 4) cell.numFmt = '0';
      if (columnIndex === 5) cell.numFmt = '0.00%';
    });
    worksheet.getRow(totalRowNumber).height = 22;

    worksheet.autoFilter = `A${tableStartRow}:F${Math.max(totalRowNumber, tableStartRow)}`;
    worksheet.views = [{ state: 'frozen', ySplit: tableStartRow }];
    worksheet.pageSetup = {
      orientation: 'landscape',
      paperSize: 9,
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.25, right: 0.25, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 }
    };
    worksheet.pageSetup.printArea = `A1:I${Math.max(totalRowNumber, 26)}`;
  }

  function createTypePieChartDataUrl(rows, totals) {
    const canvas = document.createElement('canvas');
    const width = 900;
    const height = 390;
    const scale = 2;
    canvas.width = width * scale;
    canvas.height = height * scale;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    const ctx = canvas.getContext('2d');
    ctx.scale(scale, scale);

    const palette = [
      '#7C3AED', '#FF7A1A', '#14B8A6', '#38BDF8', '#F43F5E', '#F59E0B',
      '#22C55E', '#6366F1', '#EC4899', '#0EA5E9', '#84CC16', '#A855F7',
      '#FB7185', '#10B981', '#EAB308', '#06B6D4', '#8B5CF6', '#F97316',
      '#64748B', '#D946EF', '#2DD4BF', '#EF4444'
    ];

    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = '#111827';
    ctx.font = 'bold 22px Calibri, Arial, sans-serif';
    ctx.fillText('Broad Type Share', 34, 38);
    ctx.font = '12px Calibri, Arial, sans-serif';
    ctx.fillStyle = '#6B7280';
    ctx.fillText('Total = Enquiry + Registration + Admission', 34, 58);

    const chartRows = rows.filter((row) => row.total > 0);
    const grandTotal = totals && totals.total ? totals.total : chartRows.reduce((sum, row) => sum + row.total, 0);

    if (!chartRows.length || !grandTotal) {
      ctx.fillStyle = '#F3F4F6';
      ctx.beginPath();
      ctx.arc(230, 210, 118, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#6B7280';
      ctx.font = 'bold 20px Calibri, Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('No activity found', 230, 216);
      ctx.textAlign = 'left';
      return canvas.toDataURL('image/png');
    }

    const centerX = 230;
    const centerY = 214;
    const radius = 126;
    let startAngle = -Math.PI / 2;

    chartRows.forEach((row, index) => {
      const angle = (row.total / grandTotal) * Math.PI * 2;
      const endAngle = startAngle + angle;
      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.arc(centerX, centerY, radius, startAngle, endAngle);
      ctx.closePath();
      ctx.fillStyle = palette[index % palette.length];
      ctx.fill();
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 2;
      ctx.stroke();
      startAngle = endAngle;
    });

    ctx.beginPath();
    ctx.arc(centerX, centerY, 54, 0, Math.PI * 2);
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();
    ctx.fillStyle = '#111827';
    ctx.font = 'bold 22px Calibri, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(grandTotal.toLocaleString(), centerX, centerY + 2);
    ctx.font = '12px Calibri, Arial, sans-serif';
    ctx.fillStyle = '#6B7280';
    ctx.fillText('total', centerX, centerY + 20);
    ctx.textAlign = 'left';

    const legendX = 420;
    const legendY = 76;
    const rowHeight = 26;
    const colWidth = 230;
    const maxRowsPerColumn = Math.ceil(chartRows.length / 2);
    ctx.font = '12px Calibri, Arial, sans-serif';

    chartRows.forEach((row, index) => {
      const col = index >= maxRowsPerColumn ? 1 : 0;
      const rowIndex = index % maxRowsPerColumn;
      const x = legendX + col * colWidth;
      const y = legendY + rowIndex * rowHeight;
      const pct = grandTotal ? row.total / grandTotal : 0;

      ctx.fillStyle = palette[index % palette.length];
      ctx.fillRect(x, y - 10, 12, 12);
      ctx.fillStyle = '#111827';
      ctx.font = 'bold 12px Calibri, Arial, sans-serif';
      ctx.fillText(trimLegendLabel(row.type, 22), x + 18, y);
      ctx.fillStyle = '#6B7280';
      ctx.font = '11px Calibri, Arial, sans-serif';
      ctx.fillText(`${row.total.toLocaleString()} · ${(pct * 100).toFixed(1)}%`, x + 18, y + 15);
    });

    return canvas.toDataURL('image/png');
  }

  function trimLegendLabel(value, maxLength) {
    const text = String(value || '').trim();
    if (text.length <= maxLength) return text;
    return `${text.slice(0, Math.max(1, maxLength - 1))}…`;
  }

  function addAuditWorksheet(workbook) {
    const worksheet = workbook.addWorksheet('Processing Audit');
    const now = new Date();
    const mappingRows = FIELD_DEFINITIONS.map((field) => {
      const header = state.headers.find((item) => item.column === state.mapping[field.key]);
      return [field.label, header ? `${header.letter} — ${header.name}` : 'Publisher fallback / Not mapped'];
    });

    const rows = [
      ['Processing Audit', ''],
      ['Source file', state.file ? state.file.name : ''],
      ['Source sheet', state.worksheet ? state.worksheet.name : ''],
      ['Header row', state.headerRowNumber],
      ['Source data rows', state.result.stats.sourceRows],
      ['Generated at', now],
      ['', ''],
      ['Rule', 'Logic'],
      ['Enquiry', 'Count every non-empty Publisher row by Publisher'],
      ['Registration', 'Scan every qualifying row in the complete sheet; assign to User Name FEE even when Publisher is different, otherwise use Publisher'],
      ['Admission', `Scan every qualifying row in the complete sheet; when status is one of ${els.acceptedValuesInput.value}, assign to User Name Token Fee even when Publisher is different, otherwise use Publisher`],
      ['Detailed Type', 'Counsellor Center mapping first; Complete Data mapping second; manual overrides last'],
      ['', ''],
      ['Column mapping', 'Uploaded column'],
      ...mappingRows
    ];

    rows.forEach((row) => worksheet.addRow(row));
    worksheet.columns = [{ width: 34 }, { width: 80 }];
    worksheet.getRow(1).font = { bold: true, size: 14 };
    worksheet.getRow(8).font = { bold: true };
    worksheet.getRow(14).font = { bold: true };
    worksheet.getColumn(2).alignment = { wrapText: true, vertical: 'top' };
    worksheet.getCell('B6').numFmt = 'dd-mmm-yyyy hh:mm';
    worksheet.views = [{ state: 'frozen', ySplit: 1 }];
  }

  function addUnmappedWorksheet(workbook) {
    const worksheet = workbook.addWorksheet('Unmapped Names');
    worksheet.columns = [
      { header: 'Name', key: 'name', width: 42 },
      { header: 'Enquiry', key: 'enquiry', width: 14 },
      { header: 'Registration', key: 'registration', width: 16 },
      { header: 'Admission', key: 'admission', width: 14 },
      { header: 'Seen As', key: 'roles', width: 34 }
    ];
    state.result.unmappedRows.forEach((row) => worksheet.addRow({
      name: row.name,
      enquiry: row.enquiry,
      registration: row.registration,
      admission: row.admission,
      roles: row.roles.join(', ')
    }));
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFE5B4' } };
    worksheet.views = [{ state: 'frozen', ySplit: 1 }];
    worksheet.autoFilter = `A1:E${state.result.unmappedRows.length + 1}`;
  }

  async function downloadUploadTemplate() {
    setBusy(els.downloadTemplateButton, true, 'Creating template…');
    try {
      const ExcelJS = await ensureExcelJS();
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Upload Data', { views: [{ state: 'frozen', ySplit: 1 }] });
      const headers = [
        'Publisher',
        'User Name FEE',
        'User Name Token Fee',
        'Enrollment Status',
        'Enrollment Fee',
        'Registration',
        'Registration Fee',
        'Registration Fee Approval Date'
      ];
      worksheet.addRow(headers);
      worksheet.columns = headers.map((header, index) => ({
        width: [32, 26, 28, 20, 18, 18, 20, 30][index]
      }));
      const blackBorder = { style: 'thin', color: { argb: 'FF000000' } };
      worksheet.getRow(1).eachCell((cell) => {
        cell.font = { bold: true };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E2F3' } };
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        cell.border = { top: blackBorder, left: blackBorder, bottom: blackBorder, right: blackBorder };
      });
      worksheet.getRow(1).height = 30;

      const instructions = workbook.addWorksheet('Instructions');
      [
        ['Field', 'How the website uses it'],
        ['Publisher', 'Required. Every row is an enquiry for this Publisher.'],
        ['Registration Fee Approval Date', 'Required. Non-empty means Registration.'],
        ['User Name FEE', 'Registration owner across the full sheet. This person receives the count even when another Publisher created the enquiry. If blank, Publisher receives the count.'],
        ['Enrollment Status', 'Required. Use Yes (or another configured accepted value) for Admission.'],
        ['User Name Token Fee', 'Admission owner across the full sheet. This person receives the count even when another Publisher created the enquiry. If blank, Publisher receives the count.'],
        ['Enrollment Fee / Registration / Registration Fee', 'Kept in the template because they may exist in the source report; current counting rules do not depend on them.']
      ].forEach((row) => instructions.addRow(row));
      instructions.columns = [{ width: 38 }, { width: 92 }];
      instructions.getRow(1).font = { bold: true };
      instructions.getColumn(2).alignment = { wrapText: true, vertical: 'top' };

      const buffer = await workbook.xlsx.writeBuffer();
      saveBuffer(buffer, 'Publisher_Report_Upload_Template.xlsx');
      showToast('Template downloaded.', 'success');
    } catch (error) {
      console.error(error);
      showToast(error.message || 'The template could not be created.', 'error');
    } finally {
      setBusy(els.downloadTemplateButton, false);
    }
  }

  function saveBuffer(buffer, filename) {
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  function resetUpload(showMessage = true) {
    state.file = null;
    state.workbook = null;
    state.worksheet = null;
    state.headers = [];
    state.rawRows = [];
    state.mapping = {};
    state.processRecords = [];
    state.result = null;
    state.searchTerm = '';
    els.resultSearch.value = '';
    els.fileInfo.hidden = true;
    els.uploadZone.classList.remove('has-file');
    els.mappingSection.hidden = true;
    els.resultsSection.hidden = true;
    els.previewBody.innerHTML = '';
    els.fileInput.value = '';
    renderEmptyState();
    if (showMessage) showToast('Reset complete.', 'success');
  }

  function renderEmptyState() {
    els.metricRows.textContent = '0';
    els.metricNames.textContent = '0';
    els.metricEnquiries.textContent = '0';
    els.metricRegistrations.textContent = '0';
    els.metricAdmissions.textContent = '0';
    els.metricUnmapped.textContent = '0';
  }

  function setBusy(button, isBusy, busyText) {
    if (!button) return;
    if (isBusy) {
      if (!button.dataset.originalHtml) button.dataset.originalHtml = button.innerHTML;
      button.disabled = true;
      button.classList.add('is-busy');
      if (busyText) button.innerHTML = `<span class="button-spinner" aria-hidden="true"></span><span>${escapeHTML(busyText)}</span>`;
    } else {
      button.disabled = false;
      button.classList.remove('is-busy');
      if (button.dataset.originalHtml) {
        button.innerHTML = button.dataset.originalHtml;
        delete button.dataset.originalHtml;
      }
    }
  }

  function showToast(message, type) {
    const toast = document.createElement('div');
    toast.className = `toast ${type || 'info'}`;
    toast.setAttribute('role', 'status');
    toast.textContent = message;
    els.toastRegion.appendChild(toast);
    window.setTimeout(() => toast.classList.add('show'), 10);
    window.setTimeout(() => {
      toast.classList.remove('show');
      window.setTimeout(() => toast.remove(), 250);
    }, 4200);
  }

  function toggleTheme() {
    const current = document.documentElement.dataset.theme || 'dark';
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    safeStorageSet('publisherReportTheme', next);
    updateThemeUI(next);
  }

  function applyStoredTheme() {
    const stored = safeStorageGet('publisherReportTheme');
    const theme = stored === 'light' || stored === 'dark' ? stored : 'dark';
    document.documentElement.dataset.theme = theme;
    updateThemeUI(theme);
  }

  function updateThemeUI(theme) {
    if (els.themeToggle) {
      els.themeToggle.setAttribute('aria-label', `Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`);
      els.themeToggle.title = theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme';
    }
    const themeMeta = document.querySelector('meta[name="theme-color"]');
    if (themeMeta) themeMeta.setAttribute('content', theme === 'dark' ? '#090d1d' : '#f5f6ff');
  }


  function safeStorageGet(key) {
    try {
      return window.localStorage.getItem(key);
    } catch (_) {
      return null;
    }
  }

  function safeStorageSet(key, value) {
    try {
      window.localStorage.setItem(key, value);
    } catch (_) {
      // Storage can be blocked in private or restricted browser contexts.
    }
  }

  function formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    return `${(bytes / (1024 ** index)).toFixed(index ? 1 : 0)} ${units[index]}`;
  }

  function escapeHTML(value) {
    return Core.valueToText(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function escapeAttribute(value) {
    return escapeHTML(value).replace(/`/g, '&#096;');
  }
})();
