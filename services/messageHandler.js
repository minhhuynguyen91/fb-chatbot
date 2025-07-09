const { processedMessages, pendingEvents, MESSAGE_TIMEOUT } = require('./messageHandler/stateManager.js');
const {
  handleMessage,
  handleTextMessage,
  handlePostback,
  processPendingEvents,
} = require('./messageHandler/handlers');
const {
  extractMessage,
  extractImageUrl,
  shouldStoreUserMessage,
  updateProcessedMessages,
  ensureSystemPrompt,
  storeAssistantMessage,
} = require('./messageHandler/utils');
const { isRateLimited } = require('./rateLimit');
const { storeMessage, getHistory } = require('./messageHistory');
const { processMessage } = require('./messageProcessing/processMessage');
const { sendResponse, sendMessage } = require('./sendResponse');
const { getSystemPrompt } = require('../reference/promptData');
const { compareAndGetProductDetails } = require('./visionProductMatcher');
const { getProductDatabase } = require('../db/productInfo.js');
const { uploadMessengerImageToCloudinary, deleteFromCloudinary } = require('./cloudinary/cloudinaryUploader');

// Export with dependencies injected
module.exports = {
  handleMessage: (event) => handleMessage(event, processedMessages, pendingEvents, MESSAGE_TIMEOUT, ensureSystemPrompt, extractMessage, extractImageUrl, updateProcessedMessages, handleTextMessage, processPendingEvents),
  handlePostback: (event) => handlePostback(event, ensureSystemPrompt, extractMessage, sendResponse, storeAssistantMessage, storeMessage),
};