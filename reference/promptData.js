const { google } = require('googleapis');
const { GoogleAuth } = require('google-auth-library');

// Google Sheets setup
const auth = new GoogleAuth({
  keyFile: '.env_data/client_secret_545214956475-ivfu24fmkafq8pm3cf3tcembu5rlbq8a.apps.googleusercontent.com.json',
  scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
});
const spreadsheetId = '16W66Uh4N2eeseqPaA7MZ__eglrDN1rd10XmOLjEyXwo';

// Internal state
let SYSTEM_PROMPT = '';
let PRODUCT_PROMPT = '';
let lastFetched = 0;

// Helper: Parse product info from sheet data
function getProductInfo(rowCount, cellData) {
  const product = {};
  for (let rowIdx = 1; rowIdx < rowCount; rowIdx++) {
    if (!Array.isArray(product[cellData[rowIdx][1]])) {
      product[cellData[rowIdx][1]] = [];
    }
    product[cellData[rowIdx][1]].push(cellData[rowIdx][2]);
  }
  return product;
}

// Helper: Build product prompt string
function makeProductPromptString(product) {
  let productPrompt = `Khi khách hàng muốn biết thông tin về các loại sản phẩm, liệt kê tất cả các mục sản phẩm:\n- ${Object.keys(product).join('\n- ')}`;
  for (const key in product) {
    const values = product[key];
    productPrompt += `\n\nKhi khách hàng xem tất cả về mục sản phẩm ${key}, hãy liệt ra các sản phẩm:\n- ${values.join('\n- ')}`;
  }
  return productPrompt;
}

// Fetch data from Google Sheets and update prompts
async function fetchPromptData() {
  try {
    const client = await auth.getClient();
    const sheets = google.sheets({ version: 'v4', auth: client });

    // Fetch intro/system prompt
    const introRes = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Intro',
    });
    SYSTEM_PROMPT = introRes.data.values.slice(1).map(row => row[1]).join(' ');

    // Fetch product info
    const prodRes = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'product',
    });
    const rowCount = prodRes.data.values.length;
    const data = prodRes.data.values;
    const product = getProductInfo(rowCount, data);
    PRODUCT_PROMPT = makeProductPromptString(product);

    lastFetched = Date.now();
    // Optionally, log for debugging
    // console.log('SYSTEM_PROMPT:', SYSTEM_PROMPT);
    // console.log('PRODUCT_PROMPT:', PRODUCT_PROMPT);
  } catch (error) {
    console.error('Error fetching prompt data:', error.message);
  }
}

// Public: Get the current system prompt (with product info)
function getSystemPrompt() {
  return SYSTEM_PROMPT + '\n\n' + PRODUCT_PROMPT;
}

// Public: Initialize and keep data fresh (call once at startup)
// function initPromptData(pollMs = 5000) {
//   fetchPromptData(); // Initial fetch
//   setInterval(fetchPromptData, pollMs); // Poll for updates
// }

setInterval(fetchPromptData, 600000);

// Exported API
module.exports = {
  getSystemPrompt
};