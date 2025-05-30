const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
  res.render('public/index', { PAGE_ID: process.env.PAGE_ACCESS_TOKEN });
});

router.get('/privacy', (req, res) => {
  res.render('public/privacy');
});

module.exports = router;