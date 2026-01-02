-- Create Customer Table
CREATE TABLE IF NOT EXISTS customer (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100),
  phone VARCHAR(15),
  area VARCHAR(50)
);

-- Create Orders Table
CREATE TABLE IF NOT EXISTS orders (
  id INT AUTO_INCREMENT PRIMARY KEY,
  customer_id INT,
  product VARCHAR(100),
  quantity INT,
  price DECIMAL(10,2),
  order_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create Call Log Table
CREATE TABLE IF NOT EXISTS call_log (
  id INT AUTO_INCREMENT PRIMARY KEY,
  customer_id INT,
  call_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  call_status VARCHAR(20)
);

-- Seed Data (Optional - run only if empty)
-- INSERT INTO customer (name, phone, area) VALUES 
-- ('John Doe', '1234567890', 'Downtown'),
-- ('Jane Smith', '0987654321', 'Uptown'),
-- ('Alice Johnson', '5551234567', 'Suburbs');

-- Create Expense Table for Expense Calculator
CREATE TABLE IF NOT EXISTS expense (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  category VARCHAR(50) NOT NULL,
  date DATETIME NOT NULL,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES app_users(id) ON DELETE CASCADE
);

-- Index for faster queries
CREATE INDEX idx_expense_user_date ON expense(user_id, date);
CREATE INDEX idx_expense_category ON expense(user_id, category);

-- Add is_admin column to app_users (run this ALTER if table exists)
-- ALTER TABLE app_users ADD COLUMN is_admin BOOLEAN DEFAULT FALSE;

-- Create Expense Categories Table
CREATE TABLE IF NOT EXISTS expense_categories (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(50) NOT NULL UNIQUE,
  icon VARCHAR(10) NOT NULL DEFAULT '📦',
  color VARCHAR(10) NOT NULL DEFAULT '#6B7280',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert default categories
INSERT IGNORE INTO expense_categories (name, icon, color) VALUES
  ('Food', '🍔', '#FF6B6B'),
  ('Travel', '✈️', '#4ECDC4'),
  ('Rent', '🏠', '#45B7D1'),
  ('Shopping', '🛍️', '#FF8ED4'),
  ('Bills', '💳', '#F59E0B'),
  ('Entertainment', '🎬', '#8B5CF6'),
  ('Health', '💊', '#10B981'),
  ('Education', '📚', '#EC4899'),
  ('Groceries', '🛒', '#059669'),
  ('Fuel', '⛽', '#EA580C'),
  ('Subscriptions', '📺', '#6366F1'),
  ('Other', '📦', '#6B7280');
