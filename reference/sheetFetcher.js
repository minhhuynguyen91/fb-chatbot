const { google } = require('googleapis');
const { GoogleAuth } = require('google-auth-library');
const retry = require('async-retry');

const auth = new GoogleAuth({
  keyFile: '.env_data/client_secret_545214956475-ivfu24fmkafq8pm3cf3tcembu5rlbq8a.apps.googleusercontent.com.json',
  scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
});
const spreadsheetId = '16W66Uh4N2eeseqPaA7MZ__eglrDN1rd10XmOLjEyXwo';

let introData = [];
let productData = [];

async function fetchSheetData() {
  try {
    const client = await auth.getClient();
    const sheets = google.sheets({ version: 'v4', auth: client });

    // Fetch intro/system prompt
    const introRes = await retry(
      async () => {
        return await sheets.spreadsheets.values.get({
          spreadsheetId,
          range: 'Intro',
        });
      },
      { retries: 3, factor: 2, minTimeout: 1000 }
    );
    introData = introRes.data.values;

    // Fetch product info
    const prodRes = await retry(
      async () => {
        return await sheets.spreadsheets.values.get({
          spreadsheetId,
          range: 'product',
        });
      },
      { retries: 3, factor: 2, minTimeout: 1000 }
    );
    productData = prodRes.data.values;

    console.log('Sheet data updated at', new Date().toISOString());
  } catch (error) {
    console.error('Error fetching sheet data after retries:', error.message);
  }
}

// Fetch once at startup and then every 10 minutes
fetchSheetData();
setInterval(fetchSheetData, 600000);

function getIntroData() {
  return introData;
}

function getProductData() {
  return productData;
}

module.exports = {
  getIntroData,
  getProductData,
};