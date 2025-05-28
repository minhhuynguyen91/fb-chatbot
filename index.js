require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const crypto = require('crypto');
const axios = require('axios');
const { OpenAI } = require('openai');
const app = express();
const port = process.env.PORT || 3000;

// Load environment variables
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const APP_SECRET = process.env.APP_SECRET_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// System prompt with business context
const {SYSTEM_PROMPT} = require('./reference/promptData.js')
// const SYSTEM_PROMPT = `
// You are a helpful chatbot for TG Business, you will speak Vietnamese to customer.
// - if customer speak foregin languages say "you don't know".
// - All of the data information is on tgai.vn.
// - Returns: 30-day return policy, contact us by our facebook details.
// - Respond in a friendly, concise tone. If unsure, say: "Let me check that for you!"
// `;

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: OPENAI_API_KEY
});

const userRequestMap = new Map();

function isRateLimited(userId) {
  const now = Date.now();
  const timeWindow = 60 * 1000; // 1 minute
  const maxRequests = 5;

  if (!userRequestMap.has(userId)) {
    userRequestMap.set(userId, []);
  }

  const timestamps = userRequestMap.get(userId);

  // Remove timestamps older than 1 minute
  const recentTimestamps = timestamps.filter(ts => now - ts < timeWindow);
  recentTimestamps.push(now);

  userRequestMap.set(userId, recentTimestamps);

  return recentTimestamps.length > maxRequests;
}

app.use(express.static('public'));
app.set('view engine', 'ejs');

// Middleware
app.use(bodyParser.json({
  verify: (req, res, buf) => {
    const signature = req.headers['x-hub-signature'];
    if (!signature) {
      console.error('No signature provided');
      return;
    }
    const elements = signature.split('=');
    const signatureHash = elements[1];
    const expectedHash = crypto
      .createHmac('sha1', APP_SECRET)
      .update(buf)
      .digest('hex');
    if (signatureHash !== expectedHash) {
      throw new Error('Invalid signature');
    }
  }
}));
app.use(bodyParser.urlencoded({ extended: false }));

// Webhook verification endpoint
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  console.log(`Verification attempt - Expected VERIFY_TOKEN: ${VERIFY_TOKEN}, Received token: ${token}`);
  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('Webhook verified successfully');
    res.status(200).send(challenge);
  } else {
    console.error('Webhook verification failed');
    res.sendStatus(403);
  }
});

// Webhook event handler
app.post('/webhook', (req, res) => {
  const body = req.body;
  if (body.object === 'page') {
    body.entry.forEach(entry => {
      entry.messaging.forEach(event => {
        if (event.message) {
          handleMessage(event);
        } else if (event.postback) {
          handlePostback(event);
        }
      });
    });
    res.status(200).send('EVENT_RECEIVED');
  } else {
    res.sendStatus(404);
  }
});

// Handle incoming messages
async function handleMessage(event) {
  const senderId = event.sender.id;
  const message = event.message.text?.toLowerCase().trim();

  console.log(`Received message from ${senderId}: ${message}`);

  let responseText;

  if (!message) {
    responseText = 'Please send a text message to interact with the bot.';
  } else if (message.includes('help') || message.includes('menu')) {
    responseText = 'Welcome! Type:\n- "info" for bot details\n- "support" for customer service\n- Any message for a smart reply from our AI';
  } else if (message.includes('info')) {
    responseText = 'This is a demo bot powered by ChatGPT, designed to answer your questions and assist via Messenger.';
  } else if (message.includes('support')) {
    responseText = 'Connecting you to our support team... For now, describe your issue, and our AI will assist!';
  } else {
    // Rate limit check
    if (isRateLimited(senderId)) {
      responseText = 'You are sending messages too fast. Please wait a minute before trying again.';
    } else {
      try {
        const chatResponse = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: message }
          ],
          max_tokens: 150
        });
        responseText = chatResponse.choices[0].message.content.trim();
      } catch (error) {
        console.error('OpenAI API error:', error.message);
        responseText = 'Sorry, something went wrong. Try typing "help" for options.';
      }
    }
  }

  sendMessage(senderId, responseText);
}

// Handle postback events
function handlePostback(event) {
  const senderId = event.sender.id;
  const payload = event.postback.payload;

  console.log(`Received postback from ${senderId}: ${payload}`);

  const responseText = `Received postback: ${payload}. Try typing "help" for more options.`;
  sendMessage(senderId, responseText);
}

// Send message to user
async function sendMessage(recipientId, messageText) {
  const messageData = {
    recipient: { id: recipientId },
    message: { text: messageText }
  };

  console.log(`Sending message to ${recipientId}: ${messageText}`);

  try {
    const response = await axios.post('https://graph.facebook.com/v21.0/me/messages', messageData, {
      headers: {
        'Authorization': `Bearer ${PAGE_ACCESS_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });
    console.log(`Message sent successfully to ${recipientId}`);
  } catch (error) {
    console.error('Unable to send message:', error.response ? error.response.data.error : error.message);
  }
}

app.get('/', (req, res) => {
    res.render('public/index', { PAGE_ID: process.env.PAGE_ACCESS_TOKEN });
});

app.get('/privacy', (req, res) => {
    res.render('public/privacy');
});

// Start server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err.message);
  res.status(500).send('Something went wrong!');
});

module.exports = app;