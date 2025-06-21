const { OpenAI } = require('openai');
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const { getSystemPrompt } = require('../reference/promptData');


/**
 * Clean and flatten product images from productList.
 * Ensures each product image has a single, trimmed URL.
 */
function getCleanedProductImages(productList) {
    return productList.flatMap(product => {
        // Support both 'image_url' and 'url' keys for compatibility
        const rawUrl = product.image_url || product.url || '';
        return rawUrl
            .split(/\s+/)
            .map(url => url.trim())
            .filter(url => url.length > 0)
            .map(url => ({
                url,
                name: product.product || product.name || '',
                category: product.category || ''
            }));
    });
}

async function compareImageWithProducts(customerImageUrl, productList) {
    const SYSTEM_PROMPT = getSystemPrompt();
    const productImages = getCleanedProductImages(productList);

    let prompt = `Dưới đây là một ảnh khách gửi (Ảnh khách), tiếp theo là các ảnh sản phẩm được đánh số từ 1 đến ${productImages.length}. 
Nhiệm vụ của bạn: So sánh Ảnh khách với từng ảnh sản phẩm theo thứ tự. Nếu có ảnh sản phẩm nào giống Ảnh khách, chỉ trả về tên sản phẩm và danh mục của ảnh trùng khớp đầu tiên. Giọng điệu thân thiện với khách

Nếu không, trả lời "Dạ, em không tìm thấy".\n`;

    productImages.forEach((p, idx) => {
        prompt += `Ảnh ${idx + 1}: ${p.name} (${p.category})\n`;
    });

    // console.log(prompt);
    // console.log(productImages);

    // Build the message array with explicit text before each image
    const content = [
        { type: 'text', text: prompt },
        { type: 'text', text: 'Ảnh khách:' },
        { type: 'image_url', image_url: { url: customerImageUrl } },
    ];

    productImages.forEach((p, idx) => {
        content.push({ type: 'text', text: `Ảnh ${idx + 1}: ${p.name} (${p.category})` });
        content.push({ type: 'image_url', image_url: { url: p.url } });
    });

    const messages = [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content }
    ];

    const response = await openai.chat.completions.create({
        model: 'gpt-4.1',
        messages,
        max_tokens: 200
    });

    return response.choices[0].message.content.trim();
}

module.exports = { compareImageWithProducts };