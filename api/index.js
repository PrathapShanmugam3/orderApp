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
// 0.1 Register
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
      'INSERT INTO app_users (email, password) VALUES (?, ?)',
      [email, hashedPassword]
    );
    res.status(201).json({ id: result.insertId, email });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// 0.2 Login
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

    res.json({ id: user.id, email: user.email, message: 'Login successful' });
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

// Root route for Vercel
app.get('/', (req, res) => {
  res.send('Order App Backend is Running (MySQL)');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = app;
