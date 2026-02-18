// API_BASE_URL is defined in auth.js

// Check authentication
if (!checkAuth()) {
    window.location.href = '/login.html';
}

// Display user info
const user = getCurrentUser();
if (user) {
    document.getElementById('userName').textContent = `${user.full_name} (${user.role})`;
}

// Get bill ID from URL
const urlParams = new URLSearchParams(window.location.search);
const billId = urlParams.get('id');

if (!billId) {
    window.location.href = '/bills.html';
}

// Load bill details
async function loadBillDetail() {
    try {
        const response = await fetch(`${API_BASE_URL}/bills/${billId}`, {
            headers: getAuthHeaders()
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to load bill');
        }

        displayBillDetail(data.bill, data.approvals);
    } catch (error) {
        console.error('Load bill error:', error);
        document.getElementById('billDetailCard').innerHTML =
            `<div class="error-message show">Error loading bill: ${error.message}</div>`;
    }
}

// Display bill details
function displayBillDetail(bill, approvals) {
    const card = document.getElementById('billDetailCard');
    const statusClass = `badge-${bill.final_status.toLowerCase()}`;

    card.innerHTML = `
        <div class="card-header">
            <h2>Bill #${bill.bill_number || bill.id}</h2>
            <span class="badge ${statusClass}">${bill.final_status}</span>
        </div>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 20px; margin-top: 20px;">
            <div>
                <strong>Vendor Name:</strong><br>
                ${bill.vendor_name}
            </div>
            <div>
                <strong>GST Number:</strong><br>
                ${bill.vendor_gst || 'N/A'}
            </div>
            <div>
                <strong>Bill Date:</strong><br>
                ${bill.bill_date}
            </div>
            <div>
                <strong>Amount:</strong><br>
                ₹${bill.amount}
            </div>
            <div>
                <strong>GST Amount:</strong><br>
                ₹${bill.gst_amount}
            </div>
            <div>
                <strong>Total Amount:</strong><br>
                ₹${bill.total_amount}
            </div>
            <div>
                <strong>Uploaded By:</strong><br>
                ${bill.uploaded_by_name}
            </div>
            <div>
                <strong>Current Approval Level:</strong><br>
                ${bill.current_approval_level}
            </div>
        </div>
        ${bill.image_path ? `
            <div style="margin-top: 20px;">
                <strong>Bill Image:</strong><br>
                <img src="/uploads/bills/${bill.image_path}" alt="Bill image" style="max-width: 100%; margin-top: 10px; border-radius: 8px;">
            </div>
        ` : ''}
    `;

    // Display approval history
    if (approvals && approvals.length > 0) {
        const historyCard = document.getElementById('approvalHistoryCard');
        historyCard.style.display = 'block';

        const tbody = document.getElementById('approvalHistoryBody');
        tbody.innerHTML = '';

        approvals.forEach(approval => {
            const row = document.createElement('tr');
            const statusClass = `badge-${approval.status.toLowerCase()}`;
            row.innerHTML = `
                <td>${approval.approval_level}</td>
                <td>${approval.approver_name}</td>
                <td>${approval.approver_role}</td>
                <td><span class="badge ${statusClass}">${approval.status}</span></td>
                <td>${approval.comments || '-'}</td>
                <td>${approval.approved_at || '-'}</td>
            `;
            tbody.appendChild(row);
        });
    }

    // Show approval form if user can approve
    checkCanApprove(bill, approvals);
}

// Check if user can approve
function checkCanApprove(bill, approvals) {
    // Check if bill is pending and user hasn't approved yet
    if (bill.final_status === 'Pending') {
        const userApproval = approvals?.find(a =>
            a.approver_id === user.id && a.status === 'Pending'
        );

        if (userApproval) {
            document.getElementById('approvalCard').style.display = 'block';
        }
    }
}

// Submit approval
document.getElementById('approvalForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const action = document.getElementById('approvalAction').value;
    const comments = document.getElementById('comments').value;

    try {
        const response = await fetch(`${API_BASE_URL}/bills/${billId}/approve`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ action, comments })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to process approval');
        }

        alert(`Bill ${action}d successfully!`);
        loadBillDetail();
        document.getElementById('approvalForm').reset();
        document.getElementById('approvalCard').style.display = 'none';
    } catch (error) {
        const messageDiv = document.getElementById('approvalMessage');
        messageDiv.textContent = error.message;
        messageDiv.classList.add('show');
    }
});

// Load bill detail on page load
loadBillDetail();
