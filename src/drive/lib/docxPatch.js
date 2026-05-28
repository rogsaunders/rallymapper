// src/drive/lib/docxPatch.js
//
// Parse an edited roadbook.docx and extract user-modified notes per
// row, so Drive Mode can overlay them on top of the JSON.
//
// **Replacement-only semantics** (per the architecture decision):
//   - Each DOCX data row maps to the JSON row at the same index.
//   - Row insertions or deletions in the DOCX are IGNORED — we only
//     compare and replace TEXT for rows that exist in both. Rows the
//     user adds in Word that aren't in the JSON simply don't appear
//     in Drive Mode.
//   - When DOCX text equals the JSON row's notes OR the humanised
//     fallback, no override is applied (the DOCX is just showing
//     the auto-text; the user hasn't actually edited).
//
// Approach: hand-rolled XML parsing of word/document.xml from the
// DOCX (which is a ZIP). Avoids adding a heavy DOCX library
// (mammoth.js, etc.) since we only need the Notes column from a
// known table structure produced by exportRoadbookDocx.js.
//
// Per exportRoadbookDocx.js the main roadbook table has:
//   - infoRow + headerRow (2 header rows)
//   - N data rows in the same order as JSON rows
//   - 7 cells per data row; index 5 = Notes
//   - The Notes cell's FIRST paragraph is the bold user text;
//     the second paragraph is the small grey auto-generated
//     subText (icon name + confidence). We extract only the first.

import JSZip from "jszip";

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

// Mirrors humanize() in exportRoadbookDocx.js — used to detect the
// "DOCX shows the auto-fallback, not a user edit" case.
function humanize(v) {
  return String(v || "note")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function directChildrenByTag(parent, tag) {
  const out = [];
  const all = parent.getElementsByTagNameNS(W, tag);
  for (let i = 0; i < all.length; i++) {
    if (all[i].parentNode === parent) out.push(all[i]);
  }
  return out;
}

function extractFirstParagraphText(tcEl) {
  // First <w:p> in the cell is the bold note text.
  // Subsequent paragraphs are the auto-generated subText we ignore.
  const paragraphs = directChildrenByTag(tcEl, "p");
  if (paragraphs.length === 0) return "";
  const firstP = paragraphs[0];
  // Concatenate all text runs in this paragraph
  const ts = firstP.getElementsByTagNameNS(W, "t");
  let text = "";
  for (let i = 0; i < ts.length; i++) {
    text += ts[i].textContent || "";
  }
  return text.trim();
}

// Strip the "⚠ REVIEW " prefix the exporter prepends to U-turn-
// flagged rows. That prefix is auto-generated, not a user edit.
function stripReviewMarker(text) {
  return text.replace(/^⚠\s*REVIEW\s+/, "");
}

/**
 * Find the main roadbook table inside a parsed document.xml.
 * Picks the table whose direct-child row count is closest to
 * jsonRows.length + 2 (data rows plus the 2 header rows).
 */
function findRoadbookTable(doc, expectedDataRows) {
  const tables = doc.getElementsByTagNameNS(W, "tbl");
  let bestTable = null;
  let bestDelta = Infinity;
  for (let i = 0; i < tables.length; i++) {
    const tbl = tables[i];
    const directRows = directChildrenByTag(tbl, "tr");
    const delta = Math.abs(directRows.length - (expectedDataRows + 2));
    if (delta < bestDelta) {
      bestDelta = delta;
      bestTable = tbl;
    }
  }
  return bestTable;
}

/**
 * Extract per-row note overrides from a DOCX file.
 *
 * @param {Blob|ArrayBuffer} docxBlob — the DOCX file contents
 * @param {Array} jsonRows — the JSON rows (used to detect non-edits)
 * @returns {Promise<Map<number, {notes: string}>>}
 */
export async function extractDocxNotePatches(docxBlob, jsonRows) {
  if (!docxBlob || !Array.isArray(jsonRows) || jsonRows.length === 0) {
    return new Map();
  }

  let zip;
  try {
    zip = await JSZip.loadAsync(docxBlob);
  } catch (e) {
    console.warn("docxPatch: failed to open DOCX as ZIP", e);
    return new Map();
  }

  const docFile = zip.file("word/document.xml");
  if (!docFile) {
    console.warn("docxPatch: word/document.xml not found");
    return new Map();
  }

  const xmlText = await docFile.async("string");

  let doc;
  try {
    doc = new DOMParser().parseFromString(xmlText, "application/xml");
  } catch (e) {
    console.warn("docxPatch: XML parse failed", e);
    return new Map();
  }

  const table = findRoadbookTable(doc, jsonRows.length);
  if (!table) {
    console.warn("docxPatch: no roadbook table found");
    return new Map();
  }

  const directRows = directChildrenByTag(table, "tr");
  // Skip the first 2 rows (infoRow + headerRow)
  const dataRows = directRows.slice(2);
  const patches = new Map();

  for (let i = 0; i < Math.min(dataRows.length, jsonRows.length); i++) {
    const tr = dataRows[i];
    const tcs = directChildrenByTag(tr, "tc");
    if (tcs.length < 6) continue; // structurally wrong row, skip

    const docxText = stripReviewMarker(extractFirstParagraphText(tcs[5]));
    if (!docxText) continue;

    const jsonRow = jsonRows[i];
    const jsonNotes = (jsonRow?.notes || "").trim();
    const fallback = humanize(jsonRow?.eventType);

    // Skip non-edits: text matches what the export would have written
    // either way (no user change).
    if (docxText === jsonNotes) continue;
    if (jsonNotes === "" && docxText === fallback) continue;

    patches.set(i, { notes: docxText });
  }

  return patches;
}

/**
 * Apply note patches to a roadbook rows array.
 * Returns a new rows array with the overrides applied (immutable).
 *
 * @param {Array} rows — original roadbook rows
 * @param {Map<number, {notes: string}>} patches
 * @returns {Array} new rows array
 */
export function applyNotePatches(rows, patches) {
  if (!patches || patches.size === 0) return rows;
  return rows.map((row, i) => {
    const patch = patches.get(i);
    if (!patch) return row;
    return { ...row, notes: patch.notes };
  });
}
