// test-db.js
const pool = require('./db/pool'); // adjust path if needed

(async () => {
  try {
    const res = await pool.query('SELECT NOW()');
    console.log('✅ Connected to DB! Server time is:', res.rows[0].now);
  } catch (err) {
    console.error('❌ Connection failed:', err.message);
  } finally {
    await pool.end(); // close connection pool
  }
})();