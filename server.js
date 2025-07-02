const express = require("express");
const axios = require("axios");
const { google } = require("googleapis");
const bodyParser = require("body-parser");
const cors = require("cors");
const app = express();

app.use(bodyParser.json());
app.use(cors());

const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const SHEET_ID = process.env.SHEET_ID;
const SHEET_NAME = process.env.SHEET_NAME;
const GOOGLE_CREDENTIALS_JSON = JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON);

const SCOPES = ["https://www.googleapis.com/auth/spreadsheets"];
const auth = new google.auth.JWT(
  GOOGLE_CREDENTIALS_JSON.client_email,
  null,
  GOOGLE_CREDENTIALS_JSON.private_key,
  SCOPES
);
const sheets = google.sheets({ version: "v4", auth });

const userState = {};
const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
const vinayakNumber = "918329569608";

// 🧠 Bank Sheet Mapping
const sheetTabs = {
  "Home Loan": "Home Loan Offers",
  "Transfer Your Loan": "Transfer Loan Offers",
  "Personal Loan": "Personal Loan Offers",
  "Business Loan": "Business Loan Offers",
  "Mortgage Loan": "Mortgage Loan Offers",
  "Industrial Property Loan": "Industrial Loan Offers",
  "Commercial Property Loan": "Commercial Loan Offers",
};

// ✅ Webhook verification
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("WEBHOOK_VERIFIED");
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// 📩 WhatsApp Message Handler
app.post("/webhook", async (req, res) => {
  const body = req.body;
  if (body.object) {
    const entry = body.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;
    const message = value?.messages?.[0];

    if (message && message.type === "text") {
      const from = message.from;
      const msgBody = message.text.body.trim();
      const name = value?.contacts?.[0]?.profile?.name || "NA";

      if (!userState[from]) userState[from] = {};
      if (!userState[from + "_name"]) userState[from + "_name"] = name;

      const state = userState[from];
      let reply = "";

      if (["hi", "hello", "loan"].includes(msgBody.toLowerCase())) {
        reply = `1️⃣ Home Loan\n2️⃣ Personal Loan\n3️⃣ Transfer Your Loan\n4️⃣ Business Loan\n5️⃣ Mortgage Loan\n6️⃣ Industrial Property Loan\n7️⃣ Commercial Property Loan\n\nकृपया फक्त क्रमांक टाका. (उदा: 1)`;
        state.step = "loanType";
      } else if (state.step === "loanType") {
        const loanTypes = {
          "1": "Home Loan",
          "2": "Personal Loan",
          "3": "Transfer Your Loan",
          "4": "Business Loan",
          "5": "Mortgage Loan",
          "6": "Industrial Property Loan",
          "7": "Commercial Property Loan",
        };
        state.loanType = loanTypes[msgBody] || "Unknown";
        reply = `✅ आपण निवडलं आहे: 🔁 ${state.loanType}\n📝 Eligibility साठी माहिती पाठवा:\n- मासिक उत्पन्न (उदा: ₹30000)`;
        state.step = "income";
      } else if (state.step === "income") {
        state.income = msgBody;
        reply = "🌍 तुमचं शहर/गाव सांगा (उदा: Pune)";
        state.step = "city";
      } else if (state.step === "city") {
        state.city = msgBody;
        reply = "💰 तुम्हाला किती लोन हवा आहे? (उदा: ₹15 लाख)";
        state.step = "amount";
      } else if (state.step === "amount") {
        state.amount = msgBody;
        reply = "😇 नाव सांगा (उदा: Rahul Patil)";
        state.step = "name";
      } else if (state.step === "name") {
        const dateNow = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });

        await sheets.spreadsheets.values.append({
          spreadsheetId: SHEET_ID,
          range: `${SHEET_NAME}!A1`,
          valueInputOption: "USER_ENTERED",
          requestBody: {
            values: [
              [
                dateNow,
                msgBody,
                from,
                state.city,
                state.income,
                state.loanType,
                state.amount,
                dateNow,
                "New",
              ],
            ],
          },
        });

        await notifyVinayak({
          name: msgBody,
          phone: from,
          city: state.city,
          income: state.income,
          loanType: state.loanType,
          amount: state.amount,
        });

        await sendLoanOffer({
          name: msgBody,
          phone: from,
          loanType: state.loanType,
        });

        reply = "🎉 धन्यवाद! तुमचं लोन अर्ज आम्ही प्राप्त केला आहे.\nआमचे प्रतिनिधी लवकरच संपर्क करतील.";
        delete userState[from];
      } else {
        reply = "Loan साठी क्रमांक टाका:\n1️⃣ Home Loan\n2️⃣ Personal Loan\n...";
        state.step = "loanType";
      }

      await axios.post(
        `https://graph.facebook.com/v18.0/${value.metadata.phone_number_id}/messages`,
        {
          messaging_product: "whatsapp",
          to: from,
          text: { body: reply },
        },
        {
          headers: {
            Authorization: `Bearer ${WHATSAPP_TOKEN}`,
            "Content-Type": "application/json",
          },
        }
      );
      console.log("📤 Reply sent to", from + ":", reply);
    }
    res.sendStatus(200);
  } else {
    res.sendStatus(404);
  }
});

// ✅ Vinayak ला WhatsApp वर लीड नोटिफाय करणे
async function notifyVinayak(leadData) {
  const message = `🔔 नवीन लोन लीड:\n\n👤 नाव: ${leadData.name}\n📞 नंबर: ${leadData.phone}\n🏠 Loan Type: ${leadData.loanType}\n💰 उत्पन्न: ${leadData.income}\n🌍 शहर: ${leadData.city}\n💸 रक्कम: ${leadData.amount}`;
  try {
    await axios.post(
      `https://graph.facebook.com/v18.0/${phoneNumberId}/messages`,
      {
        messaging_product: "whatsapp",
        to: vinayakNumber,
        text: { body: message },
      },
      {
        headers: {
          Authorization: `Bearer ${WHATSAPP_TOKEN}`,
          "Content-Type": "application/json",
        },
      }
    );
    console.log("📨 Vinayak ला लीड नोटिफिकेशन पाठवले.");
  } catch (err) {
    console.error("❌ Vinayak ला मेसेज पाठवताना त्रुटी:", err.response?.data || err.message);
  }
}

// ✅ Template Message पाठवणे
async function sendLoanOffer(leadData) {
  const tab = sheetTabs[leadData.loanType];
  if (!tab) return;

  const result = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${tab}!A2:G2`,
  });
  const offer = result.data.values?.[0];
  if (!offer) return;

  await axios.post(
    `https://graph.facebook.com/v18.0/${phoneNumberId}/messages`,
    {
      messaging_product: "whatsapp",
      to: leadData.phone,
      type: "template",
      template: {
        name: "loan_offer_template_marathi",
        language: { code: "mr" },
        components: [
          {
            type: "body",
            parameters: offer.map((text) => ({ type: "text", text: text || "-" })),
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
  console.log("📨 Loan Offer पाठवली:", leadData.phone);
}

//
// ✅ ✅ ✅ NEW: API Endpoints for Broadcast UI
//

// 📌 GET /api/loan-types
app.get("/api/loan-types", (req, res) => {
  res.json(Object.keys(sheetTabs));
});

// 📌 GET /api/banks?type=Home Loan
app.get("/api/banks", async (req, res) => {
  const type = req.query.type;
  const tab = sheetTabs[type];
  if (!tab) return res.status(400).json({ error: "Invalid loan type" });

  const result = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${tab}!A2:A`,
  });
  const banks = result.data.values?.map((row) => row[0]).filter(Boolean);
  res.json(banks || []);
});

// 📌 POST /api/send-offer
app.post("/api/send-offer", async (req, res) => {
  const { phone, loanType, bankName } = req.body;
  const tab = sheetTabs[loanType];
  if (!tab) return res.status(400).json({ error: "Invalid loan type" });

  const result = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${tab}!A2:G`,
  });
  const rows = result.data.values;
  const row = rows.find((r) => r[0] === bankName);
  if (!row) return res.status(404).json({ error: "Bank not found" });

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
    console.log("✅ Broadcasted loan offer to:", phone);
    res.json({ success: true });
  } catch (err) {
    console.error("❌ Broadcast error:", err.response?.data || err.message);
    res.status(500).json({ error: "Failed to send message" });
  }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("✅ LoanHelpline Bot चालू आहे पोर्ट", PORT);
});
