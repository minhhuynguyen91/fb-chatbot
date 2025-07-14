const { searchProduct } = require('./productSearcher');
const { mergeOrderInfo, saveOrderInfo, handleOrderInfo, getHistory } = require('./orderManager');
const { getGptProactivePrompt } = require('./proactivePrompt');
const { OpenAI } = require('openai');
const getUserProfile = require('../getUserProfile');
const { getPartialOrder, setPartialOrder, clearPartialOrder } = require('../partialOrderStore');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function handleIntent(analysis, message, senderId, PRODUCT_DATABASE, SYSTEM_PROMPT) {
  const { intent, entities } = analysis;
  const { product, category } = entities || {};
  const userProfile = await getUserProfile(senderId);
  const prevOrder = getPartialOrder(senderId);
  let response;

  switch (intent) {
    case 'image': {
      const images = await searchProduct(PRODUCT_DATABASE, product, category, senderId);
      response = images.length > 0
        ? { type: 'image', image_url: images.map(image => image.image_url).join('\n') }
        : { type: 'text', content: 'Không tìm thấy ảnh, vui lòng chọn sản phẩm khác ạ' };
      break;
    }
    case 'product_details': {
      const targetProduct = (await searchProduct(PRODUCT_DATABASE, product, category, senderId))?.[0];
      if (targetProduct) {
        const systemPrompt = `
          ${SYSTEM_PROMPT}
          Tên sản phẩm: ${targetProduct.product}
          Danh mục: ${targetProduct.category}
          Chi tiết: ${(targetProduct.product_details || '').trim() || 'Chưa có thông tin chi tiết.'}
          Giá: ${(targetProduct.price || '').trim() || 'Chưa có giá.'}
          Nếu khách hỏi về thông tin không có trong chi tiết sản phẩm, hãy trả lời lịch sự rằng hiện tại bên em chưa có thông tin đó và sẽ kiểm tra lại hoặc khách có thể liên hệ để biết thêm chi tiết. Luôn trả lời ngắn gọn, thân thiện, bằng tiếng Việt.
        `.trim();

        const messages = [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: message }
        ];

        const chatResponse = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages,
          max_tokens: 200
        });

        response = { type: 'text', content: chatResponse.choices[0].message.content.trim() };
      } else {
        response = { type: 'text', content: 'Hiện tại bên em ko tìm thấy thông tin của sản phẩm này' };
      }
      break;
    }
    case 'price': {
      const targetProduct = (await searchProduct(PRODUCT_DATABASE, product, category, senderId))?.[0];
      if (targetProduct) {
        const systemPrompt = `
          ${SYSTEM_PROMPT}
          Tên sản phẩm: ${targetProduct.product}
          Danh mục: ${targetProduct.category}
          Giá: ${(targetProduct.price || '').trim() || 'Chưa có giá.'}
          Giá khách hàng đề xuất: ${entities.bargain_price || 'Không có'}
          Chi tiết: ${(targetProduct.product_details || '').trim() || 'Chưa có thông tin chi tiết.'}
          Nếu khách hàng trả giá, hãy trả lời lịch sự rằng giá đã được niêm yết hoặc đang có chương trình khuyến mãi tốt nhất hiện tại. Nếu giá đề xuất hợp lý, có thể gợi ý chương trình khuyến mãi (nếu có). Luôn khuyến khích khách hàng đặt hàng và cung cấp thông tin như size, địa chỉ. Giữ giọng điệu thân thiện, tự nhiên, bằng tiếng Việt.
        `.trim();

        const messages = [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: message }
        ];

        const chatResponse = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages,
          max_tokens: 100
        });

        response = { type: 'text', content: chatResponse.choices[0].message.content.trim() };
      } else {
        response = { type: 'text', content: 'Hiện tại bên em ko tìm thấy thông tin sản phẩm này, vui lòng chọn sản phẩm khác ạ!' };
      }
      break;
    }
    case 'order_info': {
      response = await handleOrderInfo(senderId, entities, prevOrder, userProfile);
      break;
    }
    case 'size': {
      const customerWeight = entities.weight || '';
      const customerHeight = entities.height || '';
      const targetProduct = (await searchProduct(PRODUCT_DATABASE, product, category, senderId))?.[0];
      if (targetProduct && (customerWeight || customerHeight)) {
        const sizePrompt = `
          Sản phẩm: ${targetProduct.product}
          Danh mục: ${targetProduct.category}
          Thông tin khách hàng: ${customerWeight ? `Cân nặng: ${customerWeight}` : ''} ${customerHeight ? `Chiều cao: ${customerHeight}` : ''}
          Bảng size sản phẩm: ${(targetProduct.size || '').trim()}
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
          max_tokens: 150
        });
        response = { type: 'text', content: chatResponse.choices[0].message.content.trim() };
      } else if (!customerWeight && !customerHeight) {
        response = { type: 'text', content: 'Vui lòng cung cấp cân nặng và/hoặc chiều cao để được tư vấn size phù hợp nhé!' };
      } else {
        response = { type: 'text', content: 'Không tìm thấy sản phẩm hoặc bảng size, vui lòng chọn sản phẩm khác ạ!' };
      }
      break;
    }
    case 'size_chart': {
      const targetProduct = (await searchProduct(PRODUCT_DATABASE, product, category, senderId))?.[0];
      response = targetProduct && targetProduct.size
        ? { type: 'text', content: `Dạ ${userProfile.first_name} ${userProfile.last_name}, đây là bảng size cho sản phẩm ${targetProduct.product}:\n${targetProduct.size.trim()}` }
        : { type: 'text', content: 'Hiện tại bên em chưa có bảng size cho sản phẩm này.' };
      break;
    }
    case 'color': {
      const targetColor = entities.color || '';
      const targetProduct = entities.product || '';
      const userName = userProfile ? `${userProfile.first_name} ${userProfile.last_name}` : 'khách';
      
      if (targetProduct && !targetColor) {
        // Case: Asking for colors of a specific product (e.g., "Đầm Maxi có màu nào?")
        const product = await searchProduct(PRODUCT_DATABASE, targetProduct, category, senderId);
        if (product.length > 0) {
          const colors = product[0].color
            .split('\n')
            .map(c => c.trim())
            .filter(c => c)
            .map(c => c.replace(/^\d+\.\s*/, '')) // Remove numbering like "1. "
            .join(', ');
          response = {
            type: 'text',
            content: `Dạ ${userName} ơi, đầm ${targetProduct} hiện có các màu: ${colors}. Mình muốn chọn màu nào ạ? 💖`
          };
        } else {
          response = {
            type: 'text',
            content: `Hiện tại bên em chưa có thông tin về đầm ${targetProduct}, vui lòng liên hệ để biết thêm chi tiết ạ!`
          };
        }
      } else {
        // Case: Asking for products of a specific color (e.g., "còn đầm nào màu đen nữa ko?")
        const products = await searchProduct(PRODUCT_DATABASE, targetProduct, category, senderId, targetColor);
        if (products.length > 0) {
          const productNames = products.map(p => p.product).join(', ');
          response = {
            type: 'text',
            content: `Dạ ${userName} ơi, bên em có các đầm màu ${targetColor} sau đây nè: ${productNames}. Mình muốn xem chi tiết mẫu nào ạ? 💖`
          };
        } else {
          response = {
            type: 'text',
            content: `Hiện tại bên em chưa có đầm màu ${targetColor}, vui lòng liên hệ để biết thêm chi tiết ạ!`
          };
        }
      }
      break;
    }
    default: {
      const userName = userProfile ? `${userProfile.first_name} ${userProfile.last_name}` : 'khách';
      if (entities.product && message.toLowerCase().includes('màu nào')) {
        // Fallback for color queries misclassified as general
        const product = await searchProduct(PRODUCT_DATABASE, entities.product, category, senderId);
        if (product.length > 0) {
          const colors = product[0].color
            .split('\n')
            .map(c => c.trim())
            .filter(c => c)
            .map(c => c.replace(/^\d+\.\s*/, '')) // Remove numbering like "1. ")
            .join(', ');
          response = {
            type: 'text',
            content: `Dạ ${userName} ơi, đầm ${entities.product} hiện có các màu: ${colors}. Mình muốn chọn màu nào ạ? 💖`
          };
        } else {
          response = {
            type: 'text',
            content: `Hiện tại bên em chưa có thông tin về đầm ${entities.product}, vui lòng liên hệ để biết thêm chi tiết ạ!`
          };
        }
      } else {
        // Handle vague purchase requests by suggesting dress products
        const vaguePurchaseKeywords = ['mua đồ', 'muốn mua', 'có bán gì', 'có gì bán', 'mua quần áo'];
        const isVaguePurchase = vaguePurchaseKeywords.some(keyword => message.toLowerCase().includes(keyword));
        if (isVaguePurchase) {
          const categories = [...new Set(PRODUCT_DATABASE.map(r => r.category))];
          const dressCategory = categories.includes('Áo Quần') ? 'Áo Quần' : categories[0] || 'sản phẩm';
          const products = await searchProduct(PRODUCT_DATABASE, '', dressCategory, senderId);
          const productList = products.length > 0
            ? products.slice(0, 5).map(p => `- ${p.product} (${p.color ? `màu: ${p.color.split('\n').filter(c => c).join(', ')}` : 'nhiều màu'})`).join('\n')
            : 'Đầm Maxi, Đầm Bodycon, Đầm Chữ A, Đầm Suông, Đầm Midi';
          response = {
            type: 'text',
            content: `Dạ ${userName} ơi, bên em có rất nhiều mẫu đầm xinh xắn trong danh mục ${dressCategory} nè:\n\n${productList}\n\nMình thích mẫu nào hoặc muốn xem thêm về giá, size, hay màu sắc thì cho em biết nha! 💖`
          };
        } else {
          const prompt = `
            ${SYSTEM_PROMPT} 
            Danh mục sản phẩm: ${[...new Set(PRODUCT_DATABASE.map(r => r.category))].join(', ')},
            Luôn gọi khách hàng bằng tên: ${userName}
          `;
          const messages = [
            { role: 'system', content: prompt },
            ...(await getHistory(senderId)).slice(-6)
          ];
          const chatResponse = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages,
            max_tokens: 150
          });
          response = { type: 'text', content: chatResponse.choices[0].message.content.trim() };
        }
      }
    }
  }

  if (intent !== 'order_info' && response.type === 'text') {
    const proactivePromptText = await getGptProactivePrompt(senderId, entities, prevOrder, userProfile, PRODUCT_DATABASE, SYSTEM_PROMPT, response);
    if (proactivePromptText) {
      response.content += `\n${proactivePromptText}`;
    }
  }

  return response;
}

module.exports = { handleIntent };