const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
  res.render('public/index', { PAGE_ID: process.env.PAGE_ACCESS_TOKEN });
});

router.get('/privacy', (req, res) => {
  res.render('public/privacy');
});

router.get('/robots.txt', (req, res) => {
  res.type('text/plain');
  res.send(`
User-agent: facebookexternalhit
Allow: /

User-agent: Facebot
Allow: /

User-agent: WhatsApp
Allow: /

User-agent: *
Disallow:
  `);
});

module.exports = router;