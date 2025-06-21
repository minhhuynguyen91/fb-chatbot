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
// Import image comparison
const { compareImageWithProducts } = require('./visionProductMatcher');
// Get product database
const { getProductDatabase } = require('../db/productInfo.js');
// Cloudinary utilities
const { uploadMessengerImageToCloudinary, deleteFromCloudinary } = require('./cloudinary/cloudinaryUploader');

// Store recent message IDs and their pending events per sender
const processedMessages = new Set();
const pendingEvents = new Map(); // Keyed by senderId
const MESSAGE_TIMEOUT = 5000; // 5 seconds to allow event aggregation

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
  return '';
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
  const messageId = event.message?.mid || `${senderId}_${Date.now()}`;
  console.log('Processing messageId:', messageId, 'Event:', JSON.stringify(event, null, 2));

  // Skip if message was recently processed
  if (processedMessages.has(messageId)) {
    console.log('Message already processed, skipping:', messageId);
    return;
  }

  // Use senderId as the key for pending events
  if (!pendingEvents.has(senderId)) {
    pendingEvents.set(senderId, { events: [], lock: false, resolve: null, processed: false, timestamp: Date.now() });
  }

  const pending = pendingEvents.get(senderId);
  const { messageText, isQuickReply } = extractMessage(event) || { messageText: '', isQuickReply: false };
  const imageUrl = extractImageUrl(event);

  // Set or maintain lock if image is detected
  if (imageUrl && !pending.lock) {
    pending.lock = true;
    pending.resolve = new Promise((resolve) => {
      setTimeout(() => {
        resolve();
        pending.lock = false; // Unlock after timeout
      }, MESSAGE_TIMEOUT);
    });
    console.log('Image detected, locking process for sender:', senderId);
  } else if (pending.lock) {
    console.log('Process already locked for sender:', senderId);
  }

  pending.events.push({ messageText, imageUrl, timestamp: Date.now() });
  console.log('Pending events updated for sender:', senderId, JSON.stringify(pending.events, null, 2));

  // Defer processing until timeout if lock is set or might be set
  if (!pending.processed) {
    if (pending.lock) {
      await pending.resolve; // Wait for timeout if lock is active
    } else {
      // Schedule processing after timeout to check for late images
      setTimeout(async () => {
        if (!pending.processed) {
          pending.processed = true;
          await processPendingEvents(senderId);
        }
      }, MESSAGE_TIMEOUT);
    }
  }

  return;

  async function processPendingEvents(senderId) {
    const pending = pendingEvents.get(senderId);
    if (!pending || !pending.events.length) {
      console.warn('No pending events found for:', senderId);
      return;
    }

    const allEvents = pending.events;
    // Aggregate text and imageUrl from all events
    let text = '';
    let imageUrl = '';
    for (const evt of allEvents) {
      if (evt.messageText) text = evt.messageText || text;
      if (evt.imageUrl) imageUrl = evt.imageUrl || imageUrl;
    }
    console.log('Aggregated pending event for sender:', senderId, { text, imageUrl });

    if (!text && !imageUrl) {
      console.warn('No text or image to process for:', senderId);
      return;
    }

    try {
      // Handle combined text and image (prioritize image if present)
      if (imageUrl) {
        console.log('Processing image (with optional text) for sender:', senderId);
        const uploadResp = await uploadMessengerImageToCloudinary(imageUrl, senderId);
        const secure_url = uploadResp.secure_url;
        const public_id = uploadResp.public_id;

        const productList = getProductDatabase();
        const visionResult = await compareImageWithProducts(secure_url, productList);
        let combinedMsg = visionResult;
        if (text) {
          combinedMsg = `Dạ, ${text} Em nhận diện được sản phẩm giống với ảnh là:\n${visionResult}`;
        }
        await sendResponse(senderId, { type: 'text', content: combinedMsg });
        await storeAssistantMessage(senderId, combinedMsg); // Store combined result
        await deleteFromCloudinary(public_id);
      }
      // Handle text only (if no image after timeout)
      else if (text) {
        console.log('Processing text only for:', senderId);
        if (shouldStoreUserMessage(text)) {
          await storeMessage(senderId, "user", text);
        }
        await handleTextMessage(senderId, text);
      }
    } catch (error) {
      console.error('Processing error for sender:', senderId, error.message);
      const errMsg = 'Xin lỗi, em không thể xử lý tin nhắn này lúc này.';
      await sendResponse(senderId, { type: 'text', content: errMsg });
      await storeAssistantMessage(senderId, errMsg);
    } finally {
      pendingEvents.delete(senderId); // Clean up after processing
    }
  }
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