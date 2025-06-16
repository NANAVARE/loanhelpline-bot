const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
require('dotenv').config();
const { appendToSheet } = require('./googleSheet');

const app = express();
app.use(bodyParser.json());

const sessions = {}; // 👉 प्रत्येक युजरसाठी स्टेट ट्रॅक करण्यासाठी

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

app.post('/webhook', async (req, res) => {
    const body = req.body;

    if (body.object) {
        const entry = body.entry?.[0];
        const changes = entry?.changes?.[0];
        const message = changes?.value?.messages?.[0];
        const phone_number_id = changes?.value?.metadata?.phone_number_id;
        const from = message?.from;
        const msg_body = message?.text?.body?.trim();

        let reply = "";
        let user = sessions[from] || { step: 0, loanType: "", income: "", city: "", amount: "" };

        if (/^(hi|hello|loan|i want to apply for a loan)$/i.test(msg_body)) {
            reply = "Loan Helpline वर आपले स्वागत आहे! 🙏\n\nकृपया खालीलपैकी एक पर्याय निवडा:\n1️⃣ Home Loan\n2️⃣ Personal Loan\n3️⃣ Balance Transfer\n4️⃣ Business Loan\n5️⃣ Mortgage Loan\n\n👉 कृपया फक्त क्रमांक पाठवा (उदा. 1)";
            user = { step: 1 };
        }

        else if (user.step === 1 && /^[1-5]$/.test(msg_body)) {
            const loanOptions = {
                1: "Home Loan",
                2: "Personal Loan",
                3: "Balance Transfer",
                4: "Business Loan",
                5: "Mortgage Loan"
            };
            user.loanType = loanOptions[msg_body];
            reply = "📝 कृपया तुमचं मासिक उत्पन्न सांगा (उदा: ₹30000)";
            user.step = 2;
        }

        else if (user.step === 2) {
            user.income = msg_body;
            reply = "🌍 तुमचं शहर/गाव सांगा (उदा: Pune)";
            user.step = 3;
        }

        else if (user.step === 3) {
            user.city = msg_body;
            reply = "💰 तुम्हाला किती लोन हवं आहे? (उदा: ₹15 लाख)";
            user.step = 4;
        }

        else if (user.step === 4) {
            user.amount = msg_body;
            reply = "🎉 धन्यवाद! तुमचं लोन अर्ज आम्ही प्राप्त केलं आहे. आमचे प्रतिनिधी लवकरच संपर्क करतील.";
            user.step = 0;

            // ✅ Google Sheet मध्ये साठवा
            const fullLead = `Loan Type: ${user.loanType}, Income: ${user.income}, City: ${user.city}, Amount: ${user.amount}`;
            await appendToSheet(from, fullLead);
        }

        else {
            reply = "🙏 Loan Helpline वर आपले स्वागत आहे!\n\nकृपया खालीलपैकी एक पर्याय निवडा:\n1️⃣ Home Loan\n2️⃣ Personal Loan\n3️⃣ Balance Transfer\n4️⃣ Business Loan\n5️⃣ Mortgage Loan\n\n👉 कृपया फक्त क्रमांक पाठवा (उदा. 1)";
            user = { step: 1 };
        }

        sessions[from] = user;

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
    } else {
        res.sendStatus(404);
    }
});

app.listen(process.env.PORT || 3000, () => {
    console.log('✅ Server is running...');
});
