const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

async function uploadToCloudinary(imageBuffer) {
  // Uploads the buffer as a base64 data URI
  const uploadStr = `data:image/jpeg;base64,${imageBuffer.toString('base64')}`;
  const result = await cloudinary.uploader.upload(uploadStr, {
    folder: 'customer_uploads', // Optional: organize uploads
    resource_type: 'image',
  });
  return result.secure_url;
}

async function deleteFromCloudinary(publicId) {
  await cloudinary.uploader.destroy(publicId, { resource_type: 'image' });
}

module.exports = { uploadToCloudinary, deleteFromCloudinary };