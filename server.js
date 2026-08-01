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
const SHEET_ID = process.env.GOOGLE_SHEET_ID;
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

// ✅ १. मेसेज येताच तात्काळ 'Pending' लीड शीटमध्ये सेव्ह करणे (नवीन ओळ जोडणे)
const saveInitialLeadToSheet = async (phone, senderName) => {
  try {
    const client = await auth.getClient();
    const sheets = google.sheets({ version: 'v4', auth: client });
    const now = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });

    const values = [[
      now,
      senderName || 'WhatsApp User',
      phone,
      'Pending', 
      'Pending', 
      'Pending', 
      'Pending', 
      'Incomplete / New',
      'Loan Expert AI Agent'
    ]];

    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: 'Sheet1!A2',
      valueInputOption: 'USER_ENTERED',
      requestBody: { values },
    });

    console.log('✅ Initial Lead instantly saved to Google Sheet');
  } catch (err) {
    console.error('❌ Error saving initial lead:', err.response?.data || err.message);
  }
};

// ✅ २. सर्व माहिती पूर्ण झाल्यावर तीच ओळ (Row) शोधून अचूक अपडेट करणे
const updateCompletedLeadInSheet = async (lead) => {
  try {
    const client = await auth.getClient();
    const sheets = google.sheets({ version: 'v4', auth: client });
    
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: 'Sheet1!A:I',
    });

    const rows = res.data.values;
    if (!rows) return;

    let rowIndex = -1;
    for (let i = rows.length - 1; i >= 1; i--) {
      if (rows[i][2] === lead.phone) { 
        rowIndex = i + 1; 
        break;
      }
    }

    const now = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
    const updateValues = [
      now,
      lead.name || 'Not Provided',
      lead.phone,
      lead.city || 'Not Provided',
      lead.income || 'Not Provided',
      lead.loanType || 'Not Provided',
      lead.amount || 'Not Provided',
      'New Lead', 
      'Loan Expert AI Agent'
    ];

    if (rowIndex !== -1) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: SHEET_ID,
        range: `Sheet1!A${rowIndex}:I${rowIndex}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [updateValues] },
      });
      console.log(`✅ Lead row ${rowIndex} successfully updated in Google Sheet`);
    } else {
      await sheets.spreadsheets.values.append({
        spreadsheetId: SHEET_ID,
        range: 'Sheet1!A2',
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [updateValues] },
      });
    }
  } catch (err) {
    console.error('❌ Error updating lead in Google Sheet:', err.response?.data || err.message);
  }
};

// ✅ Notify Admin
const notifyAdmin = async (lead) => {
  const msg = `⚠️ नवीन पूर्ण झालेली लोन लीड (Loan Expert AI):\n👤 नाव: ${lead.name}\n📞 नंबर: ${lead.phone}\n🏦 Loan Type: ${lead.loanType}\n💰 उत्पन्न: ${lead.income}\n🌍 शहर: ${lead.city}\n📉 रक्कम: ${lead.amount}`;
  await sendWhatsAppMessage(ADMIN_PHONE, msg);
};

// ✅ Loan Expert AI Agent Logic
const processLoanAgentChat = async (phone, userText, senderName) => {
  if (!userSessions[phone]) {
    userSessions[phone] = {
      historyText: "",
      leadData: { phone, loanType: null, income: null, city: null, amount: null, name: senderName },
      isCompleted: false
    };
    
    await saveInitialLeadToSheet(phone, senderName);
  }

  const session = userSessions[phone];
  if (session.isCompleted) return;

  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    const fullPrompt = `
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

    Previous Conversation History:
    ${session.historyText}

    Customer's Latest Message: "${userText}"

    Instructions:
    - Reply in friendly Marathi like a human loan consultant.
    - Ask for the missing details naturally, one or two at a time if needed, without sounding robotic.
    - If all 5 details are collected, output a JSON block at the very end of your response in this exact format:
      JSON_DATA: {"loanType": "...", "income": "...", "city": "...", "amount": "...", "name": "..."}
      And give a warm concluding message thanking them and telling them our executive will call soon.
    `;

    const result = await model.generateContent(fullPrompt);
    const responseText = await result.response.text();

    session.historyText += `\nUser: ${userText}\nAgent: ${responseText}`;

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

        cleanReply = responseText.replace(/JSON_DATA:\s*({[\s\S]*?})/, '').trim();

        if (session.leadData.loanType && session.leadData.income && session.leadData.city && session.leadData.amount && session.leadData.name) {
          session.isCompleted = true;
          await updateCompletedLeadInSheet(session.leadData); 
          await notifyAdmin(session.leadData);
          delete userSessions[phone];
        }
      } catch (e) {
        console.error('JSON Parse Error:', e);
      }
    }

    await sendWhatsAppMessage(phone, cleanReply);

  } catch (error) {
    console.error('❌ Loan Agent AI Error:', error);
    await sendWhatsAppMessage(phone, 'माफ करा, तांत्रिक अडचणीमुळे संपर्क साधण्यात अडचण येत आहे. कृपया पुन्हा प्रयत्न करा.');
  }
};

// ✅ Webhook: POST Handler
app.post('/webhook', async (req, res) => {
  const value = req.body.entry?.[0]?.changes?.[0]?.value;
  const message = value?.messages?.[0];
  if (!message) return res.sendStatus(200);

  const phone = message.from;
  const text = message.text?.body?.trim();
  if (!text) return res.sendStatus(200);

  let senderName = 'WhatsApp User';
  if (value.contacts && value.contacts[0] && value.contacts[0].profile) {
    senderName = value.contacts[0].profile.name || 'WhatsApp User';
  }

  if (blacklistedNumbers.includes(phone)) {
    console.log(`⚠️ ब्लॅकलिस्टेड नंबर (${phone}) – मेसेज ब्लॉक केला.`);
    return res.sendStatus(200);
  }

  await processLoanAgentChat(phone, text, senderName);
  res.sendStatus(200);
});

// ✅ Webhook GET Handler (Verification)
app.get('/webhook', (req, res) => {
  const verify_token = process.env.VERIFY_TOKEN;
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
  res.send('✅ LoanHelpline Bot (Instant Lead Saving + Update) चालू आहे');
});

// ✅ Start Server
app.listen(port, () => {
  console.log(`✅ LoanHelpline Bot चालू आहे पोर्ट ${port}`);
});
