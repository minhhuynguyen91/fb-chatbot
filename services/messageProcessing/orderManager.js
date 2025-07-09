const { getPartialOrder, setPartialOrder, clearPartialOrder } = require('../partialOrderStore');
const pool = require('../../db/pool');
const { getHistory } = require('../messageHistory');

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

async function saveOrderInfo(senderId, orderInfo) {
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