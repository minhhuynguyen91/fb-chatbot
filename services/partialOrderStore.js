// In-memory store: { senderId: { ...partialOrderInfo } }
const partialOrders = new Map();

function getPartialOrder(senderId) {
  return partialOrders.get(senderId) || {};
}

function setPartialOrder(senderId, orderInfo) {
  partialOrders.set(senderId, orderInfo);
}

function clearPartialOrder(senderId) {
  partialOrders.delete(senderId);
}

module.exports = { getPartialOrder, setPartialOrder, clearPartialOrder };