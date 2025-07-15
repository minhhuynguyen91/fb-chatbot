const { getPartialOrder, setPartialOrder, clearPartialOrder } = require('../partialOrderStore');
const pool = require('../../db/pool');
const { getHistory } = require('../messageHistory');
const axios = require('axios'); // Add axios for making HTTP requests

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
    const response = await axios.get(`https://pages.fm/api/public_api/v1/pages/${process.env.PANCAKE_PAGE_ID}/tags`, {
      headers: {
        Authorization: `Bearer ${process.env.PANCAKE_PAGE_TOKEN}`
      }
    });
    const tag = response.data.tags.find(t => t.text === tagText);
    return tag ? tag.id : null;
  } catch (err) {
    console.error('Error fetching tags:', err);
    return null;
  }
}

async function saveOrderInfo(senderId, orderInfo) {
  try {
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
    const pageId = process.env.PANCAKE_PAGE_ID; // Store your page ID in environment variables
    const tagId = await getTagIdByText(pageId, 'ĐÃ TẠO ĐƠN');
    
    if (tagId) {
      const pancakeApiUrl = `https://pages.fm/api/public_api/v1/leads/${senderId}/tags`;
      await axios.post(
        pancakeApiUrl,
        { tag_id: tagId },
        {
          headers: {
            Authorization: `Bearer ${process.env.PANCAKE_PAGE_ID}`,
            'Content-Type': 'application/json'
          }
        }
      );
      console.log(`Tag "ĐÃ TẠO ĐƠN" (ID: ${tagId}) added to order ${orderId}`);
    } else {
      console.error('Tag "ĐÃ TẠO ĐƠN" not found');
    }
  } catch (err) {
    console.error('Error saving order info or adding tag:', err);
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