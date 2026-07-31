const express = require('express');
const bodyParser = require('body-parser');
const { google } = require('googleapis');
const axios = require('axios');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const app = express();
const port = process.env.PORT || 10000;

app.use(bodyParser.json());

// ✅ Constants
const WHATSAPP_API_URL = `https://graph.facebook.com/v18.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const SHEET_ID = process.env.SHEET_ID;
const ADMIN_PHONE = '918329569608';

// ✅ Gemini AI Configuration
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// ✅ Google Sheets Auth
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];
const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON),
  scopes: SCOPES,
});

// ✅ User Sessions & Conversation History
const userSessions = {}; 
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
      lead.name || 'Not Provided',
      lead.phone,
      lead.city || 'Not Provided',
      lead.income || 'Not Provided',
      lead.loanType || 'Not Provided',
      lead.amount || 'Not Provided',
      'New Lead',
      'Loan Expert AI Agent'
    ]];

    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: 'Sheet1!A2',
      valueInputOption: 'USER_ENTERED',
      requestBody: { values },
    });

    console.log('✅ Lead successfully saved to Google Sheet');
  } catch (err) {
    console.error('❌ Error saving lead to Google Sheet:', err.response?.data || err.message);
  }
};

// ✅ Notify Admin
const notifyAdmin = async (lead) => {
  const msg = `⚠️ नवीन लोन लीड (Loan Expert AI):\n👤 नाव: ${lead.name}\n📞 नंबर: ${lead.phone}\n🏦 Loan Type: ${lead.loanType}\n💰 उत्पन्न: ${lead.income}\n🌍 शहर: ${lead.city}\n📉 रक्कम: ${lead.amount}`;
  await sendWhatsAppMessage(ADMIN_PHONE, msg);
};

// ✅ Loan Expert AI Agent Logic
const processLoanAgentChat = async (phone, userText) => {
  // Initialize session if not exists
  if (!userSessions[phone]) {
    userSessions[phone] = {
      history: [],
      leadData: { phone, loanType: null, income: null, city: null, amount: null, name: null },
      isCompleted: false
    };
  }

  const session = userSessions[phone];
  if (session.isCompleted) return;

  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    // System instruction for Loan Expert Persona
    const systemInstruction = `
    You are a professional, polite, and friendly Marathi-speaking Loan Expert / DSA Agent for "LoanHelpline". 
    Your goal is to converse naturally with the customer and collect 5 key pieces of information:
    1. Loan Type (Home Loan, Personal Loan, Transfer Your Loan, Business Loan, Mortgage Loan, Industrial Property Loan, Commercial Property Loan)
    2. Monthly Income (मासिक उत्पन्न)
    3. City / Location (शहर/गाव)
    4. Required Loan Amount (हवी असलेली लोन रक्कम)
    5. Customer's Name (ग्राहकाचे नाव)

    Current collected data so far:
    - Loan Type: ${session.leadData.loanType || 'Missing'}
    - Income: ${session.leadData.income || 'Missing'}
    - City: ${session.leadData.city || 'Missing'}
    - Amount: ${session.leadData.amount || 'Missing'}
    - Name: ${session.leadData.name || 'Missing'}

    Instructions:
    - Reply in friendly Marathi like a human loan consultant.
    - Ask for the missing details naturally, one or two at a time if needed, without sounding robotic.
    - If all 5 details are collected, output a JSON block at the very end of your response in this exact format:
      JSON_DATA: {"loanType": "...", "income": "...", "city": "...", "amount": "...", "name": "..."}
      And give a warm concluding message thanking them and telling them our executive will call soon.
    `;

    // Build chat session
    const chat = model.startChat({
      history: session.history,
      systemInstruction: systemInstruction,
    });

    const result = await chat.sendMessage(userText);
    const responseText = await result.response.text();

    // Save history
    session.history.push({ role: 'user', parts: [{ text: userText }] });
    session.history.push({ role: 'model', parts: [{ text: responseText }] });

    // Check if AI extracted all data via JSON block
    const jsonMatch = responseText.match(/JSON_DATA:\s*({[\s\S]*?})/);
    let cleanReply = responseText;

    if (jsonMatch) {
      try {
        const extracted = JSON.parse(jsonMatch[1]);
        session.leadData.loanType = extracted.loanType || session.leadData.loanType;
        session.leadData.income = extracted.income || session.leadData.income;
        session.leadData.city = extracted.city || session.leadData.city;
        session.leadData.amount = extracted.amount || session.leadData.amount;
        session.leadData.name = extracted.name || session.leadData.name;

        // Clean JSON from message sent to user
        cleanReply = responseText.replace(/JSON_DATA:\s*({[\s\S]*?})/, '').trim();

        // Check if everything is filled
        if (session.leadData.loanType && session.leadData.income && session.leadData.city && session.leadData.amount && session.leadData.name) {
          session.isCompleted = true;
          await saveLeadToSheet(session.leadData);
          await notifyAdmin(session.leadData);
          delete userSessions[phone]; // Clear session after completion
        }
      } catch (e) {
        console.error('JSON Parse Error:', e);
      }
    }

    await sendWhatsAppMessage(phone, cleanReply);

  } catch (error) {
    console.error('❌ Loan Agent AI Error:', error);
    await sendWhatsAppMessage(phone, 'माஃப் करा, तांत्रिक अडचणीमुळे संपर्क साधण्यात अडचण येत आहे. कृपया पुन्हा प्रयत्न करा.');
  }
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

  // Pass message to Loan Expert AI Agent
  await processLoanAgentChat(phone, text);

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
  res.send('✅ LoanHelpline Bot (Loan Expert AI Agent) चालू आहे');
});

// ✅ Start Server
app.listen(port, () => {
  console.log(`✅ LoanHelpline Bot (Loan Expert AI Agent) चालू आहे पोर्ट ${port}`);
});
