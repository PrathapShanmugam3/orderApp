const CategoryModel = require('../models/categoryModel');

class CategoryController {
    // Get all categories
    static async getAll(req, res) {
        try {
            const categories = await CategoryModel.findAll();
            res.json(categories);
        } catch (err) {
            console.error('Get categories error:', err);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    }

    // Get single category
    static async getById(req, res) {
        try {
            const category = await CategoryModel.findById(req.params.id);
            if (!category) {
                return res.status(404).json({ error: 'Category not found' });
            }
            res.json(category);
        } catch (err) {
            console.error('Get category error:', err);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    }

    // Create category (admin only)
    static async create(req, res) {
        const { name, icon, color } = req.body;
        try {
            const existing = await CategoryModel.findByName(name);
            if (existing) {
                return res.status(400).json({ error: 'Category already exists' });
            }

            const category = await CategoryModel.create(name, icon, color);
            res.status(201).json(category);
        } catch (err) {
            console.error('Create category error:', err);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    }

    // Update category (admin only)
    static async update(req, res) {
        const { id } = req.params;
        const { name, icon, color } = req.body;
        try {
            const category = await CategoryModel.update(id, name, icon, color);
            res.json(category);
        } catch (err) {
            console.error('Update category error:', err);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    }

    // Delete category (admin only)
    static async delete(req, res) {
        try {
            await CategoryModel.delete(req.params.id);
            res.json({ message: 'Category deleted' });
        } catch (err) {
            console.error('Delete category error:', err);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    }
}

module.exports = CategoryController;
