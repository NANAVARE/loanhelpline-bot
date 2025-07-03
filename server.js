require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const { GoogleSpreadsheet } = require('google-spreadsheet');

const app = express();
const PORT = process.env.PORT || 10000;

app.use(bodyParser.json());

const SHEET_ID = process.env.GOOGLE_SHEET_ID;
const SERVICE_ACCOUNT_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const PRIVATE_KEY = process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n');

const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const ADMIN_PHONE_NUMBER = '918329569608'; // Admin Vinayak

const doc = new GoogleSpreadsheet(SHEET_ID);

// In-memory session store
const sessions = {};

const LOAN_TYPES = {
  "1": "Home Loan",
  "2": "Personal Loan",
  "3": "Transfer Your Loan",
  "4": "Business Loan",
  "5": "Mortgage Loan",
  "6": "Industrial Property Loan",
  "7": "Commercial Property Loan",
};

const OFFER_TEMPLATES = {
  "Home Loan": [
    {
      bank: "HDFC Bank",
      rate: "8.25%",
      fee: "₹0",
      topup: "Available",
      validity: "31-Jul-2025",
      special: "फक्त सॅलरीड लोकांसाठी",
    },
  ],
  "Industrial Property Loan": [
    {
      bank: "SIDBI Bank",
      rate: "9.00%",
      fee: "₹500",
      topup: "Available",
      validity: "31-Aug-2025",
      special: "Project Report अनिवार्य",
    },
  ],
  // Add more loan type offers here...
};

function getOfferMessages(loanType) {
  const offers = OFFER_TEMPLATES[loanType] || [];
  return offers.map((offer) => 
    `🏦 ${offer.bank} ऑफर\n` +
    `💰 व्याजदर: ${offer.rate}\n` +
    `🧾 प्रोसेसिंग फी: ${offer.fee}\n` +
    `📄 टॉप-अप: ${offer.topup}\n` +
    `📅 वैधता: ${offer.validity}\n` +
    `📝 विशेष माहिती: ${offer.special}\n` +
    `LoanHelpline सेवेसाठी धन्यवाद!`
  );
}

async function sendWhatsAppMessage(phone, message) {
  try {
    const url = `https://graph.facebook.com/v19.0/${WHATSAPP_PHONE_NUMBER_ID}/messages`;
    const payload = {
      messaging_product: 'whatsapp',
      to: phone,
      type: 'text',
      text: { body: message },
    };
    const headers = {
      Authorization: `Bearer ${WHATSAPP_TOKEN}`,
      'Content-Type': 'application/json',
    };
    await axios.post(url, payload, { headers });
    console.log(`📤 Reply sent to ${phone}: ${message.split('\n')[0]}`);
  } catch (error) {
    console.error('❌ WhatsApp Error:', error.response?.data || error.message);
  }
}

async function saveLeadToSheet(data) {
  await doc.useServiceAccountAuth({
    client_email: SERVICE_ACCOUNT_EMAIL,
    private_key: PRIVATE_KEY,
  });
  await doc.loadInfo();
  const sheet = doc.sheetsByIndex[0];

  const newRow = {
    Timestamp: new Date().toLocaleString(),
    Name: data.name,
    Phone: data.phone,
    City: data.city,
    Income: data.income,
    LoanType: data.loanType,
    LoanAmount: data.amount,
    Status: 'New Lead',              // ✅ Added
    Source: 'WhatsApp Bot',          // ✅ Added
  };

  await sheet.addRow(newRow);
}

app.post('/webhook', async (req, res) => {
  const body = req.body;

  if (!body?.entry?.[0]?.changes?.[0]?.value?.messages) {
    return res.sendStatus(200);
  }

  const message = body.entry[0].changes[0].value.messages[0];
  const phone = message.from;
  const text = message.text?.body?.trim();

  if (!sessions[phone]) {
    sessions[phone] = { step: 0, phone };
    await sendWhatsAppMessage(phone,
      `Loan साठी क्रमांक टाका:\n` +
      `1️⃣ Home Loan\n2️⃣ Personal Loan\n3️⃣ Transfer Your Loan\n` +
      `4️⃣ Business Loan\n5️⃣ Mortgage Loan\n6️⃣ Industrial Property Loan\n7️⃣ Commercial Property Loan\n` +
      `कृपया फक्त क्रमांक टाका. (उदा: 1)`
    );
    return res.sendStatus(200);
  }

  const session = sessions[phone];

  try {
    switch (session.step) {
      case 0:
        if (LOAN_TYPES[text]) {
          session.loanType = LOAN_TYPES[text];
          session.step = 1;
          await sendWhatsAppMessage(phone, `✅ आपण निवडलं आहे: 🔁 ${session.loanType}\n📝 Eligibility साठी माहिती पाठवा:\n- मासिक उत्पन्न (उदा: ₹30000)`);
        } else {
          await sendWhatsAppMessage(phone, '❌ कृपया वैध Loan क्रमांक टाका (1-7)');
        }
        break;
      case 1:
        session.income = text.replace(/[^\d]/g, '');
        session.step = 2;
        await sendWhatsAppMessage(phone, '🌍 तुमचं शहर/गाव सांगा (उदा: Pune)');
        break;
      case 2:
        session.city = text;
        session.step = 3;
        await sendWhatsAppMessage(phone, '💰 तुम्हाला किती लोन हवा आहे? (उदा: ₹15 लाख)');
        break;
      case 3:
        session.amount = text.replace(/[^\d]/g, '');
        session.step = 4;
        await sendWhatsAppMessage(phone, '😇 नाव सांगा (उदा: Rahul Patil)');
        break;
      case 4:
        session.name = text;
        session.step = 5;

        await sendWhatsAppMessage(phone, '🎉 धन्यवाद! तुमचं लोन अर्ज आम्ही प्राप्त केला आहे.\nआमचे प्रतिनिधी लवकरच संपर्क करतील.');

        await sendWhatsAppMessage(ADMIN_PHONE_NUMBER,
          `⚠️ नवीन लोन लीड:\n` +
          `👤 नाव: ${session.name}\n📞 नंबर: ${phone}\n🏦 Loan Type: ${session.loanType}\n` +
          `💰 उत्पन्न: ${session.income}\n🌍 शहर: ${session.city}\n📉 रक्कम: ${session.amount}`
        );

        await saveLeadToSheet({
          name: session.name,
          phone,
          city: session.city,
          income: session.income,
          loanType: session.loanType,
          amount: session.amount
        });

        const offerMessages = getOfferMessages(session.loanType);
        for (const msg of offerMessages) {
          await sendWhatsAppMessage(phone, msg);
        }

        delete sessions[phone];
        break;
    }

    res.sendStatus(200);
  } catch (err) {
    console.error('❌ Error:', err);
    res.sendStatus(500);
  }
});

app.listen(PORT, () => {
  console.log(`✅ LoanHelpline Bot चालू आहे पोर्ट ${PORT}`);
});
