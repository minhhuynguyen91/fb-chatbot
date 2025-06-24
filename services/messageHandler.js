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
const { compareAndGetProductDetails } = require('./visionProductMatcher');
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

  // Skip if message was recently processed
  if (processedMessages.has(messageId)) {
    console.log('Message already processed, skipping:', messageId);
    return;
  }

  // Use senderId as the key for pending events
  let pending = pendingEvents.get(senderId);
  if (!pending) {
    pending = { events: [], lock: false, resolve: null, processed: false, timestamp: Date.now() };
    pendingEvents.set(senderId, pending);
  }

  const { messageText, isQuickReply } = extractMessage(event) || { messageText: '', isQuickReply: false };
  const imageUrl = extractImageUrl(event);

  // Set or maintain lock only once per session
  if (!pending.lock) {
    pending.lock = true;
    pending.resolve = new Promise((resolve) => {
      setTimeout(() => {
        resolve();
        pending.lock = false; // Unlock after timeout
        console.log('Unlocking process for sender:', senderId, 'Pending state:', JSON.stringify(pending));
      }, MESSAGE_TIMEOUT);
    });
    console.log('Setting initial lock for sender:', senderId);
  }
  if (imageUrl && imageUrl.length > 0) {
    console.log('Image detected, reinforcing lock for sender with URL:', imageUrl);
  }

  pending.events.push({ messageText, imageUrl, timestamp: Date.now() });
  console.log('Pending events updated for sender:', senderId, 'Events:', JSON.stringify(pending.events));
  console.log('Current pending state:', JSON.stringify(pending));

  // Process only after the final timeout
  if (!pending.processed) {
    const timer = setTimeout(async () => {
      if (!pending.processed) {
        pending.processed = true;
        console.log('Processing all pending events for sender:', senderId, 'Final events:', JSON.stringify(pending.events));
        await processPendingEvents(senderId);
        clearTimeout(timer); // Clean up timer
        pendingEvents.delete(senderId); // Reset state after processing
        console.log('Cleared pending events for sender:', senderId);
      }
    }, MESSAGE_TIMEOUT);

    // Wait for lock resolution if set
    if (pending.lock) {
      await pending.resolve;
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
    let text = allEvents.find(evt => evt.messageText)?.messageText || '';
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
        const visionResult = await compareAndGetProductDetails(secure_url, productList);
        if (!visionResult || visionResult.trim() === '') {
          throw new Error('Vision processing returned no or empty result');
        }
        console.log('Vision result:', visionResult);
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