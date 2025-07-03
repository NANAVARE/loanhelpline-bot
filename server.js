const express = require('express');
const bodyParser = require('body-parser');
const { google } = require('googleapis');
const axios = require('axios');
const app = express();
const port = process.env.PORT || 10000;

app.use(bodyParser.json());

// 🛡️ ENV variables
const WHATSAPP_API_URL = `https://graph.facebook.com/v18.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const SHEET_ID = process.env.SHEET_ID;
const ADMIN_PHONE = '918329569608'; // तुमचा Admin नंबर

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];
const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON),
  scopes: SCOPES,
});

// 🔢 Loan types & Google Sheet ranges
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
  'Home Loan': 'Home Loan Offers!A2:G100',
  'Personal Loan': 'Personal Loan Offers!A2:G100',
  'Transfer Your Loan': 'Transfer Loan Offers!A2:G100',
  'Business Loan': 'Business Loan Offers!A2:G100',
  'Mortgage Loan': 'Mortgage Loan Offers!A2:G100',
  'Industrial Property Loan': 'Industrial Property Offers!A2:G100',
  'Commercial Property Loan': 'Commercial Property Offers!A2:G100',
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

const getLoanOffersFromSheet = async (loanType) => {
  const client = await auth.getClient();
  const sheets = google.sheets({ version: 'v4', auth: client });
  const range = sheetRanges[loanType];
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range,
  });
  return response.data.values;
};

const sendLoanOffers = async (phone, loanType) => {
  const offers = await getLoanOffersFromSheet(loanType);
  if (!offers || offers.length === 0) {
    return sendWhatsAppMessage(phone, '⚠️ सध्या ऑफर्स उपलब्ध नाहीत.');
  }

  for (const offer of offers) {
    if (offer.length < 6 || !offer[0]) continue; // Skip empty rows
    const message = `🔶 ${offer[0]} कडून आकर्षक ${loanType} ऑफर:

💼 लोन प्रकार: ${loanType}
📉 व्याजदर: ${offer[1]}
💰 कर्ज मर्यादा: ${offer[5]}
📆 कालावधी: ${offer[4]}
📄 प्रोसेसिंग फी: ${offer[2]}
➕ टॉप-अप: ${offer[3]}
✅ पूर्व-परतफेड: ${offer[6]}

LoanHelpline सेवेसाठी धन्यवाद!`;

    await sendWhatsAppMessage(phone, message);
  }
};

const saveLeadToSheet = async (lead) => {
  const client = await auth.getClient();
  const sheets = google.sheets({ version: 'v4', auth: client });
  const now = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });

  const values = [[
    now,
    lead.name,
    lead.phone,
    lead.city,
    lead.income,
    lead.loanType,
    lead.amount,
    'New Lead',        // ✅ Status
    'WhatsApp Bot'     // ✅ Source
  ]];

  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: 'Sheet1!A2',
    valueInputOption: 'USER_ENTERED',
    requestBody: { values },
  });
};

const notifyAdmin = async (lead) => {
  const msg = `⚠️ नवीन लोन लीड:
👤 नाव: ${lead.name}
📞 नंबर: ${lead.phone}
🏦 Loan Type: ${lead.loanType}
💰 उत्पन्न: ${lead.income}
🌍 शहर: ${lead.city}
📉 रक्कम: ${lead.amount}`;
  await sendWhatsAppMessage(ADMIN_PHONE, msg);
};

app.post('/webhook', async (req, res) => {
  const message = req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
  if (!message) return res.sendStatus(200);

  const phone = message.from;
  const text = message.text?.body.trim();
  const user = userState[phone] || { step: 0, phone };

  switch (user.step) {
    case 0:
      await sendWhatsAppMessage(
        phone,
        `Loan साठी क्रमांक टाका:
1️⃣ Home Loan
2️⃣ Personal Loan
3️⃣ Transfer Your Loan
4️⃣ Business Loan
5️⃣ Mortgage Loan
6️⃣ Industrial Property Loan
7️⃣ Commercial Property Loan

कृपया फक्त क्रमांक टाका. (उदा: 1)`
      );
      user.step = 1;
      break;
    case 1:
      user.loanType = loanTypes[text];
      if (!user.loanType) {
        return await sendWhatsAppMessage(phone, '❌ चुकीचा पर्याय. कृपया 1 ते 7 मधील क्रमांक टाका.');
      }
      await sendWhatsAppMessage(phone, `✅ आपण निवडलं आहे: ${user.loanType}\n\n📝 Eligibility साठी माहिती पाठवा:\nउदा: ₹30000`);
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
      await sendWhatsAppMessage(phone, '😇 तुमचं पूर्ण नाव सांगा (उदा: Rahul Patil)');
      user.step = 5;
      break;
    case 5:
      user.name = text;

      await sendWhatsAppMessage(phone, `🎉 धन्यवाद! तुमचं लोन अर्ज आम्ही प्राप्त केला आहे.\nआमचे प्रतिनिधी लवकरच संपर्क करतील.`);
      await notifyAdmin(user);
      await saveLeadToSheet(user);
      await sendLoanOffers(phone, user.loanType);

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
