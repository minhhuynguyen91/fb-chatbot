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

    let prompt = `Ảnh khách gửi là ảnh đầu tiên bên dưới. Các ảnh sản phẩm được đánh số thứ tự từ 1 đến ${productImages.length} theo thứ tự xuất hiện tiếp theo. 
Hãy xác định xem ảnh khách gửi có giống ảnh sản phẩm nào không. Nếu có, chỉ trả về tên sản phẩm và danh mục của ảnh trùng khớp đầu tiên. Nếu không, trả lời "Không tìm thấy".\n`;
    productImages.forEach((p, idx) => {
        prompt += `Ảnh ${idx + 1}: ${p.name} (${p.category})\n`;
    });

    console.log(prompt);
    console.log(productImages);

    const messages = [
        { role: 'system', content: SYSTEM_PROMPT },
        {
            role: 'user',
            content: [
                { type: 'text', text: prompt },
                { type: 'image_url', image_url: { url: customerImageUrl } },
                ...productImages.map(p => ({
                    type: 'image_url',
                    image_url: { url: p.url }
                }))
            ]
        }
    ];

    const response = await openai.chat.completions.create({
        model: 'gpt-4.1',
        messages,
        max_tokens: 200
    });

    return response.choices[0].message.content.trim();
}

module.exports = { compareImageWithProducts };