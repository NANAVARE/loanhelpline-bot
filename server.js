const express = require('express');
const bodyParser = require('body-parser');
const { google } = require('googleapis');
const axios = require('axios');
const app = express();
const port = process.env.PORT || 10000;

app.use(bodyParser.json());

// ✅ Constants
const WHATSAPP_API_URL = `https://graph.facebook.com/v18.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const SHEET_ID = process.env.SHEET_ID;
const ADMIN_PHONE = '918329569608';

// ✅ Google Sheets Auth
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];
const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON),
  scopes: SCOPES,
});

// ✅ Loan Options
const loanTypes = {
  '1': 'Home Loan',
  '2': 'Personal Loan',
  '3': 'Transfer Your Loan',
  '4': 'Business Loan',
  '5': 'Mortgage Loan',
  '6': 'Industrial Property Loan',
  '7': 'Commercial Property Loan',
};

// ✅ User State Tracker
const userState = {}; // phone => { step, ... }

// ✅ Blocked Numbers
const blacklistedNumbers = ['919599816917'];

// ✅ Send WhatsApp Text Message
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

// ✅ Save Lead to Google Sheet
const saveLeadToSheet = async (lead) => {
  try {
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
      'New Lead',
      'WhatsApp Bot'
    ]];

    const result = await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: 'Sheet1!A2',
      valueInputOption: 'USER_ENTERED',
      requestBody: { values },
    });

    console.log('✅ Lead successfully saved to Google Sheet:', result.data.updates);
  } catch (err) {
    console.error('❌ Error saving lead to Google Sheet:', err.response?.data || err.message);
  }
};

// ✅ Notify Admin
const notifyAdmin = async (lead) => {
  const msg = `⚠️ नवीन लोन लीड:\n👤 नाव: ${lead.name}\n📞 नंबर: ${lead.phone}\n🏦 Loan Type: ${lead.loanType}\n💰 उत्पन्न: ${lead.income}\n🌍 शहर: ${lead.city}\n📉 रक्कम: ${lead.amount}`;
  await sendWhatsAppMessage(ADMIN_PHONE, msg);
};

// ✅ Webhook: POST Handler
app.post('/webhook', async (req, res) => {
  const message = req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
  if (!message) return res.sendStatus(200);

  const phone = message.from;
  const text = message.text?.body?.trim();
  if (!text) return res.sendStatus(200);

  // 🛑 Block blacklisted numbers
  if (blacklistedNumbers.includes(phone)) {
    console.log(`⚠️ ब्लॅकलिस्टेड नंबर (${phone}) – मेसेज ब्लॉक केला.`);
    return res.sendStatus(200);
  }

  const user = userState[phone] || { step: 0, phone };

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
      await sendWhatsAppMessage(phone, `🎉 धन्यवाद! तुमचं लोन अर्ज आम्ही प्राप्त केला आहे.\nआमचे प्रतिनिधी लवकरच संपर्क करतील.`);
      await notifyAdmin(user);
      await saveLeadToSheet(user); // ✅ Always save
      delete userState[phone];
      break;
  }

  userState[phone] = user;
  res.sendStatus(200);
});

// ✅ Webhook GET Handler (Verification)
app.get('/webhook', (req, res) => {
  const verify_token = process.env.META_VERIFY_TOKEN;
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode && token && mode === 'subscribe' && token === verify_token) {
    console.log('✅ Webhook Verified');
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// ✅ Root Route
app.get('/', (req, res) => {
  res.send('✅ LoanHelpline Bot चालू आहे');
});

// ✅ Start Server
app.listen(port, () => {
  console.log(`✅ LoanHelpline Bot चालू आहे पोर्ट ${port}`);
});
