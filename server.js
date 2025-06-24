const express = require("express");
const axios = require("axios");
const { google } = require("googleapis");
const bodyParser = require("body-parser");
const app = express();
app.use(bodyParser.json());

// ENV Vars
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const SHEET_ID = process.env.SHEET_ID;
const SHEET_TAB_NAME = process.env.SHEET_TAB_NAME;
const OFFERS_SHEET_ID = process.env.OFFERS_SHEET_ID;
const OFFERS_TAB_NAME = process.env.OFFERS_TAB_NAME;
const phoneNumberId = process.env.PHONE_NUMBER_ID;
const GOOGLE_CREDENTIALS_JSON = JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON);
const vinayakNumber = "918329569608";

// Google Sheets Auth
const SCOPES = ["https://www.googleapis.com/auth/spreadsheets"];
const auth = new google.auth.JWT(
  GOOGLE_CREDENTIALS_JSON.client_email,
  null,
  GOOGLE_CREDENTIALS_JSON.private_key,
  SCOPES
);
const sheets = google.sheets({ version: "v4", auth });

// Store user conversation states
const userState = {};

// ✅ Vinayak Notification
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

// ✅ Get Loan Offer from Google Sheet
async function getLoanOffer(loanType) {
  try {
    const result = await sheets.spreadsheets.values.get({
      spreadsheetId: OFFERS_SHEET_ID,
      range: `${OFFERS_TAB_NAME}!A2:E1000`,
    });
    const rows = result.data.values;
    if (!rows || rows.length === 0) return null;

    for (let row of rows) {
      if ((row[0] || "").trim().toLowerCase() === loanType.trim().toLowerCase()) {
        return {
          bank_name: row[1] || "",
          interest_rate: row[2] || "",
          topup_status: row[3] || "",
          process_speed: row[4] || "",
        };
      }
    }
    return null;
  } catch (error) {
    console.error("❌ getLoanOffer error:", error.message);
    return null;
  }
}

// ✅ Send Loan Offer (Template Message)
async function sendLoanOffer(leadData) {
  console.log("📦 Sending loan offer to:", leadData.phone);
  console.log("🙍‍♂️ Name:", leadData.name);
  console.log("🏦 Loan Type:", leadData.loanType);

  const offer = await getLoanOffer(leadData.loanType);
  if (!offer) {
    console.error("❌ No offer found for loan type:", leadData.loanType);
    return;
  }

  const leadName = (leadData.name || "ग्राहक").trim();
  const loanType = (leadData.loanType || "Loan").trim();
  const bankName = (offer.bank_name || "NA").trim();
  const interestRate = (offer.interest_rate || "-").toString().trim();
  const topupStatus = (offer.topup_status || "NA").trim();
  const processSpeed = (offer.process_speed || "NA").trim();

  try {
    await axios.post(
      `https://graph.facebook.com/v18.0/${phoneNumberId}/messages`,
      {
        messaging_product: "whatsapp",
        to: leadData.phone,
        type: "template",
        template: {
          name: "loan_offer_generic",
          language: { code: "mr" },
          components: [
            {
              type: "body",
              parameters: [
                { type: "text", text: leadName },
                { type: "text", text: loanType },
                { type: "text", text: bankName },
                { type: "text", text: interestRate },
                { type: "text", text: topupStatus },
                { type: "text", text: processSpeed },
              ],
            },
            {
              type: "button",
              sub_type: "quick_reply",
              index: "0",
              parameters: [{ type: "payload", payload: "apply_now" }],
            },
            {
              type: "button",
              sub_type: "quick_reply",
              index: "1",
              parameters: [{ type: "payload", payload: "call_back" }],
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
    console.log("✅ Auto Loan Offer पाठवली:", leadData.phone);
  } catch (error) {
    console.error("❌ sendLoanOffer error:", error.response?.data || error.message);
  }
}

// ✅ Webhook Verification
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

// ✅ Webhook Receiver
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

        const dateNow = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
        await sheets.spreadsheets.values.append({
          spreadsheetId: SHEET_ID,
          range: `${SHEET_TAB_NAME}!A1`,
          valueInputOption: "USER_ENTERED",
          requestBody: {
            values: [
              [
                userState[from + "_name"],
                from,
                state.city,
                state.income,
                state.loanType,
                state.amount,
                dateNow,
                "New",
                "",
              ],
            ],
          },
        });

        await notifyVinayak({
          name: userState[from + "_name"],
          phone: from,
          city: state.city,
          income: state.income,
          loanType: state.loanType,
          amount: state.amount,
        });

        await sendLoanOffer({
          name: userState[from + "_name"],
          phone: from,
          loanType: state.loanType,
        });

        reply = "🎉 धन्यवाद! तुमचं लोन अर्ज आम्ही प्राप्त केलं आहे.\nआमचे प्रतिनिधी लवकरच संपर्क करतील.";
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

// ✅ Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("✅ LoanHelpline Bot चालू आहे पोर्ट", PORT);
});
