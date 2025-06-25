// utils.js

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

// --- Utility: Define shouldStoreUserMessage ---
function shouldStoreUserMessage(messageText) {
  return messageText && messageText.trim() !== '' && !messageText.startsWith('/');
}

// --- Utility: Manage TTL for processed messages ---
function updateProcessedMessages(processedMessages, senderId, messageId) {
  let senderSet = processedMessages.get(senderId);
  if (!senderSet) {
    senderSet = new Set();
    processedMessages.set(senderId, senderSet);
  }
  senderSet.add(messageId);
  // Clean up old entries (1-hour TTL)
  setTimeout(() => senderSet.delete(messageId), 3600000); // 1 hour TTL
  return processedMessages;
}

// --- Utility: Ensure system prompt is in history ---
async function ensureSystemPrompt(getHistory, storeMessage, getSystemPrompt, senderId) {
  const history = await getHistory(senderId);
  if (!history || history.length === 0) {
    const SYSTEM_PROMPT = getSystemPrompt();
    await storeMessage(senderId, "system", SYSTEM_PROMPT);
  }
}

// --- Utility: Store assistant message ---
async function storeAssistantMessage(storeMessage, senderId, content) {
  if (content) {
    await storeMessage(senderId, "assistant", content);
  }
}

module.exports = {
  extractMessage,
  extractImageUrl,
  shouldStoreUserMessage,
  updateProcessedMessages,
  ensureSystemPrompt,
  storeAssistantMessage,
};