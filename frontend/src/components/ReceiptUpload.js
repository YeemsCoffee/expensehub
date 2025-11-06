import React, { useState, useRef } from 'react';
import { Upload, Camera, X, CheckCircle, AlertCircle, Loader } from 'lucide-react';
import api from '../services/api';

const ReceiptUpload = ({ onReceiptProcessed, onClose }) => {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileInput = (e) => {
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
    }
  };

  const handleFile = (selectedFile) => {
    // Validate file type
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/heic', 'application/pdf'];
    if (!validTypes.includes(selectedFile.type)) {
      setError('Please upload an image (JPG, PNG, GIF, HEIC) or PDF file');
      return;
    }

    // Validate file size (10MB)
    if (selectedFile.size > 10 * 1024 * 1024) {
      setError('File size must be less than 10MB');
      return;
    }

    setFile(selectedFile);
    setError(null);
    setResult(null);

    // Create preview for images
    if (selectedFile.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreview(reader.result);
      };
      reader.readAsDataURL(selectedFile);
    } else {
      setPreview(null);
    }
  };

  const uploadAndProcess = async () => {
    if (!file) return;

    setUploading(true);
    setProcessing(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('receipt', file);

      // Use axios api instance which handles baseURL and auth automatically
      const response = await api.post('/receipts/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });

      const data = response.data;

      setResult(data);
      setProcessing(false);
      setUploading(false);

      // Call parent callback with extracted data
      if (onReceiptProcessed) {
        onReceiptProcessed(data.extractedData, data.receiptId);
      }

    } catch (err) {
      console.error('Upload error:', err);
      setError(err.response?.data?.error || err.message || 'Failed to process receipt');
      setProcessing(false);
      setUploading(false);
    }
  };

  const reset = () => {
    setFile(null);
    setPreview(null);
    setError(null);
    setResult(null);
    setUploading(false);
    setProcessing(false);
  };

  const useExtractedData = () => {
    if (result && onReceiptProcessed) {
      onReceiptProcessed(result.extractedData, result.receiptId);
    }
    if (onClose) {
      onClose();
    }
  };

  return (
    <div className="receipt-upload-container">
      <div className="receipt-upload-header">
        <h3>Upload Receipt</h3>
        {onClose && (
          <button onClick={onClose} className="btn-icon">
            <X size={20} />
          </button>
        )}
      </div>

      {!file && !result && (
        <div
          className={`receipt-drop-zone ${dragActive ? 'active' : ''}`}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
        >
          <Upload size={48} className="upload-icon" />
          <p className="drop-zone-text">Drag & drop receipt here</p>
          <p className="drop-zone-subtext">or</p>

          <div className="upload-buttons">
            <button
              className="btn btn-primary"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload size={16} />
              Choose File
            </button>

            <button
              className="btn btn-secondary"
              onClick={() => cameraInputRef.current?.click()}
            >
              <Camera size={16} />
              Take Photo
            </button>
          </div>

          <p className="upload-hint">
            Supports JPG, PNG, GIF, HEIC, PDF (max 10MB)
          </p>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,.pdf"
            onChange={handleFileInput}
            style={{ display: 'none' }}
          />

          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleFileInput}
            style={{ display: 'none' }}
          />
        </div>
      )}

      {file && !result && (
        <div className="receipt-preview-container">
          <div className="receipt-preview-header">
            <h4>{file.name}</h4>
            <button onClick={reset} className="btn-text">
              <X size={16} /> Remove
            </button>
          </div>

          {preview && (
            <div className="receipt-preview-image">
              <img src={preview} alt="Receipt preview" />
            </div>
          )}

          {!preview && (
            <div className="receipt-file-info">
              <p><strong>File:</strong> {file.name}</p>
              <p><strong>Size:</strong> {(file.size / 1024).toFixed(2)} KB</p>
              <p><strong>Type:</strong> {file.type}</p>
            </div>
          )}

          <button
            className="btn btn-primary btn-full"
            onClick={uploadAndProcess}
            disabled={uploading}
          >
            {uploading ? (
              <>
                <Loader className="spinner" size={16} />
                {processing ? 'Processing with AI...' : 'Uploading...'}
              </>
            ) : (
              <>
                <CheckCircle size={16} />
                Process Receipt
              </>
            )}
          </button>

          {processing && (
            <div className="processing-status">
              <Loader className="spinner" size={20} />
              <p>Extracting data from receipt...</p>
              <p className="text-sm text-gray">This usually takes 2-3 seconds</p>
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="alert alert-error">
          <AlertCircle size={20} />
          <span>{error}</span>
        </div>
      )}

      {result && (
        <div className="receipt-result-container">
          <div className="alert alert-success">
            <CheckCircle size={20} />
            <span>Receipt processed successfully!</span>
          </div>

          <div className="receipt-extracted-data">
            <h4>Extracted Information:</h4>

            <div className="extracted-field">
              <label>Vendor:</label>
              <span>{result.extractedData.vendor || 'N/A'}</span>
              {result.confidence?.vendor && (
                <span className="confidence">
                  {(result.confidence.vendor * 100).toFixed(0)}% confidence
                </span>
              )}
            </div>

            <div className="extracted-field">
              <label>Date:</label>
              <span>{result.extractedData.date || 'N/A'}</span>
              {result.confidence?.date && (
                <span className="confidence">
                  {(result.confidence.date * 100).toFixed(0)}% confidence
                </span>
              )}
            </div>

            <div className="extracted-field">
              <label>Total Amount:</label>
              <span>${result.extractedData.amount?.toFixed(2) || '0.00'}</span>
              {result.confidence?.total && (
                <span className="confidence">
                  {(result.confidence.total * 100).toFixed(0)}% confidence
                </span>
              )}
            </div>

            <div className="extracted-field">
              <label>Category:</label>
              <span>{result.extractedData.category || 'Other'}</span>
            </div>

            {result.extractedData.tax > 0 && (
              <div className="extracted-field">
                <label>Tax:</label>
                <span>${result.extractedData.tax.toFixed(2)}</span>
              </div>
            )}

            {result.extractedData.lineItems && result.extractedData.lineItems.length > 0 && (
              <div className="extracted-field">
                <label>Line Items:</label>
                <div className="line-items">
                  {result.extractedData.lineItems.slice(0, 3).map((item, idx) => (
                    <div key={idx} className="line-item">
                      <span>{item.description}</span>
                      <span>${item.total?.toFixed(2) || '0.00'}</span>
                    </div>
                  ))}
                  {result.extractedData.lineItems.length > 3 && (
                    <p className="text-sm text-gray">
                      +{result.extractedData.lineItems.length - 3} more items
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="result-actions">
            <button
              className="btn btn-primary btn-full"
              onClick={useExtractedData}
            >
              Use This Data
            </button>
            <button
              className="btn btn-secondary btn-full"
              onClick={reset}
            >
              Upload Another Receipt
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ReceiptUpload;
