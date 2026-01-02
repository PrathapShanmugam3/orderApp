const express = require('express');
const cors = require('cors');
require('dotenv').config();

// Import database connection (this also tests the connection)
require('./config/database');

// Import routes
const authRoutes = require('./routes/authRoutes');
const categoryRoutes = require('./routes/categoryRoutes');
const expenseRoutes = require('./routes/expenseRoutes');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/auth', authRoutes);           // /auth/register, /auth/login, /auth/password/:id
app.use('/categories', categoryRoutes); // /categories CRUD
app.use('/expenses', expenseRoutes);    // /expenses CRUD

// Legacy routes (for backward compatibility)
// These map old routes to new ones
app.post('/register', (req, res) => {
    req.url = '/auth/register';
    app.handle(req, res);
});

app.post('/login', (req, res) => {
    req.url = '/auth/login';
    app.handle(req, res);
});

// Health check
app.get('/', (req, res) => {
    res.json({
        message: 'Expense Calculator API',
        version: '2.0.0',
        endpoints: {
            auth: '/auth (register, login, password)',
            categories: '/categories (CRUD - admin only for CUD)',
            expenses: '/expenses (CRUD)',
        }
    });
});

// ===== LEGACY ROUTES (Keep existing functionality) =====
const pool = require('./config/database');

// Customer Routes
app.get('/customers/today', async (req, res) => {
    try {
        const [rows] = await pool.execute('SELECT * FROM customer ORDER BY id DESC');
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.post('/customers', async (req, res) => {
    const { name, phone, area, call_time } = req.body;
    try {
        const [result] = await pool.execute(
            'INSERT INTO customer (name, phone, area, call_time) VALUES (?, ?, ?, ?)',
            [name, phone, area, call_time]
        );
        res.status(201).json({ id: result.insertId, name, phone, area, call_time });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.put('/customers/:id', async (req, res) => {
    const { name, phone, area, call_time } = req.body;
    const { id } = req.params;
    try {
        await pool.execute(
            'UPDATE customer SET name = ?, phone = ?, area = ?, call_time = ? WHERE id = ?',
            [name, phone, area, call_time, id]
        );
        res.json({ id, name, phone, area, call_time });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.delete('/customers/:id', async (req, res) => {
    try {
        await pool.execute('DELETE FROM customer WHERE id = ?', [req.params.id]);
        res.json({ message: 'Customer deleted' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// Order Routes
app.get('/orders', async (req, res) => {
    try {
        const [rows] = await pool.execute('SELECT * FROM orders ORDER BY order_date DESC');
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.post('/orders', async (req, res) => {
    const { customer_id, product, quantity, price } = req.body;
    try {
        const [result] = await pool.execute(
            'INSERT INTO orders (customer_id, product, quantity, price) VALUES (?, ?, ?, ?)',
            [customer_id, product, quantity, price]
        );
        res.status(201).json({ id: result.insertId, customer_id, product, quantity, price });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📚 API Documentation: http://localhost:${PORT}/`);
});

module.exports = app;
