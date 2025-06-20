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
    // Remove the image limit
    const productImages = getCleanedProductImages(productList); // No .slice()

    let prompt = 'Ảnh khách gửi có giống sản phẩm nào trong các ảnh sau không? Nếu có, trả về số thứ tự ảnh, tên sản phẩm và danh mục cho từng ảnh trùng khớp. Nếu không, trả lời "Không tìm thấy".\n';
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