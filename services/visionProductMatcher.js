const { OpenAI } = require('openai');
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const { getSystemPrompt } = require('../reference/promptData');


async function compareImageWithProducts(customerImageUrl, productList) {
    const SYSTEM_PROMPT = getSystemPrompt();

    // Limit to first 5 products for demo; batch if you have many products
    const productImages = productList.slice(0, 5).map(p => ({
        url: p.image_url,
        name: p.product,
        category: p.category
    }));

    let prompt = 'Ảnh khách gửi có giống sản phẩm nào trong các ảnh sau không? Nếu có, trả về tên sản phẩm và danh mục. Nếu không, trả lời "Không tìm thấy".\n';
    productImages.forEach((p, idx) => {
        prompt += `Ảnh ${idx + 1}: ${p.name} (${p.category})\n`;
    });

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
        model: 'gpt-4o',
        messages,
        max_tokens: 200
    });

    return response.choices[0].message.content.trim();
}

module.exports = { compareImageWithProducts };