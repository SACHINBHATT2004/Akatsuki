/*
 * app.js: UI and Excel logic. Depends on SheetJS (global XLSX) and core.js (global Core).
 *
 * Model
 * - The user builds any number of "groups": a list of IDs plus one date.
 * - "Write all groups" first reverts the previous write (restoring the uploaded values),
 *   then writes every group in order. So groups can be edited, removed or re-dated at any
 *   time and re-written without anything being applied twice.
 * - If an ID appears in two groups, the later group's date is kept.
 */
(function () {
  'use strict';

  const C = window.Core;
  const $ = function (s) { return document.querySelector(s); };

  const el = {
    themeBtn: $('#themeBtn'), themeLabel: $('#themeLabel'), themeMenu: $('#themeMenu'), soundBtn: $('#soundBtn'),
    dropzone: $('#dropzone'), fileInput: $('#fileInput'), fileCard: $('#fileCard'),
    fileName: $('#fileName'), rowCount: $('#rowCount'), sheetField: $('#sheetField'),
    sheetSelect: $('#sheetSelect'), headerRow: $('#headerRow'), changeFile: $('#changeFile'),
    step2: $('#step2'), step2body: $('#step2body'), step3: $('#step3'), step3body: $('#step3body'),
    step4: $('#step4'),
    primary: $('#primaryCol'), secondary: $('#secondaryCol'),
    primarySample: $('#primarySample'), secondarySample: $('#secondarySample'),
    micLang: $('#micLang'), voiceHelp: $('#voiceHelp'),
    groups: $('#groups'), groupTpl: $('#groupTpl'), addGroup: $('#addGroup'),
    format: $('#dateFormat'), writeAs: $('#writeAs'), skipFilled: $('#skipFilled'),
    applyBtn: $('#applyBtn'), applyHint: $('#applyHint'),
    resultEmpty: $('#resultEmpty'), result: $('#result'),
    stRows: $('#stRows'), stGroups: $('#stGroups'), stMissing: $('#stMissing'), stSkipped: $('#stSkipped'),
    overlapNote: $('#overlapNote'), groupSummary: $('#groupSummary'),
    missingBox: $('#missingBox'), missingList: $('#missingList'), copyMissing: $('#copyMissing'),
    tableWrap: $('#tableWrap'), changesBody: $('#changesBody'), tableNote: $('#tableNote'),
    downloadBar: $('#downloadBar'), dlTitle: $('#dlTitle'), dlMeta: $('#dlMeta'),
    downloadBtn: $('#downloadBtn'), dlBtnText: $('#dlBtnText'), toasts: $('#toasts')
  };

  const state = {
    wb: null,
    fileName: '',
    sheetName: '',
    range: null,        // decoded !ref of the current sheet
    headerRow: 0,       // 0-based header row
    headers: [],        // [{c, label, letter}]
    index: null,        // Map(normalized ID -> [row indexes]) for the primary column
    groups: [],         // group objects (DOM refs), in display order
    applied: null,      // { sheet, reverts:[{a, prev}], ... } from the last write
    dirty: false,       // groups/options changed since the last write
    downloaded: false   // last write has been downloaded
  };

  let uid = 0;

  // voice state (declared early because updateSteps() reads it)
  let rec = null;
  let listening = false;
  let micGroup = null;
  let baseText = '';

  // ======================= theme =======================
  const CFG = window.DATESTAMP_CONFIG || {};
  const THEME_KEY = CFG.themeKey || 'datestamp-theme';
  const ALLOW_AUTO = CFG.allowAuto !== false;
  const media = window.matchMedia ? matchMedia('(prefers-color-scheme: dark)') : null;
  const THEME_LABEL = { light: 'Light', dark: 'Dark', auto: 'Auto' };

  function validChoice(c) {
    if (c === 'light' || c === 'dark') return c;
    if (c === 'auto' && ALLOW_AUTO) return 'auto';
    return ALLOW_AUTO ? 'auto' : (CFG.defaultTheme || 'dark');
  }
  function themeChoice() {
    return validChoice(document.documentElement.getAttribute('data-theme-choice'));
  }
  if (!ALLOW_AUTO) {
    const autoItem = el.themeMenu.querySelector('[data-choice="auto"]');
    if (autoItem) autoItem.remove();
  }
  function applyTheme(choice, save) {
    const resolved = choice === 'auto' ? (media && media.matches ? 'dark' : 'light') : choice;
    document.documentElement.setAttribute('data-theme', resolved);
    document.documentElement.setAttribute('data-theme-choice', choice);
    el.themeLabel.textContent = THEME_LABEL[choice];
    el.themeBtn.setAttribute('aria-label', 'Theme: ' + THEME_LABEL[choice] + '. Change theme');
    el.themeMenu.querySelectorAll('[data-choice]').forEach(function (b) {
      b.setAttribute('aria-checked', String(b.getAttribute('data-choice') === choice));
    });
    if (save) { try { localStorage.setItem(THEME_KEY, choice); } catch (e) { /* ignore */ } }
  }
  function openThemeMenu(open) {
    el.themeMenu.hidden = !open;
    el.themeBtn.setAttribute('aria-expanded', String(open));
    if (open) {
      const cur = el.themeMenu.querySelector('[aria-checked="true"]') || el.themeMenu.querySelector('button');
      cur.focus();
    }
  }
  el.themeBtn.addEventListener('click', function () { openThemeMenu(el.themeMenu.hidden); });
  el.themeMenu.addEventListener('click', function (e) {
    const b = e.target.closest('[data-choice]');
    if (!b) return;
    applyTheme(b.getAttribute('data-choice'), true);
    openThemeMenu(false);
    el.themeBtn.focus();
  });
  el.themeMenu.addEventListener('keydown', function (e) {
    const items = Array.from(el.themeMenu.querySelectorAll('button'));
    const i = items.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length].focus(); }
    if (e.key === 'ArrowUp') { e.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); }
    if (e.key === 'Escape') { openThemeMenu(false); el.themeBtn.focus(); }
  });
  document.addEventListener('click', function (e) {
    if (!el.themeMenu.hidden && !e.target.closest('.thememenu')) openThemeMenu(false);
  });
  if (media) {
    const onMedia = function () { if (themeChoice() === 'auto') applyTheme('auto', false); };
    if (media.addEventListener) media.addEventListener('change', onMedia); else media.addListener(onMedia);
  }
  applyTheme(themeChoice(), false);

  // ======================= sound =======================
  function syncSoundButton() {
    const on = Sound.isEnabled();
    el.soundBtn.setAttribute('aria-pressed', String(on));
    el.soundBtn.setAttribute('aria-label', on ? 'Turn sounds off' : 'Turn sounds on');
    el.soundBtn.title = on ? 'Sounds on' : 'Sounds off';
    el.soundBtn.classList.toggle('is-off', !on);
  }
  el.soundBtn.addEventListener('click', function () {
    Sound.setEnabled(!Sound.isEnabled());
    syncSoundButton();
    if (Sound.isEnabled()) Sound.play('select');
  });
  syncSoundButton();

  // Follow theme/sound changes made elsewhere (e.g. the AKATSUKI hub header around this module)
  window.addEventListener('storage', function (e) {
    if (e.key === THEME_KEY) applyTheme(validChoice(e.newValue), false);
    if (e.key === Sound.key) { Sound.refresh(); syncSoundButton(); }
  });

  // A soft drop for every button press; buttons can choose another sound with data-sound
  document.addEventListener('click', function (e) {
    const t = e.target.closest('button, .dropzone');
    if (!t || t.disabled) return;
    const name = t.getAttribute('data-sound') || 'tap';
    if (name !== 'none') Sound.play(name);
  });
  document.addEventListener('change', function (e) {
    if (e.target.matches('select, input[type="date"], input[type="checkbox"]')) Sound.play('select');
  });

  // Water ripple where the pointer touches a button
  document.addEventListener('pointerdown', function (e) {
    const t = e.target.closest('.btn, .pill, .roundbtn, .chipbtn, .mic, .iconbtn');
    if (!t || t.disabled || prefersReducedMotion()) return;
    const r = t.getBoundingClientRect();
    const size = Math.max(r.width, r.height) * 1.6;
    const ring = document.createElement('span');
    ring.className = 'ripple';
    ring.style.width = ring.style.height = size + 'px';
    ring.style.left = (e.clientX - r.left - size / 2) + 'px';
    ring.style.top = (e.clientY - r.top - size / 2) + 'px';
    t.appendChild(ring);
    setTimeout(function () { ring.remove(); }, 650);
  });

  // ======================= toasts =======================
  function toast(msg, kind) {
    const t = document.createElement('div');
    t.className = 'toast toast--' + (kind || 'info');
    t.textContent = msg;
    if (kind === 'success') Sound.play('success');
    else if (kind === 'error') Sound.play('error');
    el.toasts.appendChild(t);
    setTimeout(function () {
      t.classList.add('is-leaving');
      setTimeout(function () { t.remove(); }, 300);
    }, kind === 'error' ? 6000 : 3500);
  }

  // ======================= sheet helpers =======================
  function sheet() { return state.wb ? state.wb.Sheets[state.sheetName] : null; }
  function addr(r, c) { return XLSX.utils.encode_cell({ r: r, c: c }); }
  function colValue(sel) { return sel.value === '' ? null : Number(sel.value); }
  function headerLabel(c) {
    const h = state.headers.find(function (x) { return x.c === c; });
    return h ? h.label : '';
  }
  function cellText(cell) {
    if (!cell || cell.v === undefined || cell.v === null) return '';
    if (cell.w !== undefined) return String(cell.w);
    try { return XLSX.utils.format_cell(cell); } catch (e) { return String(cell.v); }
  }
  function isFilled(cell) { return !!cell && cell.v !== undefined && cell.v !== null && String(cell.v).trim() !== ''; }
  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }

  // ======================= step 1: upload =======================
  el.fileInput.addEventListener('change', function (e) {
    const f = e.target.files && e.target.files[0];
    if (f) handleFile(f);
    e.target.value = '';
  });
  ['dragenter', 'dragover'].forEach(function (ev) {
    el.dropzone.addEventListener(ev, function (e) { e.preventDefault(); el.dropzone.classList.add('is-over'); });
  });
  ['dragleave', 'drop'].forEach(function (ev) {
    el.dropzone.addEventListener(ev, function (e) { e.preventDefault(); el.dropzone.classList.remove('is-over'); });
  });
  el.dropzone.addEventListener('drop', function (e) {
    const f = e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) handleFile(f);
  });
  el.changeFile.addEventListener('click', function () { el.fileInput.click(); });

  async function handleFile(file) {
    if (!/\.(xlsx|xlsm|xls|csv|ods)$/i.test(file.name)) {
      toast('That file type is not supported. Upload a .xlsx, .xls, .csv or .ods file.', 'error');
      return;
    }
    if (typeof XLSX === 'undefined') {
      toast('The Excel reader did not load. Check your internet connection and refresh the page.', 'error');
      return;
    }
    if (hasUnsaved() &&
        !confirm('The current sheet has written dates that are not downloaded yet. Load the new file anyway? Your groups stay, but the old file\'s changes are discarded.')) {
      return;
    }
    try {
      const buf = await file.arrayBuffer();
      // cellNF keeps each cell's number format so untouched dates/numbers keep their look on export
      const wb = XLSX.read(buf, { type: 'array', cellNF: true, cellDates: false });
      state.wb = wb;
      state.fileName = file.name;
      state.applied = null;
      state.dirty = false;
      state.downloaded = false;

      el.sheetSelect.innerHTML = '';
      wb.SheetNames.forEach(function (n) { el.sheetSelect.add(new Option(n, n)); });
      el.sheetField.hidden = wb.SheetNames.length < 2;

      el.fileName.textContent = file.name;
      el.dropzone.hidden = true;
      el.fileCard.hidden = false;

      loadSheet(wb.SheetNames[0], true);
      renderResult(null);
      renderDownloadBar();
      toast('Loaded ' + file.name, 'success');
    } catch (err) {
      console.error(err);
      toast('This file could not be read. It may be password-protected or damaged.', 'error');
    }
  }

  el.sheetSelect.addEventListener('change', function () { loadSheet(el.sheetSelect.value, true); });
  el.headerRow.addEventListener('change', function () { loadSheet(state.sheetName, false); });

  function loadSheet(name, resetHeaderRow) {
    // Restore the uploaded values first so headers/samples/index see the original sheet
    revertApplied();
    state.sheetName = name;
    const ws = sheet();
    state.headers = [];
    state.range = null;
    state.index = null;

    if (ws && ws['!ref']) {
      const range = XLSX.utils.decode_range(ws['!ref']);
      state.range = range;
      if (resetHeaderRow) el.headerRow.value = range.s.r + 1;
      let hr = parseInt(el.headerRow.value, 10) - 1;
      if (isNaN(hr) || hr < range.s.r) hr = range.s.r;
      if (hr > range.e.r) hr = range.e.r;
      el.headerRow.value = hr + 1;
      el.headerRow.max = range.e.r + 1;
      state.headerRow = hr;

      for (let c = range.s.c; c <= range.e.c; c++) {
        const label = cellText(ws[addr(hr, c)]).trim();
        state.headers.push({ c: c, label: label || '(no header)', letter: XLSX.utils.encode_col(c) });
      }
    }

    fillSelect(el.primary);
    fillSelect(el.secondary);
    el.primarySample.textContent = '';
    el.secondarySample.textContent = '';

    const dataRows = state.range ? Math.max(0, state.range.e.r - state.headerRow) : 0;
    el.rowCount.textContent = dataRows + ' data rows, ' + state.headers.length + ' columns' +
      (state.wb.SheetNames.length > 1 ? ', sheet "' + name + '"' : '');
    if (!state.headers.length) toast('This sheet is empty. Pick another sheet or file.', 'error');

    renderResult(null);
    renderDownloadBar();
    updateSteps();
    refreshAll();
  }

  function fillSelect(sel) {
    sel.innerHTML = '';
    sel.add(new Option('Select column…', ''));
    state.headers.forEach(function (h) {
      sel.add(new Option(h.label + '   (column ' + h.letter + ')', String(h.c)));
    });
  }

  // ======================= step 2: columns =======================
  el.primary.addEventListener('change', function () {
    if (colValue(el.primary) !== null && colValue(el.primary) === colValue(el.secondary)) {
      el.secondary.value = '';
      el.secondarySample.textContent = '';
      toast('The secondary column was cleared because it cannot be the same as the primary column.', 'info');
    }
    columnsChanged();
  });
  el.secondary.addEventListener('change', function () {
    if (colValue(el.secondary) !== null && colValue(el.secondary) === colValue(el.primary)) {
      el.secondary.value = '';
      toast('Pick a different column. Writing dates into the ID column would overwrite your IDs.', 'error');
    }
    columnsChanged();
  });

  function columnsChanged() {
    // A previous write may have gone into another column: restore originals before re-indexing
    if (state.applied) {
      revertApplied();
      renderResult(null);
      toast('Columns changed, so the earlier write was undone. Write the groups again to apply them.', 'info');
    }
    buildIndex();
    el.primarySample.textContent = sampleText(colValue(el.primary));
    el.secondarySample.textContent = sampleText(colValue(el.secondary));
    renderDownloadBar();
    updateSteps();
    refreshAll();
  }

  function sampleText(c) {
    if (c === null || !state.range) return '';
    const ws = sheet();
    const vals = [];
    let filled = 0;
    for (let r = state.headerRow + 1; r <= state.range.e.r; r++) {
      const cell = ws[addr(r, c)];
      if (isFilled(cell)) {
        filled++;
        if (vals.length < 4) vals.push(cellText(cell));
      }
    }
    if (!filled) return 'This column is empty.';
    return 'e.g. ' + vals.join(', ') + ' (' + filled + ' filled)';
  }

  function buildIndex() {
    state.index = null;
    const c = colValue(el.primary);
    if (c === null || !state.range) return;
    const ws = sheet();
    const map = new Map();
    for (let r = state.headerRow + 1; r <= state.range.e.r; r++) {
      const cell = ws[addr(r, c)];
      if (!isFilled(cell)) continue;
      // Index both raw value and displayed text: "1021" matches a numeric cell,
      // "001021" matches a cell formatted with leading zeros.
      const keys = new Set([C.norm(cell.v)]);
      if (cell.w !== undefined) keys.add(C.norm(cell.w));
      keys.delete('');
      keys.forEach(function (k) {
        if (!map.has(k)) map.set(k, []);
        const rows = map.get(k);
        if (rows[rows.length - 1] !== r) rows.push(r);
      });
    }
    state.index = map;
  }

  function columnsReady() {
    const p = colValue(el.primary), s = colValue(el.secondary);
    return p !== null && s !== null && p !== s;
  }

  function updateSteps() {
    const has = !!(state.wb && state.headers.length);
    el.step2.classList.toggle('is-locked', !has);
    el.step2body.disabled = !has;
    const ready = has && columnsReady();
    el.step3.classList.toggle('is-locked', !ready);
    el.step3body.disabled = !ready;
    el.step4.classList.toggle('is-locked', !state.applied);
    if (!ready && listening) stopMic();
  }

  // ======================= step 3: groups =======================
  function addGroup(opts) {
    opts = opts || {};
    const node = el.groupTpl.content.firstElementChild.cloneNode(true);
    const g = {
      uid: ++uid,
      root: node,
      n: node.querySelector('.group__n'),
      title: node.querySelector('.group__title'),
      summary: node.querySelector('.group__summary'),
      remove: node.querySelector('.group__remove'),
      text: node.querySelector('.group__text'),
      mic: node.querySelector('.mic'),
      micText: node.querySelector('.mic__text'),
      clear: node.querySelector('.group__clear'),
      heard: node.querySelector('.heard'),
      chips: node.querySelector('.chips'),
      datehelp: node.querySelector('.group__datehelp'),
      date: node.querySelector('.group__dateinput'),
      timer: null
    };
    g.date.value = opts.date || C.isoFromToday(0);

    g.text.addEventListener('input', function () {
      markDirty();
      clearTimeout(g.timer);
      g.timer = setTimeout(refreshAll, 120);
    });
    g.text.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); applyAll(); }
    });
    g.clear.addEventListener('click', function () {
      g.text.value = '';
      g.heard.hidden = true;
      markDirty();
      refreshAll();
      g.text.focus();
    });
    g.date.addEventListener('change', function () {
      markDirty();
      renderDate(g, true);
      refreshAll();
    });
    node.querySelectorAll('.quickdates [data-offset]').forEach(function (b) {
      b.addEventListener('click', function () {
        g.date.value = C.isoFromToday(Number(b.getAttribute('data-offset')));
        markDirty();
        renderDate(g, true);
        refreshAll();
      });
    });
    g.mic.addEventListener('click', function () {
      if (listening && micGroup === g) stopMic(); else startMic(g);
    });
    g.remove.addEventListener('click', function () { removeGroup(g); });

    if (!SR) {
      g.mic.disabled = true;
      g.mic.title = 'Voice input works in Chrome and Edge.';
    }

    state.groups.push(g);
    el.groups.appendChild(node);
    renderDate(g, false);
    renumber();
    refreshAll();
    if (opts.focus) {
      g.text.focus();
      node.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'center' });
    }
    return g;
  }

  function removeGroup(g) {
    if (state.groups.length <= 1) return;
    if (g.text.value.trim() && !confirm('Remove group ' + g.n.textContent + ' and its IDs?')) return;
    if (micGroup === g) stopMic();
    state.groups = state.groups.filter(function (x) { return x !== g; });
    g.root.remove();
    markDirty();
    renumber();
    refreshAll();
  }

  function renumber() {
    state.groups.forEach(function (g, i) {
      g.n.textContent = String(i + 1);
      g.text.setAttribute('aria-label', 'IDs for group ' + (i + 1));
      g.date.setAttribute('aria-label', 'Date for group ' + (i + 1));
      g.remove.hidden = state.groups.length <= 1;
      g.remove.setAttribute('aria-label', 'Remove group ' + (i + 1));
    });
  }

  el.addGroup.addEventListener('click', function () {
    const last = state.groups[state.groups.length - 1];
    if (last && !C.parseIds(last.text.value).ids.length) {
      last.text.focus();
      toast('Fill in group ' + state.groups.length + ' before adding another.', 'info');
      return;
    }
    addGroup({ focus: true });
  });

  function renderDate(g, animate) {
    const dt = C.parseISO(g.date.value);
    if (!dt) {
      g.datehelp.textContent = 'Pick a date for this group.';
      g.datehelp.classList.add('is-warn');
      return;
    }
    g.datehelp.classList.remove('is-warn');
    g.datehelp.textContent = C.weekday(dt) + ', written as ' + C.formatDate(dt, el.format.value);
    if (animate) press(g.date.parentNode);
  }

  function press(node) {
    node.classList.remove('is-splash');
    void node.offsetWidth; // restart animation
    node.classList.add('is-splash');
  }

  /**
   * Re-check every group against the sheet: chip colours, per-group summaries,
   * cross-group overlaps, and the total for the write button.
   */
  function refreshAll() {
    const firstSeen = new Map();   // norm ID -> group number where it first appears
    const allRows = new Set();
    let totalIds = 0;
    const LIMIT = 300;

    state.groups.forEach(function (g, gi) {
      const parsed = C.parseIds(g.text.value);
      const ids = parsed.ids;
      totalIds += ids.length;
      g.chips.innerHTML = '';
      let found = 0, missing = 0, rows = 0, overlap = 0;

      ids.forEach(function (id, i) {
        const k = C.norm(id);
        let status = 'neutral', title = '';
        const earlier = firstSeen.get(k);
        if (earlier === undefined) firstSeen.set(k, gi + 1);

        if (state.index) {
          const hit = state.index.get(k);
          if (hit) {
            found++;
            rows += hit.length;
            hit.forEach(function (r) { allRows.add(r); });
            status = 'found';
            title = 'Matches ' + plural(hit.length, 'row', 'rows');
          } else {
            missing++;
            status = 'missing';
            title = 'Not found in the primary column';
          }
        }
        if (earlier !== undefined) {
          overlap++;
          status = 'overlap';
          title = 'Also in group ' + earlier + '. This group comes later, so its date is kept.';
        }
        if (i < LIMIT) {
          const s = document.createElement('span');
          s.className = 'chip chip--' + status;
          s.textContent = id;
          if (title) s.title = title;
          g.chips.appendChild(s);
        }
      });
      if (ids.length > LIMIT) {
        const more = document.createElement('span');
        more.className = 'chip chip--more';
        more.textContent = '+' + (ids.length - LIMIT) + ' more';
        g.chips.appendChild(more);
      }

      let summary;
      if (!ids.length) summary = '0 IDs added';
      else if (!state.index) summary = plural(ids.length, 'ID', 'IDs') + ' added.';
      else {
        summary = plural(ids.length, 'ID', 'IDs') + ' added: ' + found + ' found';
        if (missing) summary += ', ' + missing + ' not found';
        if (rows !== found) summary += ', ' + rows + ' rows';
      }
      if (overlap) summary += '. ' + overlap + ' also in an earlier group';
      if (parsed.dupes.length) summary += '. ' + plural(parsed.dupes.length, 'repeat', 'repeats') + ' ignored';
      g.summary.textContent = summary + (summary.endsWith('.') ? '' : '.');
      g.root.classList.toggle('is-missing-date', !!ids.length && !C.parseISO(g.date.value));
    });

    const ready = !!state.wb && columnsReady() && allRows.size > 0;
    el.applyBtn.disabled = !ready;
    const nGroups = state.groups.filter(function (g) { return C.parseIds(g.text.value).ids.length; }).length;
    if (state.applied && state.dirty) {
      el.applyHint.textContent = 'Groups changed. Process again to update the sheet.';
    } else if (allRows.size) {
      el.applyHint.textContent = plural(nGroups, 'group', 'groups') + ', ' + plural(allRows.size, 'row', 'rows') + ' will be updated';
    } else {
      el.applyHint.textContent = state.groups.some(function (g) { return C.parseIds(g.text.value).ids.length; })
        ? 'None of these IDs are in the primary column yet.'
        : 'Add IDs to a group to continue.';
    }
    el.applyHint.classList.toggle('is-warn', !!(state.applied && state.dirty));
  }

  // Options that change output for every group
  el.format.addEventListener('change', function () {
    state.groups.forEach(function (g) { renderDate(g, false); });
    markDirty();
  });
  el.writeAs.addEventListener('change', markDirty);
  el.skipFilled.addEventListener('change', markDirty);

  function markDirty() {
    if (!state.applied) return;
    state.dirty = true;
    renderDownloadBar();
    refreshAll();
  }

  // ======================= write =======================
  el.applyBtn.addEventListener('click', function () { applyAll(); });

  function excelFormatCode(fmt) {
    // Quoted separators keep "/" literal regardless of regional settings
    if (fmt === 'dd/mm/yyyy') return 'dd"/"mm"/"yyyy';
    if (fmt === 'mm/dd/yyyy') return 'mm"/"dd"/"yyyy';
    return fmt;
  }

  /** Put back every cell the last write changed, so the sheet equals the uploaded file. */
  function revertApplied() {
    if (!state.applied || !state.wb) { state.applied = null; return; }
    const ws = state.wb.Sheets[state.applied.sheet];
    if (ws) {
      for (let i = state.applied.reverts.length - 1; i >= 0; i--) {
        const ch = state.applied.reverts[i];
        if (ch.prev) ws[ch.a] = ch.prev; else delete ws[ch.a];
      }
    }
    state.applied = null;
    state.dirty = false;
    state.downloaded = false;
    updateSteps();
  }

  /** Validate, rebuild the sheet from the original values, and write every group. Returns true on success. */
  function applyAll() {
    if (!state.wb) { toast('Upload an Excel file first.', 'error'); return false; }
    if (!columnsReady()) { toast('Choose a primary and a different secondary column first.', 'error'); return false; }

    const work = [];
    for (let i = 0; i < state.groups.length; i++) {
      const g = state.groups[i];
      const ids = C.parseIds(g.text.value).ids;
      if (!ids.length) continue;
      const dt = C.parseISO(g.date.value);
      if (!dt) {
        toast('Group ' + (i + 1) + ' has IDs but no date. Pick a date for it.', 'error');
        g.date.focus();
        return false;
      }
      work.push({ n: i + 1, ids: ids, dt: dt });
    }
    if (!work.length) { toast('Type or speak IDs in at least one group first.', 'error'); return false; }
    if (listening) stopMic();

    revertApplied();
    buildIndex();

    const ws = sheet();
    const secC = colValue(el.secondary);
    const fmt = el.format.value;
    const asText = el.writeAs.value === 'text';
    const skipFilled = el.skipFilled.checked;

    const reverts = [];       // first-touch original values, for the next revert
    const finalRows = new Map(); // addr -> row shown in the table (latest group wins)
    const perGroup = [];
    let skipped = 0, overlapRows = 0;

    work.forEach(function (w) {
      const text = C.formatDate(w.dt, fmt);
      const serial = C.toExcelSerial(w.dt);
      const stat = { n: w.n, dateText: text, ids: w.ids.length, rows: 0, notFound: [], skipped: 0 };

      w.ids.forEach(function (id) {
        const rows = state.index.get(C.norm(id));
        if (!rows) { stat.notFound.push(id); return; }
        rows.forEach(function (r) {
          const a = addr(r, secC);
          const prior = finalRows.get(a);
          let before;
          if (prior) {
            // Already written by an earlier group in this run: the later group wins
            if (prior.group !== w.n) overlapRows++;
            before = prior.before;
          } else {
            const original = ws[a] ? Object.assign({}, ws[a]) : null;
            if (skipFilled && isFilled(original)) { skipped++; stat.skipped++; return; }
            reverts.push({ a: a, prev: original });
            before = cellText(original);
          }
          ws[a] = asText
            ? { t: 's', v: text, w: text }
            : { t: 'n', v: serial, z: excelFormatCode(fmt), w: text };
          finalRows.set(a, {
            r: r, id: id, group: w.n, before: before, after: text
          });
          stat.rows++;
        });
      });
      perGroup.push(stat);
    });

    state.applied = {
      sheet: state.sheetName,
      reverts: reverts,
      colLabel: headerLabel(secC),
      rows: Array.from(finalRows.values()).sort(function (x, y) { return x.r - y.r; }),
      perGroup: perGroup,
      skipped: skipped,
      overlapRows: overlapRows
    };
    state.dirty = false;
    state.downloaded = false;

    if (finalRows.size) {
      state.groups.forEach(function (g) { if (C.parseIds(g.text.value).ids.length) press(g.root); });
      toast('Updated ' + plural(work.length, 'group', 'groups') + ': ' + plural(finalRows.size, 'row', 'rows') + '.', 'success');
    } else {
      toast(skipped ? 'No rows changed: every matching cell already had a value.' : 'No rows changed: none of the IDs were found.', 'error');
    }

    renderResult(state.applied);
    renderDownloadBar();
    updateSteps();
    refreshAll();
    el.step4.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
    return true;
  }

  function prefersReducedMotion() {
    return window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  // ======================= step 4: results =======================
  let lastMissing = [];

  function renderResult(res) {
    if (!res) {
      el.result.hidden = true;
      el.resultEmpty.hidden = false;
      return;
    }
    el.result.hidden = false;
    el.resultEmpty.hidden = true;

    const missingTotal = res.perGroup.reduce(function (n, g) { return n + g.notFound.length; }, 0);
    el.stRows.textContent = res.rows.length;
    el.stGroups.textContent = res.perGroup.length;
    el.stMissing.textContent = missingTotal;
    el.stSkipped.textContent = res.skipped;

    el.overlapNote.hidden = !res.overlapRows;
    el.overlapNote.textContent = res.overlapRows
      ? plural(res.overlapRows, 'row was', 'rows were') + ' in more than one group. The date from the later group was kept.'
      : '';

    // per-group breakdown
    el.groupSummary.innerHTML = '';
    res.perGroup.forEach(function (g) {
      const li = document.createElement('li');
      li.className = 'groupsum__item';
      const name = document.createElement('span');
      name.className = 'groupsum__name';
      name.textContent = 'Group ' + g.n;
      const date = document.createElement('span');
      date.className = 'groupsum__date';
      date.textContent = g.dateText;
      const meta = document.createElement('span');
      meta.className = 'groupsum__meta';
      let m = plural(g.rows, 'row', 'rows') + ' written';
      if (g.notFound.length) m += ', ' + g.notFound.length + ' not found';
      if (g.skipped) m += ', ' + g.skipped + ' skipped';
      meta.textContent = m;
      li.appendChild(name); li.appendChild(date); li.appendChild(meta);
      el.groupSummary.appendChild(li);
    });

    // not-found IDs, grouped
    lastMissing = [];
    el.missingList.innerHTML = '';
    res.perGroup.forEach(function (g) {
      if (!g.notFound.length) return;
      lastMissing = lastMissing.concat(g.notFound);
      const row = document.createElement('div');
      row.className = 'missing__group';
      const label = document.createElement('span');
      label.className = 'missing__label';
      label.textContent = 'Group ' + g.n;
      const chips = document.createElement('div');
      chips.className = 'chips';
      g.notFound.forEach(function (id) {
        const s = document.createElement('span');
        s.className = 'chip chip--missing';
        s.textContent = id;
        chips.appendChild(s);
      });
      row.appendChild(label); row.appendChild(chips);
      el.missingList.appendChild(row);
    });
    el.missingBox.hidden = lastMissing.length === 0;

    // changed rows
    el.changesBody.innerHTML = '';
    const LIMIT = 300;
    res.rows.slice(0, LIMIT).forEach(function (ch) {
      const tr = document.createElement('tr');
      [String(ch.r + 1), ch.id, String(ch.group), ch.before || '(empty)', ch.after].forEach(function (v, i) {
        const td = document.createElement('td');
        td.textContent = v;
        if (i === 3 && !ch.before) td.className = 'is-dim';
        if (i === 4) td.className = 'is-new';
        tr.appendChild(td);
      });
      el.changesBody.appendChild(tr);
    });
    el.tableWrap.hidden = res.rows.length === 0;
    el.tableNote.textContent = res.rows.length > LIMIT
      ? 'Showing the first ' + LIMIT + ' of ' + res.rows.length + ' changed rows.'
      : (res.rows.length ? 'Row numbers match Excel. Dates go into "' + res.colLabel + '". "Before" is the value in your uploaded file.' : '');
  }

  el.copyMissing.addEventListener('click', function () {
    const txt = lastMissing.join(', ');
    const done = function () { toast('Copied ' + plural(lastMissing.length, 'ID', 'IDs') + '.', 'success'); };
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(txt).then(done, function () { fallbackCopy(txt); done(); });
    } else { fallbackCopy(txt); done(); }
  });

  function fallbackCopy(txt) {
    const ta = document.createElement('textarea');
    ta.value = txt;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch (e) { /* ignore */ }
    ta.remove();
  }

  // ======================= download =======================
  function outName() {
    return state.fileName.replace(/\.[^.]+$/, '') + '_updated.xlsx';
  }
  function hasUnsaved() {
    return !!state.applied && state.applied.rows.length > 0 && (!state.downloaded || state.dirty);
  }

  function renderDownloadBar() {
    const a = state.applied;
    el.downloadBar.hidden = !a;
    if (!a) return;
    if (state.dirty) {
      el.dlTitle.textContent = 'Groups changed since the last write';
      el.dlMeta.textContent = 'Downloading will process all groups again first, so the file matches what you see above.';
      el.dlBtnText.textContent = 'Process and download';
    } else {
      el.dlTitle.textContent = state.downloaded ? 'Downloaded' : 'Ready to download';
      el.dlMeta.textContent = plural(a.rows.length, 'row', 'rows') + ' changed by ' +
        plural(a.perGroup.length, 'group', 'groups') + '. Saves as ' + outName() + '.';
      el.dlBtnText.textContent = state.downloaded ? 'Download again' : 'Download updated Excel';
    }
  }

  el.downloadBtn.addEventListener('click', function () {
    if (!state.wb) return;
    if (!state.applied || state.dirty) {
      if (!applyAll()) return;
    }
    try {
      XLSX.writeFile(state.wb, outName(), { bookType: 'xlsx', compression: true });
      state.downloaded = true;
      renderDownloadBar();
      toast('Downloaded ' + outName(), 'success');
    } catch (err) {
      console.error(err);
      toast('The file could not be saved: ' + err.message, 'error');
    }
  });

  window.addEventListener('beforeunload', function (e) {
    if (hasUnsaved()) { e.preventDefault(); e.returnValue = ''; }
  });

  // ======================= voice input =======================
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;

  if (!SR) {
    el.micLang.disabled = true;
    el.voiceHelp.textContent = 'Voice input is not available in this browser. Open the page in Chrome or Edge to speak IDs.';
  }

  el.micLang.addEventListener('change', function () {
    if (listening) {
      const g = micGroup;
      stopMic();
      setTimeout(function () { startMic(g); }, 250);
    }
  });

  function setListening(g, on) {
    state.groups.forEach(function (x) {
      const live = on && x === g;
      x.mic.classList.toggle('is-live', live);
      x.mic.setAttribute('aria-pressed', String(live));
      x.micText.textContent = live ? 'Stop listening' : 'Speak IDs';
    });
    listening = on;
    micGroup = on ? g : null;
  }

  function startMic(g) {
    if (!SR || !g) return;
    if (listening) stopMic();
    if (location.protocol === 'file:') {
      toast('If the microphone does not start, run the project with start.bat or start.sh and open it from localhost.', 'info');
    }
    rec = new SR();
    rec.lang = el.micLang.value;
    rec.continuous = true;
    rec.interimResults = true;
    baseText = g.text.value;
    const target = g;
    const thisRec = rec;

    rec.onresult = function (e) {
      let finals = '', interim = '';
      for (let i = 0; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) finals += ' ' + res[0].transcript;
        else interim += ' ' + res[0].transcript;
      }
      const heard = (finals + ' ' + interim).trim();
      target.heard.hidden = !heard;
      target.heard.textContent = 'Heard: ' + heard;
      target.text.value = C.joinBase(baseText, C.voiceToText(heard));
      markDirty();
      refreshAll();
    };
    rec.onerror = function (e) {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        setListening(null, false);
        toast('Microphone access is blocked. Allow it from the lock icon in the address bar, then try again.', 'error');
      } else if (e.error === 'network') {
        setListening(null, false);
        toast('Voice input needs an internet connection in Chrome.', 'error');
      } else if (e.error === 'audio-capture') {
        setListening(null, false);
        toast('No microphone was found. Connect one and try again.', 'error');
      } else if (e.error !== 'no-speech' && e.error !== 'aborted') {
        toast('Voice input stopped (' + e.error + ').', 'error');
      }
    };
    rec.onend = function () {
      // Chrome ends sessions after silence; restart while this group is still listening.
      if (listening && micGroup === target && rec === thisRec) {
        baseText = target.text.value;
        try { rec.start(); } catch (err) { setListening(null, false); }
      }
    };
    try {
      rec.start();
      setListening(g, true);
      Sound.play('micOn');
    } catch (err) {
      setListening(null, false);
      toast('The microphone could not start: ' + err.message, 'error');
    }
  }

  function stopMic() {
    const r = rec;
    if (listening) Sound.play('micOff');
    setListening(null, false);
    rec = null;
    if (r) { try { r.stop(); } catch (e) { /* already stopped */ } }
  }

  // ======================= init =======================
  if (typeof XLSX === 'undefined') {
    toast('The Excel reader did not load. Check your internet connection and refresh the page.', 'error');
  }
  addGroup();
  updateSteps();
  refreshAll();
})();
