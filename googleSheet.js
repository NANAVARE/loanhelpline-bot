const { google } = require('googleapis');
const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON);

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];
const auth = new google.auth.JWT(
  credentials.client_email,
  null,
  credentials.private_key.replace(/\\n/g, '\n'),
  SCOPES
);

const sheets = google.sheets({ version: 'v4', auth });

const SPREADSHEET_ID = process.env.GOOGLE_SHEET_ID;
const TAB_NAME = process.env.SHEET_TAB_NAME || 'Sheet1';

/**
 * युजरने पहिला मेसेज पाठवताच इन्स्टंट नंबर आणि नाव सेव्ह करणे (Pending Status सह)
 */
async function createPendingLead(phone, name = 'Unknown') {
  try {
    const timestamp = new Date().toLocaleString();
    // कॉलम्स क्रमानुसार: Timestamp(A), Name(B), Phone(C), City(D), Income(E), Loan Type(F), Loan Amount(G), Status(H), Source(I)
    const values = [[timestamp, name, phone, '', '', '', '', 'Pending', 'WhatsApp Bot']];
    
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `${TAB_NAME}!A1`,
      valueInputOption: 'USER_ENTERED',
      resource: { values },
    });
    console.log('✅ Pending Lead Created in Google Sheet');
  } catch (error) {
    console.error('❌ Error creating pending lead:', error);
  }
}

/**
 * जुनी पद्धत: सर्व डेटा एकदाच शेवटी सेव्ह करण्यासाठी
 */
async function appendToSheet(from, msg_body) {
  try {
    const values = [[new Date().toLocaleString(), '', from, '', '', '', '', 'New Lead', 'WhatsApp Bot']];
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `${TAB_NAME}!A1`,
      valueInputOption: 'USER_ENTERED',
      resource: { values },
    });
    console.log('✅ Google Sheet Updated');
  } catch (error) {
    console.error('❌ Error writing to Google Sheet:', error);
  }
}

module.exports = { createPendingLead, appendToSheet };
