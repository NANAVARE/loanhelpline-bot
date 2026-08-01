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

/**
 * गुगल शीटमध्ये अचूक क्रमाने डेटा सेव्ह करणे:
 * Column A: Timestamp
 * Column B: Name (युजरचे नाव)
 * Column C: Phone (मोबाईल नंबर)
 * Column D to G: City, Income, Loan Type, Loan Amount (मोकळे सोडलेले)
 * Column H: Status ('New Lead')
 * Column I: Source ('WhatsApp Bot')
 */
async function appendToSheet(name, phone, msg_body) {
  try {
    const values = [[
      new Date().toLocaleString(), 
      name, 
      phone, 
      '', // City
      '', // Income
      '', // Loan Type
      '', // Loan Amount
      'New Lead', 
      'WhatsApp Bot'
    ]];

    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `${TAB_NAME}!A1`,
      valueInputOption: 'USER_ENTERED',
      resource: {
        values: values,
      },
    });
    console.log('✅ Google Sheet Updated Correctly');
  } catch (error) {
    console.error('❌ Error writing to Google Sheet:', error);
  }
}

module.exports = { appendToSheet };
