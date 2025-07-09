const sentImageContext = new Map(); // Temporary storage for sent image context

function storeImageContext(senderId, imageUrl, productInfo) {
  const context = sentImageContext.get(senderId) || [];
  context.push({ imageUrl, productInfo, timestamp: Date.now() });
  sentImageContext.set(senderId, context.filter(c => Date.now() - c.timestamp < 5 * 60 * 1000));
}

function getImageContext(senderId) {
  return sentImageContext.get(senderId);
}

module.exports = { storeImageContext, getImageContext, sentImageContext };