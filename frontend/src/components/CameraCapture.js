import React, { useState, useRef, useEffect } from 'react';
import { Camera, X, RotateCw, Check, Image as ImageIcon } from 'lucide-react';

const CameraCapture = ({ onCapture, onClose }) => {
  const [stream, setStream] = useState(null);
  const [capturedImage, setCapturedImage] = useState(null);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [error, setError] = useState(null);
  const [facingMode, setFacingMode] = useState('environment'); // 'user' or 'environment'
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    return () => {
      // Cleanup: stop stream when component unmounts
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, [stream]);

  const startCamera = async () => {
    try {
      setError(null);
      
      // Stop existing stream if any
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }

      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: facingMode,
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        }
      });

      setStream(mediaStream);
      setIsCameraActive(true);

      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch (err) {
      console.error('Camera error:', err);
      setError('Unable to access camera. Please check permissions.');
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
      setIsCameraActive(false);
    }
  };

  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    
    // Set canvas dimensions to match video
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    // Draw video frame to canvas
    const context = canvas.getContext('2d');
    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Convert to blob
    canvas.toBlob((blob) => {
      if (blob) {
        const imageUrl = URL.createObjectURL(blob);
        setCapturedImage(imageUrl);
        stopCamera();
      }
    }, 'image/jpeg', 0.95);
  };

  const switchCamera = async () => {
    const newFacingMode = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(newFacingMode);
    
    if (isCameraActive) {
      stopCamera();
      setTimeout(() => {
        startCamera();
      }, 100);
    }
  };

  const retakePhoto = () => {
    setCapturedImage(null);
    startCamera();
  };

  const confirmCapture = () => {
    if (capturedImage) {
      // Convert blob URL to File object
      fetch(capturedImage)
        .then(res => res.blob())
        .then(blob => {
          const file = new File([blob], `receipt-${Date.now()}.jpg`, { type: 'image/jpeg' });
          onCapture(file);
          onClose();
        });
    }
  };

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (file && file.type.startsWith('image/')) {
      onCapture(file);
      onClose();
    }
  };

  return (
    <div className="camera-capture-modal">
      <div className="camera-capture-overlay" onClick={onClose} />
      
      <div className="camera-capture-container">
        {/* Header */}
        <div className="camera-capture-header">
          <h3>Capture Receipt</h3>
          <button className="camera-close-btn" onClick={onClose}>
            <X size={24} />
          </button>
        </div>

        {/* Camera view or captured image */}
        <div className="camera-capture-view">
          {!isCameraActive && !capturedImage && !error && (
            <div className="camera-start-screen">
              <Camera size={64} color="#9ca3af" />
              <p>Ready to capture receipt</p>
              <div className="camera-start-actions">
                <button className="btn btn-primary" onClick={startCamera}>
                  <Camera size={20} />
                  Open Camera
                </button>
                <button 
                  className="btn btn-secondary" 
                  onClick={() => fileInputRef.current?.click()}
                >
                  <ImageIcon size={20} />
                  Choose from Gallery
                </button>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={handleFileSelect}
              />
            </div>
          )}

          {error && (
            <div className="camera-error-screen">
              <p className="camera-error-message">{error}</p>
              <button className="btn btn-secondary" onClick={startCamera}>
                Try Again
              </button>
            </div>
          )}

          {isCameraActive && (
            <>
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="camera-video"
              />
              <canvas ref={canvasRef} style={{ display: 'none' }} />
              
              {/* Camera guide overlay */}
              <div className="camera-guide-overlay">
                <div className="camera-guide-frame" />
                <p className="camera-guide-text">
                  Position receipt within frame
                </p>
              </div>
            </>
          )}

          {capturedImage && (
            <div className="camera-preview">
              <img src={capturedImage} alt="Captured receipt" />
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="camera-capture-controls">
          {isCameraActive && (
            <>
              <button 
                className="camera-control-btn"
                onClick={switchCamera}
                title="Switch camera"
              >
                <RotateCw size={24} />
              </button>
              <button 
                className="camera-capture-btn"
                onClick={capturePhoto}
              >
                <div className="camera-capture-btn-inner" />
              </button>
              <div style={{ width: '48px' }} /> {/* Spacer for centering */}
            </>
          )}

          {capturedImage && (
            <>
              <button 
                className="camera-control-btn"
                onClick={retakePhoto}
              >
                <RotateCw size={24} />
                <span>Retake</span>
              </button>
              <button 
                className="camera-confirm-btn btn btn-primary"
                onClick={confirmCapture}
              >
                <Check size={24} />
                <span>Use Photo</span>
              </button>
              <div style={{ width: '48px' }} /> {/* Spacer */}
            </>
          )}
        </div>

        {/* Tips */}
        {!capturedImage && (
          <div className="camera-capture-tips">
            <p>💡 Tips for best results:</p>
            <ul>
              <li>Ensure good lighting</li>
              <li>Keep receipt flat and in focus</li>
              <li>Capture all edges of the receipt</li>
            </ul>
          </div>
        )}
      </div>
    </div>
  );
};

export default CameraCapture;