// server.js (Updated with env-based Google Auth)
const express = require('express');
const axios = require('axios');
const { google } = require('googleapis');
const bodyParser = require('body-parser');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 10000;

app.use(cors());
app.use(bodyParser.json());

// =================== CONFIG ===================
const SHEET_ID = process.env.GOOGLE_SHEET_ID;
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;

// ============= Google Sheets Auth =============
const auth = new google.auth.JWT(
  process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
  null,
  process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
  ['https://www.googleapis.com/auth/spreadsheets']
);
const sheets = google.sheets({ version: 'v4', auth });

// ================= ROUTES =====================

app.get('/', (req, res) => {
  res.send('✅ LoanHelpline Bot is Live');
});

// Broadcast Offer to Recipients based on Loan Type + Bank
app.post('/broadcast', async (req, res) => {
  const { loanType, bankName, recipients } = req.body;

  try {
    const resSheet = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${loanType}!A2:F`,
    });

    const rows = resSheet.data.values;
    const offer = rows.find((row) => row[0].toLowerCase() === bankName.toLowerCase());

    if (!offer) return res.status(404).send('Offer not found');

    const [bank, rate, fee, topup, validTill, notes] = offer;

    for (const phone of recipients) {
      await axios.post(`https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/messages`, {
        messaging_product: "whatsapp",
        to: phone,
        type: "template",
        template: {
          name: "loan_offer_template_marathi",
          language: { code: "mr" },
          components: [
            {
              type: "body",
              parameters: [
                { type: "text", text: bank },
                { type: "text", text: rate },
                { type: "text", text: fee },
                { type: "text", text: topup },
                { type: "text", text: validTill },
                { type: "text", text: notes },
              ],
            },
          ],
        },
      }, {
        headers: {
          Authorization: `Bearer ${WHATSAPP_TOKEN}`,
          'Content-Type': 'application/json',
        },
      });
    }

    res.send('Broadcast completed successfully');
  } catch (err) {
    console.error('❌ Broadcast error:', err.message);
    res.status(500).send('Internal Server Error');
  }
});

// ==============================================

app.listen(PORT, () => {
  console.log(`✅ LoanHelpline Bot चालू आहे पोर्ट ${PORT}`);
});
