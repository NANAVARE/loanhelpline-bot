const express = require("express");
const axios = require("axios");
const { google } = require("googleapis");
const bodyParser = require("body-parser");
const cors = require("cors");
const app = express();

app.use(cors());
app.use(bodyParser.json());

const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const SHEET_ID = process.env.SHEET_ID;
const SHEET_NAME = process.env.SHEET_NAME;
const GOOGLE_CREDENTIALS_JSON = JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON);
const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
const vinayakNumber = "918329569608";

const sheetTabs = {
  "Home Loan": "Home Loan Offers",
  "Transfer Your Loan": "Transfer Loan Offers",
  "Personal Loan": "Personal Loan Offers",
  "Business Loan": "Business Loan Offers",
  "Mortgage Loan": "Mortgage Loan Offers",
  "Industrial Property Loan": "Industrial Loan Offers",
  "Commercial Property Loan": "Commercial Loan Offers",
};

// Google Sheets Auth
const SCOPES = ["https://www.googleapis.com/auth/spreadsheets"];
const auth = new google.auth.JWT(
  GOOGLE_CREDENTIALS_JSON.client_email,
  null,
  GOOGLE_CREDENTIALS_JSON.private_key,
  SCOPES
);
const sheets = google.sheets({ version: "v4", auth });

// ----------------------------------
// ✅ API: GET /api/loan-types
// ----------------------------------
app.get("/api/loan-types", (req, res) => {
  res.json(Object.keys(sheetTabs));
});

// ----------------------------------
// ✅ API: GET /api/banks?type=LoanType
// ----------------------------------
app.get("/api/banks", async (req, res) => {
  const type = req.query.type;
  const tab = sheetTabs[type];
  if (!tab) return res.status(400).json({ error: "Invalid loan type" });

  try {
    const result = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${tab}!A2:A`,
    });
    const banks = result.data.values?.map((row) => row[0]).filter(Boolean);
    res.json(banks || []);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch banks" });
  }
});

// ----------------------------------
// ✅ API: POST /api/send-offer
// ----------------------------------
app.post("/api/send-offer", async (req, res) => {
  const { phone, loanType, bankName } = req.body;
  const tab = sheetTabs[loanType];
  if (!tab) return res.status(400).json({ error: "Invalid loan type" });

  try {
    const result = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${tab}!A2:G`,
    });
    const rows = result.data.values;
    const row = rows.find((r) => r[0] === bankName);
    if (!row) return res.status(404).json({ error: "Bank not found" });

    await axios.post(
      `https://graph.facebook.com/v18.0/${phoneNumberId}/messages`,
      {
        messaging_product: "whatsapp",
        to: phone,
        type: "template",
        template: {
          name: "loan_offer_template_marathi",
          language: { code: "mr" },
          components: [
            {
              type: "body",
              parameters: row.map((text) => ({ type: "text", text: text || "-" })),
            },
          ],
        },
      },
      {
        headers: {
          Authorization: `Bearer ${WHATSAPP_TOKEN}`,
          "Content-Type": "application/json",
        },
      }
    );

    console.log("✅ Offer sent to", phone);
    res.json({ success: true });
  } catch (err) {
    console.error("❌ Broadcast error:", err.response?.data || err.message);
    res.status(500).json({ error: "Failed to send message" });
  }
});

// ----------------------------------
// ✅ API: POST /api/broadcast → used by App.jsx UI
// ----------------------------------
app.post("/api/broadcast", async (req, res) => {
  const { loanType, bankName, mobileNumbers } = req.body;
  if (!loanType || !bankName || !mobileNumbers || !Array.isArray(mobileNumbers)) {
    return res.status(400).json({ error: "Invalid input" });
  }

  const tab = sheetTabs[loanType];
  if (!tab) return res.status(400).json({ error: "Invalid loan type" });

  const result = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${tab}!A2:G`,
  });
  const rows = result.data.values;
  const row = rows.find((r) => r[0] === bankName);
  if (!row) return res.status(404).json({ error: "Bank not found" });

  let successCount = 0;

  for (const phone of mobileNumbers) {
    try {
      await axios.post(
        `https://graph.facebook.com/v18.0/${phoneNumberId}/messages`,
        {
          messaging_product: "whatsapp",
          to: phone,
          type: "template",
          template: {
            name: "loan_offer_template_marathi",
            language: { code: "mr" },
            components: [
              {
                type: "body",
                parameters: row.map((cell) => ({ type: "text", text: cell || "-" })),
              },
            ],
          },
        },
        {
          headers: {
            Authorization: `Bearer ${WHATSAPP_TOKEN}`,
            "Content-Type": "application/json",
          },
        }
      );
      successCount++;
    } catch (err) {
      console.error(`❌ Failed for ${phone}:`, err.response?.data || err.message);
    }
  }

  res.json({ message: `📤 ${successCount} ऑफर पाठवल्या गेल्या.` });
});

// ----------------------------------
// Start Server
// ----------------------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("✅ LoanHelpline Bot चालू आहे पोर्ट", PORT);
});
