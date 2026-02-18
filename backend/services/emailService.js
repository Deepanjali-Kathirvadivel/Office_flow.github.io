const nodemailer = require('nodemailer');
const { pool } = require('../db');

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST || 'smtp.gmail.com',
  port: process.env.EMAIL_PORT || 587,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// Send email notification
async function sendEmail(to, subject, html, text) {
  try {
    const info = await transporter.sendMail({
      from: process.env.EMAIL_FROM || 'OfficeFlow <noreply@officeflow.com>',
      to,
      subject,
      html,
      text
    });
    console.log('Email sent:', info.messageId);
    return info;
  } catch (error) {
    console.error('Email sending failed:', error);
    throw error;
  }
}

// Send bill approval notification
async function sendBillApprovalNotification(billId, approverId, action) {
  try {
    const [bills] = await pool.query(
      `SELECT b.*, u.email as uploader_email, u.full_name as uploader_name 
       FROM bills b 
       JOIN users u ON b.uploaded_by = u.id 
       WHERE b.id = ?`,
      [billId]
    );

    if (bills.length === 0) return;

    const bill = bills[0];
    const [approvers] = await pool.query(
      `SELECT u.*, r.name as role_name 
       FROM users u 
       JOIN roles r ON u.role_id = r.id 
       WHERE u.id = ?`,
      [approverId]
    );

    if (approvers.length === 0) return;

    const approver = approvers[0];

    let subject, html;
    
    if (action === 'assigned') {
      subject = `Bill Approval Required - ${bill.bill_number || bill.id}`;
      html = `
        <h2>Bill Approval Required</h2>
        <p>Hello ${approver.full_name},</p>
        <p>A new bill requires your approval:</p>
        <ul>
          <li><strong>Bill Number:</strong> ${bill.bill_number || 'N/A'}</li>
          <li><strong>Vendor:</strong> ${bill.vendor_name}</li>
          <li><strong>Amount:</strong> ₹${bill.total_amount}</li>
          <li><strong>Date:</strong> ${bill.bill_date}</li>
        </ul>
        <p>Please review and approve at your earliest convenience.</p>
        <p><a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/bill-detail?id=${bill.id}">View Bill Details</a></p>
      `;
    } else if (action === 'approved') {
      subject = `Bill Approved - ${bill.bill_number || bill.id}`;
      html = `
        <h2>Bill Approved</h2>
        <p>Hello ${bill.uploader_name},</p>
        <p>Your bill has been approved by ${approver.full_name}:</p>
        <ul>
          <li><strong>Bill Number:</strong> ${bill.bill_number || 'N/A'}</li>
          <li><strong>Vendor:</strong> ${bill.vendor_name}</li>
          <li><strong>Amount:</strong> ₹${bill.total_amount}</li>
        </ul>
      `;
    } else if (action === 'rejected') {
      subject = `Bill Rejected - ${bill.bill_number || bill.id}`;
      html = `
        <h2>Bill Rejected</h2>
        <p>Hello ${bill.uploader_name},</p>
        <p>Your bill has been rejected by ${approver.full_name}:</p>
        <ul>
          <li><strong>Bill Number:</strong> ${bill.bill_number || 'N/A'}</li>
          <li><strong>Vendor:</strong> ${bill.vendor_name}</li>
          <li><strong>Amount:</strong> ₹${bill.total_amount}</li>
        </ul>
      `;
    }

    if (approver.email) {
      await sendEmail(approver.email, subject, html);
    }
    
    if (action !== 'assigned' && bill.uploader_email) {
      await sendEmail(bill.uploader_email, subject, html);
    }
  } catch (error) {
    console.error('Bill approval notification error:', error);
  }
}

// Send courier reminder
async function sendCourierReminder(courierId) {
  try {
    const [couriers] = await pool.query(
      `SELECT c.*, u.email as employee_email, u.full_name as employee_name 
       FROM couriers c 
       JOIN users u ON c.assigned_to = u.id 
       WHERE c.id = ?`,
      [courierId]
    );

    if (couriers.length === 0) return;

    const courier = couriers[0];
    
    if (courier.employee_email) {
      const subject = `Reminder: Parcel Pending Acknowledgment - ${courier.tracking_number}`;
      const html = `
        <h2>Parcel Reminder</h2>
        <p>Hello ${courier.employee_name},</p>
        <p>You have a parcel that requires acknowledgment:</p>
        <ul>
          <li><strong>Tracking Number:</strong> ${courier.tracking_number}</li>
          <li><strong>Status:</strong> ${courier.status}</li>
        </ul>
        <p>Please acknowledge receipt at your earliest convenience.</p>
      `;
      await sendEmail(courier.employee_email, subject, html);
    }
  } catch (error) {
    console.error('Courier reminder error:', error);
  }
}

// Send asset overdue reminder
async function sendAssetOverdueReminder(transactionId) {
  try {
    const [transactions] = await pool.query(
      `SELECT at.*, a.name as asset_name, u.email as employee_email, u.full_name as employee_name 
       FROM asset_transactions at 
       JOIN assets a ON at.asset_id = a.id 
       JOIN users u ON at.employee_id = u.id 
       WHERE at.id = ?`,
      [transactionId]
    );

    if (transactions.length === 0) return;

    const transaction = transactions[0];
    
    if (transaction.employee_email) {
      const subject = `Reminder: Asset Overdue - ${transaction.asset_name}`;
      const html = `
        <h2>Asset Overdue Reminder</h2>
        <p>Hello ${transaction.employee_name},</p>
        <p>The following asset is overdue for return:</p>
        <ul>
          <li><strong>Asset:</strong> ${transaction.asset_name}</li>
          <li><strong>Due Date:</strong> ${transaction.due_date}</li>
          <li><strong>Issue Date:</strong> ${transaction.issue_date}</li>
        </ul>
        <p>Please return the asset at your earliest convenience.</p>
      `;
      await sendEmail(transaction.employee_email, subject, html);
    }
  } catch (error) {
    console.error('Asset overdue reminder error:', error);
  }
}

module.exports = {
  sendEmail,
  sendBillApprovalNotification,
  sendCourierReminder,
  sendAssetOverdueReminder
};
