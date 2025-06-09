const { google } = require('googleapis');
const { GoogleAuth } = require('google-auth-library');

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
    const introRes = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Intro',
    });
    introData = introRes.data.values;

    // Fetch product info
    const prodRes = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'product',
    });
    productData = prodRes.data.values;

    // Optionally log
    // console.log('Sheet data updated');
  } catch (error) {
    console.error('Error fetching sheet data:', error.message);
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