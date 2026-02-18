const { pool } = require('../db');
const emailService = require('./emailService');

// Check for pending bills > 24 hours and send reminders
async function checkPendingBills() {
  try {
    const [bills] = await pool.query(
      `SELECT b.*, ba.approver_id, ba.approval_level 
       FROM bills b 
       JOIN bill_approvals ba ON b.id = ba.bill_id 
       WHERE b.final_status = 'Pending' 
       AND ba.status = 'Pending' 
       AND ba.created_at < DATE_SUB(NOW(), INTERVAL 24 HOUR)
       AND ba.approved_at IS NULL`
    );

    for (const bill of bills) {
      await emailService.sendBillApprovalNotification(bill.id, bill.approver_id, 'assigned');
    }
  } catch (error) {
    console.error('Pending bills check error:', error);
  }
}

// Start scheduler - runs every hour
function start() {
  console.log('Email scheduler started');
  
  // Run immediately
  checkPendingBills();
  
  // Then run every hour
  setInterval(checkPendingBills, 60 * 60 * 1000);
}

module.exports = {
  start,
  checkPendingBills
};
