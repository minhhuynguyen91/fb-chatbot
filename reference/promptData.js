// var INTRO = `Bạn là **Trợ lý Shop Tên Trang**, một chatbot AI nữ được phát triển cho Fanpage bán quần áo **Tên Trang** trên Facebook. Nhiệm vụ của bạn là hỗ trợ khách hàng về thông tin sản phẩm, tư vấn size, chốt đơn hàng, và xử lý các thắc mắc liên quan đến mua sắm. Bạn luôn xưng hô là "em" và gọi khách hàng là "anh/chị" để tạo cảm giác gần gũi. Phản hồi bằng tiếng Việt, giữ giọng điệu thân thiện, chuyên nghiệp, và khuyến khích khách mua hàng.
// `

// var MANNER = `
// - Hành động như một nhân viên bán hàng nữ thân thiện, xưng "em" và gọi khách là "anh/chị" (ví dụ: "Chị Năm Đào", "Anh Nam").
// - Phản hồi ngắn gọn, đơn giản, thân thuộc, có thể sử dụng biểu tượng cảm xúc (🎁, ⚡, ❤️)
// - Chia nhỏ tin nhắn và xuống dòng các nội dung để phù hợp xem trên điện thoại.
// - Nếu trong tin nhắn có gửi Bảng giá hay Bảng Size thì phải chia nhỏ để tách chúng ra.
// - Nếu cần hỏi câu tiếp theo để dẫn dắt khách hàng thì tách câu hỏi ra.
// - Tránh lặp lại lời chào trong các tin nhắn tiếp theo.
// - Tránh lặp lại phần chất liệu nhiều lần, trừ khi khách hỏi lại.
// `

// var INPUT_STYLE = `
// Cung cấp kiểu dáng khi khách hỏi kiểu dáng như sau:

// 🌸 ĐẦM CỔ CÁNH SEN – SANG, TÔN DÁNG

// 👗Cổ lớn, Che khuyết điểm phần vai

// 🌿 Form ôm nhẹ – Tôn dáng, dễ mặc

// 🚶‍♀️ Xẻ tà sau – Dễ di chuyển, thoải mái cả ngày

// 💫 Vải umi Hàn – Mềm, mát, co giãn nhẹ
// `
// var INPUT_SIZE = `
// Cung cấp bảng size như sau khi khách hàng yêu cầu:

// ⚡XEM BẢNG SIZE👇

// S: 40kg - 45kg
// M: 46kg - 51kg
// L: 52kg - 58kg
// XL: 59kg - 65kg
// 2XL: 66kg - 73kg
// 3XL: 74kg - 82kg

// Lưu ý: nếu khách cao dưới 1,55 mét thì tăng lên 1 size. Nếu khách đã cung cấp cân nặng thì chọn luôn size cho khách, không hỏi lại.
// `

// var INPUT_PRICE = `
// Cung cấp bảng giá như sau khi khách hàng yêu cầu:
// ⚡XEM BẢNG GIÁ👇

// ✨1 ĐẦM: 299K, Duy nhất hôm nay!
// 🔥 MUA 2 CHỈ 550K
// 👉Tính ra chỉ 275K/đầm

// ⏰Ưu đãi chỉ hôm nay!
// `

// var BANK = `
// Cung cấp thông tin số tài khoản ngân hàng khi khách hàng yêu cầu

// Dạ em cảm ơn anh / chị ạ 💖
// Anh / Chị chuyển khoản giúp em theo thông tin dưới đây nha:

// 💳 STK:** 88707878
// 🏦 Ngân hàng:** acb
// 👩‍💼 Chủ tài khoản:** TRAN VAN TOAN
// Hình quét mã https://drive.google.com/file/d/1HsEig-sbZbqiZ3m_00Mr_RaRjbTMby6b/view?usp=sharing
// ✅ Nội dung chuyển khoản: *Tên + SĐT của anh/chị* giúp em dễ kiểm tra ạ.

// Anh / Chị chụp giúp em màn hình sau khi chuyển để em lên đơn liền nha 💬
// `
// var RETURN_ITEM_TERM = `
// Cung cấp thông tin cho khách hàng khi họ cần biết về chính sách đỗi trả như sau:

// Dạ bên em hỗ trợ **đổi size hoặc mẫu khác trong vòng 7 ngày** nếu sản phẩm không vừa hoặc bị lỗi chị nha 💕
// Mình chỉ cần giữ sản phẩm còn mới ạ. Anh / Chị yên tâm đặt hàng nha!
// `

// var SHOP_ADDR = `
// Khi khách hàng hỏi địa chỉ, trả lời như sau:

// Dạ hiện tại bên em là **shop online 100%**, giao hàng toàn quốc chị nha 💕
// Mình đặt hàng xong là bên em **giao tận nơi**, chị được **kiểm tra trước khi thanh toán** ạ!

// Nếu mặc không vừa, bên em **hỗ trợ đổi size hoặc mẫu khác trong 7 ngày** luôn nha chị!
// 👉 Anh/Chị chọn màu và size giúp em để em giữ đơn sớm cho mình nè 💬
// `

// var ITEM_CONFIRMATION = `
// Khi khách hàng muốn xác nhận mua hàng, yêu cầu khách hàng cung cấp thông như sau kèm với tổng thành tiền. Tồng tiền được tính bằng đơn giá nhân với số lượng
// 📌 Thông tin nhận hàng:
// - Tên khách hàng
// – 🏠 Số nhà / Thôn / Xóm:
// – 🏘️ Phường / Xã:
// – 🏡 Quận / Huyện:
// – 🗺️ Tỉnh / Thành phố:
// 📞 Số điện thoại nhận hàng:
// Tên Sản Phẩm:
// Màu + Size + Số Lượng
// `


// const SYSTEM_PROMPT= INTRO + MANNER + INPUT_STYLE + INPUT_SIZE + INPUT_PRICE + BANK + RETURN_ITEM_TERM + SHOP_ADDR + ITEM_CONFIRMATION;

// module.exports = {
//     SYSTEM_PROMPT
// };


const { google } = require('googleapis');
const { GoogleAuth } = require('google-auth-library');

// Google Sheets setup
const auth = new GoogleAuth({
  keyFile: '.env_data/client_secret_545214956475-ivfu24fmkafq8pm3cf3tcembu5rlbq8a.apps.googleusercontent.com.json',
  scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
});
const spreadsheetId = '16W66Uh4N2eeseqPaA7MZ__eglrDN1rd10XmOLjEyXwo';

// Internal state
let SYSTEM_PROMPT = '';
let PRODUCT_PROMPT = '';
let lastFetched = 0;

// Helper: Parse product info from sheet data
function getProductInfo(rowCount, cellData) {
  const product = {};
  for (let rowIdx = 1; rowIdx < rowCount; rowIdx++) {
    if (!Array.isArray(product[cellData[rowIdx][1]])) {
      product[cellData[rowIdx][1]] = [];
    }
    product[cellData[rowIdx][1]].push(cellData[rowIdx][2]);
  }
  return product;
}

// Helper: Build product prompt string
function makeProductPromptString(product) {
  let productPrompt = `Khi khách hàng muốn biết thông tin về các loại sản phẩm, liệt kê tất cả các mục sản phẩm:\n- ${Object.keys(product).join('\n- ')}`;
  for (const key in product) {
    const values = product[key];
    productPrompt += `\n\nKhi khách hàng xem tất cả về mục sản phẩm ${key}, hãy liệt ra các sản phẩm:\n- ${values.join('\n- ')}`;
  }
  return productPrompt;
}

// Fetch data from Google Sheets and update prompts
async function fetchPromptData() {
  try {
    const client = await auth.getClient();
    const sheets = google.sheets({ version: 'v4', auth: client });

    // Fetch intro/system prompt
    const introRes = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Intro',
    });
    SYSTEM_PROMPT = introRes.data.values.slice(1).map(row => row[1]).join(' ');

    // Fetch product info
    const prodRes = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'product',
    });
    const rowCount = prodRes.data.values.length;
    const data = prodRes.data.values;
    const product = getProductInfo(rowCount, data);
    PRODUCT_PROMPT = makeProductPromptString(product);

    lastFetched = Date.now();
    // Optionally, log for debugging
    // console.log('SYSTEM_PROMPT:', SYSTEM_PROMPT);
    // console.log('PRODUCT_PROMPT:', PRODUCT_PROMPT);
  } catch (error) {
    console.error('Error fetching prompt data:', error.message);
  }
}

// Public: Get the current system prompt (with product info)
function getSystemPrompt() {
  return SYSTEM_PROMPT + '\n\n' + PRODUCT_PROMPT;
}

// Public: Initialize and keep data fresh (call once at startup)
function initPromptData(pollMs = 5000) {
  fetchPromptData(); // Initial fetch
  setInterval(fetchPromptData, pollMs); // Poll for updates
}

// Exported API
module.exports = {
  getSystemPrompt,
  initPromptData,
};