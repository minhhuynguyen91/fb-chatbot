const { imageContext } = require('./imageContext');

async function searchProduct(database, product, category, senderId, color = '') {
  console.log('searchProduct inputs:', { product, category, senderId, color });
  let results = database.filter(item => {
    const itemCategory = item.category ? item.category.toLowerCase().trim() : '';
    const itemProduct = item.product ? item.product.toLowerCase().trim() : '';
    const itemColor = item.color ? item.color.toLowerCase().trim() : '';
    const itemSynonyms = Array.isArray(item.synonyms) ? item.synonyms.map(s => s.toLowerCase().trim()) : 
                         typeof item.synonyms === 'string' ? [item.synonyms.toLowerCase().trim()] : [];
    const cat = category ? category.toLowerCase().trim() : '';
    const prod = product ? product.toLowerCase().trim() : '';
    const col = color ? color.toLowerCase().trim() : '';

    const categoryMatch = !cat || itemCategory.includes(cat) || cat.includes(itemCategory);
    const productMatch = !prod || 
      itemProduct === prod || // Exact match for product
      itemSynonyms.some(synonym => synonym === prod) ||
      (itemColor && prod.includes(itemColor));
    const colorMatch = !col || itemColor.includes(col);

    console.log('Checking item:', { itemProduct, itemCategory, itemColor, productMatch, categoryMatch, colorMatch });
    return categoryMatch && productMatch && colorMatch;
  });

  console.log('searchProduct results:', results);
  if (results.length === 0 && senderId) {
    console.log('Falling back to image context:', imageContext.getImageContext(senderId));
    const context = imageContext.getImageContext(senderId) || [];
    results = context
      .filter(c => 
        (c.productInfo.product && c.productInfo.product.toLowerCase().includes(product?.toLowerCase() || '')) ||
        (c.productInfo.color && c.productInfo.color.toLowerCase().includes(product?.toLowerCase() || '')) ||
        (color && c.productInfo.color && c.productInfo.color.toLowerCase().includes(color.toLowerCase()))
      )
      .map(c => c.productInfo);
  }

  console.log('Final searchProduct results:', results);
  return results;
}

module.exports = { searchProduct };