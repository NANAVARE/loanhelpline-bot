// manual-offer.js
const { google } = require('googleapis');
const axios = require('axios');
require('dotenv').config();

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];
const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON),
  scopes: SCOPES,
});

const SHEET_ID = process.env.SHEET_ID;
const WHATSAPP_API_URL = `https://graph.facebook.com/v18.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;

const sendWhatsAppMessage = async (phone, message) => {
  try {
    await axios.post(
      WHATSAPP_API_URL,
      {
        messaging_product: 'whatsapp',
        to: phone,
        text: { body: message },
      },
      {
        headers: {
          Authorization: `Bearer ${WHATSAPP_TOKEN}`,
          'Content-Type': 'application/json',
        },
      }
    );
    console.log(`✅ Offer sent to ${phone}`);
  } catch (err) {
    console.error(`❌ Failed to send offer to ${phone}:`, err.response?.data || err.message);
  }
};

const run = async () => {
  const client = await auth.getClient();
  const sheets = google.sheets({ version: 'v4', auth: client });

  const range = 'Sheet1!A2:H';
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range,
  });

  const rows = response.data.values || [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const status = row[7];
    if (status !== 'Send Offer') continue;

    const [timestamp, name, phone, city, income, loanType, amount] = row;

    const message = `👋 नमस्कार ${name}!\n\nआपल्या ${loanType} साठी ऑफर उपलब्ध आहे:\n\n🏦 बँक: Axis Bank\n💰 रक्कम: ${amount}\n📉 व्याजदर: 10.5%\n📅 वैधता: 31-Jul-2025\n\nLoanHelpline टीमशी संपर्कासाठी आम्हाला reply करा.`;

    await sendWhatsAppMessage(phone, message);

    // Update Status to "Offer Sent"
    const updateRange = `H${i + 2}`;
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `Sheet1!${updateRange}`,
      valueInputOption: 'RAW',
      requestBody: {
        values: [['Offer Sent']],
      },
    });
  }
};

run();
