const { OpenAI } = require('openai');
const { getSystemPrompt } = require('../../reference/promptData');
const { getProductDatabase } = require('../../db/productInfo');
const { getHistory } = require('../messageHistory');
const { imageContext } = require('./imageContext');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

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
          color: p.color || ''
        })),
    }))
  );

  const prompt = `
Phân tích tin nhắn người dùng: ${message}
Lịch sử hội thoại: ${JSON.stringify(messages)}
Ngữ cảnh sản phẩm: ${productContext}
Hình ảnh đã gửi gần đây: ${JSON.stringify(imageContext.getImageContext(senderId) || [])}

Yêu cầu:
- Nếu người dùng đề cập đến sản phẩm cụ thể như "Đầm Maxi có màu nào?" hoặc hỏi về màu sắc (ví dụ: "còn đầm nào màu đen nữa ko?") và có hình ảnh sản phẩm trong lịch sử (is_image: true với product_info) hoặc sentImageContext, hãy sử dụng product_info để xác định product/category/color.
- Xác định ý định của người dùng (intent):
  "image": nếu người dùng muốn xem hình ảnh (ví dụ: "cho xem ảnh", "gửi hình")
  "product_details": nếu người dùng muốn biết thông số hoặc chi tiết sản phẩm (ví dụ: "đầm maxi thế nào?")
  "price": nếu người dùng muốn biết giá sản phẩm hoặc trả giá (ví dụ: "giá bao nhiêu?", "150k bán ko?")
  "size_chart": nếu người dùng chỉ muốn biết các size có sẵn của sản phẩm (ví dụ: "Có size nào?", "Shop có size gì?")
  "size": nếu người dùng cần tư vấn size dựa trên cân nặng/chiều cao (ví dụ: "tôi 50kg thì mặc size nào?")
  "color": nếu người dùng hỏi về màu sắc sản phẩm hoặc yêu cầu danh sách sản phẩm theo màu (ví dụ: "Đầm Maxi có màu nào?", "còn đầm nào màu đen nữa ko?")
  "order_info": nếu người dùng cung cấp thông tin đặt hàng (ví dụ: "tôi muốn đặt đầm maxi màu đen size M")
  "general": cho các câu hỏi khác không thuộc các trường hợp trên
- Trích xuất thực thể (entities):
  product: sản phẩm cụ thể được đề cập (nếu có, ví dụ: "Đầm Maxi")
  category: danh mục sản phẩm được đề cập (nếu có, ví dụ: "Áo Quần")
  weight: cân nặng (nếu có)
  height: chiều cao (nếu có)
  bargain_price: giá khách hàng đề xuất (nếu có, ví dụ: "150k")
  order_info: object chứa các trường như name, address, phone, product_name, color, size, quantity nếu người dùng cung cấp
- Lưu ý:
  - Nếu ý định là "color" và người dùng hỏi về màu sắc của sản phẩm cụ thể (ví dụ: "Đầm Maxi có màu nào?"), đặt product là sản phẩm được đề cập (ví dụ: "Đầm Maxi"), category là danh mục liên quan (ví dụ: "Áo Quần"), và để color là chuỗi rỗng ("").
  - Nếu ý định là "color" và người dùng hỏi về sản phẩm theo màu (ví dụ: "còn đầm nào màu đen nữa ko?"), đặt product là chuỗi rỗng (""), category là danh mục liên quan (nếu có, ví dụ: "Áo Quần"), và color là màu được đề cập (ví dụ: "đen").
  - Nếu ý định là "order_info", trích xuất tất cả thông tin đặt hàng mà người dùng cung cấp. Nếu người dùng chỉ cung cấp một phần thông tin, kết hợp với thông tin từ lịch sử hội thoại (product_info hoặc tin nhắn trước) để hoàn thiện đơn hàng.
  - Nếu ý định là "product_details", "price", "size", hoặc "color", luôn cố gắng xác định product và category từ tin nhắn hiện tại hoặc lịch sử hội thoại gần nhất (sử dụng product_info từ lịch sử hoặc sentImageContext). Nếu người dùng dùng đại từ như "nó", "sản phẩm đó", lấy product/category từ product_info của tin nhắn trước đó trong lịch sử.
  - Nếu không xác định được product hoặc category từ tin nhắn hiện tại, lấy giá trị gần nhất từ product_info trong lịch sử hội thoại hoặc sentImageContext (nếu có).
  - Nếu không xác định được, trả về chuỗi rỗng cho các trường đó.

Định dạng đầu ra (JSON):
{
  "intent": "...",
  "entities": {
    "product": "...",
    "category": "...",
    "weight": "...",
    "height": "...",
    "bargain_price": "...",
    "order_info": {
      "name": "...",
      "address": "...",
      "phone": "...",
      "product_name": "...",
      "color": "...",
      "size": "...",
      "quantity": "..."
    }
  }
}
`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }],
    response_format: { type: 'json_object' },
  });

  console.log('analyzeMessage output:', response.choices[0].message.content);
  return JSON.parse(response.choices[0].message.content);
}

module.exports = { analyzeMessage };