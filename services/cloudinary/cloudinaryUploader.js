const axios = require('axios');
const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

async function uploadMessengerImageToCloudinary(imageUrl, senderId) {
  const PAGE_ACCESS_TOKEN = process.env.FB_PAGE_ACCESS_TOKEN;
  try {
    const response = await axios.get(imageUrl, {
      headers: { Authorization: `Bearer ${PAGE_ACCESS_TOKEN}` },
      responseType: 'stream',
    });

    const contentType = response.headers['content-type'];
    if (!contentType.startsWith('image/')) {
      throw new Error('Invalid file type. Only images are allowed.');
    }

    const uploadResult = await new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        { folder: `messenger/${senderId}`, resource_type: 'image' },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      );
      response.data.pipe(uploadStream);
    });

    return uploadResult; // { secure_url, public_id, ... }
  } catch (error) {
    console.error('Error uploading Messenger image:', error.message);
    throw error;
  }
}

async function deleteFromCloudinary(publicId) {
  try {
    await cloudinary.uploader.destroy(publicId, { resource_type: 'image' });
    console.log(`Deleted image from Cloudinary: ${publicId}`);
  } catch (error) {
    console.error('Error deleting image from Cloudinary:', error.message);
    // Optionally, you can throw or just log
  }
}

module.exports = { uploadMessengerImageToCloudinary, deleteFromCloudinary };