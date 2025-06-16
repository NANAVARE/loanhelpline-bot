const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(bodyParser.json());

// ⬇️ Config values from environment or hardcoded for test
const token = process.env.WHATSAPP_TOKEN || "YOUR_WHATSAPP_TOKEN";
const phoneNumberId = process.env.PHONE_NUMBER_ID || "YOUR_PHONE_NUMBER_ID";

// ⬇️ User conversation state tracking
const userState = {};

// ✅ Root route (optional)
app.get("/", (req, res) => {
  res.send("✅ Loan Helpline Bot is running.");
});

// ✅ WhatsApp Webhook Verification
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode && token === "loanhelpline_verify_token") {
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
    let reply = "";

    const isTrigger = ["hi", "hello", "loan", "i want to apply for a loan"].some(keyword =>
      msgBody.includes(keyword)
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
      reply = `✅ आपण निवडलं आहे: ${loanTypes[msgBody]}\n\n📝 Eligibility साठी माहिती पाठवा:\n- मासिक उत्पन्न (उदा: ₹30000)`;
      userState[from] = "ask_income";
    } else if (state === "ask_income" && msgBody.match(/₹?\d{4,}/)) {
      reply = `🌍 तुमचं शहर/गाव सांगा (उदा: Pune)`;
      userState[from] = "ask_city";
    } else if (state === "ask_city" && msgBody.length >= 3) {
      reply = `💰 तुम्हाला किती लोन हवा आहे? (उदा: ₹15 लाख)`;
      userState[from] = "ask_amount";
    } else if (state === "ask_amount" && msgBody.match(/₹?.+/)) {
      reply = `🎉 धन्यवाद! तुमचं लोन अर्ज आम्ही प्राप्त केलं आहे.\nआमचे प्रतिनिधी लवकरच संपर्क करतील.`;
      userState[from] = "done";
    } else {
      reply = `❗ कृपया 1 ते 5 पैकी एक क्रमांक टाका किंवा 'loan' लिहा`;
    }

    // ✅ WhatsApp reply via Cloud API
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

// ✅ Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
