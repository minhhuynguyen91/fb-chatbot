const { OpenAI } = require('openai');
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const { getSystemPrompt } = require('../reference/promptData');

/**
 * Flatten and clean product images from productImages array.
 * Ensures each product image has a single, trimmed URL.
 */
function getFlattenedProductImages(productImages) {
  return productImages.flatMap(product => {
    return product.url
      .split(/\s+/)
      .map(url => url.trim())
      .filter(url => url.length > 0)
      .map(url => ({
        url,
        name: product.name,
        category: product.category
      }));
  });
}

/**
 * Compare a customer image with a list of product images using OpenAI Vision.
 * @param {string} customerImageUrl - The URL of the customer's image.
 * @param {Array} productImages - Array of { url, name, category } objects.
 * @param {number} [maxProducts=8] - Maximum number of product images to compare at once.
 * @returns {Promise<string>} - The model's response.
 */
async function compareImageWithProducts(customerImageUrl, productImages, maxProducts = 8) {
  const SYSTEM_PROMPT = getSystemPrompt();

  // Flatten and clean product images
  const flattenedProductImages = getFlattenedProductImages(productImages);

  // Limit the number of product images to avoid overwhelming the model
  const limitedProductImages = flattenedProductImages.slice(0, maxProducts);

  // Build prompt listing product names and categories
  let prompt = 'Ảnh khách gửi có giống sản phẩm nào trong các ảnh sau không? Nếu có, trả về tên sản phẩm và danh mục. Nếu không, trả lời "Không tìm thấy".\n';
  limitedProductImages.forEach((p, idx) => {
    prompt += `Ảnh ${idx + 1}: ${p.name} (${p.category})\n`;
  });

  console.log(prompt);
  console.log(limitedProductImages);
  // Build the message content for OpenAI API
  const content = [
    { type: 'text', text: prompt },
    { type: 'image_url', image_url: { url: customerImageUrl } },
    ...limitedProductImages.map(p => ({
      type: 'image_url',
      image_url: { url: p.url }
    }))
  ];

  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content }
  ];

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages,
    max_tokens: 200
  });

  return response.choices[0].message.content.trim();
}

module.exports = { compareImageWithProducts };