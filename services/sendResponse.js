const axios = require('axios');
const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;

async function sendResponse(senderId, response) {
  const url = `https://graph.facebook.com/v21.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`;
  let payload;
  if (response.type === 'image') {
    payload = {
      recipient: { id: senderId },
      message: {
        attachment: {
          type: 'image',
          payload: { url: response.image_url },
        },
      },
    };
  } else {
    payload = {
      recipient: { id: senderId },
      message: { text: response.content },
    };
  }
  try {
    console.log(payload);
    await axios.post(url, payload);
  } catch (error) {
    console.error('Error sending response:', error);
  }
}

async function sendMessage(recipientId, messageText) {
  const messageData = {
    recipient: { id: recipientId },
    message: { text: messageText.slice(0, 640) }
  };
  try {
    await axios.post(`https://graph.facebook.com/v21.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`, messageData);
  } catch (error) {
    console.error('Facebook API Error:', error);
  }
}

module.exports = { sendResponse, sendMessage };