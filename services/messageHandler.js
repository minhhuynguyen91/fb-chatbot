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


/**
 * Handle incoming user messages from Messenger.
 * Applies rate limiting, stores/retrieves chat history,
 * and delegates to processMessage for AI response.
 */
async function handleMessage(event) {
  const senderId = event.sender.id;
  // Only process if event.message and event.message.text exist
  if (!event.message || !event.message.text) {
    // Optionally, you can send a friendly fallback or just return
    // sendMessage(senderId, 'Please send a text message to interact with the bot.');
    return;
  }

  const message = event.message.text?.toLowerCase().trim();
  let responseText;
  const SYSTEM_PROMPT = getSystemPrompt();
  // Guard: No message text
  if (!message) {
    responseText = 'Please send a text message to interact with the bot.';
    sendMessage(senderId, responseText);
    return;
  }

  // Quick replies for help/menu/info/support
  if (message.includes('help') || message.includes('menu')) {
    responseText = 'Welcome! Type:\n- "info" for bot details\n- "support" for customer service\n- Any message for a smart reply from our AI';
    sendMessage(senderId, responseText);
    return;
  }

  if (message.includes('info')) {
    responseText = 'This is a demo bot powered by ChatGPT, designed to answer your questions and assist via Messenger.';
    sendMessage(senderId, responseText);
    return;
  }

  if (message.includes('support')) {
    responseText = 'Connecting you to our support team... For now, describe your issue, and our AI will assist!';
    sendMessage(senderId, responseText);
    return;
  }

  // Rate limiting check
  if (isRateLimited(senderId)) {
    responseText = 'You are sending messages too fast. Please wait a minute before trying again.';
    sendMessage(senderId, responseText);
    return;
  }

  // Main AI processing and chat history management
  try {
    // Retrieve chat history for context
    const history = await getHistory(senderId);
    // If no history, store system prompt as first message
    if (!history.length) {
      await storeMessage(senderId, 'system', SYSTEM_PROMPT);
    }
    // Store user message
    await storeMessage(senderId, 'user', message);

    // Get AI response (processMessage handles OpenAI and intent)
    const response = await processMessage(senderId, message);

    // Store assistant response
    await storeMessage(senderId, 'assistant', response.content || JSON.stringify(response));
    // Send response to user (text or image)
    await sendResponse(senderId, response);
  } catch (error) {
    // Error handling for OpenAI or other failures
    console.error('OpenAI Error:', error);
    responseText = 'Sorry, something went wrong. Try typing "help" for options.';
    sendMessage(senderId, responseText);
  }
}

/**
 * Handle postback events from Messenger (e.g., button clicks).
 */
function handlePostback(event) {
  const senderId = event.sender.id;
  const payload = event.postback.payload;
  const responseText = `Received postback: ${payload}. Try typing "help" for more options.`;
  sendMessage(senderId, responseText);
}

module.exports = { handleMessage, handlePostback };