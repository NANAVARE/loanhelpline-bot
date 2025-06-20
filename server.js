const express = require("express");
const axios = require("axios");
const { google } = require("googleapis");
const bodyParser = require("body-parser");
const app = express();
app.use(bodyParser.json());

const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const SHEET_ID = process.env.SHEET_ID;
const SHEET_TAB_NAME = process.env.SHEET_TAB_NAME;
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

const phoneNumberId = "692637547265133"; // ✅ तुमचं API Phone Number ID
const vinayakNumber = "918329569608";     // ✅ तुमचा personal WhatsApp नंबर

// ✅ Notify Vinayak on WhatsApp
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

      if (
        ["hi", "hello", "loan"].includes(msgBody.toLowerCase())
      ) {
        reply = `1️⃣ Home Loan\n2️⃣ Personal Loan\n3️⃣ Balance Transfer\n4️⃣ Business Loan\n5️⃣ Mortgage Loan\nकृपया फक्त क्रमांक टाका. (उदा: 1)`;
        state.step = "loanType";
      } else if (state.step === "loanType") {
        const loanTypes = {
          "1": "Home Loan",
          "2": "Personal Loan",
          "3": "Balance Transfer",
          "4": "Business Loan",
          "5": "Mortgage Loan",
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

        // ✅ Google Sheet मध्ये सेव करा
        const dateNow = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
        await sheets.spreadsheets.values.append({
          spreadsheetId: SHEET_ID,
          range: `${SHEET_TAB_NAME}!A1`,
          valueInputOption: "USER_ENTERED",
          requestBody: {
            values: [
              [
                userState[from + "_name"], // Name
                from,                      // Phone
                state.city,
                state.income,
                state.loanType,
                state.amount,
                dateNow,
                "New",                     // Status
                "",                        // Follow-up Date
              ],
            ],
          },
        });

        // ✅ Notify Vinayak
        await notifyVinayak({
          name: userState[from + "_name"],
          phone: from,
          city: state.city,
          income: state.income,
          loanType: state.loanType,
          amount: state.amount,
        });

        reply =
          "🎉 धन्यवाद! तुमचं लोन अर्ज आम्ही प्राप्त केलं आहे.\nआमचे प्रतिनिधी लवकरच संपर्क करतील.";
        delete userState[from]; // Reset state
      } else {
        reply = "Loan साठी क्रमांक टाका:\n1️⃣ Home Loan\n2️⃣ Personal Loan\n...";
        state.step = "loanType";
      }

      // ✅ Reply to User
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("✅ LoanHelpline Bot चालू आहे पोर्ट", PORT);
});
