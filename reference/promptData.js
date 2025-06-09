const { getIntroData, getProductData } = require('../reference/sheetFetcher');

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


// Public: Get the current system prompt (with product info)
function getSystemPrompt() {
  const introRows = getIntroData();
  const productRows = getProductData();
  SYSTEM_PROMPT = introRows.slice(1).map(row => row[1]).join(' ');

  const rowCount = productRows.length;
  const product = getProductInfo(rowCount, productRows);
  PRODUCT_PROMPT = makeProductPromptString(product);
  lastFetched = Date.now();

  return SYSTEM_PROMPT + '\n\n' + PRODUCT_PROMPT;
}

// Public: Initialize and keep data fresh (call once at startup)
// function initPromptData(pollMs = 5000) {
//   fetchPromptData(); // Initial fetch
//   setInterval(fetchPromptData, pollMs); // Poll for updates
// }

// Exported API
module.exports = {
  getSystemPrompt
};