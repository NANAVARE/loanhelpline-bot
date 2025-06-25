const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");
const { google } = require("googleapis");
require("dotenv").config();

const app = express();
app.use(bodyParser.json());

const PORT = process.env.PORT || 10000;
const sessions = {};

const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON),
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});

async function appendLeadToSheet(lead) {
  const sheets = google.sheets({ version: "v4", auth });
  const values = [[
    lead.name,
    lead.phone,
    lead.city,
    lead.income,
    lead.loanType,
    lead.amount,
    new Date().toLocaleDateString("en-GB"),
    "New Lead"
  ]];
  await sheets.spreadsheets.values.append({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    range: `${process.env.SHEET_NAME}!A1`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values },
  });
}

async function getLoanOffer(loanType) {
  const sheets = google.sheets({ version: "v4", auth });
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    range: `${process.env.OFFERS_TAB_NAME}!A2:E`,
  });

  const rows = res.data.values;
  if (!rows) return null;
  const match = rows.find((row) => row[0].toLowerCase().includes(loanType.toLowerCase()));
  if (!match) return null;
  return {
    bankName: match[1],
    interestRate: match[2],
    topUp: match[3],
    process: match[4],
  };
}

async function sendLoanOffer(lead) {
  const offer = await getLoanOffer(lead.loanType);
  if (!offer) return console.error("❌ Loan offer not found");

  try {
    await axios.post(
      `https://graph.facebook.com/v19.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: "whatsapp",
        to: lead.phone,
        type: "template",
        template: {
          name: "loan_offer_v2",
          language: { code: "mr" },
          components: [
            {
              type: "body",
              parameters: [
                { type: "text", text: lead.loanType || "Loan" },
                { type: "text", text: offer.bankName || "-" },
                { type: "text", text: offer.interestRate || "-" },
                { type: "text", text: offer.topUp || "-" },
                { type: "text", text: offer.process || "-" },
              ],
            },
          ],
        },
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
        },
      }
    );
  } catch (error) {
    console.error("❌ sendLoanOffer error:", error.response?.data || error.message);
  }
}

app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode && token === process.env.VERIFY_TOKEN) {
    console.log("✅ Webhook verified");
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

app.post("/webhook", async (req, res) => {
  const entry = req.body.entry?.[0];
  const changes = entry?.changes?.[0]?.value?.messages?.[0];
  if (!changes) return res.sendStatus(200);

  const from = changes.from;
  const msg = changes.text?.body;
  if (!sessions[from]) sessions[from] = { step: 0 };
  const session = sessions[from];

  let reply;
  if (msg === "1") {
    session.loanType = "Home Loan";
    reply = "✅ आपण निवडलं आहे: 🔁 Home Loan\n🌍 तुमचं शहर/गाव सांगा (उदा: Pune)";
    session.step = 1;
  } else if (session.step === 1) {
    session.city = msg;
    reply = "💰 तुम्हाला किती लोन हवा आहे? (उदा: ₹15 लाख)";
    session.step = 2;
  } else if (session.step === 2) {
    session.amount = msg;
    const lead = {
      name: "LoanHelpline",
      phone: from,
      city: session.city,
      income: "-",
      loanType: session.loanType,
      amount: session.amount,
    };
    await appendLeadToSheet(lead);

    // Notify admin
    await axios.post(
      `https://graph.facebook.com/v19.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: "whatsapp",
        to: "918329569608",
        type: "text",
        text: { body: `🔔 नवीन लीड:\n${lead.name} (${lead.phone})` },
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
        },
      }
    );

    await sendLoanOffer(lead);
    reply = "🎉 धन्यवाद! तुमचं लोन अर्ज आम्ही प्राप्त केलं आहे.";
    delete sessions[from];
  } else {
    reply = "1️⃣ Home Loan\nकृपया पर्याय निवडा.";
  }

  await axios.post(
    `https://graph.facebook.com/v19.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
    {
      messaging_product: "whatsapp",
      to: from,
      text: { body: reply },
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
      },
    }
  );

  res.sendStatus(200);
});

app.listen(PORT, () => {
  console.log(`✅ LoanHelpline Bot चालू आहे पोर्ट ${PORT}`);
});
