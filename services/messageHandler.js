const axios = require('axios');
const { OpenAI } = require('openai');
const { SYSTEM_PROMPT } = require('../reference/promptData');
const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const pool = require('../db/pool.js');
const PRODUCT_DATABASE = require('../db/productInfo.js');

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
      'SELECT role, content FROM pool.history WHERE sender_id = $1 ORDER BY timestamp DESC LIMIT 6',
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

        const response = processMessage(senderId, message)

        // // Get last 6  messages (system + 3 user/assistant pairs)
        // const messages = [{ role: 'system', content: SYSTEM_PROMPT }, ...(await getHistory(senderId)).slice(-6)];

        // // Get ChatGPT response
        // const chatResponse = await openai.chat.completions.create({
        //   model: 'gpt-4o-mini',
        //   messages,
        //   max_tokens: 150
        // });
        // responseText = chatResponse.choices[0].message.content.trim();
        // console.log(responseText);
        // // Store assistant response
        // await storeMessage(senderId, 'assistant', responseText);

        // Store response
        await storeMessage(senderId, 'assitant', response);

        // Send response to user
        await sendResponse(senderId, response);
      } catch (error) {
        console.error('OpenAI Error:', error);
        responseText = 'Sorry, something went wrong. Try typing "help" for options.';
      }
    }
  }
  sendMessage(senderId, responseText);
}

async function processMessage(senderId, message)
{
  try {
    const analysis = analyzeMessage(senderId, message)
    if (analysis.intent === 'image')
    {
      const {product, category} = analysis.entities;
      const image = searchProduct(PRODUCT_DATABASE, product, category);
      if(image)
      {
        return({type: 'image', image_url: image.image_url})
      }
      else
      {
        return({type:'text', content:'Không tìm thấy ảnh, vui lòng chọn sản phẩm khác ạ'})
      }
      
    }
    else if (analysis.intent === 'product_details')
    {
      const {product, category} = analysis.entities;
      const targetProduct = searchProduct(PRODUCT_DATABASE, product, category);
      if(targetProduct)
      {
        return({type: 'text', content: targetProduct.product_details})
      }
      else
      {
        return({type: 'text', content: 'Không tìm thấy sản phẩm, vui lòng tìm sản phẩm khác ạ'})
      }
    }
    else
    {
      const chatResponse = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages,
        max_tokens: 150
      });
      responseText = chatResponse.choices[0].message.content.trim();
      console.log(responseText);
      return({type: 'text', content: responseText});
    }

  } catch (error) {
    console.error('Error processing message:', error);
  }
}

async function searchProduct(database, product, category)
{
  const cat = category.toLowerCase();
  const prod = product.toLowerCase();

  return database.find(item =>
    item.category.toLowerCase() === cat &&
    item.product.toLowerCase() === prod
  ) || null;
}

async function analyzeMessage(senderId, message)
{
  var messages = [{ role: 'system', content: SYSTEM_PROMPT }, ...(await getHistory(senderId)).slice(-6)];

  const result = PRODUCT_DATABASE;
  const productContext = JSON.stringify(
    [...new Set(result.rows.map(r => r.category))].map(category => ({
      category,
      products: result.rows
        .filter(r => r.category === category)
        .map(p => ({
          product: p.product,
          synonyms: p.synonyms,
        })),
    }))
  );

  const prompt = `
  Analyze the user message: ${message}
  Context history: ${messages}
  product context: ${productContext}


  Determine the user intent: 
    - "image" : if user wants to ask for the picture
    - "product_details" : if user wants to know the spec of the product
    - "general" : for other query

  Extract entities:
    - product: the specific product mentioned (e.g., "phone", "shirt"), or empty string if none. Use the last product from history if the message refers to it (e.g., "it" or "that product").
    - category: the product category mentioned (e.g., "electronics", "clothing"), or empty string if none.
 
    Consider synonyms, misspellings, and natural language variations of the local Vietnamese (e.g 'đầm' or 'váy' has the same meaning).
    Follow the communication style in the history (or default prompt if history is empty): friendly, professional, use Vietnamese, polite.

    Consider synonyms, misspellings, and natural language variations of the local Vietnamese (e.g 'đầm' or 'váy' has the same meaning).
    Follow the communication style in the history (or default prompt if history is empty): friendly, professional, clear Vietnamese, polite, using the name TG Business.
    Return a JSON object with intent and entities (product and category).
    Example output: { "intent": "product_details", "entities": { "product": "Đầm Midi", "category": "Áo Quần" } }
    If no product or category is identified, return empty strings for those fields.

  `
  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }],
    response_format: { type: 'json_object' },
  });


  console.log(response.choices[0].message.content);
  return JSON.parse(response.choices[0].message.content);

}


// async function sendMessage(recipientId, messageText) {
//   const messageData = {
//     recipient: { id: recipientId },
//     message: { text: messageText.slice(0, 640) } // FB limits to 640 chars
//   };
//  // Dedupe method: To prevent duplicate messages, the request will be ignored if a message with the same content was sent within the last 10 minutes.
//   try {
//     await axios.post('https://graph.facebook.com/v21.0/me/messages', messageData, {
//       headers: {
//         'Authorization': `Bearer ${PAGE_ACCESS_TOKEN}`,
//         'Content-Type': 'application/json'
//       }
//     });
//   } catch (error) {
//     console.error('Facebook API Error:', error);
//   }
// }

async function sendResponse(senderId, response)
{
  const url = `https://graph.facebook.com/v21.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`;
  let payload;
  if(response.type === 'image')
  {
    payload = {
      recipient: { id: senderId },
      message: {
        attachment: {
          type: 'image',
          payload: { url: response.image_url },
        },
      },
    };
  }
  else
  {
    payload = {
      recipient: { id: senderId },
      message: { text: response.content },
    };
  }
  try {
    await axios.post(url, payload);
  } catch (error) {
    console.error('Error sending response:', error);
  }
}


function handlePostback(event) {
  const senderId = event.sender.id;
  const payload = event.postback.payload;
  const responseText = `Received postback: ${payload}. Try typing "help" for more options.`;
  sendMessage(senderId, responseText);
}

module.exports = { handleMessage, handlePostback };