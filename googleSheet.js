const { google } = require('googleapis');
const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON);


const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];
const auth = new google.auth.JWT(
  credentials.client_email,
  null,
  credentials.private_key.replace(/\\n/g, '\n'), // Fix multiline key
  SCOPES
);

const sheets = google.sheets({ version: 'v4', auth });

const SPREADSHEET_ID = process.env.GOOGLE_SHEET_ID;
const TAB_NAME = process.env.SHEET_TAB_NAME || 'Sheet1';

async function appendToSheet(from, msg_body) {
  try {
    const values = [[new Date().toLocaleString(), from, msg_body]];
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `${TAB_NAME}!A1`,
      valueInputOption: 'USER_ENTERED',
      resource: {
        values: values,
      },
    });
    console.log('✅ Google Sheet Updated');
  } catch (error) {
    console.error('❌ Error writing to Google Sheet:', error);
  }
}

module.exports = { appendToSheet };
