const express = require('express');
const bodyParser = require('body-parser');
const { createPendingLead, appendToSheet } = require('./googleSheet');

const app = express();
app.use(bodyParser.json());

const PORT = process.env.PORT || 10000;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN || 'loanhelpline_secure_token';

// 1. WhatsApp Webhook Verification (GET)
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

// 2. Handle Incoming WhatsApp Messages (POST)
app.post('/webhook', async (req, res) => {
  try {
    const body = req.body;

    if (body.object === 'whatsapp_business_account') {
      for (const entry of body.entry) {
        for (const change of entry.changes) {
          if (change.value && change.value.messages) {
            const messageObj = change.value.messages[0];
            const senderPhone = messageObj.from; // युजरचा मोबाईल नंबर
            
            // युजरचे नाव मिळवणे (नसेल तर 'Unknown' ठेवणे)
            let senderName = 'Unknown';
            if (change.value.contacts && change.value.contacts[0] && change.value.contacts[0].profile) {
              senderName = change.value.contacts[0].profile.name || 'Unknown';
            }

            const messageBody = messageObj.text ? messageObj.text.body : '';

            console.log(`📩 New message from ${senderPhone} (${senderName}): ${messageBody}`);

            // 🚀 इन्स्टंट लीड सेव्ह करणे: युजर मेसेज करताच शीटमध्ये 'Pending' स्टेटससह ओळ तयार होईल
            await createPendingLead(senderPhone, senderName);

            // टीप: जर तुम्हाला संपूर्ण चॅट संपल्यानंतर अंतिम डेटा सेव्ह करायचा असेल, तर 'appendToSheet' पुढे वापरू शकता.
          }
        }
      }
      res.status(200).send('EVENT_RECEIVED');
    } else {
      res.sendStatus(404);
    }
  } catch (error) {
    console.error('❌ Error handling webhook:', error);
    res.status(500).send('Internal Server Error');
  }
});

// Root Route
app.get('/', (req, res) => {
  res.send('✅ LoanHelpline Bot (Loan Expert AI Agent) चालू आहे!');
});

app.listen(PORT, () => {
  console.log(`✅ LoanHelpline Bot चालू आहे पोर्ट ${PORT}`);
});
