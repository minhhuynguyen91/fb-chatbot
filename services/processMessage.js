const { OpenAI } = require('openai');
const { getSystemPrompt } = require('../reference/promptData');
const {getProductDatabase} = require('../db/productInfo.js');
const { getHistory } = require('./messageHistory');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });


async function processMessage(senderId, message) {
  const SYSTEM_PROMPT = getSystemPrompt();
  const PRODUCT_DATABASE = getProductDatabase();
  try {
    const analysis = await analyzeMessage(senderId, message);
    return await handleIntent(analysis, senderId, PRODUCT_DATABASE, SYSTEM_PROMPT);
    } catch (error) {
      console.error('Error processing message:', error);
      return { type: 'text', content: 'Sorry, something went wrong!' };
    }
}

async function handleIntent(analysis, senderId, PRODUCT_DATABASE, SYSTEM_PROMPT) {
  const { intent, entities } = analysis;
  const { product, category } = entities || {};

  switch (intent) {
    case 'image': {
      const image = await searchProduct(PRODUCT_DATABASE, product, category);
      if (image) {
        return { type: 'image', image_url: image.image_url };
      } else {
        return { type: 'text', content: 'Không tìm thấy ảnh, vui lòng chọn sản phẩm khác ạ' };
      }
    }
    case 'product_details': {
      const targetProduct = await searchProduct(PRODUCT_DATABASE, product, category);
      if (targetProduct) {
        return { type: 'text', content: targetProduct.product_details };
      } else {
        return { type: 'text', content: 'Không tìm thấy sản phẩm, vui lòng tìm sản phẩm khác ạ' };
      }
    }
    case 'price': {
      const targetProduct = await searchProduct(PRODUCT_DATABASE, product, category);
      if (targetProduct) {
        return { type: 'text', content: targetProduct.price };
      } else {
        return { type: 'text', content: 'Hiện tại bên em ko tìm thấy giá sản phẩm, vui lòng tìm sản phẩm khác ạ' };
      }
    }
    default: {
      // General intent or fallback to OpenAI chat
      const messages = [
        { role: 'system', content: SYSTEM_PROMPT },
        ...(await getHistory(senderId)).slice(-6)
      ];
      const chatResponse = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages,
        max_tokens: 150
      });
      const responseText = chatResponse.choices[0].message.content.trim();
      return { type: 'text', content: responseText };
    }
  }
}

async function analyzeMessage(senderId, message) {
  const SYSTEM_PROMPT = getSystemPrompt();
  const PRODUCT_DATABASE = getProductDatabase();
  const messages = [{ role: 'system', content: SYSTEM_PROMPT }, ...(await getHistory(senderId)).slice(-6)];
  const result = PRODUCT_DATABASE;
  const productContext = JSON.stringify(
    [...new Set(result.map(r => r.category))].map(category => ({
      category,
      products: result
        .filter(r => r.category === category)
        .map(p => ({
          product: p.product,
          synonyms: p.synonyms,
        })),
    }))
  );

  const prompt = `
Phân tích tin nhắn người dùng: ${message}
Lịch sử hội thoại: ${messages}
Ngữ cảnh sản phẩm: ${productContext}

Xác định ý định của người dùng:
  "image" : nếu người dùng muốn xem hình ảnh
  "product_details" : nếu người dùng muốn biết thông số hoặc chi tiết sản phẩm
  "price" : nếu người dùng muốn biết giá sản phẩm
  "general" : cho các câu hỏi khác

Trích xuất thực thể:
  product: sản phẩm cụ thể được đề cập (ví dụ: "điện thoại", "áo sơ mi"), hoặc chuỗi rỗng nếu không có.
    - Sử dụng sản phẩm cuối cùng trong lịch sử nếu tin nhắn đề cập đến nó (ví dụ: "nó" hoặc "sản phẩm đó").
  
    category: danh mục sản phẩm được đề cập (ví dụ: "điện tử", "quần áo"), hoặc chuỗi rỗng nếu không có.

Lưu ý:
- Cân nhắc từ đồng nghĩa, lỗi chính tả, và cách diễn đạt tự nhiên trong tiếng Việt (ví dụ: "đầm" và "váy" mang cùng nghĩa)
- Tuân theo phong cách giao tiếp trong lịch sử hội thoại (hoặc mặc định nếu không có lịch sử):
- Thân thiện, chuyên nghiệp, sử dụng tiếng Việt, lịch sự.

Định dạng đầu ra:
Trả về đối tượng JSON với intent và entities (product và category).

Ví dụ kết quả: { "intent": "product_details", "entities": { "product": "Đầm Midi", "category": "Áo Quần" } }
Nếu không xác định được product hoặc category, trả về chuỗi rỗng cho các trường đó.

  `;
  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }],
    response_format: { type: 'json_object' },
  });

  console.log(response.choices[0].message.content)
  return JSON.parse(response.choices[0].message.content);
}

async function searchProduct(database, product, category) {
  const cat = category.toLowerCase();
  const prod = product.toLowerCase();

  // If both category and product are provided, return the matching item
  return database.filter(item =>
    item.category.toLowerCase() === cat &&
    item.product.toLowerCase() === prod
  );
}

module.exports = { processMessage };