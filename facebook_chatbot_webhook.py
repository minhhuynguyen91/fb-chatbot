import os
import logging
from flask import Flask, request
import requests
from pyfacebook import GraphAPI
from openai import OpenAI
from dotenv import load_dotenv


# Configure logging
logging.basicConfig(level=logging.DEBUG, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

app = Flask(__name__)

# Configuration
PAGE_ACCESS_TOKEN = os.getenv('chat_FB_TG_page')
VERIFY_TOKEN = os.getenv('chatbot_FB_TG_key')
OPENAI_API_KEY = os.getenv('OPENAI_KEY')
CERT_PERM_PATH = os.getenv('CERT_PERM_PATH')
KEY_PERM_PATH = os.getenv('KEY_PERM_PATH')

API_URL = "https://graph.facebook.com/v17.0/me/messages"

# Initialize Facebook Graph API
try:
    api = GraphAPI(access_token=PAGE_ACCESS_TOKEN)
    logger.info("Graph API initialized successfully")
except Exception as e:
    logger.error(f"Failed to initialize Graph API: {e}")

# Initialize OpenAI client
try:
    openai_client = OpenAI(api_key=OPENAI_API_KEY)
    logger.info("OpenAI client initialized successfully")
except Exception as e:
    logger.error(f"Failed to initialize OpenAI client: {e}")

# Generate response using ChatGPT
def generate_ai_response(user_message):
    try:
        logger.debug(f"Sending message to ChatGPT: {user_message}")
        response = openai_client.chat.completions.create(
            model="gpt-3.5-turbo",  # or "gpt-4" if available
            messages=[
                {"role": "system", "content": "You are a helpful assistant for a Facebook Business Page. Provide concise, friendly, and informative responses."},
                {"role": "user", "content": user_message}
            ],
            max_tokens=150,
            temperature=0.7
        )
        response_text = response.choices[0].message.content.strip()
        logger.debug(f"ChatGPT response: {response_text}")
        return response_text
    except Exception as e:
        logger.error(f"Error generating ChatGPT response: {e}")
        return "Sorry, I'm having trouble responding right now. Please try again!"

# Webhook verification
@app.route('/webhook', methods=['GET'])
def verify_webhook():
    try:
        mode = request.args.get('hub.mode')
        token = request.args.get('hub.verify_token')
        challenge = request.args.get('hub.challenge')
        
        logger.debug(f"Verification request: mode={mode}, token={token}, challenge={challenge}")
        
        if mode == 'subscribe' and token == VERIFY_TOKEN:
            logger.info("Webhook verified successfully")
            return challenge, 200
        else:
            logger.error(f"Verification failed: mode={mode}, token={token}")
            return "Verification token mismatch", 403
    except Exception as e:
        logger.error(f"Error in verify_webhook: {e}")
        return "Internal server error", 500

# Handle incoming messages
@app.route('/webhook', methods=['POST'])
def handle_webhook():
    try:
        data = request.get_json()
        logger.debug(f"Received webhook data: {data}")
        
        if data.get('object') == 'page':
            for entry in data.get('entry', []):
                for messaging_event in entry.get('messaging', []):
                    if 'message' in messaging_event and 'text' in messaging_event['message']:
                        sender_id = messaging_event['sender']['id']
                        message_text = messaging_event['message']['text']
                        logger.info(f"Received message from {sender_id}: {message_text}")
                        
                        # Generate AI response
                        response_text = generate_ai_response(message_text)
                        
                        # Send response back to user
                        send_message(sender_id, response_text)
        return "EVENT_RECEIVED", 200
    except Exception as e:
        logger.error(f"Error in handle_webhook: {e}")
        return "Internal server error", 500

# Function to send message via Facebook Messenger API
def send_message(recipient_id, message_text):
    try:
        payload = {
            'recipient': {'id': recipient_id},
            'message': {'text': message_text},
            'access_token': PAGE_ACCESS_TOKEN
        }
        response = requests.post(API_URL, params={'access_token': PAGE_ACCESS_TOKEN}, json=payload)
        if response.status_code != 200:
            logger.error(f"Failed to send message: {response.text}")
        else:
            logger.info(f"Message sent to {recipient_id}: {message_text}")
        return response.json()
    except Exception as e:
        logger.error(f"Error sending message: {e}")
        return None

if __name__ == '__main__':
    logger.info("Starting Flask server with HTTPS on port 5000")
    # Use SSL context for HTTPS
    ssl_context = (CERT_PERM_PATH, KEY_PERM_PATH)  # Replace with your certificate and key file paths
    app.run(host='0.0.0.0', port=5000, debug=True, ssl_context=ssl_context)