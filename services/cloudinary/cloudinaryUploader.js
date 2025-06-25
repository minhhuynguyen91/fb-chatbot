const axios = require('axios');
const cloudinary = require('cloudinary').v2;
const sharp = require('sharp');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

async function uploadMessengerImageToCloudinary(imageUrl, senderId) {
  const PAGE_ACCESS_TOKEN = process.env.FB_PAGE_ACCESS_TOKEN;
  try {
    // Fetch the source image
    const response = await axios.get(imageUrl, {
      headers: { Authorization: `Bearer ${PAGE_ACCESS_TOKEN}` },
      responseType: 'arraybuffer', // Use arraybuffer for binary data
    });

    const contentType = response.headers['content-type'];
    if (!contentType.startsWith('image/')) {
      throw new Error('Invalid file type. Only images are allowed.');
    }

    // Get source image size
    const sourceImageSize = Buffer.byteLength(response.data);
    console.log(`Source image size: ${sourceImageSize} bytes`);

    // Compress the image using sharp (aggressive compression)
    const compressedImageBuffer = await sharp(response.data)
      .resize({ width: 800, withoutEnlargement: true }) // Resize to max 800px width
      .jpeg({ quality: 50 }) // Low quality for aggressive compression
      .toBuffer();

    // Get compressed image size
    const compressedImageSize = Buffer.byteLength(compressedImageBuffer);
    console.log(`Compressed image size: ${compressedImageSize} bytes`);
    console.log(`Size reduction: ${((sourceImageSize - compressedImageSize) / sourceImageSize * 100).toFixed(2)}%`);

    // Upload the compressed image to Cloudinary
    const uploadResult = await new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        { folder: `messenger/${senderId}`, resource_type: 'image' },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      );
      require('stream').Readable.from(compressedImageBuffer).pipe(uploadStream);
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
  }
}

module.exports = { uploadMessengerImageToCloudinary, deleteFromCloudinary };