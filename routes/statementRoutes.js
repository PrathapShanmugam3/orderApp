const express = require('express');
const router = express.Router();
const multer = require('multer');
const statementController = require('../controllers/statementController');
const authMiddleware = require('../middleware/authMiddleware');

// Configure Multer for memory storage
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// Route to upload and parse statement
// Protected by authMiddleware to ensure only logged-in users can parse
router.post('/upload', authMiddleware.isAuthenticated, upload.single('file'), statementController.parseStatement);

module.exports = router;
