const express = require('express');
const router = express.Router();
const CategoryController = require('../controllers/categoryController');
const { isAdmin } = require('../middleware/authMiddleware');

// GET /categories - Get all categories (public)
router.get('/', CategoryController.getAll);

// GET /categories/:id - Get single category
router.get('/:id', CategoryController.getById);

// POST /categories - Create category (admin only)
router.post('/', isAdmin, CategoryController.create);

// PUT /categories/:id - Update category (admin only)
router.put('/:id', isAdmin, CategoryController.update);

// DELETE /categories/:id - Delete category (admin only)
router.delete('/:id', isAdmin, CategoryController.delete);

module.exports = router;
