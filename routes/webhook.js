const express = require('express');
const { handleMessage, handlePostback } = require('../services/messageHandler');
const router = express.Router();

const VERIFY_TOKEN = process.env.VERIFY_TOKEN;

// Webhook verification endpoint
router.get('/', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

router.post('/', async (req, res) => {
  const body = req.body;
  if (body.object === 'page') {
    const promises = [];
    body.entry.forEach(entry => {
      if (entry.messaging) {
        entry.messaging.forEach(event => {
          if (event.message) {
            promises.push(handleMessage(event));
          } else if (event.postback) {
            promises.push(handlePostback(event));
          }
        });
      }
      if (entry.changes) {
        entry.changes.forEach(change => {
          if (change.field === 'feed' && change.value.verb === 'add' && change.value.item === 'comment') {
            const senderId = change.value.from.id;
            const commentText = change.value.message;
            const event = {
              sender: { id: senderId },
              message: { mid: `${senderId}_${Date.now()}`, text: commentText },
            };
            promises.push(handleMessage(event));
          }
        });
      }
    });
    try {
      await Promise.all(promises);
      res.status(200).send('EVENT_RECEIVED');
    } catch (error) {
      console.error('Error processing webhook events:', error);
      res.status(500).send('ERROR_PROCESSING');
    }
  } else {
    res.sendStatus(404);
  }
});

module.exports = router;