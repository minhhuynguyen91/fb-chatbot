const { OpenAI } = require('openai');
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const { getSystemPrompt } = require('../reference/promptData');
const getUserProfile = require('./getUserProfile.js');

/**
 * Clean and flatten product images from productList.
 * Ensures each product image has a single, trimmed URL.
 */
function getCleanedProductImages(productList) {
    return productList.flatMap(product => {
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

/**
 * Compare customer image with product images and return a structured response.
 */
async function compareImageWithProducts(customerImageUrl, productList, senderId) {
    const SYSTEM_PROMPT = getSystemPrompt();
    const productImages = getCleanedProductImages(productList);
    const userProfile = await getUserProfile(senderId) || { first_name: 'Khách', last_name: '' }; // Fallback if null

    let prompt = `Dưới đây là một ảnh khách gửi (Ảnh khách), tiếp theo là các ảnh sản phẩm được đánh số từ 1 đến ${productImages.length}. 
Nhiệm vụ của bạn: So sánh Ảnh khách với từng ảnh sản phẩm theo thứ tự. 
- Nếu có ảnh sản phẩm nào giống Ảnh khách, trả về định dạng: 
    Dạ ${userProfile.first_name} ${userProfile.last_name} sản phẩm giống với ảnh là:
    **[Tên sản phẩm] ([Danh mục])**.

- Chỉ trả về tên sản phẩm và danh mục của ảnh trùng khớp đầu tiên
- Nếu không, trả về: "Dạ, em không tìm thấy".
Giọng điệu thân thiện với khách, chỉ trả lời theo định dạng yêu cầu.\n`;

    productImages.forEach((p, idx) => {
        prompt += `Ảnh ${idx + 1}: ${p.name} (${p.category})\n`;
    });

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

    try {
        const response = await openai.chat.completions.create({
            model: 'gpt-4.1',
            messages,
            max_tokens: 1024
        });
        return response.choices[0].message.content.trim();
    } catch (error) {
        console.error('OpenAI API error for sender:', senderId, error.message);
        return 'Dạ, em gặp lỗi khi so sánh ảnh. Vui lòng thử lại.';
    }
}

/**
 * Extract product name and category from model response.
 * Supports multiple formats: "*name (category)*", "Tên sản phẩm: name, Danh mục: category"
 */
function extractProductInfo(modelResponse) {
    let name = '', category = '';

    const match1 = modelResponse.match(/\*\s*([^\*]+)\s*\(([^)]+)\)\s*\*/);
    if (match1) {
        name = match1[1].trim();
        category = match1[2].trim();
    } else {
        const match2 = modelResponse.match(/Tên sản phẩm:\s*([^\,]+),\s*Danh mục:\s*([^\,]+)/i);
        if (match2) {
            name = match2[1].trim();
            category = match2[2].trim();
        }
    }

    return name && category ? { name, category } : null;
}

/**
 * Find product details from productList by name and category.
 */
function findProductDetails({ name, category }, productList) {
    return productList.find(
        p => (p.name === name || p.product === name) && p.category === category
    );
}

/**
 * Compare customer image and return detailed product information.
 */
async function compareAndGetProductDetails(customerImageUrl, productList, senderId) {
    const modelResponse = await compareImageWithProducts(customerImageUrl, productList, senderId);
    const response = { text: modelResponse, imgUrl: '' };

    if (/không tìm thấy|gặp lỗi/i.test(modelResponse)) {
        return response;
    }

    const info = extractProductInfo(modelResponse);
    if (!info) return response;

    const product = findProductDetails(info, productList);
    if (product) {
        const textResp = `
${modelResponse}

Giá sản phẩm: 
${product.price || 'Không có thông tin'}
Bảng size: 
${product.size || 'Không có thông tin'}
Các màu hiện có: 
${product.color || 'Không có thông tin'}
`;
        response.text = textResp;
        response.imgUrl = product.image_url || '';
    }

    return response;
}

module.exports = { compareAndGetProductDetails };