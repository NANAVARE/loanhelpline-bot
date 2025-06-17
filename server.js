const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");
require("dotenv").config();
const { google } = require("googleapis");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(bodyParser.json());

const token = process.env.WHATSAPP_TOKEN;
const phoneNumberId = process.env.PHONE_NUMBER_ID;

// User conversation state
const userState = {};
const conversation = {};

// ✅ Root route
app.get("/", (req, res) => {
  res.send("✅ Loan Helpline Bot is running.");
});

// ✅ WhatsApp webhook verification
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode && token === process.env.VERIFY_TOKEN) {
    console.log("✅ Webhook verified!");
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// ✅ WhatsApp Message Handler
app.post("/webhook", async (req, res) => {
  const entry = req.body.entry?.[0];
  const changes = entry?.changes?.[0];
  const message = changes?.value?.messages?.[0];

  if (message && message.from) {
    const from = message.from;
    const msgBody = message.text?.body?.trim().toLowerCase();

    const state = userState[from] || "initial";
    conversation[from] = conversation[from] || {};

    let reply = "";

    const isTrigger = ["hi", "hello", "loan", "i want to apply for a loan"].some(k =>
      msgBody.includes(k)
    );

    if (isTrigger) {
      reply = `🙏 Loan Helpline वर आपले स्वागत आहे!\nकृपया खालीलपैकी एक पर्याय निवडा:\n1️⃣ Home Loan\n2️⃣ Personal Loan\n3️⃣ Balance Transfer\n4️⃣ Business Loan\n5️⃣ Mortgage Loan\n\nकृपया फक्त क्रमांक टाका. (उदा: 1)`;
      userState[from] = "ask_loan_type";
    } else if (state === "ask_loan_type" && ["1", "2", "3", "4", "5"].includes(msgBody)) {
      const loanTypes = {
        "1": "🏠 Home Loan",
        "2": "💼 Personal Loan",
        "3": "🔁 Balance Transfer",
        "4": "🏢 Business Loan",
        "5": "🏡 Mortgage Loan"
      };
      conversation[from].loanType = loanTypes[msgBody];
      reply = `✅ आपण निवडलं आहे: ${loanTypes[msgBody]}\n\n📝 Eligibility साठी माहिती पाठवा:\n- मासिक उत्पन्न (उदा: ₹30000)`;
      userState[from] = "ask_income";
    } else if (state === "ask_income" && msgBody.match(/₹?\d{4,}/)) {
      conversation[from].income = msgBody;
      reply = `🌍 तुमचं शहर/गाव सांगा (उदा: Pune)`;
      userState[from] = "ask_city";
    } else if (state === "ask_city" && msgBody.length >= 3) {
      conversation[from].city = msgBody;
      reply = `💰 तुम्हाला किती लोन हवा आहे? (उदा: ₹15 लाख)`;
      userState[from] = "ask_amount";
    } else if (state === "ask_amount" && msgBody.match(/₹?.+/)) {
      conversation[from].amount = msgBody;
      reply = `🎉 धन्यवाद! तुमचं लोन अर्ज आम्ही प्राप्त केलं आहे.\nआमचे प्रतिनिधी लवकरच संपर्क करतील.`;
      userState[from] = "done";

      // ✅ Sheet sync
      const leadData = {
        name: "NA",
        phone: from,
        city: conversation[from].city,
        income: conversation[from].income,
        loan_type: conversation[from].loanType,
        amount: conversation[from].amount,
      };

      try {
        await axios.post("https://loanhelpline-bot.onrender.com/lead", leadData);
        console.log("✅ Lead pushed to Google Sheet");
      } catch (err) {
        console.error("❌ Sheet push error:", err.message);
      }
    } else {
      reply = `❗ कृपया 1 ते 5 पैकी एक क्रमांक टाका किंवा 'loan' लिहा`;
    }

    try {
      await axios.post(
        `https://graph.facebook.com/v19.0/${phoneNumberId}/messages`,
        {
          messaging_product: "whatsapp",
          to: from,
          text: { body: reply }
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json"
          }
        }
      );
      console.log(`📤 Reply sent to ${from}: ${reply}`);
    } catch (err) {
      console.error("❌ Error sending message:", err.response?.data || err.message);
    }
  }

  res.sendStatus(200);
});

// ✅ Google Sheet sync
async function appendToSheet(data) {
  const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON);
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  const sheets = google.sheets({ version: "v4", auth: await auth.getClient() });
  const spreadsheetId = process.env.SHEET_ID;
  const range = `${process.env.SHEET_TAB_NAME}!A1`;

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range,
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [[data.name, data.phone, data.city, data.income, data.loan_type, data.amount]],
    },
  });
}

// ✅ /lead route for Google Sheet
app.post("/lead", async (req, res) => {
  const data = req.body;
  try {
    await appendToSheet(data);
    console.log("✅ Google Sheet मध्ये डेटा टाकला:", data);
    res.status(200).send("Lead saved");
  } catch (err) {
    console.error("❌ Sheet update error:", err.message);
    res.status(500).send("Error saving lead");
  }
});

// ✅ Start Server
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
