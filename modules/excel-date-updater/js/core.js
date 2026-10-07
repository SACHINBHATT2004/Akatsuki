/*
 * core.js — pure helpers with no DOM access.
 * Kept separate so they can be unit-tested in Node (see tests/core.test.js).
 */
(function (global) {
  'use strict';

  /** Matching key: case-insensitive, ignores all whitespace. "MER 102" === "mer102". */
  function norm(v) {
    if (v === null || v === undefined) return '';
    return String(v).normalize('NFKC').toLowerCase().replace(/\s+/g, '');
  }

  /**
   * Split typed / pasted text into unique IDs.
   * Separators: comma, newline, semicolon, tab (so a pasted Excel column works).
   * Returns { ids: [...unique in first-seen order], dupes: [...repeated entries] }
   */
  function parseIds(text) {
    const seen = new Map();
    const dupes = [];
    String(text || '')
      .split(/[,\n\r;\t\uFF0C\u3001]+/)
      .forEach(function (raw) {
        const id = raw.trim().replace(/^["']+|["']+$/g, '').trim();
        const k = norm(id);
        if (!k) return;
        if (seen.has(k)) dupes.push(id);
        else seen.set(k, id);
      });
    return { ids: Array.from(seen.values()), dupes: dupes };
  }

  // ---------- voice ----------

  // Words that mean "next ID". "गोवा" is a common mis-hearing of "comma" by Hindi speech engines.
  const COMMA_WORDS = new Set([
    'comma', 'coma', 'kama', 'komma', 'next',
    'कॉमा', 'कोमा', 'कौमा', 'कामा', 'कमा', 'गोवा', 'अगला', 'अगली'
  ]);

  const NUM_WORDS = new Map([
    // English
    ['zero', '0'], ['one', '1'], ['won', '1'], ['two', '2'], ['to', '2'], ['too', '2'],
    ['three', '3'], ['four', '4'], ['for', '4'], ['five', '5'], ['six', '6'],
    ['seven', '7'], ['eight', '8'], ['ate', '8'], ['nine', '9'],
    // Hindi
    ['शून्य', '0'], ['ज़ीरो', '0'], ['जीरो', '0'], ['एक', '1'], ['दो', '2'], ['तीन', '3'],
    ['चार', '4'], ['पांच', '5'], ['पाँच', '5'], ['छह', '6'], ['छः', '6'], ['छे', '6'],
    ['सात', '7'], ['आठ', '8'], ['नौ', '9'],
    // English numbers as a Hindi engine writes them
    ['वन', '1'], ['टू', '2'], ['थ्री', '3'], ['फोर', '4'], ['फ़ोर', '4'], ['फाइव', '5'],
    ['फ़ाइव', '5'], ['सिक्स', '6'], ['सेवन', '7'], ['एट', '8'], ['नाइन', '9']
  ]);

  const REPEAT_WORDS = new Map([
    ['double', 2], ['triple', 3], ['डबल', 2], ['ट्रिपल', 3]
  ]);

  const DEVANAGARI_DIGITS = '०१२३४५६७८९';

  function stripPunct(s) {
    return s.replace(/^[.?!।"'“”]+/, '').replace(/[.?!।"'“”]+$/, '');
  }

  /**
   * Turn a raw speech transcript into a clean comma-separated ID list.
   * "one zero two one comma 1022 comma double five" -> "1021, 1022, 55"
   * Consecutive digit groups are joined ("10 21" -> "1021") because speech
   * engines often split long numbers.
   */
  function voiceToText(raw) {
    let t = String(raw || '').replace(/[०-९]/g, function (d) {
      return String(DEVANAGARI_DIGITS.indexOf(d));
    });
    t = t.replace(/[,\uFF0C\u3001]/g, ' , ');
    const tokens = t.split(/\s+/).filter(Boolean);

    const out = [];
    let repeat = 1;
    tokens.forEach(function (tok) {
      const clean = stripPunct(tok);
      const k = clean.toLowerCase();
      if (!k) return;
      if (k === ',' || COMMA_WORDS.has(k)) { out.push(','); repeat = 1; return; }
      if (REPEAT_WORDS.has(k)) { repeat = REPEAT_WORDS.get(k); return; }

      let piece = NUM_WORDS.has(k) ? NUM_WORDS.get(k) : clean;
      if (repeat > 1 && piece.length === 1) piece = piece.repeat(repeat);
      repeat = 1;

      const last = out[out.length - 1];
      if (last && last !== ',' && /^\d+$/.test(piece) && /\d$/.test(last)) {
        out[out.length - 1] = last + piece;
      } else {
        out.push(piece);
      }
    });

    const segs = [];
    let cur = [];
    out.forEach(function (p) {
      if (p === ',') { segs.push(cur.join(' ')); cur = []; } else cur.push(p);
    });
    segs.push(cur.join(' '));
    const text = segs.map(function (s) { return s.trim(); }).filter(Boolean).join(', ');
    const endsWithSep = out.length > 0 && out[out.length - 1] === ',';
    return text && endsWithSep ? text + ', ' : text;
  }

  /** Append spoken text to whatever was already in the box. */
  function joinBase(base, spoken) {
    const b = String(base || '').replace(/\s+$/, '');
    if (!spoken) return base || '';
    if (!b) return spoken;
    return b + (/[,;\n]$/.test(b) ? ' ' : ', ') + spoken;
  }

  // ---------- dates ----------

  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
    'August', 'September', 'October', 'November', 'December'];
  const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  function pad(n) { return String(n).padStart(2, '0'); }

  /** "2026-10-07" -> {y:2026, m:10, d:7}, or null if invalid */
  function parseISO(s) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
    if (!m) return null;
    const y = +m[1], mo = +m[2], d = +m[3];
    const check = new Date(Date.UTC(y, mo - 1, d));
    if (check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d) return null;
    return { y: y, m: mo, d: d };
  }

  /** Local date (with day offset) as "YYYY-MM-DD" */
  function isoFromToday(offset) {
    const d = new Date();
    d.setDate(d.getDate() + (offset || 0));
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  /**
   * Excel serial number for a calendar date. Computed in UTC so the
   * user's timezone can never shift the date by a day.
   * 1900 date system: serial 1 = 1900-01-01 (Excel's fake 1900-02-29 is
   * accounted for by using 1899-12-30 as day 0, valid for dates after Mar 1900).
   */
  function toExcelSerial(dt) {
    return (Date.UTC(dt.y, dt.m - 1, dt.d) - Date.UTC(1899, 11, 30)) / 86400000;
  }

  function formatDate(dt, fmt) {
    const dd = pad(dt.d), mm = pad(dt.m), yyyy = String(dt.y);
    switch (fmt) {
      case 'dd/mm/yyyy': return dd + '/' + mm + '/' + yyyy;
      case 'dd-mmm-yyyy': return dd + '-' + MONTHS[dt.m - 1] + '-' + yyyy;
      case 'yyyy-mm-dd': return yyyy + '-' + mm + '-' + dd;
      case 'mm/dd/yyyy': return mm + '/' + dd + '/' + yyyy;
      case 'dd-mm-yyyy':
      default: return dd + '-' + mm + '-' + yyyy;
    }
  }

  function weekday(dt) {
    return WEEKDAYS[new Date(Date.UTC(dt.y, dt.m - 1, dt.d)).getUTCDay()];
  }

  const api = {
    norm: norm, parseIds: parseIds, voiceToText: voiceToText, joinBase: joinBase,
    parseISO: parseISO, isoFromToday: isoFromToday, toExcelSerial: toExcelSerial,
    formatDate: formatDate, weekday: weekday, MONTHS_LONG: MONTHS_LONG
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.Core = api;
})(typeof window !== 'undefined' ? window : globalThis);
