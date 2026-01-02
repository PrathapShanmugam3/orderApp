const ExpenseModel = require('../models/expenseModel');

class ExpenseController {
    // Create expense
    static async create(req, res) {
        const { userId, amount, category, date, notes } = req.body;
        try {
            const expense = await ExpenseModel.create(userId, amount, category, date, notes);
            res.status(201).json(expense);
        } catch (err) {
            console.error('Create expense error:', err);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    }

    // Get all expenses for user
    static async getByUser(req, res) {
        try {
            const expenses = await ExpenseModel.findByUserId(req.params.userId);
            res.json(expenses);
        } catch (err) {
            console.error('Get expenses error:', err);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    }

    // Get expenses by date
    static async getByDate(req, res) {
        const { userId, date } = req.params;
        try {
            const expenses = await ExpenseModel.findByDate(userId, date);
            res.json(expenses);
        } catch (err) {
            console.error('Get expenses by date error:', err);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    }

    // Get expenses by month
    static async getByMonth(req, res) {
        const { userId, year, month } = req.params;
        try {
            const expenses = await ExpenseModel.findByMonth(userId, year, month);
            res.json(expenses);
        } catch (err) {
            console.error('Get expenses by month error:', err);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    }

    // Get expenses by year
    static async getByYear(req, res) {
        const { userId, year } = req.params;
        try {
            const expenses = await ExpenseModel.findByYear(userId, year);
            res.json(expenses);
        } catch (err) {
            console.error('Get expenses by year error:', err);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    }

    // Get summary
    static async getSummary(req, res) {
        try {
            const summary = await ExpenseModel.getSummary(req.params.userId);
            res.json(summary);
        } catch (err) {
            console.error('Get summary error:', err);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    }

    // Get category totals
    static async getCategoryTotals(req, res) {
        try {
            const totals = await ExpenseModel.getCategoryTotals(req.params.userId);
            res.json(totals);
        } catch (err) {
            console.error('Get category totals error:', err);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    }

    // Get day-wise totals
    static async getDayWiseTotals(req, res) {
        const { userId, year, month } = req.params;
        try {
            const totals = await ExpenseModel.getDayWiseTotals(userId, year, month);
            res.json(totals);
        } catch (err) {
            console.error('Get day-wise totals error:', err);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    }

    // Get month-wise totals
    static async getMonthWiseTotals(req, res) {
        const { userId, year } = req.params;
        try {
            const totals = await ExpenseModel.getMonthWiseTotals(userId, year);
            res.json(totals);
        } catch (err) {
            console.error('Get month-wise totals error:', err);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    }

    // Update expense
    static async update(req, res) {
        const { id } = req.params;
        const { amount, category, date, notes } = req.body;
        try {
            const expense = await ExpenseModel.update(id, amount, category, date, notes);
            res.json(expense);
        } catch (err) {
            console.error('Update expense error:', err);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    }

    // Delete expense
    static async delete(req, res) {
        try {
            await ExpenseModel.delete(req.params.id);
            res.json({ message: 'Expense deleted' });
        } catch (err) {
            console.error('Delete expense error:', err);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    }
}

module.exports = ExpenseController;
