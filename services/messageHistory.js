const pool = require('../db/pool.js');

async function storeMessage(senderId, role, content) {
  if (!pool) {
    console.error('Database pool is undefined');
    return;
  }
  try {
    await pool.query(
      'INSERT INTO pool.history (sender_id, role, content, timestamp) VALUES ($1, $2, $3, $4)',
      [senderId, role, content, Date.now()]
    );
  } catch (error) {
    console.error('PostgreSQL Store Error:', error);
  }
}

async function getHistory(senderId) {
  if (!pool) {
    console.error('Database pool is undefined');
    return [];
  }
  try {
    const result = await pool.query(
      'SELECT role, content, image_url, product_info FROM pool.history WHERE sender_id = $1 ORDER BY timestamp DESC LIMIT 10',
      [senderId]
    );
    return result.rows.map(row => ({
      role: row.role,
      content: row.image_url || row.content,
      is_image: !!row.image_url,
      product_info: row.product_info || null
    })).reverse();
  } catch (error) {
    console.error('PostgreSQL Fetch Error:', error);
    return [];
  }
}

module.exports = { storeMessage, getHistory };