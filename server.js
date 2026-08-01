const express = require('express');
const bodyParser = require('body-parser');
const { appendToSheet } = require('./googleSheet');

const app = express();
app.use(bodyParser.json());

const PORT = process.env.PORT || 10000;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN || 'loanhelpline_secure_token';

// 1. Webhook Verification (GET)
app.get('/webhook', (req, res) => {
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
  } else {
    res.sendStatus(400);
  }
});

// 2. Handle Incoming Messages (POST)
app.post('/webhook', async (req, res) => {
  const body = req.body;

  if (body.object === 'whatsapp_business_account') {
    for (const entry of body.entry) {
      for (const change of entry.changes) {
        if (change.value && change.value.messages) {
          const phone = change.value.messages[0].from;
          const msg_body = change.value.messages[0].text ? change.value.messages[0].text.body : '';

          console.log(`Received message: ${msg_body} from ${phone}`);
          
          // जुन्या पद्धतीनुसार डेटा शीटमध्ये टाकणे
          await appendToSheet(phone, msg_body);
        }
      }
    }
    res.status(200).send('EVENT_RECEIVED');
  } else {
    res.sendStatus(404);
  }
});

app.get('/', (req, res) => {
  res.send('✅ LoanHelpline Bot चालू आहे!');
});

app.listen(PORT, () => {
  console.log(`✅ LoanHelpline Bot चालू आहे पोर्ट ${PORT}`);
});
