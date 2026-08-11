import { google } from "googleapis";

// Appends one row per completed interview to a Google Sheet, so Henk has
// an always-up-to-date spreadsheet to skim without touching Supabase.
// Requires a Google Cloud service account with the Sheets API enabled,
// and that service account's email shared as an Editor on the target sheet.

const SHEET_TAB_NAME = "Sheet1";
const HEADER_ROW = [
  "Date",
  "Project",
  "Summary",
  "Key Insights",
  "Improvement Suggestions",
  "Sentiment",
  "Favorite Part",
  "Tricky Part",
  "Would Change",
  "Pride Level",
  "Would Build Again",
  "Would Build Again - Why",
  "Duration (sec)",
  "Conversation ID",
];

function getAuth() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error("Missing GOOGLE_SERVICE_ACCOUNT_JSON env var");

  const credentials = JSON.parse(raw);
  return new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
}

async function ensureHeaderRow(sheets, spreadsheetId) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${SHEET_TAB_NAME}!A1:N1`,
  });

  const hasHeader = res.data.values && res.data.values.length > 0;
  if (!hasHeader) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${SHEET_TAB_NAME}!A1`,
      valueInputOption: "RAW",
      requestBody: { values: [HEADER_ROW] },
    });
  }
}

export async function appendInterviewRow(interview) {
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;
  if (!spreadsheetId) throw new Error("Missing GOOGLE_SHEET_ID env var");

  const auth = getAuth();
  const sheets = google.sheets({ version: "v4", auth });

  await ensureHeaderRow(sheets, spreadsheetId);

  const row = [
    new Date().toISOString(),
    interview.project_name || "",
    interview.summary || "",
    interview.key_insights || "",
    interview.improvement_suggestions || "",
    interview.overall_sentiment || "",
    interview.favorite_part || "",
    interview.tricky_part || "",
    interview.what_youd_change || "",
    interview.pride_level || "",
    interview.would_build_again === true ? "Yes" : interview.would_build_again === false ? "No" : "",
    interview.would_build_again_reason || "",
    interview.duration_seconds ?? "",
    interview.conversation_id || "",
  ];

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${SHEET_TAB_NAME}!A1`,
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: [row] },
  });
}
