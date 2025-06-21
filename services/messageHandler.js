// Import rate limiting utility
const { isRateLimited } = require('./rateLimit');
// Import message history utilities (store/retrieve)
const { storeMessage, getHistory } = require('./messageHistory');
// Import message processing logic (OpenAI, intent, etc.)
const { processMessage } = require('./processMessage');
// Import response sending helpers (text/image to Messenger)
const { sendResponse, sendMessage } = require('./sendResponse');
// Import system prompt for OpenAI context
const { getSystemPrompt } = require('../reference/promptData');
// Import image comparision
const { compareImageWithProducts } = require('./visionProductMatcher');
// Get product database
const { getProductDatabase } = require('../db/productInfo.js');

// Cloudinary ultilities
const { uploadMessengerImageToCloudinary, deleteFromCloudinary } = require('./cloudinary/cloudinaryUploader');

// Store recent message IDs and their pending events
const processedMessages = new Set();
const pendingEvents = new Map();
const MESSAGE_TIMEOUT = 5000; // 5 seconds to group events

// Define shouldStoreUserMessage
function shouldStoreUserMessage(messageText) {
  return messageText && messageText.trim() !== '' && !messageText.startsWith('/');
}



// --- Utility: Ensure system prompt is in history ---
async function ensureSystemPrompt(senderId) {
  const history = await getHistory(senderId);
  if (!history || history.length === 0) {
    const SYSTEM_PROMPT = getSystemPrompt();
    await storeMessage(senderId, "system", SYSTEM_PROMPT);
  }
}

// --- Utility: Extract message text and type ---
function extractMessage(event) {
  let messageText = '';
  let isQuickReply = false;
  if (event.message && event.message.quick_reply) {
    messageText = event.message.quick_reply.payload;
    isQuickReply = true;
  } else if (event.postback && event.postback.payload) {
    messageText = event.postback.payload;
  } else if (event.message && event.message.text) {
    messageText = event.message.text;
  }
  return { messageText, isQuickReply };
}

// --- Utility: Extract image URL (first image only) ---
function extractImageUrl(event) {
  if (event.message && event.message.attachments) {
    for (const attachment of event.message.attachments) {
      if (attachment.type === 'image') {
        return attachment.payload.url;
      }
    }
  }
  return null;
}

// --- Utility: Store assistant message ---
async function storeAssistantMessage(senderId, content) {
  if (content) {
    await storeMessage(senderId, "assistant", content);
  }
}

// --- Modular: Handle text message logic ---
async function handleTextMessage(senderId, messageText) {
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
      await storeAssistantMessage(senderId, aiResponse.content);
    }
  } catch (error) {
    console.error('Error in handleMessage:', error);
    const errMsg = 'Xin lỗi, đã có lỗi xảy ra. Vui lòng thử lại sau nhé!';
    sendMessage(senderId, errMsg);
    await storeAssistantMessage(senderId, errMsg);
  }
}

/**
 * Handle incoming user messages from Messenger.
 * Applies rate limiting, stores/retrieves chat history,
 * and delegates to processMessage for AI response.
 */
async function handleMessage(event) {
  const senderId = event.sender.id;
  await ensureSystemPrompt(senderId);

  // Extract message ID (mid) for grouping events
  const messageId = event.message?.mid;
  if (!messageId) {
    console.log('No message ID found, processing as standalone event');
    await processStandaloneEvent(event);
    return;
  }

  // Skip if message was recently processed
  if (processedMessages.has(messageId)) {
    return;
  }

  // Store or update pending event
  if (!pendingEvents.has(messageId)) {
    pendingEvents.set(messageId, { event, text: '', imageUrl: '' });
    setTimeout(() => processPendingEvents(messageId), MESSAGE_TIMEOUT);
  }

  const { messageText, isQuickReply } = extractMessage(event);
  const imageUrl = extractImageUrl(event);

  const pending = pendingEvents.get(messageId);
  if (messageText) pending.text = messageText;
  if (imageUrl) pending.imageUrl = imageUrl;

  // Early return if not the last event in the timeout window
  return;
}

async function processPendingEvents(messageId) {
  const pending = pendingEvents.get(messageId);
  if (!pending) return;

  processedMessages.add(messageId);
  pendingEvents.delete(messageId);

  const { text, imageUrl } = pending.event;
  if (!text && !imageUrl) return;

  // Handle combined text and image
  if (imageUrl && text) {
    try {
      // 1. Store user text message
      if (shouldStoreUserMessage(text)) {
        await storeMessage(senderId, "user", text);
      }

      // 2. Upload image to Cloudinary
      const uploadResp = await uploadMessengerImageToCloudinary(imageUrl, senderId);
      const secure_url = uploadResp.secure_url;
      const public_id = uploadResp.public_id;

      // 3. Compare image with products
      const productList = getProductDatabase();
      const visionResult = await compareImageWithProducts(secure_url, productList);

      // 4. Process text message
      const aiResponse = await processMessage(senderId, text);
      const aiResult = aiResponse && aiResponse.content ? aiResponse.content : '';

      // 5. Combine results
      const combinedMsg = [visionResult, aiResult].filter(Boolean).join('\n\n');

      // 6. Send combined response
      await sendResponse(senderId, { type: 'text', content: combinedMsg });
      await storeAssistantMessage(senderId, combinedMsg);

      // 7. Delete image from Cloudinary
      await deleteFromCloudinary(public_id);
    } catch (error) {
      console.error('Combined text and image handling error:', error.message);
      const errMsg = 'Xin lỗi, em không thể xử lý ảnh và tin nhắn này lúc này.';
      await sendResponse(senderId, { type: 'text', content: errMsg });
      await storeAssistantMessage(senderId, errMsg);
    }
    return;
  }

  // Handle image only
  if (imageUrl) {
    try {
      const uploadResp = await uploadMessengerImageToCloudinary(imageUrl, senderId);
      const secure_url = uploadResp.secure_url;
      const public_id = uploadResp.public_id;

      const productList = getProductDatabase();
      const result = await compareImageWithProducts(secure_url, productList);

      await sendResponse(senderId, { type: 'text', content: result });
      await storeAssistantMessage(senderId, result);
      await deleteFromCloudinary(public_id);
    } catch (error) {
      console.error('Image handling error:', error.message);
      const errMsg = 'Xin lỗi, em không thể nhận diện ảnh này lúc này.';
      await sendResponse(senderId, { type: 'text', content: errMsg });
      await storeAssistantMessage(senderId, errMsg);
    }
    return;
  }

  // Handle text only
  if (text) {
    try {
      if (shouldStoreUserMessage(text)) {
        await storeMessage(senderId, "user", text);
      }
      await handleTextMessage(senderId, text);
    } catch (error) {
      console.error('Text handling error:', error.message);
      const errMsg = 'Xin lỗi, đã có lỗi xảy ra. Bạn thử lại sau nhé!';
      await sendResponse(senderId, { type: 'text', content: errMsg });
      await storeAssistantMessage(senderId, errMsg);
    }
    return;
  }
}

async function processStandaloneEvent(event) {
  const { messageText, isQuickReply } = extractMessage(event);
  const imageUrl = extractImageUrl(event);

  if (imageUrl && messageText) {
    try {
      if (shouldStoreUserMessage(messageText)) {
        await storeMessage(senderId, "user", messageText);
      }
      const uploadResp = await uploadMessengerImageToCloudinary(imageUrl, senderId);
      const secure_url = uploadResp.secure_url;
      const public_id = uploadResp.public_id;

      const productList = getProductDatabase();
      const visionResult = await compareImageWithProducts(secure_url, productList);
      const aiResponse = await processMessage(senderId, messageText);
      const aiResult = aiResponse && aiResponse.content ? aiResponse.content : '';

      const combinedMsg = [visionResult, aiResult].filter(Boolean).join('\n\n');
      await sendResponse(senderId, { type: 'text', content: combinedMsg });
      await storeAssistantMessage(senderId, combinedMsg);
      await deleteFromCloudinary(public_id);
    } catch (error) {
      console.error('Combined error:', error.message);
      const errMsg = 'Xin lỗi, em không thể xử lý ảnh và tin nhắn này lúc này.';
      await sendResponse(senderId, { type: 'text', content: errMsg });
      await storeAssistantMessage(senderId, errMsg);
    }
    return;
  }

  if (imageUrl) {
    try {
      const uploadResp = await uploadMessengerImageToCloudinary(imageUrl, senderId);
      const secure_url = uploadResp.secure_url;
      const public_id = uploadResp.public_id;

      const productList = getProductDatabase();
      const result = await compareImageWithProducts(secure_url, productList);

      await sendResponse(senderId, { type: 'text', content: result });
      await storeAssistantMessage(senderId, result);
      await deleteFromCloudinary(public_id);
    } catch (error) {
      console.error('Image error:', error.message);
      const errMsg = 'Xin lỗi, em không thể nhận diện ảnh này lúc này.';
      await sendResponse(senderId, { type: 'text', content: errMsg });
      await storeAssistantMessage(senderId, errMsg);
    }
    return;
  }

  if (messageText) {
    try {
      if (shouldStoreUserMessage(messageText)) {
        await storeMessage(senderId, "user", messageText);
      }
      await handleTextMessage(senderId, messageText);
    } catch (error) {
      console.error('Text error:', error.message);
      const errMsg = 'Xin lỗi, đã có lỗi xảy ra. Bạn thử lại sau nhé!';
      await sendResponse(senderId, { type: 'text', content: errMsg });
      await storeAssistantMessage(senderId, errMsg);
    }
    return;
  }

  const fallbackMsg = 'Xin lỗi, em chưa hiểu ý ạ. Có thể gửi lại tin nhắn hoặc hình ảnh?';
  await sendResponse(senderId, { type: 'text', content: fallbackMsg });
  await storeAssistantMessage(senderId, fallbackMsg);
}




/**
 * Handle postback events from Messenger (e.g., button clicks).
 */
async function handlePostback(event) {
  const senderId = event.sender.id;
  await ensureSystemPrompt(senderId);

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
  await storeAssistantMessage(senderId, postbackMsg);
}

module.exports = { handleMessage, handlePostback };