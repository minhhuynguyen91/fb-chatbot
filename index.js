require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const crypto = require('crypto');
const app = express();
const port = process.env.PORT || 3000;

// Load environment variables
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const APP_SECRET = process.env.APP_SECRET;

// Middleware
app.use(bodyParser.json({
  verify: (req, res, buf) => {
    // Verify webhook signature
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
      // Handle messaging events
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
function handleMessage(event) {
  const senderId = event.sender.id;
  const message = event.message.text;

  console.log(`Received message from ${senderId}: ${message}`);

  // Example: Echo the received message
  sendMessage(senderId, `You said: ${message}`);
}

// Handle postback events
function handlePostback(event) {
  const senderId = event.sender.id;
  const payload = event.postback.payload;

  console.log(`Received postback from ${senderId}: ${payload}`);

  // Handle postback logic here
  sendMessage(senderId, `Received postback: ${payload}`);
}

// Send message to user
function sendMessage(recipientId, messageText) {
  const request = require('request');
  const messageData = {
    recipient: { id: recipientId },
    message: { text: messageText }
  };

  request({
    uri: 'https://graph.facebook.com/v13.0/me/messages',
    qs: { access_token: PAGE_ACCESS_TOKEN },
    method: 'POST',
    json: messageData
  }, (error, response, body) => {
    if (!error && response.statusCode === 200) {
      console.log('Message sent successfully');
    } else {
      console.error('Unable to send message:', error || body.error);
    }
  });
}

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