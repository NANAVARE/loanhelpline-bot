// server.js (Updated with Broadcast Logic + Auto Offer to User)
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
const SHEET_ID = '1SASOVVvP4zVdqvaBUBjqkjeMcrmgU_dYmlfuWKvX2yU';
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;

// ============= Google Sheets Auth =============
const auth = new google.auth.GoogleAuth({
  credentials: require('./credentials.json'),
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});
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

// Auto Send Offers to WhatsApp User Based on Loan Type
app.post('/sendUserOffer', async (req, res) => {
  try {
    const { phone, loanType } = req.body;

    if (!phone || !loanType) return res.status(400).send("Missing data");

    const sheetName = getSheetNameFromLoanType(loanType);

    const resSheet = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${sheetName}!A2:F`,
    });

    const offers = resSheet.data.values;

    for (const offer of offers) {
      const [bank, rate, amount, tenure, topup, features] = offer;

      await axios.post(`https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/messages`, {
        messaging_product: "whatsapp",
        to: phone,
        type: "template",
        template: {
          name: "loan_offer_template_marathi",
          language: { code: "mr" },
          components: [{
            type: "body",
            parameters: [
              { type: "text", text: bank },
              { type: "text", text: rate },
              { type: "text", text: amount },
              { type: "text", text: tenure },
              { type: "text", text: topup },
              { type: "text", text: features }
            ]
          }]
        }
      }, {
        headers: {
          Authorization: `Bearer ${WHATSAPP_TOKEN}`,
          'Content-Type': 'application/json',
        }
      });

      console.log(`✅ Offer sent to ${phone} for ${bank}`);
    }

    res.send("Loan Offers sent to user");
  } catch (err) {
    console.error("❌ Error sending offers:", err.message);
    res.status(500).send("Failed to send offers");
  }
});

function getSheetNameFromLoanType(loanType) {
  const map = {
    "Home Loan": "Home Loan Offers",
    "Transfer Your Loan": "Transfer Loan Offers",
    "Personal Loan": "Personal Loan Offers",
    "Business Loan": "Business Loan Offers",
    "Mortgage Loan": "Mortgage Loan Offers",
    "Industrial Property Loan": "Industrial Loan Offers",
    "Commercial Property Loan": "Commercial Loan Offers",
  };
  return map[loanType.trim()] || "Home Loan Offers";
}

// ==============================================

app.listen(PORT, () => {
  console.log(`✅ LoanHelpline Bot चालू आहे पोर्ट ${PORT}`);
});
