const pool = require('../config/database');

class ExpenseModel {
    // Create expense
    static async create(userId, amount, category, date, notes) {
        const formattedDate = new Date(date).toISOString().slice(0, 19).replace('T', ' ');
        const [result] = await pool.execute(
            'INSERT INTO expense (user_id, amount, category, date, notes) VALUES (?, ?, ?, ?, ?)',
            [userId, amount, category, formattedDate, notes || '']
        );
        return { id: result.insertId, userId, amount, category, date, notes };
    }

    // Get all expenses for user
    static async findByUserId(userId) {
        const [rows] = await pool.execute(
            'SELECT * FROM expense WHERE user_id = ? ORDER BY date DESC',
            [userId]
        );
        return rows;
    }

    // Get expenses by date
    static async findByDate(userId, date) {
        const [rows] = await pool.execute(
            'SELECT * FROM expense WHERE user_id = ? AND DATE(date) = ? ORDER BY date DESC',
            [userId, date]
        );
        return rows;
    }

    // Get expenses by month
    static async findByMonth(userId, year, month) {
        const [rows] = await pool.execute(
            'SELECT * FROM expense WHERE user_id = ? AND YEAR(date) = ? AND MONTH(date) = ? ORDER BY date DESC',
            [userId, year, month]
        );
        return rows;
    }

    // Get expenses by year
    static async findByYear(userId, year) {
        const [rows] = await pool.execute(
            'SELECT * FROM expense WHERE user_id = ? AND YEAR(date) = ? ORDER BY date DESC',
            [userId, year]
        );
        return rows;
    }

    // Get summary (today, month, year totals)
    static async getSummary(userId) {
        // Construct local date string YYYY-MM-DD
        const now = new Date();
        const year = now.getFullYear();
        const month = now.getMonth() + 1;
        const day = now.getDate();
        const today = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

        console.log(`[ExpenseModel] Getting summary for userId: ${userId}, Date: ${today}`);

        const [[todayResult]] = await pool.execute(
            'SELECT COALESCE(SUM(amount), 0) as total FROM expense WHERE user_id = ? AND DATE(date) = ?',
            [userId, today]
        );
        const [[monthResult]] = await pool.execute(
            'SELECT COALESCE(SUM(amount), 0) as total FROM expense WHERE user_id = ? AND YEAR(date) = ? AND MONTH(date) = ?',
            [userId, year, month]
        );
        const [[yearResult]] = await pool.execute(
            'SELECT COALESCE(SUM(amount), 0) as total FROM expense WHERE user_id = ? AND YEAR(date) = ?',
            [userId, year]
        );

        console.log('[ExpenseModel] Summary results:', {
            today: todayResult.total,
            month: monthResult.total,
            year: yearResult.total
        });

        return {
            today: parseFloat(todayResult.total),
            month: parseFloat(monthResult.total),
            year: parseFloat(yearResult.total)
        };
    }

    // Get category totals
    static async getCategoryTotals(userId) {
        const [rows] = await pool.execute(
            'SELECT category, SUM(amount) as total FROM expense WHERE user_id = ? GROUP BY category ORDER BY total DESC',
            [userId]
        );
        return rows;
    }

    // Get day-wise totals for a month
    static async getDayWiseTotals(userId, year, month) {
        const [rows] = await pool.execute(
            'SELECT DAY(date) as day, SUM(amount) as total FROM expense WHERE user_id = ? AND YEAR(date) = ? AND MONTH(date) = ? GROUP BY DAY(date) ORDER BY day DESC',
            [userId, year, month]
        );
        return rows;
    }

    // Get month-wise totals for a year
    static async getMonthWiseTotals(userId, year) {
        const [rows] = await pool.execute(
            'SELECT MONTH(date) as month, SUM(amount) as total FROM expense WHERE user_id = ? AND YEAR(date) = ? GROUP BY MONTH(date) ORDER BY month ASC',
            [userId, year]
        );
        return rows;
    }

    // Update expense
    static async update(id, amount, category, date, notes) {
        const formattedDate = new Date(date).toISOString().slice(0, 19).replace('T', ' ');
        await pool.execute(
            'UPDATE expense SET amount = ?, category = ?, date = ?, notes = ? WHERE id = ?',
            [amount, category, formattedDate, notes, id]
        );
        return { id: parseInt(id), amount, category, date, notes };
    }

    // Delete expense
    static async delete(id) {
        await pool.execute('DELETE FROM expense WHERE id = ?', [id]);
        return true;
    }

    // Check if transaction exists
    static async findByTransactionId(userId, transactionId) {
        const [rows] = await pool.execute(
            'SELECT id FROM expense WHERE user_id = ? AND transaction_id = ?',
            [userId, transactionId]
        );
        return rows.length > 0;
    }

    // Create expense with transaction ID
    static async createWithTransactionId(userId, amount, category, date, notes, transactionId) {
        const formattedDate = new Date(date).toISOString().slice(0, 19).replace('T', ' ');
        const [result] = await pool.execute(
            'INSERT INTO expense (user_id, amount, category, date, notes, transaction_id) VALUES (?, ?, ?, ?, ?, ?)',
            [userId, amount, category, formattedDate, notes || '', transactionId]
        );
        return { id: result.insertId, userId, amount, category, date, notes, transactionId };
    }
}

module.exports = ExpenseModel;
