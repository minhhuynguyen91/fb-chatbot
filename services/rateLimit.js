const userRequestMap = new Map();

function isRateLimited(userId) {
  const now = Date.now();
  const timeWindow = 60 * 1000;
  const maxRequests = 5;
  if (!userRequestMap.has(userId)) userRequestMap.set(userId, []);
  const timestamps = userRequestMap.get(userId).filter(ts => now - ts < timeWindow);
  timestamps.push(now);
  userRequestMap.set(userId, timestamps);
  return timestamps.length > maxRequests;
}

module.exports = { isRateLimited };