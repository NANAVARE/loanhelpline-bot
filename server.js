const express = require("express");
const axios = require("axios");
const { google } = require("googleapis");
const bodyParser = require("body-parser");
const app = express();

app.use(bodyParser.json());

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

async function getLoanOffer(loanType) {
  const sheetTabNames = {
    "Home Loan": "Home Loan Offers",
    "Transfer Your Loan": "Transfer Loan Offers",
    "Personal Loan": "Personal Loan Offers",
    "Business Loan": "Business Loan Offers",
    "Mortgage Loan": "Mortgage Loan Offers",
    "Industrial Property Loan": "Industrial Loan Offers",
    "Commercial Property Loan": "Commercial Loan Offers",
  };
  const sheetTab = sheetTabNames[loanType] || "Loan Offers";

  try {
    const result = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${sheetTab}!A2:F`,
    });
    const rows = result.data.values;
    if (!rows || rows.length === 0) return null;
    return rows[0];
  } catch (error) {
    console.error("❌ getLoanOffer error:", error.message);
    return null;
  }
}

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
          name: "loan_offer_template_marathi",
          language: { code: "mr" },
          components: [
            {
              type: "body",
              parameters: [
                { type: "text", text: offer[0] },
                { type: "text", text: offer[1] },
                { type: "text", text: offer[2] },
                { type: "text", text: offer[3] },
                { type: "text", text: offer[4] },
                { type: "text", text: offer[5] || "" },
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
    console.log("📨 Auto Loan Offer पाठवली:", leadData.phone);
  } catch (error) {
    console.error("❌ sendLoanOffer error:", error.response?.data || error.message);
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

// ✅ API for React UI

app.get("/api/loan-types", (req, res) => {
  const loanTypes = [
    "Home Loan",
    "Personal Loan",
    "Transfer Your Loan",
    "Business Loan",
    "Mortgage Loan",
    "Industrial Property Loan",
    "Commercial Property Loan",
  ];
  res.json(loanTypes);
});

app.get("/api/banks", async (req, res) => {
  const loanType = req.query.type;
  const tabMapping = {
    "Home Loan": "Home Loan Offers",
    "Personal Loan": "Personal Loan Offers",
    "Transfer Your Loan": "Transfer Loan Offers",
    "Business Loan": "Business Loan Offers",
    "Mortgage Loan": "Mortgage Loan Offers",
    "Industrial Property Loan": "Industrial Loan Offers",
    "Commercial Property Loan": "Commercial Loan Offers",
  };
  const tabName = tabMapping[loanType];
  if (!tabName) return res.status(400).json({ error: "Invalid loan type" });

  try {
    const result = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${tabName}!A1:Z`,
    });
    const rows = result.data.values;
    if (!rows || rows.length < 2) return res.json([]);
    const headers = rows[0];
    const offers = rows.slice(1).map((row) => {
      const obj = {};
      headers.forEach((h, i) => {
        obj[h] = row[i] || "";
      });
      return obj;
    });
    res.json(offers);
  } catch (err) {
    console.error("❌ /api/banks error:", err.message);
    res.status(500).json({ error: "Failed to fetch bank offers" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("✅ LoanHelpline Bot चालू आहे पोर्ट", PORT);
});
