const axios = require('axios');
const { Pool } = require('pg');
const pool = new Pool(); // Make sure to configure .env or pass config here

const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const PROFILE_REFRESH_DAYS = 7;

async function getUserProfile(psid) {
  const client = await pool.connect();
  try {
    // Check if we have a recent profile in the DB
    const { rows } = await client.query(
      `SELECT * FROM pool.user_profiles 
       WHERE psid = $1 AND last_updated > NOW() - INTERVAL '${PROFILE_REFRESH_DAYS} days'`,
      [psid]
    );

    if (rows.length > 0) {
      return rows[0]; // return cached version
    }

    // Otherwise, fetch from Facebook
    const url = `https://graph.facebook.com/v21.0/${psid}?fields=first_name,last_name,profile_pic&access_token=${PAGE_ACCESS_TOKEN}`;
    const fbRes = await axios.get(url);
    const { first_name, last_name, profile_pic } = fbRes.data;

    // Upsert into DB
    await client.query(`
      INSERT INTO pool.user_profiles (psid, first_name, last_name, profile_pic, last_updated)
      VALUES ($1, $2, $3, $4, NOW())
      ON CONFLICT (psid)
      DO UPDATE SET first_name = $2, last_name = $3, profile_pic = $4, last_updated = NOW()
    `, [psid, first_name, last_name, profile_pic]);

    return { psid, first_name, last_name, profile_pic };
  } catch (error) {
    console.error('⚠️ Error fetching/storing user profile:', error.response?.data || error.message);
    return null;
  } finally {
    client.release();
  }
}

module.exports = getUserProfile;
