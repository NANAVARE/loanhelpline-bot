const express = require("express");
const axios = require("axios");
const bodyParser = require("body-parser");
const { google } = require("googleapis");
const app = express();
require("dotenv").config();

const PORT = process.env.PORT || 10000;

const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const GOOGLE_SHEET_ID = process.env.GOOGLE_SHEET_ID;
const SHEET_NAME = process.env.SHEET_NAME;
const OFFERS_TAB_NAME = process.env.OFFERS_TAB_NAME;

app.use(bodyParser.json());

// --------- Google Sheets Setup ----------
const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON),
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});

// ✅ Append Lead to Sheet
async function appendLeadToSheet(leadData) {
  const client = await auth.getClient();
  const sheets = google.sheets({ version: "v4", auth: client });

  await sheets.spreadsheets.values.append({
    spreadsheetId: GOOGLE_SHEET_ID,
    range: `${SHEET_NAME}!A1`,
    valueInputOption: "USER_ENTERED",
    resource: {
      values: [
        [
          leadData.name,
          leadData.phone,
          leadData.city,
          leadData.monthlyIncome,
          leadData.loanType,
          leadData.amount,
          new Date().toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" }),
          "New Lead",
        ],
      ],
    },
  });
}

// ✅ Get Loan Offer from Offer Sheet
async function getLoanOffer(loanType) {
  const client = await auth.getClient();
  const sheets = google.sheets({ version: "v4", auth: client });

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: GOOGLE_SHEET_ID,
    range: `${OFFERS_TAB_NAME}`,
  });

  const rows = response.data.values;
  const headers = rows[0];
  const typeIndex = headers.indexOf("Loan Type");

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if ((row[typeIndex] || "").toLowerCase() === loanType.toLowerCase()) {
      return {
        bank_name: row[headers.indexOf("Bank Name")],
        interest_rate: row[headers.indexOf("Interest Rate")],
        topup_status: row[headers.indexOf("Top-up")],
        process_speed: row[headers.indexOf("Process")],
      };
    }
  }

  return null;
}

// ✅ Send Loan Offer Template
async function sendLoanOffer(leadData) {
  const offer = await getLoanOffer(leadData.loanType);
  if (!offer) return;

  try {
    await axios.post(
      `https://graph.facebook.com/v18.0/${phoneNumberId}/messages`,
      {
        messaging_product: "whatsapp",
        to: leadData.phone,
        type: "template",
        template: {
          name: "loan_offer_v2",
          language: { code: "mr" },
          components: [
            {
              type: "body",
              parameters: [
                { type: "text", text: leadData.loanType },
                { type: "text", text: offer.bank_name },
                { type: "text", text: offer.interest_rate },
                { type: "text", text: offer.topup_status },
                { type: "text", text: offer.process_speed },
              ],
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
    console.log("📨 Loan offer पाठवली:", leadData.phone);
  } catch (error) {
    console.error("❌ sendLoanOffer error:", error.response?.data || error.message);
  }
}

// ✅ Webhook Verify
app.get("/webhook", (req, res) => {
  const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode && token === VERIFY_TOKEN) {
    console.log("✅ Webhook verified");
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

const sessions = {};

// ✅ Main Webhook
app.post("/webhook", async (req, res) => {
  try {
    const body = req.body;
    const msg =
      body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0] || null;
    if (!msg) return res.sendStatus(200);

    const from = msg.from;
    const text = msg.text?.body?.trim();
    const name =
      body.entry[0].changes[0].value.contacts?.[0]?.profile?.name || "Loanhelpline";

    if (!sessions[from]) {
      sessions[from] = { step: 0, name, phone: from };
    }

    const session = sessions[from];

    if (/^[1-7]$/.test(text)) {
      const loanTypes = [
        "Home Loan",
        "Personal Loan",
        "Transfer Your Loan",
        "Business Loan",
        "Mortgage Loan",
        "Industrial Property Loan",
        "Commercial Property Loan",
      ];
      session.loanType = loanTypes[parseInt(text) - 1];
      session.step = 1;
      await sendMessage(from, `✅ आपण निवडलं आहे: 🔁 ${session.loanType}\n📝 Eligibility साठी माहिती पाठवा:\n- मासिक उत्पन्न (उदा: ₹30000)`);
    } else if (session.step === 1) {
      session.monthlyIncome = text;
      session.step = 2;
      await sendMessage(from, `🌍 तुमचं शहर/गाव सांगा (उदा: Pune)`);
    } else if (session.step === 2) {
      session.city = text;
      session.step = 3;
      await sendMessage(from, `💰 तुम्हाला किती लोन हवा आहे? (उदा: ₹15 लाख)`);
    } else if (session.step === 3) {
      session.amount = text;
      session.step = 4;

      await sendMessage("918329569608", `🔔 नवीन लीड:\n\n🙍‍♂️ नाव: ${session.name}\n📞 मोबाईल: ${session.phone}\n🏦 ${session.loanType}\n💰 ${session.monthlyIncome}\n🌍 ${session.city}\n₹ ${session.amount}`);
      console.log("📨 Vinayak ला लीड नोटिफिकेशन पाठवले.");

      await appendLeadToSheet(session);
      await sendLoanOffer(session);

      await sendMessage(from, `🎉 धन्यवाद! तुमचं लोन अर्ज आम्ही प्राप्त केलं आहे.\nआमचे प्रतिनिधी लवकरच संपर्क करतील.`);
      delete sessions[from];
      console.log("🧹 Session Deleted:", from);
    } else {
      await sendMessage(from, `1️⃣ Home Loan\n2️⃣ Personal Loan\n3️⃣ Transfer Your Loan\n4️⃣ Business Loan\n5️⃣ Mortgage Loan\n6️⃣ Industrial Property Loan\n7️⃣ Commercial Property Loan\n\nकृपया फक्त क्रमांक टाका. (उदा: 1)`);
    }

    res.sendStatus(200);
  } catch (err) {
    console.error("❌ Webhook error:", err);
    res.sendStatus(500);
  }
});

// ✅ Send WhatsApp Message
async function sendMessage(to, message) {
  try {
    await axios.post(
      `https://graph.facebook.com/v18.0/${phoneNumberId}/messages`,
      {
        messaging_product: "whatsapp",
        to,
        text: { body: message },
      },
      {
        headers: {
          Authorization: `Bearer ${WHATSAPP_TOKEN}`,
          "Content-Type": "application/json",
        },
      }
    );
    console.log("📤 Reply sent to", to + ":", message.split("\n")[0]);
  } catch (err) {
    console.error("❌ sendMessage error:", err.response?.data || err.message);
  }
}

app.listen(PORT, () => {
  console.log(`✅ LoanHelpline Bot चालू आहे पोर्ट ${PORT}`);
});
