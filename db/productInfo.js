// const PRODUCT_DATABASE =
// [
//   {
//     "category": "Áo Quần",
//     "product": "Đầm Maxi",
//     "image_url": "https://lp2.hm.com/hmgoepprod?set=source[/a1/2b/a12b3f4e5d6c7e8f9a0b1c2d3e4f5g6h7i8j9k0l.jpg],origin[dam],category[ladies_dresses_maxidresses],type[LOOKBOOK],res[w],hmver[1]&call=url[file:/product/main]",
//     "product_details": "Một chiếc đầm dài chạm sàn, thướt tha, lý tưởng cho cả dịp thường ngày và trang trọng.",
//     "price":
//     "synonyms": ["Đầm Dài", "Đầm Dài Toàn Thân", "Đầm Boho"]
//   },
//]
const { google } = require('googleapis');
const { GoogleAuth } = require('google-auth-library');
const PRODUCT_DATABASE = [];

// Google Sheets setup
const auth = new GoogleAuth({
  keyFile: '.env_data/client_secret_545214956475-ivfu24fmkafq8pm3cf3tcembu5rlbq8a.apps.googleusercontent.com.json',
  scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
});
const spreadsheetId = '16W66Uh4N2eeseqPaA7MZ__eglrDN1rd10XmOLjEyXwo';

async function fetchProductData() 
{
  try {
      const client = await auth.getClient();
      const sheets = google.sheets({ version: 'v4', auth: client });
  
      // Fetch product info
      const prodRes = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: 'product',
      });

      const rowCount = prodRes.data.values.length;
      const data = prodRes.data.values;
      for(let rowIdx=0 + 1 ; rowIdx <rowCount; rowIdx++)
      {
        let idxData = {};
        idxData['category'] = data[rowIdx][1];
        idxData['product'] = data[rowIdx][2];
        idxData['product_details'] = data[rowIdx][3];
        idxData['image_url'] = data[rowIdx][4];
        idxData['price'] = data[rowIdx][5];
        idxData['synonyms'] = data[rowIdx][6];
        PRODUCT_DATABASE.push(idxData);
      }
    }
  catch (error) {
    console.error('Error fetching product data:', error);
  }
}

function getProductDatabase()
{
  return PRODUCT_DATABASE;
}

setInterval(fetchProductData, 600000);

module.exports = {getProductDatabase};