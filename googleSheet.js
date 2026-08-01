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

async function appendToSheet(name, phone, msg_body) {
  try {
    // Column A: Timestamp
    // Column B: Name (नाव)
    // Column C: Phone (मोबाईल नंबर)
    // Column D: Message (मेसेज)
    const values = [[
      new Date().toLocaleString(), // Column A
      name,                        // Column B
      phone,                       // Column C
      msg_body,                    // Column D
      '',                          // Column E (Income)
      '',                          // Column F (Loan Type)
      '',                          // Column G (Loan Amount)
      'New Lead',                  // Column H
      'WhatsApp Bot'               // Column I
    ]];

    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `${TAB_NAME}!A1`,
      valueInputOption: 'USER_ENTERED',
      resource: {
        values: values,
      },
    });
    console.log('✅ Google Sheet Updated with correct columns');
  } catch (error) {
    console.error('❌ Error writing to Google Sheet:', error);
  }
}

module.exports = { appendToSheet };
