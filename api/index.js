const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.text({ limit: '50mb' })); // For SQL restore



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

// 0.3 Change Password
app.put('/auth/password/:id', async (req, res) => {
  const { id } = req.params;
  const { currentPassword, newPassword } = req.body;
  try {
    const [users] = await pool.execute('SELECT * FROM app_users WHERE id = ?', [id]);
    if (users.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    const user = users[0];

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(400).json({ error: 'Current password is incorrect' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await pool.execute('UPDATE app_users SET password = ? WHERE id = ?', [hashedPassword, id]);
    res.json({ message: 'Password changed successfully' });
  } catch (err) {
    console.error('Change password error:', err);
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
    const [rows] = await pool.execute('SELECT id, email, role_id FROM app_users ORDER BY id ASC');
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

// ===== BACKUP ROUTES (Admin only) =====
app.get('/admin/backup', checkAdmin, async (req, res) => {
  try {
    console.log('Starting database dump...');
    let dump = '';

    // Add header
    dump += `-- Database Dump\n`;
    dump += `-- Generated: ${new Date().toISOString()}\n\n`;
    dump += `SET FOREIGN_KEY_CHECKS=0;\n\n`;

    // Get all tables
    const [tables] = await pool.query('SHOW TABLES');
    const tableNames = tables.map(t => Object.values(t)[0]);

    for (const table of tableNames) {
      // Get Create Table statement
      const [createResult] = await pool.query(`SHOW CREATE TABLE ${table}`);
      const createSql = createResult[0]['Create Table'];

      dump += `-- Table structure for ${table}\n`;
      dump += `DROP TABLE IF EXISTS ${table};\n`;
      dump += `${createSql};\n\n`;

      // Get Data
      const [rows] = await pool.query(`SELECT * FROM ${table}`);
      if (rows.length > 0) {
        dump += `-- Dumping data for ${table}\n`;
        dump += `INSERT INTO ${table} VALUES\n`;

        const values = rows.map(row => {
          const rowValues = Object.values(row).map(val => {
            if (val === null) return 'NULL';
            if (typeof val === 'number') return val;
            if (val instanceof Date) return `'${val.toISOString().slice(0, 19).replace('T', ' ')}'`;
            return `'${String(val).replace(/'/g, "\\'")}'`;
          });
          return `(${rowValues.join(', ')})`;
        });

        dump += values.join(',\n');
        dump += `;\n\n`;
      }
    }

    dump += `SET FOREIGN_KEY_CHECKS=1;\n`;

    res.header('Content-Type', 'text/plain');
    res.attachment(`backup_${new Date().toISOString().split('T')[0]}.sql`);
    res.send(dump);

  } catch (err) {
    console.error('Backup error:', err);
    res.status(500).json({ error: 'Backup failed', details: err.message });
  }
});

app.post('/admin/restore', checkAdmin, async (req, res) => {
  const sql = req.body;

  if (!sql || typeof sql !== 'string') {
    return res.status(400).json({ error: 'Invalid SQL dump provided' });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const statements = sql
      .split(/;\s*[\r\n]+/)
      .filter(stmt => stmt.trim().length > 0);

    for (const statement of statements) {
      if (statement.trim().startsWith('--')) continue;
      await connection.query(statement);
    }

    await connection.commit();
    res.json({ message: 'Database restored successfully' });

  } catch (err) {
    await connection.rollback();
    console.error('Restore error:', err);
    res.status(500).json({ error: 'Restore failed', details: err.message });
  } finally {
    connection.release();
  }
});

// ===== STATEMENT PARSING ROUTES =====
const multer = require('multer');
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB
});

// Middleware to check authentication
const checkAuth = (req, res, next) => {
  const userId = req.headers['x-user-id'];
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized - No user ID provided' });
  }
  req.userId = userId;
  next();
};

// ===== STATEMENT PARSING LOGIC =====
const pdf = require('pdf-parse');
const csv = require('csv-parser');
const { Readable } = require('stream');

// Helper to parse date string
const parseDate = (dateStr) => {
  if (!dateStr) return null;
  dateStr = dateStr.trim();
  if (dateStr.includes(' ')) {
    if (dateStr.match(/\d{1,2}\/\d{1,2}\/\d{4}/)) {
      dateStr = dateStr.split(' ')[0];
    }
  }
  dateStr = dateStr.replace(/[./]/g, '-');
  let d = new Date(dateStr);
  if (!isNaN(d.getTime()) && dateStr.includes('-') && dateStr.length >= 10) return d;
  let match = dateStr.match(/^(\d{1,2})\s+([A-Za-z]+),?\s+(\d{4})$/);
  if (match) {
    const day = parseInt(match[1]);
    const monthStr = match[2].toLowerCase().substring(0, 3);
    const year = parseInt(match[3]);
    const months = { 'jan': 0, 'feb': 1, 'mar': 2, 'apr': 3, 'may': 4, 'jun': 5, 'jul': 6, 'aug': 7, 'sep': 8, 'oct': 9, 'nov': 10, 'dec': 11 };
    if (months[monthStr] !== undefined) return new Date(year, months[monthStr], day);
  }
  match = dateStr.match(/^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})$/);
  if (match) {
    const monthStr = match[1].toLowerCase().substring(0, 3);
    const day = parseInt(match[2]);
    const year = parseInt(match[3]);
    const months = { 'jan': 0, 'feb': 1, 'mar': 2, 'apr': 3, 'may': 4, 'jun': 5, 'jul': 6, 'aug': 7, 'sep': 8, 'oct': 9, 'nov': 10, 'dec': 11 };
    if (months[monthStr] !== undefined) return new Date(year, months[monthStr], day);
  }
  match = dateStr.match(/^(\d{1,2})\s+([A-Za-z]+)$/);
  if (match) {
    const day = parseInt(match[1]);
    const monthStr = match[2].toLowerCase().substring(0, 3);
    const year = new Date().getFullYear();
    const months = { 'jan': 0, 'feb': 1, 'mar': 2, 'apr': 3, 'may': 4, 'jun': 5, 'jul': 6, 'aug': 7, 'sep': 8, 'oct': 9, 'nov': 10, 'dec': 11 };
    if (months[monthStr] !== undefined) return new Date(year, months[monthStr], day);
  }
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    let p1 = parseInt(parts[0]);
    let p2 = parseInt(parts[1]);
    let p3 = parseInt(parts[2]);
    if (p3 < 100) p3 += 2000;
    if (p1 > 12) return new Date(p3, p2 - 1, p1);
    if (p2 > 12) return new Date(p3, p1 - 1, p2);
    return new Date(p3, p2 - 1, p1);
  }
  return null;
};

const extractPayeeName = (fullText, fallback) => {
  const amountRegex = /(?:₹|Rs\.?|INR|INR\s)\s*([\d,]+(?:\.\d{1,2})?)/;
  const match = fullText.match(amountRegex);
  if (match) {
    const preAmount = fullText.substring(0, match.index).trim();
    const lines = preAmount.split('\n');
    if (lines.length > 0) {
      const candidate = lines[lines.length - 1].trim();
      if (!candidate.includes("Date") && !candidate.includes("Time") && candidate.length > 2) {
        return candidate;
      }
    }
  }
  return fallback;
};

const processTransactionBlock = (block, expenses) => {
  if (!block || block.length === 0) return;
  const fullText = block.join(' ');
  const dateRegex = /(\d{2}[-/]\d{2}[-/]\d{4}|\d{1,2}\s+[A-Za-z]+,?\s+\d{4}|[A-Za-z]+\s+\d{1,2},?\s+\d{4}|\d{1,2}\s+[A-Za-z]{3})/;
  const dateMatch = block[0].match(dateRegex);
  if (!dateMatch) return;
  const date = parseDate(dateMatch[0]);
  if (!date) return;

  const amountRegex = /(?:₹|Rs\.?|INR|INR\s)\s*([\d,]+(?:\.\d{1,2})?)/g;
  let allAmounts = [];
  let match;
  while ((match = amountRegex.exec(fullText)) !== null) {
    const val = parseFloat(match[1].replace(/,/g, ''));
    if (val > 0) allAmounts.push(val);
  }

  let isDebit = false;
  let amount = 0;
  let description = "";
  let category = "Other";

  const tagRegex = /(?:Tag:\s*)?#\s*([A-Za-z0-9]+)/;
  const tagMatch = fullText.match(tagRegex);
  if (tagMatch) {
    const tag = tagMatch[1].trim();
    if (tag) category = tag.charAt(0).toUpperCase() + tag.slice(1).toLowerCase();
  }

  const paidToRegex = /(?:Paid to|Sent to|Money Sent to|Paid Successfully to)\s+(.+?)(?:\s+(?:DEBIT|CREDIT|₹|Rs|INR|Transaction|Txn|Ref)|$)/;
  const paidToMatch = fullText.match(paidToRegex);

  if (paidToMatch) {
    isDebit = true;
    description = paidToMatch[1].trim();
    const garbage = ['Transaction ID', 'Txn ID', 'Ref No', 'UPI', 'Debited from'];
    garbage.forEach(g => {
      if (description.includes(g)) description = description.split(g)[0].trim();
    });
    if (allAmounts.length === 0) {
      const looseAmountRegex = /\b\d+(?:[.,]\d+)*\b/g;
      let candidates = [];
      let m;
      while ((m = looseAmountRegex.exec(fullText)) !== null) {
        const s = m[0];
        if (s.includes(':')) continue;
        if (s.length === 4 && (s.startsWith('20') || s.startsWith('19'))) {
          const val = parseInt(s);
          if (val > 1900 && val < 2100) continue;
        }
        const val = parseFloat(s.replace(/,/g, ''));
        if (val > 0 && val < 10000000) candidates.push(val);
      }
      if (candidates.length > 0) {
        const decimalCandidates = candidates.filter(c => c % 1 !== 0);
        if (decimalCandidates.length > 0) {
          allAmounts = [decimalCandidates[0]];
        } else {
          const day = date.getDate();
          candidates = candidates.filter(c => c !== day);
          if (candidates.length > 0) allAmounts = [candidates[candidates.length - 1]];
        }
      }
    }
  } else if (fullText.includes("Received from")) {
    return;
  } else if (fullText.includes("Debited from") || fullText.toUpperCase().includes("DEBIT")) {
    isDebit = true;
    description = "Debit Transaction";
  } else if (fullText.toUpperCase().includes("/DR") || fullText.toUpperCase().includes(" DR ")) {
    isDebit = true;
  }

  const negativeAmountRegex = /-\s*(?:Rs\.?|₹)\s*([\d,]+(?:\.\d{1,2})?)/;
  const negMatch = fullText.match(negativeAmountRegex);
  if (negMatch) {
    isDebit = true;
    amount = parseFloat(negMatch[1].replace(/,/g, ''));
  } else if (allAmounts.length > 0) {
    amount = allAmounts[0];
  }

  if (!isDebit || amount === 0) return;

  if (!description || description === "Debit Transaction") {
    description = extractPayeeName(fullText, "Expense");
  }

  description = description.replace(/\s+/g, ' ').trim();
  description = description.replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9]+$/g, '');
  if (description.length > 50) description = description.substring(0, 50);

  expenses.push({
    date: date.toISOString(),
    amount,
    description,
    category
  });
};

const parsePdf = async (buffer) => {
  try {
    const data = await pdf(buffer);
    const text = data.text;
    const lines = text.split('\n');
    const expenses = [];
    const dateStartRegex = /^(\d{2}[-/]\d{2}[-/]\d{4}|\d{1,2}\s+[A-Za-z]+,?\s+\d{4}|[A-Za-z]+\s+\d{1,2},?\s+\d{4}|\d{1,2}\s+[A-Za-z]{3})/;
    let transactionBuffer = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      if (dateStartRegex.test(trimmed)) {
        if (transactionBuffer.length > 0) {
          processTransactionBlock(transactionBuffer, expenses);
          transactionBuffer = [];
        }
        transactionBuffer.push(trimmed);
      } else if (transactionBuffer.length > 0) {
        transactionBuffer.push(trimmed);
      }
    }
    if (transactionBuffer.length > 0) {
      processTransactionBlock(transactionBuffer, expenses);
    }
    return expenses;
  } catch (error) {
    console.error("PDF Parse Error:", error);
    return [];
  }
};

const parseCsvRows = (rows) => {
  let expenses = [];
  if (rows.length === 0) return [];
  let headerIndex = -1;
  let headers = [];
  for (let i = 0; i < rows.length; i++) {
    const rowStr = rows[i].map(e => e.toLowerCase().trim());
    if (rowStr.includes('date') || rowStr.includes('transaction date') || rowStr.includes('dt')) {
      headerIndex = i;
      headers = rowStr;
      break;
    }
  }
  if (headerIndex === -1) return [];
  let format = 'generic';
  if (headers.includes('phonepe') || (headers.includes('transaction id') && headers.includes('provider reference id'))) {
    format = 'phonepe';
  } else if (headers.includes('google pay') || (headers.includes('transaction id') && headers.includes('status') && headers.includes('amount'))) {
    format = 'gpay';
  } else if (headers.includes('wallet txn id') || (headers.includes('debit') && headers.includes('credit') && headers.includes('activity'))) {
    format = 'paytm';
  }
  console.log(`[StatementController] Detected CSV Format: ${format}`);
  for (let i = headerIndex + 1; i < rows.length; i++) {
    const row = rows[i];
    if (row.length === 0 || (row.length === 1 && !row[0])) continue;
    try {
      let date = null;
      let amount = 0;
      let description = "Expense";
      let isDebit = false;
      if (format === 'phonepe') {
        const dateIdx = headers.findIndex(h => h.includes('date'));
        const amountIdx = headers.findIndex(h => h.includes('amount'));
        const typeIdx = headers.findIndex(h => h.includes('type') || h.includes('cr/dr'));
        const descIdx = headers.findIndex(h => h.includes('description') || h.includes('remarks') || h.includes('note'));
        const statusIdx = headers.findIndex(h => h.includes('status'));
        if (dateIdx !== -1 && row[dateIdx]) date = parseDate(row[dateIdx]);
        if (statusIdx !== -1 && row[statusIdx]) {
          const status = row[statusIdx].toLowerCase();
          if (!status.includes('success') && !status.includes('completed')) continue;
        }
        if (amountIdx !== -1 && row[amountIdx]) {
          const val = row[amountIdx].replace(/[^0-9.-]/g, '');
          amount = parseFloat(val) || 0;
        }
        if (typeIdx !== -1 && row[typeIdx]) {
          const type = row[typeIdx].toLowerCase();
          if (type.includes('debit') || type.includes('dr')) isDebit = true;
        } else {
          if (amount > 0) isDebit = true;
        }
        if (descIdx !== -1 && row[descIdx]) description = row[descIdx];
      } else if (format === 'gpay') {
        const dateIdx = headers.findIndex(h => h.includes('date'));
        const amountIdx = headers.findIndex(h => h.includes('amount'));
        const descIdx = headers.findIndex(h => h.includes('description') || h.includes('title'));
        const statusIdx = headers.findIndex(h => h.includes('status'));
        if (dateIdx !== -1 && row[dateIdx]) date = parseDate(row[dateIdx]);
        if (statusIdx !== -1 && row[statusIdx]) {
          const status = row[statusIdx].toLowerCase();
          if (!status.includes('success') && !status.includes('completed')) continue;
        }
        if (amountIdx !== -1 && row[amountIdx]) {
          let val = row[amountIdx];
          if (val.includes('-')) isDebit = true;
          val = val.replace(/[^0-9.]/g, '');
          amount = parseFloat(val) || 0;
        }
        if (descIdx !== -1 && row[descIdx]) {
          description = row[descIdx];
          if (description.toLowerCase().startsWith('sent to') || description.toLowerCase().startsWith('paid to')) {
            isDebit = true;
          }
        }
      } else if (format === 'paytm') {
        const dateIdx = headers.findIndex(h => h.includes('date'));
        const debitIdx = headers.findIndex(h => h.includes('debit'));
        const descIdx = headers.findIndex(h => h.includes('source') || h.includes('destination') || h.includes('activity'));
        const statusIdx = headers.findIndex(h => h.includes('status'));
        if (dateIdx !== -1 && row[dateIdx]) date = parseDate(row[dateIdx]);
        if (statusIdx !== -1 && row[statusIdx]) {
          const status = row[statusIdx].toLowerCase();
          if (!status.includes('success') && !status.includes('completed')) continue;
        }
        if (debitIdx !== -1 && row[debitIdx]) {
          const val = row[debitIdx].replace(/[^0-9.-]/g, '');
          if (val) {
            amount = parseFloat(val) || 0;
            if (amount > 0) isDebit = true;
          }
        }
        if (descIdx !== -1 && row[descIdx]) description = row[descIdx];
      } else {
        let dateIdx = -1, amountIdx = -1, debitIdx = -1, descIdx = -1, typeIdx = -1;
        headers.forEach((h, j) => {
          if (h.includes('date') || h === 'dt') dateIdx = j;
          else if (h.includes('debit') || h.includes('withdrawal')) debitIdx = j;
          else if (h.includes('amount')) amountIdx = j;
          else if (h.includes('desc') || h.includes('particular') || h.includes('narration')) descIdx = j;
          else if (h.includes('type') || h.includes('dr/cr')) typeIdx = j;
        });
        if (dateIdx !== -1 && row[dateIdx]) date = parseDate(row[dateIdx]);
        if (date) {
          if (debitIdx !== -1 && row[debitIdx]) {
            const val = row[debitIdx].replace(/[^0-9.-]/g, '');
            if (val) {
              amount = parseFloat(val) || 0;
              if (amount > 0) isDebit = true;
            }
          }
          if (!isDebit && amountIdx !== -1 && row[amountIdx]) {
            const val = row[amountIdx].replace(/[^0-9.-]/g, '');
            amount = parseFloat(val) || 0;
            if (typeIdx !== -1 && row[typeIdx]) {
              const type = row[typeIdx].toLowerCase();
              if (type.includes('dr') || type.includes('debit')) isDebit = true;
            } else {
              isDebit = true;
            }
          }
          if (descIdx !== -1 && row[descIdx]) description = row[descIdx];
        }
      }
      if (date && amount > 0 && isDebit) {
        description = description.replace(/Paid to /g, '').trim();
        expenses.push({
          date: date.toISOString(),
          amount,
          description: description.trim(),
          category: 'Other'
        });
      }
    } catch (e) {
      console.error(`Error parsing CSV row ${i}:`, e);
    }
  }
  return expenses;
};

const parseCsv = async (buffer) => {
  const results = [];
  const stream = Readable.from(buffer.toString());
  return new Promise((resolve, reject) => {
    stream
      .pipe(csv({ headers: false }))
      .on('data', (data) => results.push(Object.values(data)))
      .on('end', () => resolve(parseCsvRows(results)))
      .on('error', (err) => reject(err));
  });
};

app.post('/statements/upload', checkAuth, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const ext = req.file.originalname.split('.').pop().toLowerCase();
    console.log(`[Vercel] Parsing file: ${req.file.originalname} (${ext})`);

    let expenses = [];
    if (ext === 'pdf') {
      expenses = await parsePdf(req.file.buffer);
    } else {
      expenses = await parseCsv(req.file.buffer);
    }

    console.log(`[Vercel] Found ${expenses.length} expenses`);
    res.json(expenses);

  } catch (error) {
    console.error("Parse Error:", error);
    res.status(500).json({ error: 'Failed to parse statement' });
  }
});

// Root route for Vercel
app.get('/', (req, res) => {
  res.json({
    message: 'Order App Backend is Running (MySQL)',
    version: '2.0.0',
    endpoints: {
      auth: '/auth (register, login, password)',
      categories: '/categories (CRUD - admin only for CUD)',
      expenses: '/expenses (CRUD)',
      backup: '/admin/backup, /admin/restore',
      statements: '/statements/upload'
    }
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = app;
