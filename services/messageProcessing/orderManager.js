const { getPartialOrder, setPartialOrder, clearPartialOrder } = require('../partialOrderStore');
const pool = require('../../db/pool');
const { getHistory } = require('../messageHistory');
const axios = require('axios');

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

async function getTagIdByText(pageId, tagText) {
  try {
    const pageAccessToken = process.env.PANCAKE_PAGE_TOKEN;
    if (!pageAccessToken) {
      console.error('Missing PANCAKE_PAGE_TOKEN in environment variables');
      return null;
    }

    const response = await axios.get(`https://pages.fm/api/public_api/v1/pages/${pageId}/tags`, {
      params: { page_access_token: pageAccessToken }
    });

    // Log the response for debugging
    console.log('Pancake API response (tags):', JSON.stringify(response.data, null, 2));

    if (!response.data || !Array.isArray(response.data.tags)) {
      console.error('Invalid API response: tags array not found');
      return null;
    }

    // Normalize text for comparison
    const normalizedTagText = tagText.normalize('NFC').toUpperCase();
    const tag = response.data.tags.find(t => t.text.normalize('NFC').toUpperCase() === normalizedTagText);
    if (!tag) {
      console.error(`Tag "${tagText}" not found. Available tags:`, response.data.tags.map(t => t.text));
      return null;
    }

    return tag.id;
  } catch (err) {
    console.error('Error fetching tags:', err.message);
    if (err.response) {
      console.error('API error response (tags):', JSON.stringify(err.response.data, null, 2));
    }
    return null;
  }
}

async function getConversationId(pageId, senderId) {
  try {
    const pageAccessToken = process.env.PANCAKE_PAGE_TOKEN;
    if (!pageAccessToken) {
      console.error('Missing PANCAKE_PAGE_TOKEN in environment variables');
      return null;
    }

    const response = await axios.get(`https://pages.fm/api/public_api/v1/pages/${pageId}/conversations`, {
      params: { page_access_token: pageAccessToken }
    });

    // Log the response for debugging
    console.log('Pancake API response (conversations):', JSON.stringify(response.data, null, 2));

    if (!response.data || !Array.isArray(response.data.conversations)) {
      console.error('Invalid API response: conversations array not found');
      return null;
    }

    const conversation = response.data.conversations.find(c => c.last_sent_by?.id === senderId);
    if (!conversation) {
      console.error(`Conversation for senderId ${senderId} not found`);
      return null;
    }

    return conversation.id;
  } catch (err) {
    console.error('Error fetching conversation:', err.message);
    if (err.response) {
      console.error('API error response (conversations):', JSON.stringify(err.response.data, null, 2));
    }
    return null;
  }
}

async function saveOrderInfo(senderId, orderInfo) {
  try {
    // Save order to the database
    const result = await pool.query(
      'INSERT INTO pool.order_info (sender_id, name, address, phone, product_name, color, size, quantity, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW()) RETURNING id',
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

    const orderId = result.rows[0].id;
    const pageId = process.env.PANCAKE_PAGE_ID;
    const pageAccessToken = process.env.PANCAKE_PAGE_TOKEN;

    // Validate environment variables
    if (!pageId || !pageAccessToken) {
      console.error('Missing PANCAKE_PAGE_ID or PANCAKE_PAGE_TOKEN in environment variables');
      return;
    }

    // Get tag ID dynamically
    const tagId = await getTagIdByText(pageId, 'ĐÃ TẠO ĐƠN') || 18;
    const conversationId = await getConversationId(pageId, senderId);

    if (!conversationId) {
      console.error(`Skipping tag assignment: No conversation ID found for senderId ${senderId}`);
      return;
    }

    if (tagId) {
      const pancakeApiUrl = `https://pages.fm/api/public_api/v1/conversations/${conversationId}/tags`;
      try {
        const response = await axios.post(
          pancakeApiUrl,
          { tag_id: tagId },
          {
            params: { page_access_token: pageAccessToken },
            headers: { 'Content-Type': 'application/json' }
          }
        );
        console.log(`Tag "ĐÃ TẠO ĐƠN" (ID: ${tagId}) added to conversation ${conversationId} for order ${orderId}`);
        console.log('Tag API response:', JSON.stringify(response.data, null, 2));
      } catch (tagErr) {
        console.error('Error adding tag:', tagErr.message);
        if (tagErr.response) {
          console.error('Tag API error response:', JSON.stringify(tagErr.response.data, null, 2));
        }
      }
    } else {
      console.error('Skipping tag assignment: Tag "ĐÃ TẠO ĐƠN" not found');
    }
  } catch (err) {
    console.error('Error saving order info:', err.message);
  }
}

async function handleOrderInfo(senderId, entities, prevOrder, userProfile) {
  let newInfo = entities.order_info || {};
  const possibleFields = ['name', 'address', 'phone', 'product_name', 'color', 'size', 'quantity'];
  if (Object.keys(newInfo).length === 0) {
    possibleFields.forEach(field => {
      if (entities[field]) newInfo[field] = entities[field];
    });
  }
  const orderInfo = mergeOrderInfo(prevOrder, newInfo);
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
    setPartialOrder(senderId, orderInfo);
    const missingList = missingFields.map(f => fieldNames[f]).join(', ');
    return { type: 'text', content: `Vui lòng cung cấp thêm thông tin ạ: ${missingList}.` };
  } else {
    await saveOrderInfo(senderId, orderInfo);
    clearPartialOrder(senderId);
    return { type: 'order', content: 'Thông tin đặt hàng đã được lưu. Cảm ơn ạ!' };
  }
}

module.exports = { mergeOrderInfo, saveOrderInfo, handleOrderInfo, getHistory };