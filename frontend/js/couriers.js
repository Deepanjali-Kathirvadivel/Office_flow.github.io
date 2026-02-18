const API_BASE_URL = '/api';

// Check authentication
if (!checkAuth()) {
    window.location.href = '/login.html';
}

// Display user info
const user = getCurrentUser();
if (user) {
    document.getElementById('userName').textContent = `${user.full_name} (${user.role})`;
    
    // Show new courier button for Reception role
    if (user.role === 'Reception') {
        document.getElementById('newCourierBtn').style.display = 'inline-flex';
        document.getElementById('courierFormCard').style.display = 'block';
    }
}

let slipImagePath = null;

// Load vendors and employees
async function loadFormData() {
    try {
        // Load vendors
        const vendorsResponse = await fetch(`${API_BASE_URL}/couriers/vendors`, {
            headers: getAuthHeaders()
        });
        const vendorsData = await vendorsResponse.json();
        
        if (vendorsResponse.ok) {
            const vendorSelect = document.getElementById('vendor_id');
            vendorsData.vendors.forEach(vendor => {
                const option = document.createElement('option');
                option.value = vendor.id;
                option.textContent = vendor.name;
                vendorSelect.appendChild(option);
            });
        }

        // Load employees
        const usersResponse = await fetch(`${API_BASE_URL}/users?role=Employee`, {
            headers: getAuthHeaders()
        });
        const usersData = await usersResponse.json();
        
        if (usersResponse.ok) {
            const employeeSelect = document.getElementById('assigned_to');
            usersData.users.forEach(user => {
                const option = document.createElement('option');
                option.value = user.id;
                option.textContent = `${user.full_name} (${user.email})`;
                employeeSelect.appendChild(option);
            });
        }
    } catch (error) {
        console.error('Load form data error:', error);
    }
}

// File upload handler
document.getElementById('slipFile').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (file) {
        try {
            const formData = new FormData();
            formData.append('slip', file);

            const response = await fetch(`${API_BASE_URL}/couriers/upload`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${getAuthToken()}`
                },
                body: formData
            });

            const data = await response.json();
            
            if (response.ok) {
                slipImagePath = data.imagePath;
                const preview = document.getElementById('slipPreview');
                preview.src = `/uploads/couriers/${data.imagePath}`;
                preview.style.display = 'block';
            } else {
                alert('Upload failed: ' + data.error);
            }
        } catch (error) {
            alert('Upload error: ' + error.message);
        }
    }
});

// New courier button
document.getElementById('newCourierBtn')?.addEventListener('click', () => {
    document.getElementById('courierFormCard').style.display = 'block';
});

// Submit courier form
document.getElementById('courierForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const formData = new FormData(e.target);
    const courierData = {
        tracking_number: formData.get('tracking_number'),
        vendor_id: parseInt(formData.get('vendor_id')),
        assigned_to: parseInt(formData.get('assigned_to')),
        slip_image_path: slipImagePath
    };

    try {
        const response = await fetch(`${API_BASE_URL}/couriers`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify(courierData)
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to create courier');
        }

        alert('Courier entry created successfully!');
        e.target.reset();
        document.getElementById('slipPreview').style.display = 'none';
        slipImagePath = null;
        loadCouriers();
    } catch (error) {
        const messageDiv = document.getElementById('courierMessage');
        messageDiv.textContent = error.message;
        messageDiv.classList.add('show');
    }
});

// Load couriers
async function loadCouriers() {
    try {
        const response = await fetch(`${API_BASE_URL}/couriers`, {
            headers: getAuthHeaders()
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to load couriers');
        }

        const tbody = document.getElementById('couriersTableBody');
        tbody.innerHTML = '';

        if (data.couriers.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="loading">No couriers found</td></tr>';
            return;
        }

        data.couriers.forEach(courier => {
            const row = document.createElement('tr');
            const statusClass = courier.status === 'Collected' ? 'badge-approved' : 'badge-pending';
            row.innerHTML = `
                <td>${courier.tracking_number}</td>
                <td>${courier.vendor_name}</td>
                <td>${courier.assigned_to_name}</td>
                <td><span class="badge ${statusClass}">${courier.status}</span></td>
                <td>${courier.received_at || '-'}</td>
                <td>
                    ${courier.assigned_to === user.id && !courier.acknowledgement_id ? 
                        `<button class="btn btn-primary btn-sm" onclick="acknowledgeCourier(${courier.id})">Acknowledge</button>` : 
                        '<span>Acknowledged</span>'}
                </td>
            `;
            tbody.appendChild(row);
        });
    } catch (error) {
        console.error('Load couriers error:', error);
        document.getElementById('couriersTableBody').innerHTML = 
            '<tr><td colspan="6" class="loading">Error loading couriers</td></tr>';
    }
}

// Acknowledge courier
async function acknowledgeCourier(courierId) {
    // Create signature canvas modal
    const modal = document.createElement('div');
    modal.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 1000; display: flex; align-items: center; justify-content: center;';
    
    const modalContent = document.createElement('div');
    modalContent.style.cssText = 'background: white; padding: 20px; border-radius: 8px; max-width: 500px; width: 90%;';
    
    modalContent.innerHTML = `
        <h3>Digital Signature</h3>
        <div class="signature-container">
            <canvas id="signatureCanvas" width="450" height="200"></canvas>
        </div>
        <div class="signature-controls">
            <button class="btn btn-secondary" onclick="clearSignature()">Clear</button>
            <button class="btn btn-primary" onclick="submitSignature(${courierId})">Submit</button>
            <button class="btn btn-secondary" onclick="closeSignatureModal()">Cancel</button>
        </div>
    `;
    
    modal.appendChild(modalContent);
    document.body.appendChild(modal);
    
    // Initialize signature canvas
    const canvas = document.getElementById('signatureCanvas');
    const ctx = canvas.getContext('2d');
    let isDrawing = false;
    
    canvas.addEventListener('mousedown', (e) => {
        isDrawing = true;
        const rect = canvas.getBoundingClientRect();
        ctx.beginPath();
        ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top);
    });
    
    canvas.addEventListener('mousemove', (e) => {
        if (isDrawing) {
            const rect = canvas.getBoundingClientRect();
            ctx.lineTo(e.clientX - rect.left, e.clientY - rect.top);
            ctx.stroke();
        }
    });
    
    canvas.addEventListener('mouseup', () => {
        isDrawing = false;
    });
    
    window.clearSignature = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    };
    
    window.submitSignature = async () => {
        const signatureData = canvas.toDataURL();
        
        try {
            const response = await fetch(`${API_BASE_URL}/couriers/${courierId}/acknowledge`, {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify({ signature_data: signatureData })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to acknowledge');
            }

            alert('Courier acknowledged successfully!');
            closeSignatureModal();
            loadCouriers();
        } catch (error) {
            alert('Error: ' + error.message);
        }
    };
    
    window.closeSignatureModal = () => {
        document.body.removeChild(modal);
        delete window.clearSignature;
        delete window.submitSignature;
        delete window.closeSignatureModal;
    };
}

// Load data on page load
loadFormData();
loadCouriers();
