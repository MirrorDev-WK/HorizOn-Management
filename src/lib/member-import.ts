import { readSheet } from "read-excel-file/browser";

export type ImportedMember = {
  name: string;
  className: string;
};

export type MemberImportResult = {
  members: ImportedMember[];
  invalidRowCount: number;
  duplicateRowCount: number;
  error?: string;
};

const NAME_HEADERS = new Set(["charactername", "character", "name"]);
const CLASS_HEADERS = new Set(["class", "classname", "job"]);

export async function readMemberImportFile(file: File, existingMemberNames: string[]): Promise<MemberImportResult> {
  try {
    const rows = file.name.toLowerCase().endsWith(".csv") ? parseCsv(await file.text()) : await readSheet(file);
    return parseMemberImportRows(rows, existingMemberNames);
  } catch {
    return emptyResult("Could not read that file. Use an .xlsx or .csv roster file.");
  }
}

export function parseMemberImportRows(rows: unknown[][], existingMemberNames: string[] = []): MemberImportResult {
  const headerRow = rows[0];
  if (!headerRow) return emptyResult("The file is empty.");

  const nameIndex = headerRow.findIndex((value) => NAME_HEADERS.has(normalizeHeader(value)));
  const classIndex = headerRow.findIndex((value) => CLASS_HEADERS.has(normalizeHeader(value)));
  if (nameIndex < 0 || classIndex < 0) {
    return emptyResult("Add Character Name (or Name) and Class (or Job) headers in the first row.");
  }

  const knownNames = new Set(existingMemberNames.map(normalizeName));
  const members: ImportedMember[] = [];
  let invalidRowCount = 0;
  let duplicateRowCount = 0;

  for (const row of rows.slice(1)) {
    const name = cellText(row[nameIndex]);
    const className = cellText(row[classIndex]);
    if (!name && !className) continue;
    if (!name || !className) {
      invalidRowCount += 1;
      continue;
    }

    const normalizedName = normalizeName(name);
    if (knownNames.has(normalizedName)) {
      duplicateRowCount += 1;
      continue;
    }

    knownNames.add(normalizedName);
    members.push({ name, className });
  }

  return { members, invalidRowCount, duplicateRowCount };
}

function normalizeHeader(value: unknown): string {
  return cellText(value).toLowerCase().replace(/[^a-z]/g, "");
}

function normalizeName(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function cellText(value: unknown): string {
  return typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
}

function emptyResult(error: string): MemberImportResult {
  return { members: [], invalidRowCount: 0, duplicateRowCount: 0, error };
}

function parseCsv(text: string): unknown[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let isQuoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"') {
      if (isQuoted && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else {
        isQuoted = !isQuoted;
      }
    } else if (character === "," && !isQuoted) {
      row.push(cell);
      cell = "";
    } else if ((character === "\n" || character === "\r") && !isQuoted) {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += character;
    }
  }

  if (cell || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}
