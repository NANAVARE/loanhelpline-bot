const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const { appendToSheet } = require('./sheet'); // तुमचं Google Sheet code

const app = express();
app.use(bodyParser.json());

const userState = {}; // युजरची state (context) track करायला

// ✅ Health Check
app.get('/healthz', (req, res) => {
  res.status(200).send('OK');
});

// ✅ Webhook Verification (GET)
app.get('/webhook', (req, res) => {
  const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode && token) {
    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      console.log('WEBHOOK_VERIFIED');
      res.status(200).send(challenge);
    } else {
      res.sendStatus(403);
    }
  }
});

// ✅ Webhook Message Handler (POST)
app.post('/webhook', async (req, res) => {
  try {
    const entry = req.body.entry?.[0];
    const changes = entry?.changes?.[0];
    const message = changes?.value?.messages?.[0];

    if (!message) return res.sendStatus(200);

    const from = message.from;
    const msg_body = message.text?.body.trim();
    const phone_number_id = changes.value.metadata.phone_number_id;

    let reply = '';
    const state = userState[from] || {};

    // Step 1: Start
    if (!state.step && /hi|hello|loan|apply/i.test(msg_body)) {
      reply = `🙏 Loan Helpline वर आपले स्वागत आहे! कृपया खालीलपैकी एक पर्याय निवडा:
1️⃣ Home Loan
2️⃣ Personal Loan
3️⃣ Balance Transfer
4️⃣ Business Loan
5️⃣ Mortgage Loan

कृपया फक्त क्रमांक टाका (उदा: 1)`;
      userState[from] = { step: 'awaiting_loan_type' };
    }

    // Step 2: Loan type निवडलं
    else if (state.step === 'awaiting_loan_type' && /^[1-5]$/.test(msg_body)) {
      const loanTypes = {
        1: 'Home Loan',
        2: 'Personal Loan',
        3: 'Balance Transfer',
        4: 'Business Loan',
        5: 'Mortgage Loan'
      };
      const selected = loanTypes[msg_body];
      reply = `📝 कृपया तुमचं मासिक उत्पन्न सांगा (उदा: ₹30000)`;
      userState[from] = {
        step: 'awaiting_income',
        loanType: selected
      };
    }

    // Step 3: Income दिलं
    else if (state.step === 'awaiting_income') {
      reply = `🌍 तुमचं शहर/गाव सांगा (उदा: Pune)`;
      userState[from].income = msg_body;
      userState[from].step = 'awaiting_city';
    }

    // Step 4: शहर दिलं
    else if (state.step === 'awaiting_city') {
      reply = `💰 तुम्हाला किती लोन हवं आहे? (उदा: ₹15 लाख)`;
      userState[from].city = msg_body;
      userState[from].step = 'awaiting_amount';
    }

    // Step 5: Amount दिलं
    else if (state.step === 'awaiting_amount') {
      userState[from].amount = msg_body;

      // Google Sheet मध्ये send करा
      await appendToSheet(
        from,
        userState[from].loanType,
        userState[from].income,
        userState[from].city,
        userState[from].amount
      );

      reply = `🎉 धन्यवाद! तुमचं ${userState[from].loanType} अर्ज प्राप्त झाला आहे. आमचे प्रतिनिधी लवकरच संपर्क करतील.`;
      delete userState[from]; // Reset conversation
    }

    // काहीही वेगळं आलं तर
    else {
      reply = `🙏 Loan Helpline वर आपले स्वागत आहे! कृपया खालीलपैकी एक पर्याय निवडा:
1️⃣ Home Loan
2️⃣ Personal Loan
3️⃣ Balance Transfer
4️⃣ Business Loan
5️⃣ Mortgage Loan

कृपया फक्त क्रमांक टाका (उदा: 1)`;
      userState[from] = { step: 'awaiting_loan_type' };
    }

    // WhatsApp ला reply पाठवा
    await axios.post(`https://graph.facebook.com/v18.0/${phone_number_id}/messages`, {
      messaging_product: 'whatsapp',
      to: from,
      text: { body: reply }
    }, {
      headers: {
        Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`
      }
    });

    res.sendStatus(200);
  } catch (err) {
    console.error('❌ Webhook error:', err.message);
    res.sendStatus(500);
  }
});

// ✅ Server चालू करा
app.listen(process.env.PORT || 3000, () => {
  console.log('✅ LoanHelpline Bot चालू आहे...');
});
