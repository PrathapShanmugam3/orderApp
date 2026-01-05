const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());


// Database Connection
// Parse the connection string or use individual env vars
// For Aiven/MySQL URLs, it's often easier to parse or pass directly if the library supports it.
// mysql2 supports connection strings.

const pool = mysql.createPool({
  host: 'datacode-datacode.d.aivencloud.com',
  port: 15555,
  user: 'avnadmin',
  password: 'AVNS_8E64xznbT9AA1SAok9F',
  database: 'defaultdb',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  ssl: {
    rejectUnauthorized: false
  }
});

// Test DB Connection
pool.getConnection()
  .then(connection => {
    console.log('Connected to MySQL Database');
    connection.release();
  })
  .catch(err => {
    console.error('Error connecting to MySQL', err);
  });

const bcrypt = require('bcryptjs');

// Routes

// 0. Auth Routes
// 0.1 Register (default role_id = 1 = user)
app.post('/register', async (req, res) => {
  const { email, password } = req.body;
  try {
    // Check if user exists
    const [existing] = await pool.execute('SELECT * FROM app_users WHERE email = ?', [email]);
    if (existing.length > 0) {
      return res.status(400).json({ error: 'Email already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const [result] = await pool.execute(
      'INSERT INTO app_users (email, password, role_id) VALUES (?, ?, ?)',
      [email, hashedPassword, 1]
    );
    res.status(201).json({ id: result.insertId, email, roleId: 1 });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// 0.2 Login (returns roleId)
app.post('/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const [users] = await pool.execute('SELECT * FROM app_users WHERE email = ?', [email]);
    if (users.length === 0) {
      return res.status(400).json({ error: 'User not found' });
    }

    const user = users[0];
    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    const roleId = user.role_id || 1;
    res.json({ id: user.id, email: user.email, roleId: roleId, isAdmin: roleId === 3, message: 'Login successful' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// ===== CATEGORY MANAGEMENT (Admin only for CUD) =====

// Get all categories (public)
app.get('/categories', async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM expense_categories ORDER BY name ASC');
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Admin check middleware (role_id = 3)
const checkAdmin = async (req, res, next) => {
  const userId = req.headers['x-user-id'];
  console.log(`[API] checkAdmin for userId: ${userId}`);
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const [users] = await pool.execute('SELECT role_id FROM app_users WHERE id = ?', [userId]);
    console.log(`[API] checkAdmin user result:`, users[0]);

    // Loose equality to handle string/number mismatch
    if (users.length === 0 || users[0].role_id != 3) {
      console.log(`[API] Access denied. role_id: ${users[0]?.role_id}`);
      return res.status(403).json({ error: 'Admin access required' });
    }
    next();
  } catch (err) {
    console.error('[API] checkAdmin error:', err);
    res.status(500).json({ error: 'Internal Server Error', details: err.message });
  }
};

// ===== ADMIN USER MANAGEMENT =====

// Get all users (admin only)
app.get('/auth/users', checkAdmin, async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT id, email, role_id, created_at FROM app_users ORDER BY id ASC');
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Update user role (admin only)
app.put('/auth/users/:id/role', checkAdmin, async (req, res) => {
  const { id } = req.params;
  const { roleId } = req.body;
  try {
    await pool.execute('UPDATE app_users SET role_id = ? WHERE id = ?', [roleId, id]);
    res.json({ message: 'Role updated successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Delete user (admin only)
app.delete('/auth/users/:id', checkAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    await pool.execute('DELETE FROM app_users WHERE id = ?', [id]);
    res.json({ message: 'User deleted successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Create category (admin only)
app.post('/categories', checkAdmin, async (req, res) => {
  const { name, icon, color } = req.body;
  try {
    const [existing] = await pool.execute('SELECT * FROM expense_categories WHERE name = ?', [name]);
    if (existing.length > 0) {
      return res.status(400).json({ error: 'Category already exists' });
    }
    const [result] = await pool.execute(
      'INSERT INTO expense_categories (name, icon, color) VALUES (?, ?, ?)',
      [name, icon || '📦', color || '#6B7280']
    );
    res.status(201).json({ id: result.insertId, name, icon: icon || '📦', color: color || '#6B7280' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Update category (admin only)
app.put('/categories/:id', checkAdmin, async (req, res) => {
  const { id } = req.params;
  const { name, icon, color } = req.body;
  try {
    await pool.execute(
      'UPDATE expense_categories SET name = ?, icon = ?, color = ? WHERE id = ?',
      [name, icon, color, id]
    );
    res.json({ id: parseInt(id), name, icon, color });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Delete category (admin only)
app.delete('/categories/:id', checkAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    await pool.execute('DELETE FROM expense_categories WHERE id = ?', [id]);
    res.json({ message: 'Category deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// 1. Get Daily Customer List
app.get('/customers/today', async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM customer ORDER BY id DESC');
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// 1.1 Add New Customer
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

// 1.2 Update Customer
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

// 1.3 Delete Customer
app.delete('/customers/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await pool.execute('DELETE FROM customer WHERE id = ?', [id]);
    res.json({ message: 'Customer deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// 2. Create Order
app.post('/orders', async (req, res) => {
  const { customerId, product, quantity, price } = req.body;
  try {
    const [result] = await pool.query(
      'INSERT INTO orders (customer_id, product, quantity, price, order_date) VALUES (?, ?, ?, ?, NOW())',
      [customerId, product, quantity, price]
    );
    // Fetch the inserted order
    const [newOrder] = await pool.query('SELECT * FROM orders WHERE id = ?', [result.insertId]);
    res.status(201).json(newOrder[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// 3. Log Call
app.post('/call-log', async (req, res) => {
  const { customerId, callStatus } = req.body;
  try {
    const [result] = await pool.query(
      'INSERT INTO call_log (customer_id, call_date, call_status) VALUES (?, NOW(), ?)',
      [customerId, callStatus]
    );
    const [newLog] = await pool.query('SELECT * FROM call_log WHERE id = ?', [result.insertId]);
    res.status(201).json(newLog[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// =============================================
// EXPENSE CALCULATOR ROUTES
// =============================================

// 4.1 Create Expense
app.post('/expenses', async (req, res) => {
  const { userId, amount, category, date, notes } = req.body;
  try {
    const [result] = await pool.execute(
      'INSERT INTO expense (user_id, amount, category, date, notes) VALUES (?, ?, ?, ?, ?)',
      [userId, amount, category, date, notes || '']
    );
    const [newExpense] = await pool.execute('SELECT * FROM expense WHERE id = ?', [result.insertId]);
    res.status(201).json(newExpense[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// 4.2 Get All Expenses for a User
app.get('/expenses/:userId', async (req, res) => {
  const { userId } = req.params;
  try {
    const [rows] = await pool.execute(
      'SELECT * FROM expense WHERE user_id = ? ORDER BY date DESC',
      [userId]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// 4.3 Get Expenses by Date
app.get('/expenses/:userId/date/:date', async (req, res) => {
  const { userId, date } = req.params;
  try {
    const [rows] = await pool.execute(
      'SELECT * FROM expense WHERE user_id = ? AND DATE(date) = ? ORDER BY date DESC',
      [userId, date]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// 4.4 Get Expenses by Month
app.get('/expenses/:userId/month/:year/:month', async (req, res) => {
  const { userId, year, month } = req.params;
  try {
    const [rows] = await pool.execute(
      'SELECT * FROM expense WHERE user_id = ? AND YEAR(date) = ? AND MONTH(date) = ? ORDER BY date DESC',
      [userId, year, month]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// 4.5 Get Expenses by Year
app.get('/expenses/:userId/year/:year', async (req, res) => {
  const { userId, year } = req.params;
  try {
    const [rows] = await pool.execute(
      'SELECT * FROM expense WHERE user_id = ? AND YEAR(date) = ? ORDER BY date DESC',
      [userId, year]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// 4.6 Get Summary Totals (Today, Month, Year)
app.get('/expenses/:userId/summary', async (req, res) => {
  const { userId } = req.params;
  try {
    // Today's total
    const [todayResult] = await pool.execute(
      'SELECT COALESCE(SUM(amount), 0) as total FROM expense WHERE user_id = ? AND DATE(date) = CURDATE()',
      [userId]
    );
    // This month's total
    const [monthResult] = await pool.execute(
      'SELECT COALESCE(SUM(amount), 0) as total FROM expense WHERE user_id = ? AND YEAR(date) = YEAR(CURDATE()) AND MONTH(date) = MONTH(CURDATE())',
      [userId]
    );
    // This year's total
    const [yearResult] = await pool.execute(
      'SELECT COALESCE(SUM(amount), 0) as total FROM expense WHERE user_id = ? AND YEAR(date) = YEAR(CURDATE())',
      [userId]
    );
    res.json({
      today: todayResult[0].total,
      month: monthResult[0].total,
      year: yearResult[0].total
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// 4.7 Get Category-wise Totals
app.get('/expenses/:userId/categories', async (req, res) => {
  const { userId } = req.params;
  try {
    const [rows] = await pool.execute(
      'SELECT category, SUM(amount) as total FROM expense WHERE user_id = ? GROUP BY category ORDER BY total DESC',
      [userId]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// 4.8 Get Day-wise Totals for a Month
app.get('/expenses/:userId/daywisе/:year/:month', async (req, res) => {
  const { userId, year, month } = req.params;
  try {
    const [rows] = await pool.execute(
      'SELECT DAY(date) as day, SUM(amount) as total FROM expense WHERE user_id = ? AND YEAR(date) = ? AND MONTH(date) = ? GROUP BY DAY(date) ORDER BY day',
      [userId, year, month]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// 4.9 Get Month-wise Totals for a Year
app.get('/expenses/:userId/monthwise/:year', async (req, res) => {
  const { userId, year } = req.params;
  try {
    const [rows] = await pool.execute(
      'SELECT MONTH(date) as month, SUM(amount) as total FROM expense WHERE user_id = ? AND YEAR(date) = ? GROUP BY MONTH(date) ORDER BY month',
      [userId, year]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// 4.10 Update Expense
app.put('/expenses/:id', async (req, res) => {
  const { id } = req.params;
  const { amount, category, date, notes } = req.body;
  try {
    await pool.execute(
      'UPDATE expense SET amount = ?, category = ?, date = ?, notes = ? WHERE id = ?',
      [amount, category, date, notes || '', id]
    );
    const [updated] = await pool.execute('SELECT * FROM expense WHERE id = ?', [id]);
    res.json(updated[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// 4.11 Delete Expense
app.delete('/expenses/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await pool.execute('DELETE FROM expense WHERE id = ?', [id]);
    res.json({ message: 'Expense deleted successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Root route for Vercel
app.get('/', (req, res) => {
  res.send('Order App Backend is Running (MySQL)');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = app;
