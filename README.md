# FB Chatbot

A modular, AI-powered Facebook Messenger chatbot for product support, order handling, and smart customer engagement.  
Built with Node.js, OpenAI GPT-4, Postgres, Cloudinary, and a flexible product database.

---

## Features

- **Image Recognition:** Users can send product images; the bot identifies and matches them to your product catalog.
- **Product Q&A:** Customers can ask about product details, price, color, size, and more—bot answers using up-to-date product info.
- **Contextual Chat:** Handles follow-up questions like "Còn sản phẩm nào có màu này nữa không?" by tracking conversation context.
- **Order Support:** Collects and confirms order info, addresses, and preferences.
- **Batch Image Sending:** Sends multiple product images with header text, rate-limited to avoid Facebook API blocks.
- **History & Logging:** Stores chat and image history for each user.
- **Error Handling:** Friendly fallback messages and robust error logging.

---

## User Stories

### 1. Product Discovery by Image

**As a customer**,  
I want to send a photo of a dress I like,  
So that the bot can tell me which product it is and show me more details.

---

### 2. Ask for Product Details

**As a customer**,  
I want to ask about a product's material, price, or size,  
So that I can decide if I want to buy it.

---

### 3. Color Context Awareness

**As a customer**,  
I want to ask "Sản phẩm này có màu đen không?" and then "Còn sản phẩm nào có màu này nữa không?",  
So that the bot understands "màu này" means "đen" and shows me all black products.

---

### 4. Price Negotiation Handling

**As a customer**,  
If I ask "Mua 1 váy giá 200k được không?",  
I want the bot to politely explain the current price and any promotions.

---

### 5. Order Placement

**As a customer**,  
I want to provide my name, address, and phone number,  
So that the bot can confirm my order and send it to the store.

---

### 6. Batch Product Image Browsing

**As a customer**,  
When I ask for "đầm màu đỏ",  
I want the bot to send me a batch of red dress images, with a friendly header message.

---

### 7. Error Recovery

**As a customer**,  
If something goes wrong,  
I want the bot to apologize and ask me to try again, so I feel supported.

---

## Setup

1. **Clone the repo:**  
   `git clone https://github.com/your-org/fb-chatbot.git`

2. **Install dependencies:**  
   `npm install`

3. **Configure environment:**  
   - Set up `.env` with your Facebook, OpenAI, Postgres, and Cloudinary credentials.

4. **Run the bot:**  
   `npm start`

---

## Folder Structure

```
services/
  messageHandler/      # Modular message/event handlers
  messageUtils.js      # Extraction and helper functions
  eventAggregator.js   # Pending event logic
  imageHandler.js      # Image upload/vision logic
  textHandler.js       # Text message logic
  sendResponse.js      # Facebook response logic
  visionProductMatcher.js # Product image matching
  ...
db/
  productInfo.js       # Product database access
reference/
  promptData.js        # System prompt templates
cloudinary/
  cloudinaryUploader.js
```

---

## Customization

- **Add new product fields** in `db/productInfo.js`.
- **Tune prompts** in `reference/promptData.js` for your brand voice.
- **Add new intents** in `services/messageProcessing/processMessage.js`.

---

## License

MIT

---

## Authors

- Minh Nguyen