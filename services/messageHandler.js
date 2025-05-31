const axios = require('axios');
const { OpenAI } = require('openai');
const { SYSTEM_PROMPT } = require('../reference/promptData');
const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const pool = require('../db/pool.js');

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
const userRequestMap = new Map();

function isRateLimited(userId) {
  const now = Date.now();
  const timeWindow = 60 * 1000;
  const maxRequests = 5;
  if (!userRequestMap.has(userId)) userRequestMap.set(userId, []);
  const timestamps = userRequestMap.get(userId).filter(ts => now - ts < timeWindow);
  timestamps.push(now);
  userRequestMap.set(userId, timestamps);
  return timestamps.length > maxRequests;
}

async function storeMessage(senderId, role, content) {
  if (!pool) {
    console.error('Database pool is undefined');
    return;
  }
  try {
    await pool.query(
      'INSERT INTO pool.history (sender_id, role, content, timestamp) VALUES ($1, $2, $3, $4)',
      [senderId, role, content, Date.now()]
    );
  } catch (error) {
    console.error('PostgreSQL Store Error:', error);
  }
}

async function getHistory(senderId) {
  if (!pool) {
    console.error('Database pool is undefined');
    return [];
  }
  try {
    const result = await pool.query(
      'SELECT role, content FROM pool.history WHERE sender_id = $1 ORDER BY timestamp DESC LIMIT 4',
      [senderId]
    );
    return result.rows.map(row => ({ role: row.role, content: row.content })).reverse();
  } catch (error) {
    console.error('PostgreSQL Fetch Error:', error);
    return [];
  }
}

async function handleMessage(event) {
  const senderId = event.sender.id;
  const message = event.message.text?.toLowerCase().trim();
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
    if (isRateLimited(senderId)) {
      responseText = 'You are sending messages too fast. Please wait a minute before trying again.';
    } else {
      try {
        // Initialize system message if no history exists
        const history = await getHistory(senderId);
        if (!history.length) {
          await storeMessage(senderId, 'system', SYSTEM_PROMPT);
        }

        // Store user message
        await storeMessage(senderId, 'user', message);

        // Get last 4 messages (system + 2 user/assistant pairs)
        const messages = [{ role: 'system', content: SYSTEM_PROMPT }, ...(await getHistory(senderId)).slice(-4)];

        // Get ChatGPT response
        const chatResponse = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages,
          max_tokens: 150
        });
        responseText = chatResponse.choices[0].message.content.trim();
        console.log(responseText);
        // Store assistant response
        await storeMessage(senderId, 'assistant', responseText);
      } catch (error) {
        console.error('OpenAI Error:', error);
        responseText = 'Sorry, something went wrong. Try typing "help" for options.';
      }
    }
  }
  sendMessage(senderId, responseText);
}

function handlePostback(event) {
  const senderId = event.sender.id;
  const payload = event.postback.payload;
  const responseText = `Received postback: ${payload}. Try typing "help" for more options.`;
  sendMessage(senderId, responseText);
}

async function sendMessage(recipientId, messageText) {
  const messageData = {
    recipient: { id: recipientId },
    message: { text: messageText.slice(0, 640) } // FB limits to 640 chars
  };
 // Dedupe method: To prevent duplicate messages, the request will be ignored if a message with the same content was sent within the last 10 minutes.
  try {
    await axios.post('https://graph.facebook.com/v21.0/me/messages', messageData, {
      headers: {
        'Authorization': `Bearer ${PAGE_ACCESS_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    console.error('Facebook API Error:', error);
  }
}

module.exports = { handleMessage, handlePostback };