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

const { getProductData } = require('../reference/sheetFetcher');

function getProductDatabase()
{
  const data = getProductData();
  const rowCount = data.length;
  const PRODUCT_DATABASE = [];
  for(let rowIdx=0 + 1 ; rowIdx <rowCount; rowIdx++)
  {
    let idxData = {};
    idxData['category'] = data[rowIdx][1];
    idxData['product'] = data[rowIdx][2];
    idxData['product_details'] = data[rowIdx][3];
    idxData['color'] = data[rowIdx][4];
    idxData['image_url'] = data[rowIdx][5];
    idxData['size'] = data[rowIdx][6];
    idxData['price'] = data[rowIdx][7];
    idxData['synonyms'] = data[rowIdx][8];
    PRODUCT_DATABASE.push(idxData);
  }

  return PRODUCT_DATABASE;
}

module.exports = {getProductDatabase};