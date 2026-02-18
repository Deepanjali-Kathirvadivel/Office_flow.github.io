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

let stream = null;
let capturedImageData = null;

// Camera controls
document.getElementById('startCameraBtn').addEventListener('click', async () => {
    try {
        stream = await navigator.mediaDevices.getUserMedia({ video: true });
        const video = document.getElementById('videoElement');
        video.srcObject = stream;
        video.style.display = 'block';
        document.getElementById('startCameraBtn').style.display = 'none';
        document.getElementById('captureBtn').style.display = 'inline-flex';
        document.getElementById('stopCameraBtn').style.display = 'inline-flex';
    } catch (error) {
        alert('Error accessing camera: ' + error.message);
    }
});

document.getElementById('stopCameraBtn').addEventListener('click', () => {
    if (stream) {
        stream.getTracks().forEach(track => track.stop());
        stream = null;
    }
    document.getElementById('videoElement').style.display = 'none';
    document.getElementById('startCameraBtn').style.display = 'inline-flex';
    document.getElementById('captureBtn').style.display = 'none';
    document.getElementById('stopCameraBtn').style.display = 'none';
});

document.getElementById('captureBtn').addEventListener('click', () => {
    const video = document.getElementById('videoElement');
    const canvas = document.getElementById('captureCanvas');
    const ctx = canvas.getContext('2d');
    
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0);
    
    const imageData = canvas.toDataURL('image/jpeg');
    capturedImageData = imageData;
    
    const img = document.getElementById('capturedImage');
    img.src = imageData;
    img.style.display = 'block';
    
    // Stop camera
    if (stream) {
        stream.getTracks().forEach(track => track.stop());
        stream = null;
    }
    document.getElementById('videoElement').style.display = 'none';
    document.getElementById('startCameraBtn').style.display = 'inline-flex';
    document.getElementById('captureBtn').style.display = 'none';
    document.getElementById('stopCameraBtn').style.display = 'none';
});

// File input
document.getElementById('fileInput').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
            capturedImageData = event.target.result;
            const img = document.getElementById('capturedImage');
            img.src = capturedImageData;
            img.style.display = 'block';
        };
        reader.readAsDataURL(file);
    }
});

// Upload image and process OCR
async function uploadAndProcessImage(imageData) {
    try {
        // Convert data URL to blob
        const response = await fetch(imageData);
        const blob = await response.blob();
        
        const formData = new FormData();
        formData.append('image', blob, 'bill.jpg');

        const uploadResponse = await fetch(`${API_BASE_URL}/bills/upload`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${getAuthToken()}`
            },
            body: formData
        });

        const data = await uploadResponse.json();
        
        if (!uploadResponse.ok) {
            throw new Error(data.error || 'Upload failed');
        }

        return data;
    } catch (error) {
        console.error('Upload error:', error);
        throw error;
    }
}

// Auto-fill form from OCR data
function fillFormFromOCR(ocrData) {
    if (ocrData.parsedData) {
        const data = ocrData.parsedData;
        if (data.bill_number) document.getElementById('bill_number').value = data.bill_number;
        if (data.vendor_name) document.getElementById('vendor_name').value = data.vendor_name;
        if (data.gst_number) document.getElementById('vendor_gst').value = data.gst_number;
        if (data.date) {
            // Try to parse date
            const dateStr = data.date.replace(/\//g, '-');
            document.getElementById('bill_date').value = dateStr;
        }
        if (data.amount) {
            document.getElementById('amount').value = data.amount;
            document.getElementById('total_amount').value = data.amount;
        }
    }
}

// Process image when captured
document.getElementById('capturedImage').addEventListener('load', async function() {
    if (capturedImageData) {
        try {
            const messageDiv = document.getElementById('billMessage');
            messageDiv.textContent = 'Processing OCR...';
            messageDiv.classList.add('show');
            messageDiv.classList.remove('error-message');
            messageDiv.classList.add('success-message');

            const ocrData = await uploadAndProcessImage(capturedImageData);
            fillFormFromOCR(ocrData);
            
            messageDiv.textContent = 'OCR processing complete. Please review and edit fields.';
        } catch (error) {
            const messageDiv = document.getElementById('billMessage');
            messageDiv.textContent = 'OCR processing failed: ' + error.message;
            messageDiv.classList.add('show');
            messageDiv.classList.remove('success-message');
            messageDiv.classList.add('error-message');
        }
    }
});

// Submit bill form
document.getElementById('billForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const formData = new FormData(e.target);
    const billData = {
        bill_number: formData.get('bill_number'),
        vendor_name: formData.get('vendor_name'),
        vendor_gst: formData.get('vendor_gst'),
        bill_date: formData.get('bill_date'),
        amount: parseFloat(formData.get('amount')) || 0,
        gst_amount: parseFloat(formData.get('gst_amount')) || 0,
        total_amount: parseFloat(formData.get('total_amount'))
    };

    // Get image path if available
    if (capturedImageData) {
        try {
            const ocrData = await uploadAndProcessImage(capturedImageData);
            billData.image_path = ocrData.imagePath;
            billData.ocr_text = ocrData.ocrText;
        } catch (error) {
            alert('Failed to upload image: ' + error.message);
            return;
        }
    }

    try {
        const response = await fetch(`${API_BASE_URL}/bills`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify(billData)
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to submit bill');
        }

        alert('Bill submitted successfully!');
        e.target.reset();
        document.getElementById('capturedImage').style.display = 'none';
        capturedImageData = null;
        loadBills();
    } catch (error) {
        const messageDiv = document.getElementById('billMessage');
        messageDiv.textContent = error.message;
        messageDiv.classList.add('show');
        messageDiv.classList.remove('success-message');
        messageDiv.classList.add('error-message');
    }
});

// Load bills
async function loadBills() {
    try {
        const response = await fetch(`${API_BASE_URL}/bills`, {
            headers: getAuthHeaders()
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to load bills');
        }

        const tbody = document.getElementById('billsTableBody');
        tbody.innerHTML = '';

        if (data.bills.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="loading">No bills found</td></tr>';
            return;
        }

        data.bills.forEach(bill => {
            const row = document.createElement('tr');
            const statusClass = `badge-${bill.final_status.toLowerCase()}`;
            row.innerHTML = `
                <td>${bill.bill_number || 'N/A'}</td>
                <td>${bill.vendor_name}</td>
                <td>${bill.bill_date}</td>
                <td>₹${bill.total_amount}</td>
                <td><span class="badge ${statusClass}">${bill.final_status}</span></td>
                <td><a href="bill-detail.html?id=${bill.id}">View</a></td>
            `;
            tbody.appendChild(row);
        });
    } catch (error) {
        console.error('Load bills error:', error);
        document.getElementById('billsTableBody').innerHTML = 
            '<tr><td colspan="6" class="loading">Error loading bills</td></tr>';
    }
}

// Load bills on page load
loadBills();
