// Import utilities and external dependencies
const { isRateLimited } = require('../rateLimit.js');
const { storeMessage, getHistory } = require('../messageHistory.js');
const { processMessage } = require('../processMessage.js');
const { sendResponse, sendMessage } = require('../sendResponse.js');
const { getSystemPrompt } = require('../../reference/promptData.js');
const { compareAndGetProductDetails } = require('../visionProductMatcher.js');
const { getProductDatabase } = require('../../db/productInfo.js');
const { uploadMessengerImageToCloudinary, deleteFromCloudinary } = require('../cloudinary/cloudinaryUploader.js');
const {
  extractMessage,
  extractImageUrl,
  shouldStoreUserMessage,
  updateProcessedMessages,
  ensureSystemPrompt,
  storeAssistantMessage,
} = require('./utils.js');

// --- Modular: Handle text message logic ---
async function handleTextMessage(senderId, messageText, sendMessage, storeAssistantMessage, processMessage, isRateLimited, storeMessage) {
  const lowerText = messageText.toLowerCase().trim();
  if (lowerText.includes('help') || lowerText.includes('menu')) {
    const helpMsg = 'Welcome! Type:\n- "info" for bot details\n- "support" for customer service\n- Any message for a smart reply from our AI';
    sendMessage(senderId, helpMsg);
    return;
  }
  if (lowerText.includes('info')) {
    const infoMsg = 'This is a demo bot powered by ChatGPT, designed to answer your questions and assist via Messenger.';
    sendMessage(senderId, infoMsg);
    return;
  }
  if (lowerText.includes('support')) {
    const supportMsg = 'Connecting you to our support team... For now, describe your issue, and our AI will assist!';
    sendMessage(senderId, supportMsg);
    return;
  }
  if (isRateLimited(senderId)) {
    const rateMsg = 'You are sending messages too fast. Please wait a minute before trying again.';
    sendMessage(senderId, rateMsg);
    return;
  }
  try {
    const aiResponse = await processMessage(senderId, messageText);
    sendResponse(senderId, aiResponse);
    if (aiResponse && aiResponse.content) {
      await storeAssistantMessage(storeMessage, senderId, aiResponse.content);
    }
  } catch (error) {
    console.error('Error in handleTextMessage:', error);
    const errMsg = 'Xin lỗi, đã có lỗi xảy ra. Vui lòng thử lại sau nhé!';
    sendMessage(senderId, errMsg);
    await storeAssistantMessage(storeMessage, senderId, errMsg);
  }
}

/**
 * Handle incoming user messages from Messenger.
 */
async function handleMessage(event, processedMessages, pendingEvents, MESSAGE_TIMEOUT, ensureSystemPrompt, extractMessage, extractImageUrl, updateProcessedMessages, handleTextMessage, processPendingEvents) {
  const senderId = event.sender.id;
  await ensureSystemPrompt(getHistory, storeMessage, getSystemPrompt, senderId);

  // Extract message ID (mid) for grouping events
  const messageId = event.message?.mid || `${senderId}_${Date.now()}`;
  console.log('Processing messageId:', messageId, 'Event:', JSON.stringify(event, null, 2));

  // Skip if message was recently processed for this sender
  const senderProcessed = processedMessages.get(senderId) || new Set();
  if (senderProcessed.has(messageId)) {
    console.log('Message already processed for sender, skipping:', messageId);
    return;
  }

  // Extract message details
  const { messageText, isQuickReply } = extractMessage(event) || { messageText: '', isQuickReply: false };
  const imageUrl = extractImageUrl(event);

  // Ignore specific quick reply buttons
  const ignoredQuickReplies = ['LIKE', 'YES', 'NO', 'HELP']; // Add payloads to ignore
  if (isQuickReply && ignoredQuickReplies.includes(messageText)) {
    console.log(`Ignoring quick reply with payload "${messageText}" for sender:`, senderId, 'Message ID:', messageId);
    updateProcessedMessages(processedMessages, senderId, messageId); // Mark as processed to prevent reprocessing
    return;
  }

  // Set or reset lock and timer
  let pending = pendingEvents.get(senderId);
  if (!pending) {
    pending = { events: [], lock: false, timer: null, timestamp: Date.now() };
    pendingEvents.set(senderId, pending);
  }

  if (!pending.lock) {
    pending.lock = true;
    pending.timer = setTimeout(async () => {
      pending.lock = false;
      console.log('Unlocking process for sender:', senderId, 'Pending state:', JSON.stringify({ ...pending, timer: 'Timeout Object' }));
      if (pending.events.length > 0) {
        pending.processed = true;
        console.log('Processing all pending events for sender:', senderId, 'Final events:', JSON.stringify(pending.events));
        await processPendingEvents(senderId, pendingEvents, extractImageUrl, uploadMessengerImageToCloudinary, deleteFromCloudinary, getProductDatabase, compareAndGetProductDetails, sendResponse, storeAssistantMessage, storeMessage, handleTextMessage, shouldStoreUserMessage);
        clearTimeout(pending.timer);
        pendingEvents.delete(senderId);
        console.log('Cleared pending events for sender:', senderId);
      }
    }, MESSAGE_TIMEOUT);
    console.log('Setting initial lock for sender:', senderId, 'Timer set at:', new Date().toISOString());
  } else if (pending.timer) {
    clearTimeout(pending.timer);
    pending.timer = setTimeout(async () => {
      pending.lock = false;
      console.log('Reset and unlocking process for sender:', senderId, 'Pending state:', JSON.stringify({ ...pending, timer: 'Timeout Object' }));
      if (pending.events.length > 0) {
        pending.processed = true;
        console.log('Processing all pending events for sender:', senderId, 'Final events:', JSON.stringify(pending.events));
        await processPendingEvents(senderId, pendingEvents, extractImageUrl, uploadMessengerImageToCloudinary, deleteFromCloudinary, getProductDatabase, compareAndGetProductDetails, sendResponse, storeAssistantMessage, storeMessage, handleTextMessage, shouldStoreUserMessage);
        clearTimeout(pending.timer);
        pendingEvents.delete(senderId);
        console.log('Cleared pending events for sender:', senderId);
      }
    }, MESSAGE_TIMEOUT);
    console.log('Reset timer for sender:', senderId, 'New timer set at:', new Date().toISOString());
  }
  if (imageUrl && imageUrl.length > 0) {
    console.log('Image detected, resetting lock for sender with URL:', imageUrl);
  }

  pending.events.push({ messageText, imageUrl, timestamp: Date.now() });
  updateProcessedMessages(processedMessages, senderId, messageId); // Mark as processed with TTL
  console.log('Pending events updated for sender:', senderId, 'Events:', JSON.stringify(pending.events));

  return;
}

/**
 * Process all pending events for a sender.
 */
async function processPendingEvents(senderId, pendingEvents, extractImageUrl, uploadMessengerImageToCloudinary, deleteFromCloudinary, getProductDatabase, compareAndGetProductDetails, sendResponse, storeAssistantMessage, storeMessage, handleTextMessage, shouldStoreUserMessage) {
  const pending = pendingEvents.get(senderId);
  if (!pending || !pending.events.length) {
    console.warn('No pending events found for:', senderId);
    return;
  }

  const allEvents = pending.events;
  // Aggregate text and imageUrl from all events, taking the latest text
  let text = allEvents.filter(evt => evt.messageText).pop()?.messageText || '';
  let imageUrl = allEvents.find(evt => evt.imageUrl)?.imageUrl || '';

  console.log('Aggregated pending event for sender:', senderId, { text, imageUrl });

  if (!text && !imageUrl) {
    console.warn('No text or image to process for:', senderId);
    return;
  }

  try {
    // Handle combined text and image (prioritize image if present)
    if (imageUrl && imageUrl.length > 0) {
      console.log('Starting image processing for sender:', senderId);
      console.log('Validating image URL:', imageUrl);
      if (!imageUrl.startsWith('http')) {
        throw new Error('Invalid image URL format');
      }
      console.log('Uploading image to Cloudinary with URL:', imageUrl);
      const uploadResp = await uploadMessengerImageToCloudinary(imageUrl, senderId);
      if (!uploadResp || !uploadResp.secure_url || !uploadResp.public_id) {
        throw new Error('Cloudinary upload failed or returned invalid response: ' + JSON.stringify(uploadResp));
      }
      console.log('Upload response:', uploadResp);
      const secure_url = uploadResp.secure_url;
      const public_id = uploadResp.public_id;

      const productList = getProductDatabase();
      console.log('Comparing image with product database using URL:', secure_url);
      const visionResult = await compareAndGetProductDetails(secure_url, productList, senderId);
      if (!visionResult || !visionResult.text || visionResult.text.trim() === '') {
        throw new Error('Vision processing returned no or empty result');
      }
      console.log('Vision result:', visionResult.text);
      let combinedMsg = visionResult.text;
      if (text) {
        combinedMsg = `Dạ, ${text} Em nhận diện được sản phẩm giống với ảnh là:\n${visionResult.text}`;
      }
      console.log('Sending combined response:', combinedMsg);
      await sendResponse(senderId, { type: 'text', content: combinedMsg });
      // Send following image when found
      if (visionResult.imgUrl) {
        await sendResponse(senderId, { type: 'image', image_url: visionResult.imgUrl });
      }
      await storeAssistantMessage(storeMessage, senderId, combinedMsg); // Store combined result
      await deleteFromCloudinary(public_id);
    }
    // Handle text only (if no image)
    else if (text) {
      console.log('Processing text only for:', senderId);
      if (shouldStoreUserMessage(text)) {
        await storeMessage(senderId, "user", text);
      }
      await handleTextMessage(senderId, text, sendMessage, storeAssistantMessage, processMessage, isRateLimited, storeMessage);
    }
  } catch (error) {
    console.error('Processing error for sender:', senderId, 'Error:', error.message, 'Stack:', error.stack);
    const errMsg = `Xin lỗi, em gặp lỗi khi xử lý ${imageUrl ? 'hình ảnh' : 'tin nhắn'}: ${error.message}. Vui lòng thử lại hoặc kiểm tra kết nối.`;
    await sendResponse(senderId, { type: 'text', content: errMsg });
    await storeAssistantMessage(storeMessage, senderId, errMsg);
  }
}

/**
 * Handle postback events from Messenger (e.g., button clicks).
 */
async function handlePostback(event, ensureSystemPrompt, extractMessage, sendResponse, storeAssistantMessage, storeMessage) {
  const senderId = event.sender.id;
  await ensureSystemPrompt(getHistory, storeMessage, getSystemPrompt, senderId);

  let content = '';

  // Prefer string payload if available
  if (event.postback && typeof event.postback.payload === 'string') {
    content = event.postback.payload;
  } else if (
    event.postback &&
    event.postback.payload &&
    typeof event.postback.payload === 'object'
  ) {
    // If payload is an object, try to extract a string or URL field
    if (event.postback.payload.url) {
      content = event.postback.payload.url;
    } else if (event.postback.payload.text) {
      content = event.postback.payload.text;
    } else {
      // Fallback: stringify only the first-level keys/values that are strings or URLs
      for (const key in event.postback.payload) {
        if (
          typeof event.postback.payload[key] === 'string' &&
          (event.postback.payload[key].startsWith('http') ||
            event.postback.payload[key].length < 100)
        ) {
          content = event.postback.payload[key];
          break;
        }
      }
    }
  }

  // Fallback if nothing found
  if (!content) content = '[postback]';

  // await storeMessage(senderId, "user", content);
  const postbackMsg = `Received postback: ${content}. Try typing "help" for more options.`;
  sendResponse(senderId, { type: 'text', content: postbackMsg });
  await storeAssistantMessage(storeMessage, senderId, postbackMsg);
}

module.exports = {
  handleMessage,
  handleTextMessage,
  handlePostback,
  processPendingEvents,
};