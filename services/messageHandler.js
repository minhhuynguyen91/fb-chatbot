// Import required utilities
const { isRateLimited } = require('./rateLimit');
const { storeMessage, getHistory } = require('./messageHistory');
const { processMessage } = require('./processMessage');
const { sendResponse, sendMessage } = require('./sendResponse');
const { getSystemPrompt } = require('../reference/promptData');
const { compareAndGetProductDetails } = require('./visionProductMatcher');
const { getProductDatabase } = require('../db/productInfo.js');
const { uploadMessengerImageToCloudinary, deleteFromCloudinary } = require('./cloudinary/cloudinaryUploader');

// Store recent message IDs and their pending events per sender with TTL
const processedMessages = new Map(); // Key: senderId, Value: Set of messageIds with TTL
const pendingEvents = new Map(); // Key: senderId, Value: pending state
const MESSAGE_TIMEOUT = 5000; // 5 seconds to allow event aggregation

// Utility to manage TTL for processed messages
function updateProcessedMessages(senderId, messageId) {
  let senderSet = processedMessages.get(senderId);
  if (!senderSet) {
    senderSet = new Set();
    processedMessages.set(senderId, senderSet);
  }
  senderSet.add(messageId);
  // Clean up old entries (1-hour TTL)
  setTimeout(() => senderSet.delete(messageId), 3600000); // 1 hour TTL
}

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
  try {
    const aiResponse = await processMessage(senderId, messageText);
    sendResponse(senderId, aiResponse);
    if (aiResponse && aiResponse.content) {
      await storeAssistantMessage(senderId, aiResponse.content);
    }
  } catch (error) {
    console.error('Error in handleTextMessage:', error);
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

  // Skip if message was recently processed for this sender
  const senderProcessed = processedMessages.get(senderId) || new Set();
  if (senderProcessed.has(messageId)) {
    console.log('Message already processed for sender, skipping:', messageId);
    return;
  }

  // Use senderId as the key for pending events
  let pending = pendingEvents.get(senderId);
  if (!pending) {
    pending = { events: [], lock: false, timer: null, timestamp: Date.now() };
    pendingEvents.set(senderId, pending);
  }

  const { messageText, isQuickReply } = extractMessage(event) || { messageText: '', isQuickReply: false };
  const imageUrl = extractImageUrl(event);

  // Set or reset lock and timer
  if (!pending.lock) {
    pending.lock = true;
    pending.timer = setTimeout(async () => {
      pending.lock = false;
      console.log('Unlocking process for sender:', senderId, 'Pending state:', JSON.stringify({ ...pending, timer: 'Timeout Object' }));
      if (pending.events.length > 0) {
        pending.processed = true;
        console.log('Processing all pending events for sender:', senderId, 'Final events:', JSON.stringify(pending.events));
        await processPendingEvents(senderId);
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
        await processPendingEvents(senderId);
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
  updateProcessedMessages(senderId, messageId); // Mark as processed with TTL
  console.log('Pending events updated for sender:', senderId, 'Events:', JSON.stringify(pending.events));

  return;

  async function processPendingEvents(senderId) {
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
        if (!visionResult || visionResult.trim() === '') {
          throw new Error('Vision processing returned no or empty result');
        }
        //console.log('Vision result:', visionResult);
        let combinedMsg = visionResult;
        if (text) {
          combinedMsg = `Dạ, ${text} Em nhận diện được sản phẩm giống với ảnh là:\n${visionResult}`;
        }
        console.log('Sending combined response:', combinedMsg);
        await sendResponse(senderId, { type: 'text', content: combinedMsg });
        await storeAssistantMessage(senderId, combinedMsg); // Store combined result
        await deleteFromCloudinary(public_id);
      }
      // Handle text only (if no image)
      else if (text) {
        console.log('Processing text only for:', senderId);
        if (shouldStoreUserMessage(text)) {
          await storeMessage(senderId, "user", text);
        }
        await handleTextMessage(senderId, text);
      }
    } catch (error) {
      console.error('Processing error for sender:', senderId, 'Error:', error.message, 'Stack:', error.stack);
      const errMsg = `Xin lỗi, em gặp lỗi khi xử lý ${imageUrl ? 'hình ảnh' : 'tin nhắn'}: ${error.message}. Vui lòng thử lại hoặc kiểm tra kết nối.`;
      await sendResponse(senderId, { type: 'text', content: errMsg });
      await storeAssistantMessage(senderId, errMsg);
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