const { OpenAI } = require('openai');
const { SYSTEM_PROMPT } = require('../reference/promptData');
const PRODUCT_DATABASE = require('../db/productInfo.js');
const { getHistory } = require('./messageHistory');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function processMessage(senderId, message) {
  try {
    const analysis = await analyzeMessage(senderId, message);
    if (analysis.intent === 'image') {
      const { product, category } = analysis.entities;
      const image = await searchProduct(PRODUCT_DATABASE, product, category);
      if (image) {
        return { type: 'image', image_url: image.image_url };
      } else {
        return { type: 'text', content: 'Không tìm thấy ảnh, vui lòng chọn sản phẩm khác ạ' };
      }
    } else if (analysis.intent === 'product_details') {
      const { product, category } = analysis.entities;
      const targetProduct = await searchProduct(PRODUCT_DATABASE, product, category);
      if (targetProduct) {
        return { type: 'text', content: targetProduct.product_details };
      } else {
        return { type: 'text', content: 'Không tìm thấy sản phẩm, vui lòng tìm sản phẩm khác ạ' };
      }
    } else {
      const messages = [{ role: 'system', content: SYSTEM_PROMPT }, ...(await getHistory(senderId)).slice(-6)];
      const chatResponse = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages,
        max_tokens: 150
      });
      const responseText = chatResponse.choices[0].message.content.trim();
      return { type: 'text', content: responseText };
    }
  } catch (error) {
    console.error('Error processing message:', error);
    return { type: 'text', content: 'Sorry, something went wrong!' };
  }
}

async function analyzeMessage(senderId, message) {
  const messages = [{ role: 'system', content: SYSTEM_PROMPT }, ...(await getHistory(senderId)).slice(-6)];
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

    Return a JSON object with intent and entities (product and category).
    Example output: { "intent": "product_details", "entities": { "product": "Đầm Midi", "category": "Áo Quần" } }
    If no product or category is identified, return empty strings for those fields.
  `;
  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }],
    response_format: { type: 'json_object' },
  });

  console.log(response.choices[0].message.content);
  return JSON.parse(response.choices[0].message.content);
}

async function searchProduct(database, product, category) {
  const cat = category.toLowerCase();
  const prod = product.toLowerCase();
  return database.find(item =>
    item.category.toLowerCase() === cat &&
    item.product.toLowerCase() === prod
  ) || null;
}

module.exports = { processMessage };