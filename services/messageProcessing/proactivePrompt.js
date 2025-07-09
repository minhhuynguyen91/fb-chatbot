const { OpenAI } = require('openai');
const { getHistory } = require('../messageHistory');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function getGptProactivePrompt(senderId, entities, prevOrder, userProfile, PRODUCT_DATABASE, SYSTEM_PROMPT, response) {
  const { product, category, color } = entities || {};
  const userName = userProfile ? `${userProfile.first_name} ${userProfile.last_name}` : 'khách';
  const history = (await getHistory(senderId)).slice(-10);
  const partialOrderFields = prevOrder ? Object.entries(prevOrder)
    .filter(([_, value]) => value && value.toString().trim() !== '')
    .map(([key, value]) => `${key}: ${value}`)
    .join(', ') : 'không có';
  const latestResponse = response.type === 'text' ? response.content : 'Không có phản hồi văn bản';

  const prompt = `
${SYSTEM_PROMPT}

Bạn là trợ lý bán hàng thân thiện và chuyên nghiệp cho một cửa hàng thương mại điện tử, luôn xưng là "em" và gọi khách hàng là theo tên (${userName}). Nhiệm vụ của bạn là tạo một câu gợi ý ngắn gọn, tự nhiên và hấp dẫn để khuyến khích khách hàng đặt hàng hoặc tiếp tục cung cấp thông tin đặt hàng, dựa trên phản hồi gần nhất của em và ngữ cảnh hội thoại hiện tại.

Ngữ cảnh:
- Danh mục sản phẩm: ${[...new Set(PRODUCT_DATABASE.map(r => r.category))].join(', ')}
- Sản phẩm hiện tại (nếu được đề cập): ${product || 'không có'}
- Danh mục hiện tại (nếu được đề cập): ${category || 'không có'}
- Màu sắc (nếu được đề cập): ${color || 'không có'}
- Thông tin đơn hàng tạm thời (nếu có): ${partialOrderFields}
- Phản hồi gần nhất của em: ${latestResponse}
- Lịch sử hội thoại (10 tin nhắn gần nhất): ${JSON.stringify(history)}

Yêu cầu:
- Tạo một gợi ý ngắn gọn (1-2 câu, tối đa 50 token) để khuyến khích khách hàng chọn sản phẩm cụ thể, màu sắc, size hoặc cung cấp thông tin đặt hàng (ví dụ: tên, địa chỉ, số điện thoại).
- Nếu phản hồi gần nhất đã liệt kê danh sách sản phẩm hoặc màu sắc, KHÔNG lặp lại danh sách này. Thay vào đó, gợi ý khách hàng chọn một sản phẩm cụ thể, màu sắc hoặc cung cấp thông tin đặt hàng.
- Nếu phản hồi là tư vấn size, gợi ý đặt hàng với size đã đề xuất.
- Nếu phản hồi là bảng size hoặc màu sắc, khuyến khích khách hàng chọn size/màu và tiếp tục đặt hàng.
- Nếu không có thông tin sản phẩm hoặc đơn hàng rõ ràng, đưa ra gợi ý chung để xem hoặc đặt hàng.
- Giữ giọng điệu thân thiện, lịch sự, tự nhiên, bằng tiếng Việt.
- Tránh lặp lại nội dung của phản hồi gần nhất hoặc gây cảm giác ép buộc.

Định dạng đầu ra:
Trả về một chuỗi văn bản thuần túy (không JSON, không markdown, không nằm trong dấu nháy ' hoặc ").

Ví dụ đầu ra:
- ${userName} thấy mẫu đầm nào ưng ý chưa ạ? Chọn mẫu và size để em giữ đơn nhé! 💖
- ${userName} đã chọn được màu và size nào chưa ạ? Cho em xin thông tin đặt hàng nhé! 💕
- ${userName} muốn đặt hàng sản phẩm nào hôm nay không ạ? Em sẵn sàng hỗ trợ! 😊
  `;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 50,
      temperature: 0.7,
    });
    return response.choices[0].message.content.trim();
  } catch (error) {
    console.error('Error generating proactive prompt:', error);
    return '';
  }
}

module.exports = { getGptProactivePrompt };