const express = require('express');
const router = express.Router();
const ExpenseController = require('../controllers/expenseController');

// POST /expenses - Create expense
router.post('/', ExpenseController.create);

// GET /expenses/:userId - Get all expenses for user
router.get('/:userId', ExpenseController.getByUser);

// GET /expenses/:userId/date/:date - Get expenses by date
router.get('/:userId/date/:date', ExpenseController.getByDate);

// GET /expenses/:userId/month/:year/:month - Get expenses by month
router.get('/:userId/month/:year/:month', ExpenseController.getByMonth);

// GET /expenses/:userId/year/:year - Get expenses by year
router.get('/:userId/year/:year', ExpenseController.getByYear);

// GET /expenses/:userId/summary - Get summary totals
router.get('/:userId/summary', ExpenseController.getSummary);

// GET /expenses/:userId/categories - Get category totals
router.get('/:userId/categories', ExpenseController.getCategoryTotals);

// GET /expenses/:userId/daywise/:year/:month - Get day-wise totals
router.get('/:userId/daywise/:year/:month', ExpenseController.getDayWiseTotals);

// GET /expenses/:userId/monthwise/:year - Get month-wise totals
router.get('/:userId/monthwise/:year', ExpenseController.getMonthWiseTotals);

// PUT /expenses/:id - Update expense
router.put('/:id', ExpenseController.update);

// DELETE /expenses/:id - Delete expense
router.delete('/:id', ExpenseController.delete);

module.exports = router;
