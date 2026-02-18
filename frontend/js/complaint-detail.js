const API_BASE_URL = '/api';

// Check authentication
if (!checkAuth()) {
    window.location.href = '/login.html';
}

// Display user info
const user = getCurrentUser();
if (user) {
    document.getElementById('userName').textContent = `${user.full_name} (${user.role})`;
}

// Get complaint ID from URL
const urlParams = new URLSearchParams(window.location.search);
const complaintId = urlParams.get('id');

if (!complaintId) {
    window.location.href = '/complaints.html';
}

// Load complaint details
async function loadComplaintDetail() {
    try {
        const response = await fetch(`${API_BASE_URL}/complaints/${complaintId}`, {
            headers: getAuthHeaders()
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to load complaint');
        }

        displayComplaintDetail(data.complaint, data.history, data.assignments);
    } catch (error) {
        console.error('Load complaint error:', error);
        document.getElementById('complaintDetailCard').innerHTML = 
            `<div class="error-message show">Error loading complaint: ${error.message}</div>`;
    }
}

// Display complaint details
function displayComplaintDetail(complaint, history, assignments) {
    const card = document.getElementById('complaintDetailCard');
    const statusClass = `badge-${complaint.status.toLowerCase().replace(' ', '-')}`;
    const priorityClass = complaint.priority === 'Critical' ? 'badge-danger' : 
                         complaint.priority === 'High' ? 'badge-warning' : 'badge-pending';
    
    card.innerHTML = `
        <div class="card-header">
            <h2>Ticket: ${complaint.ticket_number}</h2>
            <div>
                <span class="badge ${statusClass}">${complaint.status}</span>
                <span class="badge ${priorityClass}">${complaint.priority}</span>
            </div>
        </div>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 20px; margin-top: 20px;">
            <div>
                <strong>Category:</strong><br>
                ${complaint.category}
            </div>
            <div>
                <strong>Priority:</strong><br>
                ${complaint.priority}
            </div>
            <div>
                <strong>Status:</strong><br>
                ${complaint.status}
            </div>
            <div>
                <strong>Submitted By:</strong><br>
                ${complaint.submitted_by_name}
            </div>
            <div>
                <strong>Assigned To:</strong><br>
                ${complaint.assigned_to_name || 'Unassigned'}
            </div>
            <div>
                <strong>Created:</strong><br>
                ${new Date(complaint.created_at).toLocaleString()}
            </div>
        </div>
        <div style="margin-top: 20px;">
            <strong>Description:</strong><br>
            <p style="margin-top: 10px; padding: 15px; background: #f8fafc; border-radius: 6px;">${complaint.description}</p>
        </div>
        ${complaint.resolution_note ? `
            <div style="margin-top: 20px;">
                <strong>Resolution Note:</strong><br>
                <p style="margin-top: 10px; padding: 15px; background: #d1fae5; border-radius: 6px;">${complaint.resolution_note}</p>
            </div>
        ` : ''}
        ${complaint.attachment_path ? `
            <div style="margin-top: 20px;">
                <strong>Attachment:</strong><br>
                <a href="/uploads/complaints/${complaint.attachment_path}" target="_blank" style="margin-top: 10px; display: inline-block;">View Attachment</a>
            </div>
        ` : ''}
    `;

    // Display history
    if (history && history.length > 0) {
        const historyCard = document.getElementById('historyCard');
        historyCard.style.display = 'block';
        
        const tbody = document.getElementById('historyTableBody');
        tbody.innerHTML = '';

        history.forEach(item => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${new Date(item.created_at).toLocaleString()}</td>
                <td>${item.action}</td>
                <td>${item.performed_by_name || 'System'}</td>
                <td>${item.old_status || '-'}</td>
                <td>${item.new_status || '-'}</td>
                <td>${item.comments || '-'}</td>
            `;
            tbody.appendChild(row);
        });
    }

    // Show status update form if user can update
    checkCanUpdate(complaint);
}

// Check if user can update
function checkCanUpdate(complaint) {
    const canUpdate = complaint.assigned_to === user.id || 
                     complaint.submitted_by === user.id || 
                     user.role === 'Admin';

    if (canUpdate && complaint.status !== 'Closed') {
        document.getElementById('statusUpdateCard').style.display = 'block';
    }
}

// Status change handler
document.getElementById('status').addEventListener('change', (e) => {
    const resolutionGroup = document.getElementById('resolutionNoteGroup');
    if (e.target.value === 'Closed') {
        resolutionGroup.style.display = 'block';
        document.getElementById('resolutionNote').required = true;
    } else {
        resolutionGroup.style.display = 'none';
        document.getElementById('resolutionNote').required = false;
    }
});

// Submit status update
document.getElementById('statusUpdateForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const status = document.getElementById('status').value;
    const comments = document.getElementById('statusComments').value;
    const resolutionNote = document.getElementById('resolutionNote').value;

    try {
        const response = await fetch(`${API_BASE_URL}/complaints/${complaintId}/status`, {
            method: 'PUT',
            headers: getAuthHeaders(),
            body: JSON.stringify({ 
                status, 
                comments,
                resolution_note: status === 'Closed' ? resolutionNote : null
            })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to update status');
        }

        alert('Status updated successfully!');
        loadComplaintDetail();
        document.getElementById('statusUpdateForm').reset();
    } catch (error) {
        const messageDiv = document.getElementById('statusMessage');
        messageDiv.textContent = error.message;
        messageDiv.classList.add('show');
    }
});

// Load complaint detail on page load
loadComplaintDetail();
