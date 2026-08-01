const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const { GoogleGenAI } = require('@google/genai'); // Gemini AI SDK
const { appendToSheet } = require('./googleSheet');

const app = express();
app.use(bodyParser.json());

const PORT = process.env.PORT || 10000;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN || 'loanhelpline_secure_token';
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;

// Gemini AI सेट अप (Env मधील GEMINI_API_KEY वापरून)
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

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
      console.log('⚠️ WhatsApp Token or Phone ID is missing.');
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
    console.log('✅ AI Smart WhatsApp Reply Sent Successfully');
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
            const phone = messageObj.from; 
            
            let senderName = 'WhatsApp User';
            if (change.value.contacts && change.value.contacts[0] && change.value.contacts[0].profile) {
              senderName = change.value.contacts[0].profile.name || 'WhatsApp User';
            }

            const msg_body = messageObj.text ? messageObj.text.body : '';
            console.log(`Received message: ${msg_body} from ${phone} (${senderName})`);
            
            // 📊 गुगल शीटमध्ये डेटा सेव्ह करणे (Name, Phone, Message)
            await appendToSheet(senderName, phone, msg_body);

            // 🤖 Gemini AI द्वारे स्मार्ट आणि डायनॅमिक रिप्लाय तयार करणे
            let aiReplyText = '';
            try {
              const prompt = `तू 'LoanHelpline Pune' चा एक अत्यंत हुशार आणि polite लोन अडव्हायझर एआय असिस्टंट आहेस. 
              युजरचे नाव: ${senderName}
              युजरने पाठवलेला मेसेज: "${msg_body}"
              
              या युजरला मराठीमध्ये उत्तम प्रतिसाद दे. जर त्याने फक्त 'hi' किंवा साधे स्वागत केले असेल, तर त्याला लोनच्या सेवांबद्दल (जसे की Personal Loan, Home Loan, Business Loan, Loan Balance Transfer) माहिती विचार आणि त्याला कोणत्या प्रकारचे लोन हवे आहे किंवा किती रक्कम हवी आहे ते नमूद करण्यास सांग. उत्तर खूप लांब नसावे, WhatsApp वर वाचायला सोपे आणि आकर्षक असावे.`;

              const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: prompt,
              });

              aiReplyText = response.text || `नमस्कार ${senderName}! LoanHelpline मध्ये आपले स्वागत आहे. आपल्याला कोणत्या प्रकारचे लोन हवे आहे? (उदा. पर्सनल लोन, होम लोन किंवा बिजनेस लोन)`;
            } else {
              aiReplyText = `नमस्कार ${senderName}! LoanHelpline मध्ये आपले स्वागत आहे. आमचे प्रतिनिधी लवकरच आपल्याशी संपर्क साधतील.`;
            }

            // WhatsApp वर एआयचा रिप्लाय पाठवणे
            await sendWhatsAppMessage(phone, aiReplyText);
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
  res.send('✅ LoanHelpline AI Bot चालू आहे!');
});

app.listen(PORT, () => {
  console.log(`✅ LoanHelpline AI Bot चालू आहे पोर्ट ${PORT}`);
});
