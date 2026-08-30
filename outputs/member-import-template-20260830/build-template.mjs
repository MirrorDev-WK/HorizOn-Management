import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const outputDir = fileURLToPath(new URL(".", import.meta.url));
const workbook = Workbook.create();

const membersSheet = workbook.worksheets.add("Members");
membersSheet.showGridLines = false;
membersSheet.getRange("A1:C1").values = [["Character Name", "Class", "Discord User ID"]];
membersSheet.getRange("A1:C1").format = {
  fill: "#0B3A24",
  font: { bold: true, color: "#F4F7F2" },
  horizontalAlignment: "left",
  verticalAlignment: "center",
  borders: { preset: "outside", style: "thin", color: "#6EA752" },
};
membersSheet.getRange("A1:C1").format.rowHeight = 24;
membersSheet.getRange("A:A").format.columnWidth = 26;
membersSheet.getRange("B:B").format.columnWidth = 22;
membersSheet.getRange("C:C").format.columnWidth = 27;
membersSheet.getRange("A2:C101").format = {
  fill: "#F7FBF5",
  borders: { preset: "outside", style: "thin", color: "#D9E7D8" },
};
membersSheet.getRange("C2:C101").format.numberFormat = "@";
membersSheet.getRange("B2:B101").dataValidation = {
  rule: {
    type: "list",
    values: ["Swordsman", "Mage", "Archer", "Acolyte", "Thief", "Merchant", "Gunslinger", "Druid", "Knight", "Wizard", "Hunter", "Priest", "Assassin", "Blacksmith"],
  },
};
membersSheet.freezePanes.freezeRows(1);

const instructionsSheet = workbook.worksheets.add("Instructions");
instructionsSheet.showGridLines = false;
instructionsSheet.getRange("A1:C1").merge();
instructionsSheet.getRange("A1:C1").values = [["HorizOn Member Import + Discord Link Template"]];
instructionsSheet.getRange("A1:C1").format = {
  fill: "#0B3A24",
  font: { bold: true, color: "#F4F7F2", size: 16 },
  horizontalAlignment: "left",
  verticalAlignment: "center",
};
instructionsSheet.getRange("A1:C1").format.rowHeight = 30;
instructionsSheet.getRange("A3:C3").merge();
instructionsSheet.getRange("A3:C3").values = [["Fill in the Members sheet and save as .xlsx. Import the roster in the HorizOn app first. Then use the optional Discord User ID column with the bot command to bulk-link Discord accounts. Do not change the first-row headers."]];
instructionsSheet.getRange("A3:C3").format = {
  fill: "#EAF4E6",
  font: { color: "#1E4325" },
  wrapText: true,
  verticalAlignment: "center",
  borders: { preset: "outside", style: "thin", color: "#A7C99C" },
};
instructionsSheet.getRange("A3:C3").format.rowHeight = 42;
instructionsSheet.getRange("A5:C5").values = [["Required column", "What to enter", "Example"]];
instructionsSheet.getRange("A5:C5").format = {
  fill: "#1D5A31",
  font: { bold: true, color: "#FFFFFF" },
  borders: { preset: "outside", style: "thin", color: "#6EA752" },
};
instructionsSheet.getRange("A6:C8").values = [
  ["Character Name", "Unique character name", "Luna"],
  ["Class", "Choose a job from the Members dropdown", "Priest"],
  ["Discord User ID (optional)", "Paste a Discord User ID as Text; never use a username", "Copy User ID as Text"],
];
instructionsSheet.getRange("A6:C8").format = { borders: { preset: "all", style: "thin", color: "#D9E7D8" } };
instructionsSheet.getRange("A10:B10").values = [["Ragnarok: The New World jobs", "Job tier"]];
instructionsSheet.getRange("A10:B10").format = {
  fill: "#1D5A31",
  font: { bold: true, color: "#FFFFFF" },
  borders: { preset: "outside", style: "thin", color: "#6EA752" },
};
instructionsSheet.getRange("A11:B24").values = [
  ["Swordsman", "Launch class"], ["Mage", "Launch class"], ["Archer", "Launch class"], ["Acolyte", "Launch class"],
  ["Thief", "Launch class"], ["Merchant", "Launch class"], ["Gunslinger", "Launch class"], ["Druid", "Launch class"],
  ["Knight", "Current advancement"], ["Wizard", "Current advancement"], ["Hunter", "Current advancement"], ["Priest", "Current advancement"],
  ["Assassin", "Current advancement"], ["Blacksmith", "Current advancement"],
];
instructionsSheet.getRange("A11:B24").format = { borders: { preset: "all", style: "thin", color: "#D9E7D8" } };
instructionsSheet.getRange("A:A").format.columnWidth = 30;
instructionsSheet.getRange("B:B").format.columnWidth = 42;
instructionsSheet.getRange("C:C").format.columnWidth = 28;

await fs.mkdir(outputDir, { recursive: true });
const preview = await workbook.render({ sheetName: "Members", autoCrop: "all", scale: 1.5, format: "png" });
await fs.writeFile(`${outputDir}members-preview.png`, new Uint8Array(await preview.arrayBuffer()));
const instructionsPreview = await workbook.render({ sheetName: "Instructions", autoCrop: "all", scale: 1.5, format: "png" });
await fs.writeFile(`${outputDir}instructions-preview.png`, new Uint8Array(await instructionsPreview.arrayBuffer()));
const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(`${outputDir}horizon-member-import-template.xlsx`);

const inspection = await workbook.inspect({ kind: "table", range: "Members!A1:C6", include: "values,formulas", tableMaxRows: 6, tableMaxCols: 3 });
console.log(inspection.ndjson);
