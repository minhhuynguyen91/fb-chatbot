// stateManager.js

// Manage state with TTL and cleanup
const processedMessages = new Map(); // Key: senderId, Value: Set of messageIds with TTL
const pendingEvents = new Map(); // Key: senderId, Value: pending state
const MESSAGE_TIMEOUT = 5000; // 5 seconds to allow event aggregation

module.exports = {
  processedMessages,
  pendingEvents,
  MESSAGE_TIMEOUT,
};