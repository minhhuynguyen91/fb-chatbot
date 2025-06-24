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
      const image = (await searchProduct(PRODUCT_DATABASE, product, category))?.[0];
      if (image) {
        return { type: 'image', image_url: image.image_url };
      } else {
        return { type: 'text', content: 'Không tìm thấy ảnh, vui lòng chọn sản phẩm khác ạ' };
      }
    }
    case 'product_details': {
      const targetProduct = (await searchProduct(PRODUCT_DATABASE, product, category))?.[0];
      if (targetProduct) {
        const detailText = (targetProduct.product_details || '').trim();
        console.log(detailText);
        return { type: 'text', content: detailText || 'Hiện tại bên em chưa có thông tin cho sản phẩm này, vui lòng liên hệ để biết thêm chi tiết ạ!' };
      } else {
        return { type: 'text', content: 'Hiện tại bên em ko tìm thấy thông tin của sản phẩm này' };
      }
    }
    case 'price': {
      const targetProduct = (await searchProduct(PRODUCT_DATABASE, product, category))?.[0];
      if (targetProduct) {
        const priceText = (targetProduct.price || '').trim();
        console.log(priceText);
        return { type: 'text', content: priceText || 'Hiện tại bên em chưa có giá cho sản phẩm này, vui lòng liên hệ để biết thêm chi tiết ạ!' };
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
      // Extract customer info (weight, height) from entities if available
      const customerWeight = entities.weight || '';
      const customerHeight = entities.height || '';
      const targetProduct = (await searchProduct(PRODUCT_DATABASE, product, category))?.[0];

      if (targetProduct && (customerWeight || customerHeight)) {
        // Compose a prompt for ChatGPT to recommend a size
        const sizePrompt = `
    Sản phẩm: ${targetProduct.product}
    Danh mục: ${targetProduct.category}
    Thông tin khách hàng: ${customerWeight ? `Cân nặng: ${customerWeight}` : ''} ${customerHeight ? `Chiều cao: ${customerHeight}` : ''}
    Bảng size sản phẩm: 
    ${(targetProduct.size || '').trim()}

    Dựa vào thông tin trên, hãy tư vấn size phù hợp cho khách hàng bằng tiếng Việt, ngắn gọn, thân thiện.
    Luôn xưng bản thân là em.
        `.trim();

        const messages = [
          { role: 'system', content: sizePrompt },
          ...(await getHistory(senderId)).slice(-10)
        ];
        const chatResponse = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages,
          max_tokens: 1024
        });
        const responseText = chatResponse.choices[0].message.content.trim();
        return { type: 'text', content: responseText };
      } else if (!customerWeight && !customerHeight) {
        return { type: 'text', content: 'Vui lòng cung cấp cân nặng và/hoặc chiều cao để được tư vấn size phù hợp nhé!' };
      } else {
        return { type: 'text', content: 'Không tìm thấy sản phẩm hoặc bảng size, vui lòng chọn sản phẩm khác ạ!' };
      }
    }

    case 'size_chart': {
      const targetProduct = (await searchProduct(PRODUCT_DATABASE, product, category))?.[0];
      if (targetProduct && targetProduct.size) {
        return { type: 'text', content: `Bảng size cho sản phẩm ${targetProduct.product}:\n${targetProduct.size.trim()}` };
      } else {
        return { type: 'text', content: 'Hiện tại bên em chưa có bảng size cho sản phẩm này.' };
      }
    }

    case 'color': {
      const targetProduct = (await searchProduct(PRODUCT_DATABASE, product, category))?.[0];;
      if (targetProduct) {
        const colorText = (targetProduct.color || '').trim();
        console.log(colorText);
        return { type: 'text', content: ('Màu bên em đang có đây ạ:' + colorText )  || 'Hiện tại bên em chưa có màu của sản phẩm này, vui lòng liên hệ để biết thêm chi tiết ạ' };
      } else {
        return { type: 'text', content: 'Hiện tại bên em chưa có màu của sản phẩm này, vui lòng liên hệ để biết thêm chi tiết ạ' };
      }
    }

    default: {
      try {
        const userProfile = await getUserProfile(senderId);
        const prompt = `
    ${SYSTEM_PROMPT} 
    Danh mục sản phẩm :${PRODUCT_DATABASE}, 
    Luôn gọi khách hàng bằng tên: ${userProfile.first_name} ${userProfile.last_name}
    `
        const messages = [
          { role: 'system', content: prompt },
          ...(await getHistory(senderId)).slice(-10)
        ];
        const chatResponse = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages,
          max_tokens: 1024
        });
        const responseText = chatResponse.choices[0].message.content.trim();
        return { type: 'text', content: responseText };
      } catch (err) {
        console.error('Error in handleIntent default case:', err);
        return { type: 'text', content: 'Xin lỗi, em không hiểu ý khách. Khách có thể hỏi lại giúp em nhé!' };
      }
    }
  }
}

async function analyzeMessage(senderId, message) {
  const SYSTEM_PROMPT = getSystemPrompt();
  const PRODUCT_DATABASE = getProductDatabase();

  const messages = [{ role: 'system', content: SYSTEM_PROMPT }, ...(await getHistory(senderId)).slice(-10)];
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
Lịch sử hội thoại: ${JSON.stringify(messages)}
Ngữ cảnh sản phẩm: ${productContext}

Yêu cầu:
- Xác định ý định của người dùng (intent):
  "image" : nếu người dùng muốn xem hình ảnh
  "product_details" : nếu người dùng muốn biết thông số hoặc chi tiết sản phẩm
  "price" : nếu người dùng muốn biết giá sản phẩm
  "size_chart" : nếu người dùng chỉ muốn biết các size có sẵn của sản phẩm
  "size" : nếu người dùng cần tư vấn size dựa trên cân nặng/chiều cao
  "color" : nếu người dùng cần biết màu sắc sản phẩm
  "order_info" : nếu người dùng cung cấp thông tin đặt hàng (ví dụ: tên, địa chỉ, số điện thoại, tên sản phẩm, màu sắc, kích cỡ, số lượng)
  "general" : cho các câu hỏi khác

- Trích xuất thực thể (entities):
  product: sản phẩm cụ thể được đề cập (nếu có)
  category: danh mục sản phẩm được đề cập (nếu có)
  order_info: object chứa các trường như name, address, phone, product_name, color, size, quantity nếu người dùng cung cấp

Lưu ý:
- Nếu ý định là "order_info", hãy trích xuất tất cả thông tin đặt hàng mà người dùng cung cấp.
- Nếu người dùng chỉ cung cấp một phần thông tin, hãy kết hợp với thông tin đã có trong lịch sử hội thoại để hoàn thiện đơn hàng.
- Nếu người dùng chỉ cung cấp một trường thông tin, hãy trả về order_info với trường đó và các trường còn lại là chuỗi rỗng.
- Nếu ý định là "product_details", "price", "size", hoặc "color", luôn cố gắng xác định product và category từ tin nhắn hiện tại hoặc lịch sử hội thoại gần nhất. Nếu user dùng đại từ như "nó", "sản phẩm đó", hãy lấy product/category từ câu trước đó trong lịch sử.
- Nếu người dùng chỉ hỏi về các size có sẵn (ví dụ: "Có size nào?", "Shop có size gì?"), đặt intent là "size_chart" và KHÔNG trích xuất weight/height.
- Nếu người dùng hỏi tư vấn size dựa trên cân nặng/chiều cao, đặt intent là "size" và trích xuất weight/height nếu có.
- Nếu không xác định được product hoặc category từ tin nhắn hiện tại, hãy lấy giá trị gần nhất từ lịch sử hội thoại (nếu có).
- Nếu không xác định được, trả về chuỗi rỗng cho các trường đó.


Định dạng đầu ra:
Trả về định dạng JSON:
{
  "intent": "...",
  "entities": {
    "product": "...",
    "category": "...",
    "weight": "...",
    "height": "...",
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