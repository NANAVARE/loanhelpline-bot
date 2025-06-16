const { google } = require('googleapis');
require('dotenv').config();

async function appendToSheet(user, message) {
    const auth = new google.auth.GoogleAuth({
        keyFile: 'credentials.json',
        scopes: ['https://www.googleapis.com/auth/spreadsheets']
    });

    const client = await auth.getClient();
    const sheets = google.sheets({ version: 'v4', auth: client });

    const response = await sheets.spreadsheets.values.append({
        spreadsheetId: process.env.SHEET_ID,
        range: `${process.env.SHEET_TAB_NAME}!A1`,
        valueInputOption: 'RAW',
        resource: { values: [[new Date().toISOString(), user, message]] }
    });

    console.log('Sheet updated:', response.status);
}

module.exports = { appendToSheet };