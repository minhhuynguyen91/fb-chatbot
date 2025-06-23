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

function cleanAndSplitLines(str) {
  return str
    .split(/\r?\n/)                // Split by line breaks (handles \n and \r\n)
    .map(line => line.trim())      // Trim each line
    .filter(line => line.length);  // Remove empty lines
}

async function sendImagesInBatch(senderId, imageUrls) {
  imageUrls = cleanAndSplitLines(imageUrls);
  console.log(imageUrls);
  try {
    for (const imageUrl of imageUrls) {
      await sendImage(senderId, imageUrl); // Uses postWithLimit inside sendImage
      await delay(500); // Avoid rate limits
    }
    console.log('All images sent successfully!');
  } catch (error) {
    console.error('Failed to send images:', error);
  }
}

async function sendImage(senderId, imageUrl) {
  const payload = {
    recipient: { id: senderId },
    message: {
      attachment: {
        type: 'image',
        payload: { url: imageUrl }
      }
    }
  };

  try {
    const url = `https://graph.facebook.com/v21.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`;
    const response = await postWithLimit(url, payload);
    console.log(`Image sent: ${imageUrl}`);
    return response;
  } catch (error) {
    console.error(`Error sending image ${imageUrl}:`, error.response?.data || error.message);
    throw error;
  }
}

async function sendResponse(senderId, response) {
  const url = `https://graph.facebook.com/v21.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`;
  let payload;

  // Batch image sending if image_url is an array
  if (response.type === 'image') {
    await sendMessage(senderId, "Dạ ảnh của bên em đây ạ");
    await sendImagesInBatch(senderId, response.image_url);
    return;

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