const express = require('express');
const router = express.Router();
const BackupController = require('../controllers/backupController');
const { isAdmin } = require('../middleware/authMiddleware');

// GET /admin/backup - Download DB dump
router.get('/backup', isAdmin, BackupController.createDump);

// POST /admin/restore - Restore DB from dump
// Note: Requires body-parser text middleware in server.js
router.post('/restore', isAdmin, BackupController.restoreDump);

module.exports = router;
