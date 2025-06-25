// server.js - Updated Version with Fixes
import express from 'express';
import bodyParser from 'body-parser';
import { google } from 'googleapis';
import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

const app = express();
app.use(bodyParser.json());

const sessions = {};
const PORT = process.env.PORT || 10000;

const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON);
const auth = new google.auth.GoogleAuth({
  credentials,
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});
const sheets = google.sheets({ version: 'v4', auth });

const SHEET_ID = process.env.GOOGLE_SHEET_ID;
const SHEET_NAME = process.env.SHEET_NAME;
const OFFERS_TAB_NAME = process.env.OFFERS_TAB_NAME;
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;

const sendMessage = async (to, message) => {
  try {
    await axios.post(
      `https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: 'whatsapp',
        to,
        text: { body: message },
      },
      {
        headers: {
          Authorization: `Bearer ${WHATSAPP_TOKEN}`,
          'Content-Type': 'application/json',
        },
      }
    );
    console.log(`📤 Reply sent to ${to}: ${message}`);
  } catch (error) {
    console.error('❌ sendMessage error:', error.response?.data || error.message);
  }
};

const sendLoanOffer = async (to, loanType) => {
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${OFFERS_TAB_NAME}!A2:E`,
    });

    const cleanType = loanType.replace(/[^a-zA-Z ]/g, '').trim().toLowerCase();
    const offer = res.data.values.find((row) =>
      row[0]?.trim().toLowerCase() === cleanType
    );

    if (!offer) throw new Error('Loan offer not found');

    const [type, bank, rate, topup, process] = offer;
    const message = `🔹 LoanHelpline कडून नवीन ऑफर:
${type}
🏦 बँक: ${bank}
💰 व्याजदर: ${rate}% पासून
📄 टॉप-अप: ${topup}
⚡ प्रक्रिया: ${process}

LoanHelpline सेवेसाठी धन्यवाद!`;

    await sendMessage(to, message);
  } catch (error) {
    console.error('❌ sendLoanOffer error:', error.response?.data || error.message);
  }
};

const saveLeadToSheet = async (lead) => {
  try {
    const values = [[
      new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
      lead.name,
      lead.phone,
      lead.city,
      lead.income,
      lead.loanType,
      lead.amount,
      lead.followUp || new Date().toLocaleDateString('en-IN'),
      lead.status || 'New Lead'
    ]];

    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: `${SHEET_NAME}!A:I`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values },
    });
  } catch (error) {
    console.error('\u274c saveLeadToSheet error:', error.message);
  }
};

app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('Webhook verified');
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

app.post('/webhook', async (req, res) => {
  const body = req.body;
  if (body.object !== 'whatsapp_business_account') return res.sendStatus(404);

  const message = body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
  const from = message?.from;
  const text = message?.text?.body;
  if (!from || !text) return res.sendStatus(200);

  if (!sessions[from]) sessions[from] = { step: 0, data: { phone: from } };
  const session = sessions[from];

  try {
    if (text === '1') {
      session.step = 1;
      session.data.loanType = 'Home Loan';
      await sendMessage(from, '✅ आपण निवडलं आहे: 🔁 Home Loan');
      await sendMessage(from, '🌍 तुमचं शहर/गाव सांगा (उदा: Pune)');
      return res.sendStatus(200);
    }

    switch (session.step) {
      case 1:
        session.data.city = text;
        session.step++;
        await sendMessage(from, '💰 तुम्हाला किती लोन हवा आहे? (उदा: ₹15 लाख)');
        break;
      case 2:
        session.data.amount = text;
        session.step++;
        await sendMessage(from, '🧾 तुमचं उत्पन्न किती आहे? (उदा: ₹50,000)');
        break;
      case 3:
        session.data.income = text;
        session.step++;
        await sendMessage(from, '🧑 नाव सांगा (उदा: Rahul Patil)');
        break;
      case 4:
        session.data.name = text;
        await saveLeadToSheet({ ...session.data });
        await sendMessage(from, '🎉 धन्यवाद! तुमचं लोन अर्ज आम्ही प्राप्त केलं आहे.');
        await sendMessage('918329569608', `🔔 नवीन लीड:
${session.data.name} (${from})
📍 ${session.data.city}
💰 ₹${session.data.amount}`);
        await sendLoanOffer(from, session.data.loanType);
        delete sessions[from];
        console.log('🧹 Session Deleted:', from);
        break;
      default:
        await sendMessage(from, '1️⃣ Home Loan\nकृपया पर्याय निवडा.');
    }
  } catch (e) {
    console.error('❌ Webhook error:', e);
  }

  res.sendStatus(200);
});

app.listen(PORT, () => {
  console.log(`✅ LoanHelpline Bot चालू आहे पोर्ट ${PORT}`);
});
