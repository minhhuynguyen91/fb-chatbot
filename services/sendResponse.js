const axios = require('axios');

const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;

let limit;
(async () => {
  const pLimit = (await import('p-limit')).default;
  limit = pLimit(5); // Adjust concurrency here
})();

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Wrapped POST function with retry + throttling
async function postWithLimit(url, payload) {
  while (!limit) await delay(10); // Wait until p-limit is loaded

  return limit(async () => {
    try {
      const response = await axios.post(url, payload);
      return response.data;
    } catch (error) {
      const data = error.response?.data || error.message;
      console.error('❌ Facebook API error:', data);

      // Retry logic on rate-limit errors
      if (error.response?.status === 429 || data?.error?.code === 613) {
        console.log('⏳ Rate limit hit. Retrying after 1s...');
        await delay(1000);
        return postWithLimit(url, payload);
      }

      throw error;
    }
  });
}

async function sendResponse(senderId, response) {
  const url = `https://graph.facebook.com/v21.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`;
  let payload;

  if (response.type === 'image') {
    payload = {
      recipient: { id: senderId },
      message: {
        attachment: {
          type: 'image',
          payload: {
            url: response.image_url,
            is_reusable: true
          },
        },
      },
    };
  } else if (response.type === 'order') {
    payload = {
      messaging_type: "MESSAGE_TAG",
      recipient: { id: senderId },
      message: { text: response.content },
      tag: "POST_PURCHASE_UPDATE",
    };
  } else {
    payload = {
      messaging_type: "RESPONSE",
      recipient: { id: senderId },
      message: { text: response.content },
    };
  }

  console.log('Sending payload:', JSON.stringify(payload, null, 2));
  return await postWithLimit(url, payload);
}

async function sendMessage(recipientId, messageText) {
  const url = `https://graph.facebook.com/v21.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`;
  const payload = {
    messaging_type: "RESPONSE",
    recipient: { id: recipientId },
    message: { text: messageText.slice(0, 640) }
  };

  return await postWithLimit(url, payload);
}

module.exports = { sendResponse, sendMessage };