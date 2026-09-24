import "server-only";
import { JWT } from "google-auth-library";
import { getDb } from "./db";
import { throwDbError } from "./http";
import {
  buildAttendanceMatrix, ledgerHeader, ledgerValues, parseLedgerValues, visibleHeader,
  type AttendanceLedgerRecord,
} from "./sheet-layout";

type AttendanceRow = {
  lesson_id: string; student_id: string; change_version: number; lease_token: string;
  class_id: string; class_name: string; lesson_at: string; student_name: string;
  status: "var" | "yok"; updated_at: string;
};
const ledgerTab = "_Sistem";
type SheetProperties = { sheetId: number; title: string; gridProperties: { rowCount: number; columnCount: number } };

function sheetConfig() {
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;
  const encodedCredentials = process.env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64;
  if (!spreadsheetId || !encodedCredentials) return null;
  if (!/^[a-zA-Z0-9_-]{20,200}$/.test(spreadsheetId)) throw new Error("GOOGLE_SHEET_ID is invalid");
  const tab = process.env.GOOGLE_SHEET_TAB || "Yoklama";
  if (!tab || tab.length > 100 || /[\x00-\x1f\[\]*?/\\]/.test(tab)) throw new Error("GOOGLE_SHEET_TAB is invalid");
  const credentials = JSON.parse(Buffer.from(encodedCredentials, "base64").toString("utf8")) as {
    type?: string; client_email?: string; private_key?: string;
  };
  if (credentials.type !== "service_account" || !credentials.client_email || !credentials.private_key) {
    throw new Error("Google service account credentials are invalid");
  }
  return { spreadsheetId, tab, credentials };
}

export function sheetsConfigured() {
  try { return Boolean(sheetConfig()); } catch { return false; }
}

async function sheetsRequest<T>(token: string, spreadsheetId: string, path: string, method = "GET", body?: unknown): Promise<T> {
  const separator = path.startsWith(":") || path.startsWith("?") ? "" : "/";
  const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}${separator}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Google Sheets API returned ${response.status}`);
  return response.json() as Promise<T>;
}

function sheetRange(tab: string, range: string) {
  return `'${tab.replaceAll("'", "''")}'!${range}`;
}

function valuesPath(range: string) {
  return `values/${encodeURIComponent(range)}`;
}

function columnLabel(index: number) {
  let label = "";
  for (let value = index; value > 0; value = Math.floor((value - 1) / 26)) {
    label = String.fromCharCode(65 + ((value - 1) % 26)) + label;
  }
  return label;
}

function recordFromQueue(row: AttendanceRow): AttendanceLedgerRecord {
  return {
    key: `${row.lesson_id}:${row.student_id}`, classId: row.class_id,
    studentId: row.student_id, studentName: row.student_name,
    className: row.class_name, lessonAt: row.lesson_at,
    status: row.status, updatedAt: row.updated_at,
  };
}

async function ensureCapacity(token: string, spreadsheetId: string, sheet: SheetProperties,
  requiredRows: number, requiredColumns: number, visible: boolean) {
  const rows = Math.max(sheet.gridProperties.rowCount, requiredRows);
  const columns = Math.max(sheet.gridProperties.columnCount, requiredColumns);
  if (rows === sheet.gridProperties.rowCount && columns === sheet.gridProperties.columnCount && !visible) return;
  const requests: Record<string, unknown>[] = [];
  if (rows !== sheet.gridProperties.rowCount || columns !== sheet.gridProperties.columnCount) {
    requests.push({ updateSheetProperties: {
      properties: { sheetId: sheet.sheetId, gridProperties: { rowCount: rows, columnCount: columns } },
      fields: "gridProperties.rowCount,gridProperties.columnCount",
    } });
  }
  if (visible) {
    if (columns > sheet.gridProperties.columnCount) {
      requests.push({ repeatCell: {
        range: { sheetId: sheet.sheetId, startRowIndex: 0, endRowIndex: 1,
          startColumnIndex: sheet.gridProperties.columnCount, endColumnIndex: columns },
        cell: { userEnteredFormat: { backgroundColorStyle: { rgbColor: {
          red: 0.94509804, green: 0.9529412, blue: 0.9607843,
        } }, textFormat: { bold: true } } },
        fields: "userEnteredFormat(backgroundColorStyle,textFormat.bold)",
      } });
      requests.push({ updateDimensionProperties: {
        range: { sheetId: sheet.sheetId, dimension: "COLUMNS",
          startIndex: sheet.gridProperties.columnCount, endIndex: columns },
        properties: { pixelSize: 110 }, fields: "pixelSize",
      } });
    }
    requests.push({ setBasicFilter: { filter: { range: {
      sheetId: sheet.sheetId, startRowIndex: 0, endRowIndex: rows,
      startColumnIndex: 0, endColumnIndex: requiredColumns,
    } } } });
  }
  await sheetsRequest(token, spreadsheetId, ":batchUpdate", "POST", { requests });
}

async function writeRows(rows: AttendanceRow[]) {
  const config = sheetConfig();
  if (!config) throw new Error("Google Sheets is not configured");
  const auth = new JWT({
    email: config.credentials.client_email,
    key: config.credentials.private_key,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  const token = (await auth.getAccessToken()).token;
  if (!token) throw new Error("Google service account did not return an access token");
  const metadata = await sheetsRequest<{ sheets: { properties: SheetProperties }[] }>(
    token, config.spreadsheetId, "?fields=sheets(properties(sheetId,title,gridProperties))");
  const visibleSheet = metadata.sheets.find((sheet) => sheet.properties.title === config.tab)?.properties;
  const systemSheet = metadata.sheets.find((sheet) => sheet.properties.title === ledgerTab)?.properties;
  if (!visibleSheet || !systemSheet) throw new Error("Yoklama veya gizli sistem sekmesi bulunamadı");
  const existing = await sheetsRequest<{ values?: string[][] }>(token, config.spreadsheetId,
    valuesPath(sheetRange(ledgerTab, `A1:H${systemSheet.gridProperties.rowCount}`)));
  const sheetRows = existing.values ?? [];
  if (JSON.stringify(sheetRows[0]) !== JSON.stringify(ledgerHeader)) {
    throw new Error("Yoklama sistem sekmesinin başlıkları değişmiş");
  }
  const updatedRows = sheetRows.slice(1).map((row) => [...row]);
  const indexes = new Map<string, number>();
  updatedRows.forEach((row, index) => {
    if (row.length === 0) return;
    const record = parseLedgerValues(row);
    if (indexes.has(record.key)) throw new Error("Yoklama sistem sekmesinde yinelenen kayıt var");
    indexes.set(record.key, index + 2);
  });
  const updates: { range: string; values: string[][] }[] = [];
  const appends: string[][] = [];
  for (const row of rows) {
    const values = ledgerValues(recordFromQueue(row));
    const index = indexes.get(values[0]);
    if (index) {
      updates.push({ range: sheetRange(ledgerTab, `A${index}:H${index}`), values: [values] });
      updatedRows[index - 2] = values;
    } else {
      appends.push(values);
      updatedRows.push(values);
    }
  }
  const matrix = buildAttendanceMatrix(updatedRows.filter((row) => row.length > 0).map(parseLedgerValues));
  await ensureCapacity(token, config.spreadsheetId, systemSheet, sheetRows.length + appends.length, 8, false);
  if (updates.length) await sheetsRequest(token, config.spreadsheetId, "values:batchUpdate", "POST", {
    valueInputOption: "RAW", data: updates,
  });
  if (appends.length) await sheetsRequest(token, config.spreadsheetId,
    `${valuesPath(sheetRange(ledgerTab, "A:H"))}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
    "POST", { values: appends });
  const visible = await sheetsRequest<{ values?: string[][] }>(token, config.spreadsheetId,
    valuesPath(sheetRange(config.tab,
      `A1:${columnLabel(visibleSheet.gridProperties.columnCount)}${visibleSheet.gridProperties.rowCount}`)));
  const oldRows = visible.values ?? [];
  if (oldRows.length && JSON.stringify(oldRows[0].slice(0, 2)) !== JSON.stringify(visibleHeader)) {
    throw new Error("Yoklama görünümünün ilk iki başlığı değişmiş");
  }
  const targetRows = Math.max(matrix.length, oldRows.length);
  const targetColumns = Math.max(matrix[0].length, ...oldRows.map((row) => row.length));
  await ensureCapacity(token, config.spreadsheetId, visibleSheet, targetRows, targetColumns, true);
  const padded = Array.from({ length: targetRows }, (_, row) =>
    Array.from({ length: targetColumns }, (_, column) => matrix[row]?.[column] ?? ""));
  await sheetsRequest(token, config.spreadsheetId,
    `${valuesPath(sheetRange(config.tab, `A1:${columnLabel(targetColumns)}${targetRows}`))}?valueInputOption=RAW`,
    "PUT", { values: padded });
}

export async function processAttendanceOutbox() {
  if (!sheetsConfigured()) return { configured: false, processed: 0, failed: 0, busy: false };
  const db = getDb();
  const { data: token, error: lockError } = await db.rpc("acquire_delivery_lock", { p_name: "attendance", p_seconds: 300 });
  throwDbError(lockError);
  if (!token) return { configured: true, processed: 0, failed: 0, busy: true };
  let processed = 0;
  let failed = 0;
  try {
    for (let batch = 0; batch < 5; batch++) {
      const { data, error } = await db.rpc("claim_attendance_sync", { p_limit: 100 });
      throwDbError(error);
      const rows = (data ?? []) as AttendanceRow[];
      if (rows.length === 0) break;
      let deliveryError: string | null = null;
      try { await writeRows(rows); }
      catch (cause) { deliveryError = cause instanceof Error ? cause.message : "Google Sheets delivery failed"; }
      for (const row of rows) {
        const { data: acknowledged, error: finishError } = await db.rpc("finish_attendance_sync", {
          p_lesson_id: row.lesson_id, p_student_id: row.student_id,
          p_change_version: row.change_version, p_lease_token: row.lease_token,
          p_success: deliveryError === null, p_error: deliveryError,
        });
        throwDbError(finishError);
        if (acknowledged) { if (deliveryError) failed++; else processed++; }
      }
      if (deliveryError) break;
    }
  } finally {
    const { error } = await db.rpc("release_delivery_lock", { p_name: "attendance", p_token: token });
    if (error) console.error("Attendance delivery lock release failed", error.message);
  }
  return { configured: true, processed, failed, busy: false };
}
