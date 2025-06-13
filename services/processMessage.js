const { OpenAI } = require('openai');
const { getSystemPrompt } = require('../reference/promptData');
const {getProductDatabase} = require('../db/productInfo.js');
const { getHistory } = require('./messageHistory');
const { getPartialOrder, setPartialOrder, clearPartialOrder } = require('./partialOrderStore');
const pool = require('../db/pool.js');
const getUserProfile = require('./getUserProfile.js');

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

// Merge only non-empty new fields into previous order
function mergeOrderInfo(prevOrder, newInfo) {
  const fields = ['name', 'address', 'phone', 'product_name', 'color', 'size', 'quantity'];
  const merged = { ...prevOrder };
  for (const field of fields) {
    if (newInfo[field] && newInfo[field].toString().trim() !== '') {
      merged[field] = newInfo[field];
    }
  }
  return merged;
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

    case 'order_info': {
      // Get previous partial order for this user
      const prevOrder = getPartialOrder(senderId);

      // Try to get new info from entities.order_info, or fallback to direct fields
      let newInfo = entities.order_info || {};

      // Fallback: If order_info is empty, but a single field is present at the root, use it
      const possibleFields = ['name', 'address', 'phone', 'product_name', 'color', 'size', 'quantity'];
      if (Object.keys(newInfo).length === 0) {
        possibleFields.forEach(field => {
          if (entities[field]) newInfo[field] = entities[field];
        });
      }

      // Merge new info with previous info, only non-empty fields overwrite
      const orderInfo = mergeOrderInfo(prevOrder, newInfo);

      // List required fields
      const requiredFields = possibleFields;
      const fieldNames = {
        name: 'tên người nhận',
        address: 'địa chỉ',
        phone: 'số điện thoại',
        product_name: 'tên sản phẩm',
        color: 'màu sắc',
        size: 'kích cỡ',
        quantity: 'số lượng'
      };
      const missingFields = requiredFields.filter(field => !orderInfo[field] || orderInfo[field].toString().trim() === '');

      if (missingFields.length > 0) {
        // Save the merged partial order for next turn
        setPartialOrder(senderId, orderInfo);
        const missingList = missingFields.map(f => fieldNames[f] || f).join(', ');
        return {
          type: 'text',
          content: `Vui lòng cung cấp thêm thông tin ạ: ${missingList}.`
        };
      }

      // All fields present, save to DB and clear partial order
      await saveOrderInfo(senderId, orderInfo);
      clearPartialOrder(senderId);
      return { type: 'order', content: 'Thông tin đặt hàng đã được lưu. Cảm ơn ạ!' };
    }

    case 'size': {
      const targetProduct = await searchProduct(PRODUCT_DATABASE, product, category);
      if(targetProduct) {
        const message = [
          { role: 'system', content: targetProduct.size },...(await getHistory(senderId)).slice(-6)
        ];
        const chatResponse = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          message,
          max_tokens: 150
        });
        const responseText = chatResponse.choices[0].message.content.trim();
        return { type: 'text', content: responseText };
      } else {
        return {type: 'text', content: 'Không tìm thấy size cho sản phẩm này, vui lòng chọn sản phẩm khác ạ!'}
      }
    }

    case 'color': {
      const targetProduct = await searchProduct(PRODUCT_DATABASE, product, category);
      if (targetProduct) {
        return { type: 'text', content: 'Đây là màu sản phẩm của em hiện có ạ\n'+ targetProduct.color };
      } else {
        return { type: 'text', content: 'Hiện tại bên em ko tìm thấy giá sản phẩm, vui lòng tìm sản phẩm khác ạ' };
      }
    }

    default: {
      // General intent or fallback to OpenAI chat
      const userProfile = await getUserProfile(senderId);
      const prompt=` ${SYSTEM_PROMPT}, luôn gọi khách hàng bằng tên ${userProfile.first_name} ${userProfile.last_name}`
      const messages = [
        { role: 'system', content: prompt },
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
  "size" : nếu người dùng cần hỏi kích cỡ sản phẩm dựa theo chiều cao hoặc cân nặng
  "color" : nếu người dùng cần biết màu sắc sản phẩm
  "order_info" : nếu người dùng cung cấp thông tin đặt hàng (ví dụ: tên, địa chỉ, số điện thoại, tên sản phẩm, màu sắc, kích cỡ, số lượng)
  "general" : cho các câu hỏi khác

Trích xuất thực thể:
  product: sản phẩm cụ thể được đề cập (nếu có)
  category: danh mục sản phẩm được đề cập (nếu có)
  order_info: object chứa các trường như name, address, phone, product_name, color, size, quantity nếu người dùng cung cấp

Lưu ý:
- Nếu ý định là "order_info", hãy trích xuất tất cả thông tin đặt hàng mà người dùng cung cấp.
- Nếu người dùng chỉ cung cấp một phần thông tin, hãy kết hợp với thông tin đã có trong lịch sử hội thoại để hoàn thiện đơn hàng.
- Nếu người dùng chỉ cung cấp một trường thông tin, hãy trả về order_info với trường đó và các trường còn lại là chuỗi rỗng.
- Nếu không xác định được, trả về chuỗi rỗng cho các trường đó.

Định dạng đầu ra:
Trả về định dạng JSON
{ "intent": "...", "entities": { "product": "...", "category": "...", "order_info": { "name": "...", "address": "...", "phone": "...", "product_name": "...", "color": "...", "size": "...", "quantity": "..." } } }
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

async function saveOrderInfo(senderId, orderInfo) {
  // Replace with your DB logic
  try {
    await pool.query(
      'INSERT INTO pool.order_info (sender_id, name, address, phone, product_name, color, size, quantity, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())',
      [
        senderId,
        orderInfo.name,
        orderInfo.address,
        orderInfo.phone,
        orderInfo.product_name,
        orderInfo.color,
        orderInfo.size,
        orderInfo.quantity
      ]
    );
  } catch (err) {
    console.error('Error saving order info:', err);
  }
}

module.exports = { processMessage };