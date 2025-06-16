const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
require('dotenv').config();
const { appendToSheet } = require('./googleSheet');

const app = express();
app.use(bodyParser.json());

const userState = {}; // 🔁 प्रत्येक युजरसाठी conversation state ठेवतो

app.get('/healthz', (req, res) => {
    res.status(200).send('OK');
});

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

        if (!msg_body) return res.sendStatus(200);

        let reply = '';
        const state = userState[from] || { step: 0, loanType: '', income: '', city: '', amount: '' };

        // 🔁 Step-by-step flow
        if (state.step === 0) {
            if (/hi|hello|loan|apply/i.test(msg_body)) {
                reply = `Loan Helpline वर आपले स्वागत आहे! 🙏\n\nकृपया खालीलपैकी एक पर्याय निवडा:\n1️⃣ Home Loan\n2️⃣ Personal Loan\n3️⃣ Balance Transfer\n4️⃣ Business Loan\n5️⃣ Mortgage Loan\n\n👉 कृपया फक्त क्रमांक पाठवा (उदा. 1)`;
                state.step = 1;
            } else {
                reply = `🙏 Loan Helpline वर आपले स्वागत आहे!\n\nकृपया loan type निवडण्यासाठी 'loan' किंवा 'hi' असा मेसेज पाठवा.`;
            }
        } else if (state.step === 1) {
            const loans = {
                1: 'Home Loan',
                2: 'Personal Loan',
                3: 'Balance Transfer',
                4: 'Business Loan',
                5: 'Mortgage Loan',
            };
            const choice = parseInt(msg_body);
            if (loans[choice]) {
                state.loanType = loans[choice];
                reply = `📝 कृपया तुमचं मासिक उत्पन्न सांगा (उदा: ₹30000)`;
                state.step = 2;
            } else {
                reply = `❗ कृपया वैध loan प्रकार निवडा (1 ते 5 पैकी एक क्रमांक).`;
            }
        } else if (state.step === 2) {
            state.income = msg_body;
            reply = `🌍 तुमचं शहर/गाव सांगा (उदा: Pune)`;
            state.step = 3;
        } else if (state.step === 3) {
            state.city = msg_body;
            reply = `💰 तुम्हाला किती लोन हवं आहे? (उदा: ₹15 लाख)`;
            state.step = 4;
        } else if (state.step === 4) {
            state.amount = msg_body;
            reply = `🎉 धन्यवाद! तुमचं ${state.loanType} अर्ज आम्ही प्राप्त केलं आहे. आमचे प्रतिनिधी लवकरच संपर्क करतील.`;

            // ✅ Google Sheet ला माहिती पाठवा
            await appendToSheet(from, `${state.loanType} | Income: ${state.income} | City: ${state.city} | Amount: ${state.amount}`);

            // ✅ reset state
            userState[from] = { step: 0 };
        }

        // Store updated state
        userState[from] = state;

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
