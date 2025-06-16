const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
require('dotenv').config();
const { appendToSheet } = require('./googleSheet');

const app = express();
app.use(bodyParser.json());

// ✅ Render साठी health check route
app.get('/healthz', (req, res) => {
    res.status(200).send('OK');
});

// ✅ Webhook GET verification route (Meta callback)
app.get('/webhook', (req, res) => {
    const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    console.log("Webhook GET called");
    console.log({ mode, token, VERIFY_TOKEN });

    if (mode && token) {
        if (mode === 'subscribe' && token === VERIFY_TOKEN) {
            console.log('WEBHOOK_VERIFIED');
            res.status(200).send(challenge);
        } else {
            console.log('❌ Token mismatch');
            res.sendStatus(403);
        }
    }
});

// ✅ Webhook POST handler (WhatsApp message receive)
app.post('/webhook', async (req, res) => {
    const body = req.body;

    if (body.object) {
        const entry = body.entry?.[0];
        const changes = entry?.changes?.[0];
        const message = changes?.value?.messages?.[0];
        const phone_number_id = changes?.value?.metadata?.phone_number_id;
        const from = message?.from;
        const msg_body = message?.text?.body;

        if (msg_body) {
            let reply = '';

            if (/^\d+$/.test(msg_body)) {
                const choice = parseInt(msg_body.trim());
                switch (choice) {
                    case 1:
                        reply = "🏠 आपण निवडलं आहे: Home Loan\n\n✅ Eligibility साठी माहिती पाठवा:\n- 🧾 Monthly Income\n- 📍 Property Location\n- 💰 Loan Amount";
                        break;
                    case 2:
                        reply = "💼 आपण निवडलं आहे: Personal Loan\n\n✅ Eligibility साठी माहिती पाठवा:\n- 🧾 Monthly Income\n- 📍 Current City\n- 💰 Loan Amount";
                        break;
                    case 3:
                        reply = "🏢 आपण निवडलं आहे: Business Loan\n\n✅ Eligibility साठी माहिती पाठवा:\n- 🧾 Monthly Income\n- 📍 Business Location\n- 💰 Required Loan";
                        break;
                    case 4:
                        reply = "🔁 आपण निवडलं आहे: Balance Transfer\n\n✅ Eligibility साठी माहिती पाठवा:\n- 🧾 Existing Loan EMI\n- 📍 City\n- 💰 Balance Amount";
                        break;
                    default:
                        reply = "❗कृपया 1 ते 4 पैकी एक क्रमांक टाका.";
                }
            } else if (/income|loan|location|amount|city|emi/i.test(msg_body)) {
                reply = "🎉 Thank you!\nतुमची माहिती आम्ही प्राप्त केली आहे. आमचे प्रतिनिधी लवकरच संपर्क करतील.";
                await appendToSheet(from, msg_body);
            } else {
                reply = "🙏 Loan Helpline वर आपले स्वागत आहे!\n\nPlease select the type of loan:\n1️⃣ Home Loan\n2️⃣ Personal Loan\n3️⃣ Business Loan\n4️⃣ Balance Transfer\n\n👉 कृपया एक क्रमांक टाका (1/2/3/4)";
            }

            await axios.post(`https://graph.facebook.com/v18.0/${phone_number_id}/messages`, {
                messaging_product: 'whatsapp',
                to: from,
                text: { body: reply }
            }, {
                headers: {
                    Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`
                }
            });
        }

        res.sendStatus(200);
    } else {
        res.sendStatus(404);
    }
});

// ✅ Server सुरू करा
app.listen(process.env.PORT || 3000, () => {
    console.log('✅ Server is running...');
});
