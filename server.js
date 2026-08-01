const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const { appendToSheet } = require('./googleSheet');

const app = express();
app.use(bodyParser.json());

const PORT = process.env.PORT || 10000;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN || 'loanhelpline_secure_token';
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;

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

// WhatsApp वर युजरला रिप्लाय पाठवणारे फंक्शन
async function sendWhatsAppMessage(recipientPhone, messageText) {
  try {
    if (!WHATSAPP_TOKEN || !PHONE_NUMBER_ID) {
      console.log('⚠️ WhatsApp Token or Phone ID is missing in environment variables.');
      return;
    }
    await axios({
      method: 'POST',
      url: `https://graph.facebook.com/v17.0/${PHONE_NUMBER_ID}/messages`,
      headers: {
        Authorization: `Bearer ${WHATSAPP_TOKEN}`,
        'Content-Type': 'application/json',
      },
      data: {
        messaging_product: 'whatsapp',
        to: recipientPhone,
        text: { body: messageText },
      },
    });
    console.log('✅ WhatsApp Reply Sent Successfully');
  } catch (error) {
    console.error('❌ Error sending WhatsApp message:', error.response?.data || error.message);
  }
}

// 2. Handle Incoming Messages (POST)
app.post('/webhook', async (req, res) => {
  try {
    const body = req.body;

    if (body.object === 'whatsapp_business_account') {
      for (const entry of body.entry) {
        for (const change of entry.changes) {
          if (change.value && change.value.messages) {
            const messageObj = change.value.messages[0];
            const phone = messageObj.from; // मोबाईल नंबर (हा अचूक नंबर आहे)
            
            // युजरचे नाव शोधणे (नसेल तर मोबाईल नंबर किंवा 'WhatsApp User' ठेवणे)
            let senderName = 'WhatsApp User';
            if (change.value.contacts && change.value.contacts[0] && change.value.contacts[0].profile) {
              senderName = change.value.contacts[0].profile.name || 'WhatsApp User';
            }

            const msg_body = messageObj.text ? messageObj.text.body : '';

            console.log(`Received message: ${msg_body} from ${phone} (${senderName})`);
            
            // 📊 गुगल शीटमध्ये अचूक पाठवणे: (Name, Phone, Message)
            // इथे आपण खात्रीशीरपणे Phone च्या जागी 'phone' व्हेरिएबल पाठवत आहोत जेणेकरून तो कॉलम C मध्येच जाईल.
            await appendToSheet(senderName, phone, msg_body);

            // 🤖 WhatsApp वर युजरला ऑटोमॅटिक रिप्लाय पाठवणे
            const replyText = `नमस्कार! LoanHelpline मध्ये आपले स्वागत आहे. आपला मेसेज मिळाला आहे. आमचे प्रतिनिधी लवकरच आपल्याशी संपर्क साधतील.`;
            await sendWhatsAppMessage(phone, replyText);
          }
        }
      }
      res.status(200).send('EVENT_RECEIVED');
    } else {
      res.sendStatus(404);
    }
  } catch (error) {
    console.error('❌ Webhook Error:', error);
    res.sendStatus(500);
  }
});

app.get('/', (req, res) => {
  res.send('✅ LoanHelpline Bot चालू आहे!');
});

app.listen(PORT, () => {
  console.log(`✅ LoanHelpline Bot चालू आहे पोर्ट ${PORT}`);
});
