const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
require('dotenv').config();

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'officeflow',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
};

const pool = mysql.createPool(dbConfig);

// Initialize database schema
async function initialize() {
  try {
    // Create database if not exists
    const connection = await mysql.createConnection({
      host: dbConfig.host,
      user: dbConfig.user,
      password: dbConfig.password
    });
    
    await connection.query(`CREATE DATABASE IF NOT EXISTS ${dbConfig.database}`);
    await connection.end();

    // Create tables
    await createTables();
    console.log('Database initialized successfully');
  } catch (error) {
    console.error('Database initialization error:', error);
    throw error;
  }
}

async function createTables() {
  const connection = await pool.getConnection();
  
  try {
    // Roles table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS roles (
        id INT PRIMARY KEY AUTO_INCREMENT,
        name VARCHAR(50) UNIQUE NOT NULL,
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Users table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS users (
        id INT PRIMARY KEY AUTO_INCREMENT,
        username VARCHAR(100) UNIQUE NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        full_name VARCHAR(255) NOT NULL,
        role_id INT NOT NULL,
        department VARCHAR(100),
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (role_id) REFERENCES roles(id)
      )
    `);

    // Bills table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS bills (
        id INT PRIMARY KEY AUTO_INCREMENT,
        bill_number VARCHAR(100),
        vendor_name VARCHAR(255) NOT NULL,
        vendor_gst VARCHAR(50),
        bill_date DATE NOT NULL,
        amount DECIMAL(10, 2) NOT NULL,
        gst_amount DECIMAL(10, 2) DEFAULT 0,
        total_amount DECIMAL(10, 2) NOT NULL,
        uploaded_by INT NOT NULL,
        image_path VARCHAR(500),
        ocr_text TEXT,
        current_approval_level INT DEFAULT 0,
        final_status ENUM('Draft', 'Pending', 'Approved', 'Rejected') DEFAULT 'Draft',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (uploaded_by) REFERENCES users(id)
      )
    `);

    // Bill_Approvals table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS bill_approvals (
        id INT PRIMARY KEY AUTO_INCREMENT,
        bill_id INT NOT NULL,
        approver_id INT NOT NULL,
        approval_level INT NOT NULL,
        status ENUM('Pending', 'Approved', 'Rejected') DEFAULT 'Pending',
        comments TEXT,
        approved_at TIMESTAMP NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (bill_id) REFERENCES bills(id),
        FOREIGN KEY (approver_id) REFERENCES users(id)
      )
    `);

    // Workflow_Rules table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS workflow_rules (
        id INT PRIMARY KEY AUTO_INCREMENT,
        min_amount DECIMAL(10, 2) NOT NULL,
        max_amount DECIMAL(10, 2),
        approval_level INT NOT NULL,
        role_id INT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (role_id) REFERENCES roles(id)
      )
    `);

    // Audit_Log table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS audit_log (
        id INT PRIMARY KEY AUTO_INCREMENT,
        user_id INT,
        action VARCHAR(100) NOT NULL,
        entity_type VARCHAR(50) NOT NULL,
        entity_id INT,
        details JSON,
        ip_address VARCHAR(45),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `);

    // Couriers table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS couriers (
        id INT PRIMARY KEY AUTO_INCREMENT,
        tracking_number VARCHAR(100) UNIQUE NOT NULL,
        vendor_id INT NOT NULL,
        assigned_to INT NOT NULL,
        slip_image_path VARCHAR(500),
        status ENUM('Pending Pickup', 'Collected') DEFAULT 'Pending Pickup',
        received_at TIMESTAMP NULL,
        created_by INT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (assigned_to) REFERENCES users(id),
        FOREIGN KEY (created_by) REFERENCES users(id)
      )
    `);

    // Courier_Vendors table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS courier_vendors (
        id INT PRIMARY KEY AUTO_INCREMENT,
        name VARCHAR(255) NOT NULL,
        contact_email VARCHAR(255),
        contact_phone VARCHAR(20),
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Courier_Acknowledgements table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS courier_acknowledgements (
        id INT PRIMARY KEY AUTO_INCREMENT,
        courier_id INT NOT NULL,
        employee_id INT NOT NULL,
        signature_data TEXT NOT NULL,
        acknowledged_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (courier_id) REFERENCES couriers(id),
        FOREIGN KEY (employee_id) REFERENCES users(id)
      )
    `);

    // Notifications table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id INT PRIMARY KEY AUTO_INCREMENT,
        user_id INT NOT NULL,
        type VARCHAR(50) NOT NULL,
        title VARCHAR(255) NOT NULL,
        message TEXT NOT NULL,
        entity_type VARCHAR(50),
        entity_id INT,
        is_read BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `);

    // Assets table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS assets (
        id INT PRIMARY KEY AUTO_INCREMENT,
        asset_id VARCHAR(100) UNIQUE NOT NULL,
        name VARCHAR(255) NOT NULL,
        category VARCHAR(100),
        description TEXT,
        department VARCHAR(100),
        image_path VARCHAR(500),
        current_status ENUM('Available', 'Issued', 'Returned', 'Overdue') DEFAULT 'Available',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Asset_Transactions table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS asset_transactions (
        id INT PRIMARY KEY AUTO_INCREMENT,
        asset_id INT NOT NULL,
        employee_id INT NOT NULL,
        issued_by INT NOT NULL,
        issue_date DATE NOT NULL,
        due_date DATE NOT NULL,
        return_date DATE NULL,
        signature_data TEXT,
        condition_on_issue VARCHAR(50),
        condition_on_return VARCHAR(50),
        status ENUM('Issued', 'Returned', 'Overdue') DEFAULT 'Issued',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (asset_id) REFERENCES assets(id),
        FOREIGN KEY (employee_id) REFERENCES users(id),
        FOREIGN KEY (issued_by) REFERENCES users(id)
      )
    `);

    // Damage_Reports table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS damage_reports (
        id INT PRIMARY KEY AUTO_INCREMENT,
        transaction_id INT NOT NULL,
        description TEXT NOT NULL,
        image_path VARCHAR(500),
        reported_by INT NOT NULL,
        reported_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (transaction_id) REFERENCES asset_transactions(id),
        FOREIGN KEY (reported_by) REFERENCES users(id)
      )
    `);

    // Asset_History table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS asset_history (
        id INT PRIMARY KEY AUTO_INCREMENT,
        asset_id INT NOT NULL,
        transaction_id INT,
        action VARCHAR(100) NOT NULL,
        performed_by INT,
        details JSON,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (asset_id) REFERENCES assets(id),
        FOREIGN KEY (transaction_id) REFERENCES asset_transactions(id),
        FOREIGN KEY (performed_by) REFERENCES users(id)
      )
    `);

    // Complaints table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS complaints (
        id INT PRIMARY KEY AUTO_INCREMENT,
        ticket_number VARCHAR(50) UNIQUE NOT NULL,
        category VARCHAR(100) NOT NULL,
        priority ENUM('Low', 'Medium', 'High', 'Critical') DEFAULT 'Medium',
        description TEXT NOT NULL,
        attachment_path VARCHAR(500),
        submitted_by INT NOT NULL,
        assigned_to INT,
        status ENUM('Open', 'In Progress', 'Closed') DEFAULT 'Open',
        resolution_note TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        closed_at TIMESTAMP NULL,
        FOREIGN KEY (submitted_by) REFERENCES users(id),
        FOREIGN KEY (assigned_to) REFERENCES users(id)
      )
    `);

    // Complaint_Assignments table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS complaint_assignments (
        id INT PRIMARY KEY AUTO_INCREMENT,
        complaint_id INT NOT NULL,
        assigned_to INT NOT NULL,
        assigned_by INT NOT NULL,
        assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (complaint_id) REFERENCES complaints(id),
        FOREIGN KEY (assigned_to) REFERENCES users(id),
        FOREIGN KEY (assigned_by) REFERENCES users(id)
      )
    `);

    // Complaint_History table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS complaint_history (
        id INT PRIMARY KEY AUTO_INCREMENT,
        complaint_id INT NOT NULL,
        action VARCHAR(100) NOT NULL,
        performed_by INT,
        old_status VARCHAR(50),
        new_status VARCHAR(50),
        comments TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (complaint_id) REFERENCES complaints(id),
        FOREIGN KEY (performed_by) REFERENCES users(id)
      )
    `);

    // Departments table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS departments (
        id INT PRIMARY KEY AUTO_INCREMENT,
        name VARCHAR(100) UNIQUE NOT NULL,
        description TEXT,
        category VARCHAR(100),
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Insert default roles
    await insertDefaultRoles(connection);

    // Insert seed users (first run)
    await insertSeedUsers(connection);
    
    // Insert default workflow rules
    await insertDefaultWorkflowRules(connection);

    // Insert default departments
    await insertDefaultDepartments(connection);

    // Insert default courier vendors
    await insertDefaultCourierVendors(connection);

  } catch (error) {
    console.error('Error creating tables:', error);
    throw error;
  } finally {
    connection.release();
  }
}

async function insertDefaultRoles(connection) {
  const roles = [
    ['Reception', 'Reception staff'],
    ['Accounts', 'Accounts department'],
    ['Manager', 'Management team'],
    ['MD', 'Managing Director'],
    ['Admin', 'System Administrator'],
    ['Employee', 'General Employee'],
    ['IT Team', 'IT Support Team'],
    ['Facilities', 'Facilities / Maintenance Team'],
    ['HR Team', 'Human Resources Team'],
    ['Security Team', 'Security Team']
  ];

  for (const [name, description] of roles) {
    await connection.query(
      'INSERT IGNORE INTO roles (name, description) VALUES (?, ?)',
      [name, description]
    );
  }
}

async function insertDefaultWorkflowRules(connection) {
  // Reset workflow rules to keep routing correct & deterministic.
  // Rules implement:
  // < 5000 -> Accounts
  // 5000-25000 -> Accounts -> Manager
  // >= 25000 -> Accounts -> Manager -> MD
  await connection.query('DELETE FROM workflow_rules');

  const rules = [
    // < 5000
    [0, 4999.99, 1, 'Accounts'],

    // 5000 - 25000
    [5000, 24999.99, 1, 'Accounts'],
    [5000, 24999.99, 2, 'Manager'],

    // >= 25000
    [25000, null, 1, 'Accounts'],
    [25000, null, 2, 'Manager'],
    [25000, null, 3, 'MD']
  ];

  for (const [minAmount, maxAmount, level, roleName] of rules) {
    const [roleResult] = await connection.query(
      'SELECT id FROM roles WHERE name = ?',
      [roleName]
    );
    
    if (roleResult.length > 0) {
      await connection.query(
        'INSERT IGNORE INTO workflow_rules (min_amount, max_amount, approval_level, role_id) VALUES (?, ?, ?, ?)',
        [minAmount, maxAmount, level, roleResult[0].id]
      );
    }
  }
}

async function insertDefaultDepartments(connection) {
  const departments = [
    ['IT', 'Information Technology', 'IT'],
    ['Maintenance', 'Facilities Maintenance', 'Maintenance'],
    ['HR', 'Human Resources', 'HR'],
    ['Security', 'Security Department', 'Security']
  ];

  for (const [name, description, category] of departments) {
    await connection.query(
      'INSERT IGNORE INTO departments (name, description, category) VALUES (?, ?, ?)',
      [name, description, category]
    );
  }
}

async function insertDefaultCourierVendors(connection) {
  const vendors = [
    ['BlueDart', 'support@bluedart.com', '1800-258-4747'],
    ['DTDC', 'support@dtdc.com', '1800-208-4141'],
    ['FedEx', 'support@fedex.com', '1800-419-4343']
  ];

  for (const [name, email, phone] of vendors) {
    await connection.query(
      'INSERT IGNORE INTO courier_vendors (name, contact_email, contact_phone) VALUES (?, ?, ?)',
      [name, email, phone]
    );
  }
}

async function insertSeedUsers(connection) {
  const [existing] = await connection.query('SELECT COUNT(*) as count FROM users');
  if ((existing[0]?.count || 0) > 0) return;

  const defaultPassword = process.env.SEED_DEFAULT_PASSWORD || 'ChangeMe123!';
  const hashedPassword = await bcrypt.hash(defaultPassword, 10);

  const seedUsers = [
    { username: 'admin', full_name: 'System Admin', email: 'admin@officeflow.local', role: 'Admin', department: 'Admin' },
    { username: 'reception', full_name: 'Reception User', email: 'reception@officeflow.local', role: 'Reception', department: 'Reception' },
    { username: 'accounts', full_name: 'Accounts User', email: 'accounts@officeflow.local', role: 'Accounts', department: 'Accounts' },
    { username: 'manager', full_name: 'Manager User', email: 'manager@officeflow.local', role: 'Manager', department: 'Management' },
    { username: 'md', full_name: 'MD User', email: 'md@officeflow.local', role: 'MD', department: 'Management' },
    { username: 'employee', full_name: 'Employee User', email: 'employee@officeflow.local', role: 'Employee', department: 'General' },
    { username: 'itteam', full_name: 'IT Team User', email: 'it@officeflow.local', role: 'IT Team', department: 'IT' },
    { username: 'facilities', full_name: 'Facilities Team User', email: 'facilities@officeflow.local', role: 'Facilities', department: 'Facilities' },
    { username: 'hrteam', full_name: 'HR Team User', email: 'hr@officeflow.local', role: 'HR Team', department: 'HR' },
    { username: 'securityteam', full_name: 'Security Team User', email: 'security@officeflow.local', role: 'Security Team', department: 'Security' }
  ];

  for (const u of seedUsers) {
    const [roleRows] = await connection.query('SELECT id FROM roles WHERE name = ? LIMIT 1', [u.role]);
    if (roleRows.length === 0) continue;

    await connection.query(
      'INSERT INTO users (username, email, password, full_name, role_id, department) VALUES (?, ?, ?, ?, ?, ?)',
      [u.username, u.email, hashedPassword, u.full_name, roleRows[0].id, u.department]
    );
  }
}

module.exports = {
  pool,
  initialize
};
