const { google } = require('googleapis');
const credentials = require('./credentials.json');

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];
const auth = new google.auth.JWT(
  credentials.client_email,
  null,
  credentials.private_key,
  SCOPES
);

const sheets = google.sheets({ version: 'v4', auth });

const SPREADSHEET_ID = process.env.GOOGLE_SHEET_ID;

async function appendToSheet(from, msg_body) {
  try {
    const values = [[new Date().toLocaleString(), from, msg_body]];
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Sheet1!A1',
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
