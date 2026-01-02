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
