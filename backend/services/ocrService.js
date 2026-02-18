const Tesseract = require('tesseract.js');
const fs = require('fs').promises;

// Extract text from image using OCR
async function extractText(imagePath) {
  try {
    const { data: { text } } = await Tesseract.recognize(imagePath, 'eng', {
      logger: m => console.log(m)
    });
    return text;
  } catch (error) {
    console.error('OCR extraction error:', error);
    throw error;
  }
}

// Parse bill data from OCR text
function parseBillData(ocrText) {
  const data = {
    vendor_name: '',
    bill_number: '',
    date: '',
    amount: 0,
    gst_number: ''
  };

  const lines = ocrText.split('\n').map(line => line.trim()).filter(line => line);

  // Extract vendor name (usually first few lines)
  if (lines.length > 0) {
    data.vendor_name = lines[0].substring(0, 255);
  }

  // Extract bill number (look for patterns like "Bill No:", "Invoice No:", etc.)
  const billNumberPatterns = [
    /bill\s*no[:\s]+([A-Z0-9\-]+)/i,
    /invoice\s*no[:\s]+([A-Z0-9\-]+)/i,
    /bill\s*#\s*([A-Z0-9\-]+)/i,
    /invoice\s*#\s*([A-Z0-9\-]+)/i
  ];

  for (const pattern of billNumberPatterns) {
    const match = ocrText.match(pattern);
    if (match) {
      data.bill_number = match[1];
      break;
    }
  }

  // Extract date (look for date patterns)
  const datePatterns = [
    /(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/,
    /(\d{2,4}[-\/]\d{1,2}[-\/]\d{1,2})/,
    /date[:\s]+(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i
  ];

  for (const pattern of datePatterns) {
    const match = ocrText.match(pattern);
    if (match) {
      data.date = match[1];
      break;
    }
  }

  // Extract amount (look for "Total", "Amount", "Grand Total", etc.)
  const amountPatterns = [
    /total[:\s]+[₹Rs.]*\s*(\d+[.,]?\d*)/i,
    /amount[:\s]+[₹Rs.]*\s*(\d+[.,]?\d*)/i,
    /grand\s*total[:\s]+[₹Rs.]*\s*(\d+[.,]?\d*)/i,
    /[₹Rs.]\s*(\d+[.,]?\d*)/g
  ];

  let amounts = [];
  for (const pattern of amountPatterns) {
    const matches = ocrText.match(pattern);
    if (matches) {
      amounts = matches.map(m => {
        const numStr = m.replace(/[₹Rs.,\s]/g, '');
        return parseFloat(numStr);
      }).filter(n => !isNaN(n) && n > 0);
      if (amounts.length > 0) {
        // Take the largest amount as total
        data.amount = Math.max(...amounts);
        break;
      }
    }
  }

  // Extract GST number (look for GST patterns)
  const gstPatterns = [
    /gst[:\s]+([0-9A-Z]{15})/i,
    /gstin[:\s]+([0-9A-Z]{15})/i,
    /gst\s*no[:\s]+([0-9A-Z]{15})/i
  ];

  for (const pattern of gstPatterns) {
    const match = ocrText.match(pattern);
    if (match) {
      data.gst_number = match[1];
      break;
    }
  }

  return data;
}

// Process image and return structured data
async function processBillImage(imagePath) {
  try {
    const ocrText = await extractText(imagePath);
    const parsedData = parseBillData(ocrText);
    
    return {
      ocrText,
      parsedData
    };
  } catch (error) {
    console.error('Bill image processing error:', error);
    throw error;
  }
}

module.exports = {
  extractText,
  parseBillData,
  processBillImage
};
