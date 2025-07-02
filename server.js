const express = require('express');
const bodyParser = require('body-parser');
const { google } = require('googleapis');
const axios = require('axios');

const app = express();
const port = process.env.PORT || 10000;

app.use(bodyParser.json());

// Load environment variables
const WHATSAPP_API_URL = `https://graph.facebook.com/v18.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const SHEET_ID = process.env.SHEET_ID;

const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON);

const auth = new google.auth.GoogleAuth({
  credentials,
  scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
});

const loanTypes = {
  '1': 'Home Loan',
  '2': 'Personal Loan',
  '3': 'Transfer Your Loan',
  '4': 'Business Loan',
  '5': 'Mortgage Loan',
  '6': 'Industrial Property Loan',
  '7': 'Commercial Property Loan',
};

const sheetRanges = {
  'Home Loan': 'Home Loan Offers!A2:G2',
  'Personal Loan': 'Personal Loan Offers!A2:G2',
  'Transfer Your Loan': 'Transfer Loan Offers!A2:G2',
  'Business Loan': 'Business Loan Offers!A2:G2',
  'Mortgage Loan': 'Mortgage Loan Offers!A2:G2',
  'Industrial Property Loan': 'Industrial Property Offers!A2:G2',
  'Commercial Property Loan': 'Commercial Property Offers!A2:G2',
};

const userState = {}; // phone => { step, loanType, income, city, amount, name }

const sendWhatsAppMessage = async (phone, message) => {
  try {
    await axios.post(
      WHATSAPP_API_URL,
      {
        messaging_product: 'whatsapp',
        to: phone,
        text: { body: message },
      },
      {
        headers: {
          Authorization: `Bearer ${WHATSAPP_TOKEN}`,
          'Content-Type': 'application/json',
        },
      }
    );
    console.log(`📤 Reply sent to ${phone}: ${message}`);
  } catch (error) {
    console.error('❌ Error sending WhatsApp message:', error.response?.data || error.message);
  }
};

const getLoanOfferFromSheet = async (loanType) => {
  try {
    const client = await auth.getClient();
    const sheets = google.sheets({ version: 'v4', auth: client });
    const range = sheetRanges[loanType];
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range,
    });
    return response.data.values[0];
  } catch (err) {
    console.error(`❌ Error fetching Google Sheet for ${loanType}:`, err.message);
    return null;
  }
};

const sendLoanOffer = async (phone, loanType) => {
  const offer = await getLoanOfferFromSheet(loanType);
  if (!offer) {
    return sendWhatsAppMessage(phone, '⚠️ सध्या ऑफर उपलब्ध नाही.');
  }

  const message = `🏦 ${offer[0]} ऑफर\n💰 व्याजदर: ${offer[1]}\n🧾 प्रोसेसिंग फी: ${offer[2]}\n📄 टॉप-अप: ${offer[3]}\n📅 वैधता: ${offer[4]}\n📝 विशेष माहिती: ${offer[5]}\nLoanHelpline सेवेसाठी धन्यवाद!`;
  await sendWhatsAppMessage(phone, message);
};

app.post('/webhook', async (req, res) => {
  const message = req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
  if (!message) return res.sendStatus(200);

  const phone = message.from;
  const text = message.text?.body.trim();
  const user = userState[phone] || { step: 0 };

  switch (user.step) {
    case 0:
      await sendWhatsAppMessage(
        phone,
        `Loan साठी क्रमांक टाका:\n1️⃣ Home Loan\n2️⃣ Personal Loan\n3️⃣ Transfer Your Loan\n4️⃣ Business Loan\n5️⃣ Mortgage Loan\n6️⃣ Industrial Property Loan\n7️⃣ Commercial Property Loan\n\nकृपया फक्त क्रमांक टाका. (उदा: 1)`
      );
      user.step = 1;
      break;
    case 1:
      user.loanType = loanTypes[text];
      if (!user.loanType) {
        return await sendWhatsAppMessage(phone, '❌ चुकीचा पर्याय. कृपया 1 ते 7 मधील क्रमांक टाका.');
      }
      await sendWhatsAppMessage(phone, `✅ आपण निवडलं आहे: 🔁 ${user.loanType}\n📝 Eligibility साठी माहिती पाठवा:\n- मासिक उत्पन्न (उदा: ₹30000)`);
      user.step = 2;
      break;
    case 2:
      user.income = text;
      await sendWhatsAppMessage(phone, '🌍 तुमचं शहर/गाव सांगा (उदा: Pune)');
      user.step = 3;
      break;
    case 3:
      user.city = text;
      await sendWhatsAppMessage(phone, '💰 तुम्हाला किती लोन हवा आहे? (उदा: ₹15 लाख)');
      user.step = 4;
      break;
    case 4:
      user.amount = text;
      await sendWhatsAppMessage(phone, '😇 नाव सांगा (उदा: Rahul Patil)');
      user.step = 5;
      break;
    case 5:
      user.name = text;
      await sendWhatsAppMessage(phone, '📨 Vinayak ला लीड नोटिफिकेशन पाठवले.');
      await sendLoanOffer(phone, user.loanType);
      delete userState[phone];
      break;
  }

  userState[phone] = user;
  res.sendStatus(200);
});

app.get('/', (req, res) => {
  res.send('✅ LoanHelpline Bot चालू आहे');
});

app.listen(port, () => {
  console.log(`✅ LoanHelpline Bot चालू आहे पोर्ट ${port}`);
});
