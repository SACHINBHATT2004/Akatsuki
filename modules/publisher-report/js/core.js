(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.ReportCore = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const HONORIFICS = new Set([
    'mr', 'mrs', 'ms', 'miss', 'dr', 'prof', 'professor', 'shri', 'smt', 'sir', 'madam'
  ]);

  const BLANK_MARKERS = new Set([
    '', '-', '--', '---', 'na', 'n a', 'n/a', 'none', 'null', 'nil', 'undefined',
    '0', 'nan', 'not available', 'not applicable', 'not assigned', 'unassigned', 'select',
    'select user', 'select name', 'blank', '(blank)'
  ]);

  const DEFAULT_ADMISSION_VALUES = [
    'yes', 'y', 'true', '1', 'enrolled', 'admitted', 'confirmed'
  ];

  function valueToText(value) {
    if (value === null || value === undefined) return '';
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? '' : value.toISOString();
    if (typeof value === 'object') {
      if (Object.prototype.hasOwnProperty.call(value, 'result')) return valueToText(value.result);
      if (Array.isArray(value.richText)) return value.richText.map((part) => part.text || '').join('');
      if (Object.prototype.hasOwnProperty.call(value, 'text')) return valueToText(value.text);
      if (Object.prototype.hasOwnProperty.call(value, 'hyperlink')) return valueToText(value.text || value.hyperlink);
    }
    return String(value);
  }

  function normalizeBasic(value) {
    let text = valueToText(value).trim().toLowerCase();
    try {
      text = text.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
    } catch (_) {
      // Older browsers can continue without Unicode normalization.
    }
    return text
      .replace(/&/g, ' and ')
      .replace(/[’'`]/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function normalizeName(value) {
    const parts = normalizeBasic(value).split(' ').filter(Boolean);
    while (parts.length && HONORIFICS.has(parts[0])) parts.shift();
    return parts.join(' ');
  }

  function compactName(value) {
    return normalizeName(value).replace(/\s+/g, '');
  }

  function removeParenthetical(value) {
    return valueToText(value)
      .replace(/\([^)]*\)/g, ' ')
      .replace(/\[[^\]]*\]/g, ' ')
      .replace(/\{[^}]*\}/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function cleanDisplayName(value) {
    return valueToText(value).replace(/\s+/g, ' ').trim();
  }

  function isBlankValue(value) {
    if (value === null || value === undefined) return true;
    if (value instanceof Date) return Number.isNaN(value.getTime());
    if (typeof value === 'number') return Number.isNaN(value);
    if (typeof value === 'boolean') return false;
    const normalized = normalizeBasic(value);
    return BLANK_MARKERS.has(normalized);
  }

  function isUsableName(value) {
    if (isBlankValue(value)) return false;
    const normalized = normalizeName(value);
    return normalized.length > 0 && !BLANK_MARKERS.has(normalized);
  }

  function parseAcceptedValues(value) {
    const source = Array.isArray(value) ? value : valueToText(value).split(/[,;|\n]+/);
    const normalized = source.map(normalizeBasic).filter(Boolean);
    return new Set(normalized.length ? normalized : DEFAULT_ADMISSION_VALUES);
  }

  function isAdmissionValue(value, acceptedValues) {
    if (value === true) return true;
    if (value === false || value === null || value === undefined) return false;
    if (typeof value === 'number') return acceptedValues.has(String(value));
    return acceptedValues.has(normalizeBasic(value));
  }

  function addToIndex(index, key, record) {
    if (!key) return;
    if (!index.has(key)) index.set(key, []);
    index.get(key).push(record);
  }

  function pickUnambiguous(records) {
    if (!records || records.length === 0) return null;
    const unique = [];
    const seen = new Set();
    for (const record of records) {
      const signature = [normalizeName(record.name), normalizeBasic(record.detailedType), normalizeBasic(record.broadType)].join('|');
      if (!seen.has(signature)) {
        seen.add(signature);
        unique.push(record);
      }
    }
    if (unique.length === 1) return unique[0];

    // Duplicate rows with the same name and detailed type are still safe.
    const safeSignature = new Set(unique.map((record) => [normalizeName(record.name), normalizeBasic(record.detailedType)].join('|')));
    return safeSignature.size === 1 ? unique[0] : null;
  }

  function buildSourceIndexes(records) {
    const exact = new Map();
    const compact = new Map();
    const base = new Map();
    const baseCompact = new Map();

    for (const record of records) {
      addToIndex(exact, normalizeName(record.name), record);
      addToIndex(compact, compactName(record.name), record);
      const baseName = removeParenthetical(record.name);
      addToIndex(base, normalizeName(baseName), record);
      addToIndex(baseCompact, compactName(baseName), record);
    }

    return { exact, compact, base, baseCompact };
  }

  function buildReferenceResolver(referenceData) {
    const safeData = referenceData || {};
    const centerRecords = (safeData.centerMappings || []).map((item) => ({
      name: cleanDisplayName(item.name),
      detailedType: cleanDisplayName(item.detailedType),
      broadType: '',
      source: 'center'
    })).filter((item) => item.name && item.detailedType);

    const completeRecords = (safeData.completeMappings || []).map((item) => ({
      name: cleanDisplayName(item.name),
      detailedType: cleanDisplayName(item.detailedType),
      broadType: cleanDisplayName(item.broadType),
      source: 'complete'
    })).filter((item) => item.name && item.detailedType);

    const center = buildSourceIndexes(centerRecords);
    const complete = buildSourceIndexes(completeRecords);

    function mergeRecords(centerRecord, completeRecord, method) {
      if (!centerRecord && !completeRecord) return null;
      return {
        // Complete data is the canonical naming list; center data has priority only for Detailed Type.
        name: (completeRecord && completeRecord.name) || (centerRecord && centerRecord.name) || '',
        detailedType: (centerRecord && centerRecord.detailedType) || (completeRecord && completeRecord.detailedType) || 'Not Mapped',
        broadType: (completeRecord && completeRecord.broadType) || '',
        matchedFrom: centerRecord && completeRecord ? 'center+complete' : (centerRecord ? 'center' : 'complete'),
        matchMethod: method
      };
    }

    function resolveBy(indexKey, key, method) {
      if (!key) return null;
      const centerRecord = pickUnambiguous(center[indexKey].get(key));
      const completeRecord = pickUnambiguous(complete[indexKey].get(key));
      return mergeRecords(centerRecord, completeRecord, method);
    }

    function resolve(value) {
      if (!isUsableName(value)) return null;

      const exactKey = normalizeName(value);
      const exact = resolveBy('exact', exactKey, 'exact');
      if (exact) return exact;

      const compactKey = compactName(value);
      const compact = resolveBy('compact', compactKey, 'compact');
      if (compact) return compact;

      const baseValue = removeParenthetical(value);
      const baseKey = normalizeName(baseValue);
      if (baseKey && baseKey !== exactKey) {
        const base = resolveBy('base', baseKey, 'base');
        if (base) return base;
      }

      const baseCompactKey = compactName(baseValue);
      if (baseCompactKey && baseCompactKey !== compactKey) {
        const baseCompact = resolveBy('baseCompact', baseCompactKey, 'base-compact');
        if (baseCompact) return baseCompact;
      }

      return null;
    }

    const uniqueNames = new Set();
    const detailedTypes = new Set();
    for (const record of [...centerRecords, ...completeRecords]) {
      uniqueNames.add(normalizeName(record.name));
      detailedTypes.add(record.detailedType);
    }

    return {
      resolve,
      stats: {
        uniqueNames: uniqueNames.size,
        centerRows: centerRecords.length,
        completeRows: completeRecords.length,
        detailedTypes: [...detailedTypes].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true }))
      }
    };
  }

  function resolvePerson(rawName, resolver, manualTypeOverrides) {
    if (!isUsableName(rawName)) return null;
    const match = resolver && typeof resolver.resolve === 'function' ? resolver.resolve(rawName) : null;
    const normalizedRaw = normalizeName(rawName);
    const canonicalName = match ? match.name : cleanDisplayName(rawName);
    const aggregationKey = match ? `mapped:${normalizeName(canonicalName)}` : `raw:${normalizedRaw}`;
    const overrideType = manualTypeOverrides && cleanDisplayName(manualTypeOverrides[aggregationKey]);

    return {
      key: aggregationKey,
      name: canonicalName,
      detailedType: overrideType || (match && match.detailedType) || 'Not Mapped',
      broadType: (match && match.broadType) || '',
      matched: Boolean(match),
      matchedFrom: match ? match.matchedFrom : '',
      matchMethod: match ? match.matchMethod : '',
      originalName: cleanDisplayName(rawName)
    };
  }

  function processReport(records, options) {
    const safeRecords = Array.isArray(records) ? records : [];
    const safeOptions = options || {};
    const resolver = safeOptions.resolver || buildReferenceResolver({});
    const acceptedAdmissionValues = parseAcceptedValues(safeOptions.admissionAcceptedValues || DEFAULT_ADMISSION_VALUES);
    const manualTypeOverrides = safeOptions.manualTypeOverrides || {};
    const aggregation = new Map();

    const issues = {
      blankPublisherRows: [],
      unattributedRegistrationRows: [],
      unattributedAdmissionRows: []
    };

    function ensureAggregate(person) {
      if (!person) return null;
      if (!aggregation.has(person.key)) {
        aggregation.set(person.key, {
          key: person.key,
          type: person.detailedType,
          broadType: person.broadType,
          name: person.name,
          enquiry: 0,
          registration: 0,
          admission: 0,
          matched: person.matched,
          matchedFrom: person.matchedFrom,
          matchMethod: person.matchMethod,
          originalNames: new Set(),
          roles: new Set()
        });
      }
      const row = aggregation.get(person.key);
      row.originalNames.add(person.originalName);
      if (row.type === 'Not Mapped' && person.detailedType !== 'Not Mapped') row.type = person.detailedType;
      if (!row.broadType && person.broadType) row.broadType = person.broadType;
      if (!row.matched && person.matched) {
        row.matched = true;
        row.matchedFrom = person.matchedFrom;
        row.matchMethod = person.matchMethod;
      }
      return row;
    }

    function addMetric(person, metric, role) {
      const row = ensureAggregate(person);
      if (!row) return false;
      row[metric] += 1;
      row.roles.add(role);
      return true;
    }

    // Resolve every possible owner once, then build the three metrics independently.
    // This is important because the person who created the enquiry can be different
    // from the person who collected the application fee or token fee.
    const preparedRecords = safeRecords.map((record, index) => ({
      sourceRow: record && record.sourceRow ? record.sourceRow : index + 2,
      publisher: resolvePerson(record && record.publisher, resolver, manualTypeOverrides),
      feeUser: resolvePerson(record && record.feeUser, resolver, manualTypeOverrides),
      tokenUser: resolvePerson(record && record.tokenUser, resolver, manualTypeOverrides),
      isRegistration: !isBlankValue(record && record.registrationApproval),
      isAdmission: isAdmissionValue(record && record.enrollmentStatus, acceptedAdmissionValues)
    }));

    // Pass 1: enquiry ownership always comes only from Publisher.
    for (const record of preparedRecords) {
      if (record.publisher) addMetric(record.publisher, 'enquiry', 'Publisher');
      else issues.blankPublisherRows.push(record.sourceRow);
    }

    // Pass 2: scan the complete sheet for registrations. User Name FEE owns the
    // registration even when that person never appears as Publisher. Publisher is
    // used only when User Name FEE is blank.
    for (const record of preparedRecords) {
      if (!record.isRegistration) continue;
      const registrationTarget = record.feeUser || record.publisher;
      const role = record.feeUser ? 'User Name FEE' : 'Publisher fallback';
      if (!addMetric(registrationTarget, 'registration', role)) {
        issues.unattributedRegistrationRows.push(record.sourceRow);
      }
    }

    // Pass 3: scan the complete sheet for admissions. User Name Token Fee owns the
    // admission even when the enquiry Publisher is somebody else. Publisher is used
    // only when User Name Token Fee is blank.
    for (const record of preparedRecords) {
      if (!record.isAdmission) continue;
      const admissionTarget = record.tokenUser || record.publisher;
      const role = record.tokenUser ? 'User Name Token Fee' : 'Publisher fallback';
      if (!addMetric(admissionTarget, 'admission', role)) {
        issues.unattributedAdmissionRows.push(record.sourceRow);
      }
    }

    const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });
    const rows = [...aggregation.values()].map((row) => ({
      ...row,
      originalNames: [...row.originalNames],
      roles: [...row.roles]
    })).sort((a, b) => {
      const aUnmapped = a.type === 'Not Mapped';
      const bUnmapped = b.type === 'Not Mapped';
      if (aUnmapped !== bUnmapped) return aUnmapped ? 1 : -1;
      const byType = collator.compare(a.type, b.type);
      return byType || collator.compare(a.name, b.name);
    });

    const totals = rows.reduce((acc, row) => {
      acc.enquiry += row.enquiry;
      acc.registration += row.registration;
      acc.admission += row.admission;
      return acc;
    }, { enquiry: 0, registration: 0, admission: 0 });

    const unmappedRows = rows.filter((row) => row.type === 'Not Mapped');

    return {
      rows,
      totals,
      unmappedRows,
      issues,
      stats: {
        sourceRows: safeRecords.length,
        uniqueNames: rows.length,
        unmappedNames: unmappedRows.length,
        blankPublisherRows: issues.blankPublisherRows.length,
        unattributedRegistrations: issues.unattributedRegistrationRows.length,
        unattributedAdmissions: issues.unattributedAdmissionRows.length
      }
    };
  }


  function buildBroadTypeSummary(rows) {
    const groups = new Map();
    const totals = { enquiry: 0, registration: 0, admission: 0, total: 0 };
    const safeRows = Array.isArray(rows) ? rows : [];

    for (const sourceRow of safeRows) {
      const broadType = cleanDisplayName(sourceRow && sourceRow.broadType) || 'Not Mapped';
      if (!groups.has(broadType)) {
        groups.set(broadType, {
          type: broadType,
          enquiry: 0,
          registration: 0,
          admission: 0,
          total: 0,
          share: 0
        });
      }
      const group = groups.get(broadType);
      const enquiry = Number(sourceRow && sourceRow.enquiry) || 0;
      const registration = Number(sourceRow && sourceRow.registration) || 0;
      const admission = Number(sourceRow && sourceRow.admission) || 0;
      group.enquiry += enquiry;
      group.registration += registration;
      group.admission += admission;
      totals.enquiry += enquiry;
      totals.registration += registration;
      totals.admission += admission;
    }

    totals.total = totals.enquiry + totals.registration + totals.admission;

    const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });
    const summaryRows = [...groups.values()].map((row) => {
      row.total = row.enquiry + row.registration + row.admission;
      row.share = totals.total ? row.total / totals.total : 0;
      return row;
    }).sort((a, b) => (b.total - a.total) || collator.compare(a.type, b.type));

    return { rows: summaryRows, totals };
  }

  function sanitizeFilename(value, fallback) {
    const raw = cleanDisplayName(value || fallback || 'Publisher_Counsellor_Report.xlsx');
    let safe = raw.replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_').replace(/\s+/g, ' ').trim();
    if (!safe) safe = 'Publisher_Counsellor_Report.xlsx';
    if (!/\.xlsx$/i.test(safe)) safe += '.xlsx';
    return safe;
  }

  function columnLetter(number) {
    let n = Number(number);
    if (!Number.isFinite(n) || n < 1) return '';
    let result = '';
    while (n > 0) {
      const remainder = (n - 1) % 26;
      result = String.fromCharCode(65 + remainder) + result;
      n = Math.floor((n - 1) / 26);
    }
    return result;
  }

  return {
    DEFAULT_ADMISSION_VALUES,
    valueToText,
    normalizeBasic,
    normalizeName,
    compactName,
    removeParenthetical,
    cleanDisplayName,
    isBlankValue,
    isUsableName,
    parseAcceptedValues,
    isAdmissionValue,
    buildReferenceResolver,
    resolvePerson,
    processReport,
    buildBroadTypeSummary,
    sanitizeFilename,
    columnLetter
  };
});
