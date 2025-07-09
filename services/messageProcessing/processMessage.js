const { handleIntent } = require('./intentHandler');
const { getSystemPrompt } = require('../../reference/promptData');
const { getProductDatabase } = require('../../db/productInfo');
const { analyzeMessage } = require('./messageAnalyzer');

async function processMessage(senderId, message) {
  const SYSTEM_PROMPT = getSystemPrompt();
  const PRODUCT_DATABASE = getProductDatabase();
  try {
    const analysis = await analyzeMessage(senderId, message);
    return await handleIntent(analysis, message, senderId, PRODUCT_DATABASE, SYSTEM_PROMPT);
  } catch (error) {
    console.error('Error processing message:', error);
    return { type: 'text', content: 'Sorry, something went wrong!' };
  }
}

module.exports = { processMessage };