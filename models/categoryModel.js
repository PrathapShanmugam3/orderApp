const pool = require('../config/database');

class CategoryModel {
    // Get all categories
    static async findAll() {
        const [rows] = await pool.execute('SELECT * FROM expense_categories ORDER BY name ASC');
        return rows;
    }

    // Find category by ID
    static async findById(id) {
        const [rows] = await pool.execute('SELECT * FROM expense_categories WHERE id = ?', [id]);
        return rows[0] || null;
    }

    // Find category by name
    static async findByName(name) {
        const [rows] = await pool.execute('SELECT * FROM expense_categories WHERE name = ?', [name]);
        return rows[0] || null;
    }

    // Create category
    static async create(name, icon = '📦', color = '#6B7280') {
        const [result] = await pool.execute(
            'INSERT INTO expense_categories (name, icon, color) VALUES (?, ?, ?)',
            [name, icon, color]
        );
        return { id: result.insertId, name, icon, color };
    }

    // Update category
    static async update(id, name, icon, color) {
        await pool.execute(
            'UPDATE expense_categories SET name = ?, icon = ?, color = ? WHERE id = ?',
            [name, icon, color, id]
        );
        return { id: parseInt(id), name, icon, color };
    }

    // Delete category
    static async delete(id) {
        await pool.execute('DELETE FROM expense_categories WHERE id = ?', [id]);
        return true;
    }
}

module.exports = CategoryModel;
