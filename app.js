require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const crypto = require('crypto');
const webhookRoutes = require('./routes/webhook');
const pageRoutes = require('./routes/page');

const app = express();
const APP_SECRET = process.env.APP_SECRET_KEY;

app.use(express.static('public'));
app.set('view engine', 'ejs');

// Middleware for signature verification
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

// Routes
app.use('/', pageRoutes);
app.use('/webhook', webhookRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err.message);
  res.status(500).send('Something went wrong!');
});

module.exports = app;