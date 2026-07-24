(() => {
  "use strict";

  const TITLE_WORDS = new Set([
    "mr", "mister", "mrs", "missus", "ms", "miss", "dr", "doctor",
    "prof", "professor", "shri", "smt", "sir", "madam", "counsellor", "counselor"
  ]);

  const normalizeName = (value) => {
    const cleaned = String(value || "")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/&/g, " and ")
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    return cleaned
      .split(" ")
      .filter((word) => word && !TITLE_WORDS.has(word))
      .join(" ");
  };

  const normalizeHeader = (value) => String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

  const rawCounselors = Array.isArray(window.COUNSELORS) ? window.COUNSELORS : [];
  const counselors = [];
  const counselorSeen = new Set();

  rawCounselors.forEach((item, index) => {
    if (!item || !item.name || !item.center) return;
    const name = String(item.name).trim().replace(/\s+/g, " ");
    const center = String(item.center).trim().replace(/\s+/g, " ");
    const key = `${normalizeName(name)}|${center.toLowerCase()}`;
    if (!normalizeName(name) || !center || counselorSeen.has(key)) return;
    counselorSeen.add(key);
    counselors.push({ id: index + 1, name, center });
  });

  const elements = {
    themeToggle: document.getElementById("themeToggle"),
    counselorCount: document.getElementById("counselorCount"),
    centerCount: document.getElementById("centerCount"),
    selectedCount: document.getElementById("selectedCount"),

    nameInput: document.getElementById("nameInput"),
    inputWrap: document.getElementById("inputWrap"),
    clearInput: document.getElementById("clearInput"),
    suggestionBox: document.getElementById("suggestionBox"),
    inputCounter: document.getElementById("inputCounter"),
    findButton: document.getElementById("findButton"),
    resetButton: document.getElementById("resetButton"),

    resultsSection: document.getElementById("resultsSection"),
    resultsBody: document.getElementById("resultsBody"),
    matchedSummary: document.getElementById("matchedSummary"),
    unmatchedSummary: document.getElementById("unmatchedSummary"),
    unmatchedCard: document.getElementById("unmatchedCard"),
    unmatchedNames: document.getElementById("unmatchedNames"),
    copyButton: document.getElementById("copyButton"),
    downloadButton: document.getElementById("downloadButton"),

    countFileInput: document.getElementById("countFileInput"),
    dropZone: document.getElementById("dropZone"),
    chooseFileButton: document.getElementById("chooseFileButton"),
    fileStatus: document.getElementById("fileStatus"),
    countResultsSection: document.getElementById("countResultsSection"),
    grandTotalMetric: document.getElementById("grandTotalMetric"),
    matchedRowsMetric: document.getElementById("matchedRowsMetric"),
    unmatchedRowsMetric: document.getElementById("unmatchedRowsMetric"),
    topCenterMetric: document.getElementById("topCenterMetric"),
    centerSummaryBody: document.getElementById("centerSummaryBody"),
    centerChart: document.getElementById("centerChart"),
    chartSubtext: document.getElementById("chartSubtext"),
    matchedDetailsPanel: document.getElementById("matchedDetailsPanel"),
    matchedCountBody: document.getElementById("matchedCountBody"),
    countUnmatchedCard: document.getElementById("countUnmatchedCard"),
    countUnmatchedList: document.getElementById("countUnmatchedList"),
    copyCenterSummaryButton: document.getElementById("copyCenterSummaryButton"),
    downloadCenterCsvButton: document.getElementById("downloadCenterCsvButton"),

    toast: document.getElementById("toast")
  };

  let suggestions = [];
  let activeSuggestion = 0;
  let lastResults = [];
  let lastCountResult = null;
  let toastTimer = null;

  const tokenize = (value) => normalizeName(value).split(" ").filter(Boolean);

  const formatNumber = (value) => {
    const number = Number(value);
    if (!Number.isFinite(number)) return "0";
    return number.toLocaleString("en-IN", {
      maximumFractionDigits: Number.isInteger(number) ? 0 : 2
    });
  };

  const escapeHtml = (value) => String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

  const getInitials = (name) => {
    const words = String(name)
      .replace(/[^a-zA-Z\s]/g, " ")
      .split(/\s+/)
      .filter((word) => word && !TITLE_WORDS.has(word.toLowerCase()));
    return (words.slice(0, 2).map((word) => word[0]).join("") || "C").toUpperCase();
  };

  const damerauLevenshtein = (source, target) => {
    const a = String(source);
    const b = String(target);
    const rows = a.length + 1;
    const cols = b.length + 1;
    const matrix = Array.from({ length: rows }, () => Array(cols).fill(0));

    for (let i = 0; i < rows; i += 1) matrix[i][0] = i;
    for (let j = 0; j < cols; j += 1) matrix[0][j] = j;

    for (let i = 1; i < rows; i += 1) {
      for (let j = 1; j < cols; j += 1) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j - 1] + cost
        );

        if (
          i > 1 &&
          j > 1 &&
          a[i - 1] === b[j - 2] &&
          a[i - 2] === b[j - 1]
        ) {
          matrix[i][j] = Math.min(matrix[i][j], matrix[i - 2][j - 2] + 1);
        }
      }
    }

    return matrix[a.length][b.length];
  };

  const similarityScore = (query, candidate) => {
    const q = normalizeName(query);
    const c = normalizeName(candidate);
    if (!q || !c) return 0;
    if (q === c) return 1;
    if (c.startsWith(q)) return 0.97 - Math.min((c.length - q.length) * 0.002, 0.08);
    if (c.includes(q)) return 0.91 - Math.min((c.length - q.length) * 0.002, 0.08);

    const qTokens = tokenize(q);
    const cTokens = tokenize(c);
    const commonTokens = qTokens.filter((token) => cTokens.includes(token)).length;
    const tokenOverlap = commonTokens / Math.max(qTokens.length, cTokens.length, 1);

    const qSorted = [...qTokens].sort().join(" ");
    const cSorted = [...cTokens].sort().join(" ");
    const distance = damerauLevenshtein(qSorted, cSorted);
    const editSimilarity = 1 - distance / Math.max(qSorted.length, cSorted.length, 1);

    const firstTokenBoost = qTokens[0] && cTokens[0]
      ? 1 - damerauLevenshtein(qTokens[0], cTokens[0]) / Math.max(qTokens[0].length, cTokens[0].length, 1)
      : 0;

    return Math.max(editSimilarity, tokenOverlap * 0.93, editSimilarity * 0.76 + firstTokenBoost * 0.24);
  };

  const bestMatchForName = (inputName) => {
    const normalizedInput = normalizeName(inputName);
    if (!normalizedInput) return null;

    const exact = counselors.find((person) => normalizeName(person.name) === normalizedInput);
    if (exact) {
      return { person: exact, score: 1, type: "Exact" };
    }

    const ranked = counselors
      .map((person) => ({ person, score: similarityScore(normalizedInput, person.name) }))
      .sort((a, b) => b.score - a.score || a.person.name.localeCompare(b.person.name));

    const best = ranked[0];
    const second = ranked[1];
    const margin = best ? best.score - (second?.score || 0) : 0;

    if (best && best.score >= 0.72 && (best.score >= 0.88 || margin >= 0.08)) {
      return { ...best, type: "Smart" };
    }

    return null;
  };

  const currentTokenInfo = () => {
    const value = elements.nameInput.value;
    const caret = elements.nameInput.selectionStart ?? value.length;
    const beforeCaret = value.slice(0, caret);
    const tokenStart = beforeCaret.lastIndexOf(",") + 1;
    const token = beforeCaret.slice(tokenStart).trim();
    return { value, caret, tokenStart, token };
  };

  const parseInputNames = () => elements.nameInput.value
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);

  const findSuggestions = (query) => {
    const normalized = normalizeName(query);
    if (!normalized) return [];

    return counselors
      .map((person) => ({ person, score: similarityScore(normalized, person.name) }))
      .filter((entry) => entry.score >= 0.36)
      .sort((a, b) => b.score - a.score || a.person.name.localeCompare(b.person.name))
      .slice(0, 7);
  };

  const updateStats = () => {
    elements.counselorCount.textContent = counselors.length.toLocaleString("en-IN");
    elements.centerCount.textContent = new Set(counselors.map((item) => item.center.toLowerCase())).size.toLocaleString("en-IN");
    elements.selectedCount.textContent = lastResults.length.toLocaleString("en-IN");
  };

  const updateInputState = () => {
    const count = parseInputNames().length;
    elements.inputCounter.textContent = `${count} ${count === 1 ? "name" : "names"} entered`;
    elements.clearInput.classList.toggle("visible", elements.nameInput.value.trim().length > 0);
    elements.inputWrap.classList.remove("has-error");
  };

  const renderSuggestions = () => {
    const { token } = currentTokenInfo();
    suggestions = findSuggestions(token);
    activeSuggestion = Math.min(activeSuggestion, Math.max(suggestions.length - 1, 0));

    if (!token || suggestions.length === 0 || document.activeElement !== elements.nameInput) {
      hideSuggestions();
      return;
    }

    elements.suggestionBox.innerHTML = `
      <div class="suggestion-head"><span>Suggestions</span><span>↑ ↓ navigate</span></div>
      ${suggestions.map((entry, index) => `
        <button class="suggestion-item ${index === activeSuggestion ? "active" : ""}" type="button" role="option" aria-selected="${index === activeSuggestion}" data-index="${index}">
          <span class="suggestion-person">
            <span class="suggestion-avatar">${escapeHtml(getInitials(entry.person.name))}</span>
            <span class="suggestion-copy">
              <strong>${escapeHtml(entry.person.name)}</strong>
              <span>${escapeHtml(entry.person.center)}</span>
            </span>
          </span>
          <span class="suggestion-key">${index === activeSuggestion ? "Tab ↵" : `${Math.round(entry.score * 100)}%`}</span>
        </button>
      `).join("")}
    `;

    elements.suggestionBox.hidden = false;
  };

  const hideSuggestions = () => {
    elements.suggestionBox.hidden = true;
    elements.suggestionBox.innerHTML = "";
    suggestions = [];
    activeSuggestion = 0;
  };

  const acceptSuggestion = (index = activeSuggestion, addComma = false) => {
    const entry = suggestions[index];
    if (!entry) return;

    const { value, caret, tokenStart } = currentTokenInfo();
    const beforeToken = value.slice(0, tokenStart);
    const afterCaret = value.slice(caret);
    const leadingSpace = tokenStart > 0 ? " " : "";
    const suffix = addComma ? ", " : "";
    const replacement = `${leadingSpace}${entry.person.name}${suffix}`;
    const nextValue = `${beforeToken}${replacement}${afterCaret}`;

    elements.nameInput.value = nextValue;
    const nextCaret = beforeToken.length + replacement.length;
    elements.nameInput.setSelectionRange(nextCaret, nextCaret);
    updateInputState();
    hideSuggestions();
  };

  const renderResults = (matched, unmatched) => {
    lastResults = matched;
    updateStats();

    elements.resultsBody.innerHTML = matched.map((result, index) => `
      <tr>
        <td class="number-cell">${String(index + 1).padStart(2, "0")}</td>
        <td>
          <div class="person-cell">
            <span class="person-avatar">${escapeHtml(getInitials(result.person.name))}</span>
            <div>
              <strong>${escapeHtml(result.person.name)}</strong>
              <span>Entered as: ${escapeHtml(result.input)}</span>
            </div>
          </div>
        </td>
        <td class="center-cell">${escapeHtml(result.person.center)}</td>
        <td><span class="match-badge ${result.type === "Smart" ? "fuzzy" : ""}"><i></i>${escapeHtml(result.type)} · ${Math.round(result.score * 100)}%</span></td>
      </tr>
    `).join("");

    elements.matchedSummary.textContent = matched.length;
    elements.unmatchedSummary.textContent = unmatched.length;
    elements.unmatchedCard.hidden = unmatched.length === 0;
    elements.unmatchedNames.textContent = unmatched.join(", ");
    elements.resultsSection.hidden = false;

    window.setTimeout(() => {
      elements.resultsSection.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);
  };

  const runSearch = () => {
    const inputNames = parseInputNames();
    hideSuggestions();

    if (inputNames.length === 0) {
      elements.inputWrap.classList.add("has-error");
      elements.nameInput.focus();
      showToast("Enter at least one counselor name.");
      return;
    }

    const matched = [];
    const unmatched = [];
    const seen = new Set();

    inputNames.forEach((input) => {
      const match = bestMatchForName(input);
      if (!match) {
        unmatched.push(input);
        return;
      }

      const key = `${normalizeName(match.person.name)}|${match.person.center.toLowerCase()}`;
      if (!seen.has(key)) {
        matched.push({ ...match, input });
        seen.add(key);
      }
    });

    renderResults(matched, unmatched);

    if (matched.length === 0) {
      showToast("No confident match found. Try selecting a suggestion.");
    } else if (unmatched.length > 0) {
      showToast(`${matched.length} matched; ${unmatched.length} need review.`);
    } else {
      showToast(`${matched.length} counselor${matched.length === 1 ? "" : "s"} matched successfully.`);
    }
  };

  const resetAll = () => {
    elements.nameInput.value = "";
    lastResults = [];
    elements.resultsBody.innerHTML = "";
    elements.resultsSection.hidden = true;
    elements.unmatchedCard.hidden = true;
    hideSuggestions();
    updateInputState();
    updateStats();
    elements.nameInput.focus();
  };

  const csvEscape = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;

  const rowsToCsv = (rows) => rows
    .map((row) => row.map(csvEscape).join(","))
    .join("\n");

  const downloadBlob = (content, filename, type = "text/csv;charset=utf-8") => {
    const blob = new Blob(["\uFEFF", content], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const resultsAsCsv = () => {
    const rows = [["Counselor Name", "Center", "Entered Name", "Match Type", "Confidence"]];
    lastResults.forEach((result) => {
      rows.push([
        result.person.name,
        result.person.center,
        result.input,
        result.type,
        `${Math.round(result.score * 100)}%`
      ]);
    });
    return rowsToCsv(rows);
  };

  const copyText = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      const helper = document.createElement("textarea");
      helper.value = text;
      helper.style.position = "fixed";
      helper.style.opacity = "0";
      document.body.appendChild(helper);
      helper.select();
      const copied = document.execCommand("copy");
      helper.remove();
      return copied;
    }
  };

  const copyResults = async () => {
    if (lastResults.length === 0) {
      showToast("There are no matched results to copy.");
      return;
    }

    const text = lastResults.map((result) => `${result.person.name} — ${result.person.center}`).join("\n");
    await copyText(text);
    showToast("Results copied to clipboard.");
  };

  const downloadSearchCsv = () => {
    if (lastResults.length === 0) {
      showToast("There are no matched results to download.");
      return;
    }

    const date = new Date().toISOString().slice(0, 10);
    downloadBlob(resultsAsCsv(), `counselor-centers-${date}.csv`);
    showToast("CSV downloaded.");
  };

  const parseCount = (value) => {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    const text = String(value ?? "").trim();
    if (!text) return Number.NaN;
    const cleaned = text.replace(/,/g, "");
    const match = cleaned.match(/-?\d+(?:\.\d+)?/);
    if (!match) return Number.NaN;
    return Number(match[0]);
  };

  const isMeaningfulRow = (row) => {
    if (!Array.isArray(row)) return false;
    const first = String(row[0] ?? "").trim();
    const second = String(row[1] ?? "").trim();
    return Boolean(first || second);
  };

  const looksLikeHeaderRow = (row) => {
    if (!row) return false;
    const first = normalizeHeader(row[0]);
    const second = normalizeHeader(row[1]);
    const firstIsHeader = /^(name|counsellorname|counselorname|username|employee|agent)$/.test(first) ||
      first.includes("counsellor") ||
      first.includes("counselor");
    const secondIsHeader = second.includes("count") ||
      second.includes("total") ||
      second.includes("qty") ||
      second.includes("quantity") ||
      second.includes("admission") ||
      second.includes("lead");
    const secondLooksNumeric = Number.isFinite(parseCount(row[1]));
    return firstIsHeader || secondIsHeader || (!secondLooksNumeric && first.length > 0 && second.length > 0);
  };

  const parseCsv = (text) => {
    const rows = [];
    let row = [];
    let cell = "";
    let inQuotes = false;

    for (let index = 0; index < text.length; index += 1) {
      const char = text[index];
      const next = text[index + 1];

      if (char === '"' && inQuotes && next === '"') {
        cell += '"';
        index += 1;
        continue;
      }

      if (char === '"') {
        inQuotes = !inQuotes;
        continue;
      }

      if (char === "," && !inQuotes) {
        row.push(cell);
        cell = "";
        continue;
      }

      if ((char === "\n" || char === "\r") && !inQuotes) {
        if (char === "\r" && next === "\n") index += 1;
        row.push(cell);
        rows.push(row);
        row = [];
        cell = "";
        continue;
      }

      cell += char;
    }

    row.push(cell);
    if (row.some((value) => String(value).trim() !== "")) rows.push(row);
    return rows;
  };

  const readRowsFromFile = async (file) => {
    const extension = file.name.split(".").pop().toLowerCase();

    if (extension === "csv") {
      return parseCsv(await file.text());
    }

    if (!window.XLSX) {
      throw new Error("Excel reader is still loading or internet is off. Try CSV, or reopen the file after internet is available.");
    }

    const buffer = await file.arrayBuffer();
    const workbook = window.XLSX.read(buffer, { type: "array", cellDates: false });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) throw new Error("No worksheet found in this Excel file.");

    const sheet = workbook.Sheets[sheetName];
    return window.XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      defval: "",
      raw: false,
      blankrows: false
    });
  };

  const createCenterSummary = (rows, fileName) => {
    const rowObjects = rows
      .map((row, index) => ({ row, rowNumber: index + 1 }))
      .filter((item) => isMeaningfulRow(item.row));

    if (rowObjects.length === 0) {
      throw new Error("The uploaded file has no usable rows.");
    }

    const dataRows = looksLikeHeaderRow(rowObjects[0].row) ? rowObjects.slice(1) : rowObjects;
    const centerMap = new Map();
    const matchedRows = [];
    const unmatchedRows = [];

    dataRows.forEach(({ row, rowNumber }) => {
      const inputName = String(row[0] ?? "").trim().replace(/\s+/g, " ");
      const rawCount = row[1];
      const count = parseCount(rawCount);

      if (!inputName) {
        unmatchedRows.push({ rowNumber, inputName: "Blank name", rawCount, reason: "Name missing" });
        return;
      }

      if (!Number.isFinite(count) || count < 0) {
        unmatchedRows.push({ rowNumber, inputName, rawCount, reason: "Invalid count" });
        return;
      }

      const match = bestMatchForName(inputName);
      if (!match) {
        unmatchedRows.push({ rowNumber, inputName, rawCount: count, reason: "Counselor not found" });
        return;
      }

      const center = match.person.center;
      if (!centerMap.has(center)) {
        centerMap.set(center, { center, total: 0, rows: 0, counselors: new Set() });
      }

      const item = centerMap.get(center);
      item.total += count;
      item.rows += 1;
      item.counselors.add(match.person.name);

      matchedRows.push({
        rowNumber,
        inputName,
        officialName: match.person.name,
        center,
        count,
        matchType: match.type,
        confidence: match.score
      });
    });

    const summary = Array.from(centerMap.values())
      .map((item) => ({
        center: item.center,
        total: item.total,
        rows: item.rows,
        counselors: Array.from(item.counselors).sort((a, b) => a.localeCompare(b))
      }))
      .sort((a, b) => b.total - a.total || a.center.localeCompare(b.center));

    const grandTotal = summary.reduce((sum, item) => sum + item.total, 0);

    return {
      fileName,
      summary,
      matchedRows,
      unmatchedRows,
      grandTotal
    };
  };

  const renderCountResults = (result) => {
    lastCountResult = result;
    const { summary, matchedRows, unmatchedRows, grandTotal } = result;
    const topCenter = summary[0]?.center || "—";
    const maxTotal = Math.max(...summary.map((item) => item.total), 0);

    elements.grandTotalMetric.textContent = formatNumber(grandTotal);
    elements.matchedRowsMetric.textContent = matchedRows.length.toLocaleString("en-IN");
    elements.unmatchedRowsMetric.textContent = unmatchedRows.length.toLocaleString("en-IN");
    elements.topCenterMetric.textContent = topCenter;
    elements.chartSubtext.textContent = summary.length ? `${summary.length} center${summary.length === 1 ? "" : "s"} · scroll horizontally` : "No matched center";

    elements.centerSummaryBody.innerHTML = summary.map((item, index) => {
      const share = grandTotal ? (item.total / grandTotal) * 100 : 0;
      return `
        <tr>
          <td class="number-cell">${String(index + 1).padStart(2, "0")}</td>
          <td class="center-cell">${escapeHtml(item.center)}</td>
          <td class="strong-number">${formatNumber(item.total)}</td>
          <td>${item.rows}</td>
          <td>${share.toFixed(1)}%</td>
        </tr>
      `;
    }).join("");

    elements.centerChart.innerHTML = summary.length
      ? summary.map((item) => {
          const percent = maxTotal ? Math.max((item.total / maxTotal) * 100, 4) : 0;
          const share = grandTotal ? (item.total / grandTotal) * 100 : 0;
          return `
            <article class="chart-row center-total-card">
              <div class="center-card-topline">
                <span class="center-rank">#${String(summary.indexOf(item) + 1).padStart(2, "0")}</span>
                <span class="center-share">${share.toFixed(1)}%</span>
              </div>
              <strong class="center-card-name">${escapeHtml(item.center)}</strong>
              <div class="center-card-total">${formatNumber(item.total)}</div>
              <span class="center-card-caption">Total count · ${item.rows} row${item.rows === 1 ? "" : "s"}</span>
              <div class="bar-track" aria-hidden="true">
                <span class="bar-fill" style="--bar-width:${percent.toFixed(2)}%"></span>
              </div>
            </article>
          `;
        }).join("")
      : `<div class="empty-state">No center total found.</div>`;

    elements.matchedCountBody.innerHTML = matchedRows.map((row) => `
      <tr>
        <td class="number-cell">${row.rowNumber}</td>
        <td>${escapeHtml(row.inputName)}</td>
        <td>${escapeHtml(row.officialName)}</td>
        <td class="center-cell">${escapeHtml(row.center)}</td>
        <td class="strong-number">${formatNumber(row.count)}</td>
        <td><span class="match-badge ${row.matchType === "Smart" ? "fuzzy" : ""}"><i></i>${escapeHtml(row.matchType)} · ${Math.round(row.confidence * 100)}%</span></td>
      </tr>
    `).join("");

    elements.matchedDetailsPanel.hidden = matchedRows.length === 0;

    elements.countUnmatchedCard.hidden = unmatchedRows.length === 0;
    elements.countUnmatchedList.innerHTML = unmatchedRows.map((row) => `
      <div class="unmatched-chip">
        <strong>Row ${row.rowNumber}</strong>
        <span>${escapeHtml(row.inputName)} · Count: ${escapeHtml(row.rawCount ?? "")} · ${escapeHtml(row.reason)}</span>
      </div>
    `).join("");

    elements.countResultsSection.hidden = false;
    window.setTimeout(() => {
      elements.countResultsSection.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);
  };

  const handleCountFile = async (file) => {
    if (!file) return;
    elements.fileStatus.textContent = `Reading ${file.name}...`;

    try {
      const rows = await readRowsFromFile(file);
      const result = createCenterSummary(rows, file.name);
      renderCountResults(result);
      elements.fileStatus.textContent = `${file.name} processed`;
      const message = `${result.matchedRows.length} matched rows, ${result.unmatchedRows.length} need review.`;
      showToast(message);
    } catch (error) {
      elements.fileStatus.textContent = "Could not process file";
      showToast(error.message || "Could not process this file.");
    }
  };

  const centerSummaryCsv = () => {
    if (!lastCountResult) return "";
    const rows = [["S.No.", "Center", "Counselors", "Total Count"]];
    lastCountResult.summary.forEach((item, index) => {
      rows.push([index + 1, item.center, item.counselors.join(", "), item.total]);
    });

    rows.push([]);
    rows.push(["Not Found"]);
    rows.push(["Source Row", "Input Name", "Count", "Reason"]);
    lastCountResult.unmatchedRows.forEach((row) => {
      rows.push([row.rowNumber, row.inputName, row.rawCount, row.reason]);
    });

    return rowsToCsv(rows);
  };

  const copyCenterSummary = async () => {
    if (!lastCountResult || lastCountResult.summary.length === 0) {
      showToast("There is no center summary to copy.");
      return;
    }

    const lines = lastCountResult.summary.map((item) => `${item.center}: ${formatNumber(item.total)}`);
    await copyText(lines.join("\n"));
    showToast("Center summary copied.");
  };

  const styleWorksheetAsTable = (sheet, rowCount, colCount, columnWidths) => {
    const headerStyle = {
      font: { bold: true, color: { rgb: "FFFFFF" } },
      fill: { fgColor: { rgb: "2563EB" } },
      alignment: { horizontal: "center", vertical: "center" },
      border: {
        top: { style: "thin", color: { rgb: "D1D5DB" } },
        bottom: { style: "thin", color: { rgb: "D1D5DB" } },
        left: { style: "thin", color: { rgb: "D1D5DB" } },
        right: { style: "thin", color: { rgb: "D1D5DB" } }
      }
    };
    const bodyBorder = {
      top: { style: "thin", color: { rgb: "E5E7EB" } },
      bottom: { style: "thin", color: { rgb: "E5E7EB" } },
      left: { style: "thin", color: { rgb: "E5E7EB" } },
      right: { style: "thin", color: { rgb: "E5E7EB" } }
    };

    for (let row = 0; row < rowCount; row += 1) {
      for (let col = 0; col < colCount; col += 1) {
        const address = window.XLSX.utils.encode_cell({ r: row, c: col });
        if (!sheet[address]) continue;
        if (row === 0) {
          sheet[address].s = headerStyle;
        } else {
          sheet[address].s = {
            fill: { fgColor: { rgb: row % 2 === 0 ? "EFF6FF" : "FFFFFF" } },
            alignment: {
              vertical: "center",
              horizontal: col === 0 || col === colCount - 1 ? "center" : "left",
              wrapText: col === 2
            },
            border: bodyBorder
          };
        }
      }
    }

    sheet["!cols"] = columnWidths.map((wch) => ({ wch }));
    sheet["!rows"] = [{ hpt: 24 }];
    if (rowCount > 1) {
      sheet["!autofilter"] = { ref: `A1:${window.XLSX.utils.encode_col(colCount - 1)}${rowCount}` };
    }
    sheet["!freeze"] = { xSplit: 0, ySplit: 1, topLeftCell: "A2", activePane: "bottomLeft", state: "frozen" };
  };

  const downloadCenterCsv = () => {
    if (!lastCountResult) {
      showToast("Upload a count file first.");
      return;
    }

    const date = new Date().toISOString().slice(0, 10);

    if (window.XLSX) {
      const workbook = window.XLSX.utils.book_new();

      const summaryData = [["S.No.", "Center", "Counselors", "Total Count"]];
      lastCountResult.summary.forEach((item, index) => {
        summaryData.push([index + 1, item.center, item.counselors.join(", "), item.total]);
      });
      const summarySheet = window.XLSX.utils.aoa_to_sheet(summaryData);
      styleWorksheetAsTable(summarySheet, summaryData.length, 4, [10, 34, 58, 18]);
      window.XLSX.utils.book_append_sheet(workbook, summarySheet, "Center Summary");

      const unmatchedData = [["Source Row", "Input Name", "Count", "Reason"]];
      lastCountResult.unmatchedRows.forEach((row) => {
        unmatchedData.push([row.rowNumber, row.inputName, row.rawCount, row.reason]);
      });
      const unmatchedSheet = window.XLSX.utils.aoa_to_sheet(unmatchedData);
      styleWorksheetAsTable(unmatchedSheet, unmatchedData.length, 4, [14, 34, 16, 46]);
      window.XLSX.utils.book_append_sheet(workbook, unmatchedSheet, "Not Found");

      window.XLSX.writeFile(workbook, `center-count-summary-${date}.xlsx`, { cellStyles: true });
      showToast("Formatted center summary Excel downloaded.");
      return;
    }

    downloadBlob(centerSummaryCsv(), `center-count-summary-${date}.csv`);
    showToast("Excel library unavailable, CSV downloaded instead.");
  };

  const showToast = (message) => {
    window.clearTimeout(toastTimer);
    elements.toast.textContent = message;
    elements.toast.classList.add("show");
    toastTimer = window.setTimeout(() => elements.toast.classList.remove("show"), 3000);
  };

  const safeStorage = {
    get(key) {
      try { return window.localStorage.getItem(key); } catch { return null; }
    },
    set(key, value) {
      try { window.localStorage.setItem(key, value); } catch { /* storage can be blocked */ }
    }
  };

  const setTheme = (theme) => {
    document.documentElement.dataset.theme = theme;
    safeStorage.set("centerly-theme", theme);
    elements.themeToggle.setAttribute(
      "aria-label",
      theme === "dark" ? "Switch to light theme" : "Switch to dark theme"
    );

    const themeMeta = document.querySelector('meta[name="theme-color"]');
    if (themeMeta) themeMeta.setAttribute("content", theme === "dark" ? "#0b0e18" : "#7562ff");
  };

  const initializeTheme = () => {
    const saved = safeStorage.get("centerly-theme");
    const preferred = window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    setTheme(saved || preferred);
  };

  const wireManualSearchEvents = () => {
    elements.themeToggle.addEventListener("click", () => {
      const current = document.documentElement.dataset.theme;
      setTheme(current === "dark" ? "light" : "dark");
    });

    elements.nameInput.addEventListener("input", () => {
      updateInputState();
      activeSuggestion = 0;
      renderSuggestions();
    });

    elements.nameInput.addEventListener("click", renderSuggestions);
    elements.nameInput.addEventListener("focus", renderSuggestions);
    elements.nameInput.addEventListener("blur", () => {
      window.setTimeout(hideSuggestions, 140);
    });

    elements.nameInput.addEventListener("keydown", (event) => {
      const isOpen = !elements.suggestionBox.hidden && suggestions.length > 0;

      if (isOpen && event.key === "ArrowDown") {
        event.preventDefault();
        activeSuggestion = (activeSuggestion + 1) % suggestions.length;
        renderSuggestions();
        return;
      }

      if (isOpen && event.key === "ArrowUp") {
        event.preventDefault();
        activeSuggestion = (activeSuggestion - 1 + suggestions.length) % suggestions.length;
        renderSuggestions();
        return;
      }

      if (isOpen && (event.key === "Tab" || event.key === "Enter")) {
        event.preventDefault();
        acceptSuggestion(activeSuggestion, false);
        return;
      }

      if (isOpen && event.key === ",") {
        event.preventDefault();
        acceptSuggestion(activeSuggestion, true);
        return;
      }

      if (event.key === "Escape") {
        hideSuggestions();
      }

      if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
        event.preventDefault();
        runSearch();
      }
    });

    elements.suggestionBox.addEventListener("mousedown", (event) => {
      const button = event.target.closest(".suggestion-item");
      if (!button) return;
      event.preventDefault();
      acceptSuggestion(Number(button.dataset.index), false);
      elements.nameInput.focus();
    });

    elements.clearInput.addEventListener("click", resetAll);
    elements.resetButton.addEventListener("click", resetAll);
    elements.findButton.addEventListener("click", runSearch);
    elements.copyButton.addEventListener("click", copyResults);
    elements.downloadButton.addEventListener("click", downloadSearchCsv);

  };

  const wireCountUploadEvents = () => {
    const openFilePicker = () => elements.countFileInput.click();

    elements.chooseFileButton.addEventListener("click", (event) => {
      event.stopPropagation();
      openFilePicker();
    });

    elements.dropZone.addEventListener("click", (event) => {
      if (event.target.closest("button")) return;
      openFilePicker();
    });

    elements.dropZone.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openFilePicker();
      }
    });

    elements.countFileInput.addEventListener("change", () => {
      handleCountFile(elements.countFileInput.files?.[0]);
    });

    ["dragenter", "dragover"].forEach((name) => {
      elements.dropZone.addEventListener(name, (event) => {
        event.preventDefault();
        elements.dropZone.classList.add("dragging");
      });
    });

    ["dragleave", "drop"].forEach((name) => {
      elements.dropZone.addEventListener(name, (event) => {
        event.preventDefault();
        elements.dropZone.classList.remove("dragging");
      });
    });

    elements.dropZone.addEventListener("drop", (event) => {
      const file = event.dataTransfer?.files?.[0];
      handleCountFile(file);
    });

    elements.copyCenterSummaryButton.addEventListener("click", copyCenterSummary);
    elements.downloadCenterCsvButton.addEventListener("click", downloadCenterCsv);
  };

  const initializeLiquidExperience = () => {
    const finePointer = window.matchMedia?.("(hover: hover) and (pointer: fine)").matches;
    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const cursorGlow = document.getElementById("cursorGlow");
    const liquidSelector = [
      ".stat-card",
      ".workspace-card",
      ".results-section",
      ".metric-grid article",
      ".chart-card",
      ".upload-panel",
      ".center-total-card"
    ].join(",");

    if (finePointer) document.documentElement.classList.add("pointer-fine");

    let targetX = -320;
    let targetY = -320;
    let currentX = targetX;
    let currentY = targetY;
    let activeTiltCard = null;
    let activeLiquidSurface = null;

    const animateCursor = () => {
      if (!cursorGlow || !finePointer || reducedMotion) return;
      currentX += (targetX - currentX) * 0.16;
      currentY += (targetY - currentY) * 0.16;
      cursorGlow.style.transform = `translate3d(${currentX - 120}px, ${currentY - 120}px, 0)`;
      window.requestAnimationFrame(animateCursor);
    };

    if (cursorGlow && finePointer && !reducedMotion) {
      window.requestAnimationFrame(animateCursor);
    }

    document.addEventListener("pointermove", (event) => {
      if (finePointer && !reducedMotion) {
        targetX = event.clientX;
        targetY = event.clientY;
      }

      const surface = event.target.closest?.(liquidSelector);
      if (!surface) {
        if (activeLiquidSurface) {
          activeLiquidSurface.classList.remove("liquid-hover");
          activeLiquidSurface = null;
        }
        if (activeTiltCard) {
          activeTiltCard.style.removeProperty("--tilt-x");
          activeTiltCard.style.removeProperty("--tilt-y");
          activeTiltCard = null;
        }
        return;
      }

      if (activeLiquidSurface && activeLiquidSurface !== surface) {
        activeLiquidSurface.classList.remove("liquid-hover");
      }
      activeLiquidSurface = surface;
      surface.classList.add("liquid-hover");

      const rect = surface.getBoundingClientRect();
      surface.style.setProperty("--pointer-x", `${event.clientX - rect.left}px`);
      surface.style.setProperty("--pointer-y", `${event.clientY - rect.top}px`);

      const tiltCard = surface.matches(".stat-card") ? surface : null;
      if (activeTiltCard && activeTiltCard !== tiltCard) {
        activeTiltCard.style.removeProperty("--tilt-x");
        activeTiltCard.style.removeProperty("--tilt-y");
      }
      activeTiltCard = tiltCard;

      if (tiltCard && finePointer && !reducedMotion) {
        const xRatio = (event.clientX - rect.left) / rect.width - 0.5;
        const yRatio = (event.clientY - rect.top) / rect.height - 0.5;
        tiltCard.style.setProperty("--tilt-x", `${(xRatio * 3.8).toFixed(2)}deg`);
        tiltCard.style.setProperty("--tilt-y", `${(-yRatio * 3.8).toFixed(2)}deg`);
      }
    }, { passive: true });

    document.addEventListener("pointerout", (event) => {
      const surface = event.target.closest?.(liquidSelector);
      if (surface && !surface.contains(event.relatedTarget)) {
        surface.classList.remove("liquid-hover");
        if (activeLiquidSurface === surface) activeLiquidSurface = null;
      }

      const card = event.target.closest?.(".stat-card");
      if (!card || card.contains(event.relatedTarget)) return;
      card.style.removeProperty("--tilt-x");
      card.style.removeProperty("--tilt-y");
      if (activeTiltCard === card) activeTiltCard = null;
    });

    document.addEventListener("click", (event) => {
      if (reducedMotion) return;
      const target = event.target.closest?.("button, .upload-panel");
      if (!target || target.disabled) return;

      const rect = target.getBoundingClientRect();
      const ripple = document.createElement("span");
      const diameter = Math.max(rect.width, rect.height) * 2.15;
      ripple.className = "liquid-ripple";
      ripple.style.width = `${diameter}px`;
      ripple.style.height = `${diameter}px`;
      ripple.style.left = `${event.clientX - rect.left}px`;
      ripple.style.top = `${event.clientY - rect.top}px`;
      target.appendChild(ripple);
      ripple.addEventListener("animationend", () => ripple.remove(), { once: true });
    });

    const enableHorizontalWheel = () => {
      const scroller = elements.centerChart;
      if (!scroller || scroller.dataset.wheelReady === "true") return;
      scroller.dataset.wheelReady = "true";
      scroller.addEventListener("wheel", (event) => {
        if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
        const maxScroll = scroller.scrollWidth - scroller.clientWidth;
        if (maxScroll <= 0) return;
        const movingRight = event.deltaY > 0;
        const canMove = movingRight ? scroller.scrollLeft < maxScroll - 1 : scroller.scrollLeft > 1;
        if (!canMove) return;
        event.preventDefault();
        scroller.scrollLeft += event.deltaY;
      }, { passive: false });
    };

    enableHorizontalWheel();
  };

  initializeTheme();
  wireManualSearchEvents();
  wireCountUploadEvents();
  initializeLiquidExperience();
  updateStats();
  updateInputState();
})();
