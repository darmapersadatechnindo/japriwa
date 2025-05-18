// middleware/apiKey.js
module.exports = (req, res, next) => {
    const apiKey = req.headers['x-api-key'];
    if (!apiKey || apiKey !== "WhatsappRestApi2025") {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    next();
};
