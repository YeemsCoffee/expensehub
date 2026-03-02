import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './ProjectDocuments.css';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';

function ProjectDocuments({ projectId, onClose }) {
  const [documents, setDocuments] = useState([]);
  const [versions, setVersions] = useState([]);
  const [selectedDoc, setSelectedDoc] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showUploadForm, setShowUploadForm] = useState(false);
  const [showVersions, setShowVersions] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [userRole, setUserRole] = useState('');

  const [uploadForm, setUploadForm] = useState({
    file: null,
    document_name: '',
    document_type: 'technical_doc',
    document_category: 'Planning',
    version: '1.0',
    description: '',
    tags: '',
    is_confidential: false,
    requires_approval: false,
    parent_document_id: ''
  });

  useEffect(() => {
    fetchDocuments();
    const role = localStorage.getItem('role');
    setUserRole(role);
  }, [projectId]);

  const fetchDocuments = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API_URL}/api/project-documents/project/${projectId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setDocuments(response.data);
      setLoading(false);
    } catch (err) {
      setError('Failed to fetch documents');
      setLoading(false);
    }
  };

  const fetchVersions = async (docId) => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API_URL}/api/project-documents/${docId}/versions`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setVersions(response.data);
      setShowVersions(true);
    } catch (err) {
      setError('Failed to fetch document versions');
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setUploadForm({
        ...uploadForm,
        file: file,
        document_name: uploadForm.document_name || file.name
      });
    }
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!uploadForm.file) {
      setError('Please select a file to upload');
      return;
    }

    setUploading(true);
    setError('');

    try {
      const token = localStorage.getItem('token');
      const formData = new FormData();
      formData.append('file', uploadForm.file);
      formData.append('project_id', projectId);
      formData.append('document_name', uploadForm.document_name);
      formData.append('document_type', uploadForm.document_type);
      formData.append('document_category', uploadForm.document_category);
      formData.append('version', uploadForm.version);
      formData.append('description', uploadForm.description);
      formData.append('tags', uploadForm.tags);
      formData.append('is_confidential', uploadForm.is_confidential);
      formData.append('requires_approval', uploadForm.requires_approval);

      if (uploadForm.parent_document_id) {
        formData.append('parent_document_id', uploadForm.parent_document_id);
      }

      await axios.post(
        `${API_URL}/api/project-documents/upload`,
        formData,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'multipart/form-data'
          }
        }
      );

      setShowUploadForm(false);
      resetUploadForm();
      fetchDocuments();
      setUploading(false);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to upload document');
      setUploading(false);
    }
  };

  const handleDownload = async (docId, fileName) => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API_URL}/api/project-documents/${docId}/download`, {
        headers: { Authorization: `Bearer ${token}` },
        responseType: 'blob'
      });

      // Create download link
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', fileName);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      setError('Failed to download document');
    }
  };

  const handleApprove = async (docId) => {
    try {
      const token = localStorage.getItem('token');
      await axios.post(
        `${API_URL}/api/project-documents/${docId}/approve`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      fetchDocuments();
      if (selectedDoc && selectedDoc.id === docId) {
        setSelectedDoc(null);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to approve document');
    }
  };

  const resetUploadForm = () => {
    setUploadForm({
      file: null,
      document_name: '',
      document_type: 'technical_doc',
      document_category: 'Planning',
      version: '1.0',
      description: '',
      tags: '',
      is_confidential: false,
      requires_approval: false,
      parent_document_id: ''
    });
  };

  const uploadNewVersion = (doc) => {
    setUploadForm({
      ...uploadForm,
      parent_document_id: doc.id,
      document_name: doc.document_name,
      document_type: doc.document_type,
      document_category: doc.document_category,
      version: incrementVersion(doc.version),
      tags: doc.tags ? doc.tags.join(', ') : ''
    });
    setShowUploadForm(true);
  };

  const incrementVersion = (version) => {
    const parts = version.split('.');
    const major = parseInt(parts[0]) || 1;
    const minor = parseInt(parts[1]) || 0;
    return `${major}.${minor + 1}`;
  };

  const getFileIcon = (fileType) => {
    if (fileType?.includes('pdf')) return '📄';
    if (fileType?.includes('word') || fileType?.includes('document')) return '📝';
    if (fileType?.includes('sheet') || fileType?.includes('excel')) return '📊';
    if (fileType?.includes('presentation') || fileType?.includes('powerpoint')) return '📽️';
    if (fileType?.includes('image') || fileType?.includes('png') || fileType?.includes('jpg')) return '🖼️';
    if (fileType?.includes('zip') || fileType?.includes('archive')) return '📦';
    return '📎';
  };

  const getApprovalBadge = (status) => {
    const badges = {
      draft: { text: 'Draft', class: 'badge-gray' },
      pending_approval: { text: 'Pending Approval', class: 'badge-yellow' },
      approved: { text: 'Approved', class: 'badge-green' },
      rejected: { text: 'Rejected', class: 'badge-red' }
    };
    const badge = badges[status] || badges.draft;
    return <span className={`badge ${badge.class}`}>{badge.text}</span>;
  };

  const formatFileSize = (bytes) => {
    if (!bytes) return 'Unknown';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  if (loading) return <div className="loading">Loading documents...</div>;

  return (
    <div className="project-documents-container">
      <div className="documents-header">
        <h2>Project Documents</h2>
        <div className="documents-actions">
          <button className="btn btn-primary" onClick={() => { resetUploadForm(); setShowUploadForm(true); }}>
            📤 Upload Document
          </button>
          {onClose && <button className="btn btn-outline" onClick={onClose}>Close</button>}
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {/* Upload Form Modal */}
      {showUploadForm && (
        <div className="modal">
          <div className="modal-content">
            <h3>{uploadForm.parent_document_id ? 'Upload New Version' : 'Upload Document'}</h3>
            <form onSubmit={handleUpload}>
              <div className="form-group">
                <label>Select File *</label>
                <input
                  type="file"
                  onChange={handleFileChange}
                  required
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip,.png,.jpg,.jpeg"
                />
                <small>Max 50MB. Supported: PDF, DOC, DOCX, XLS, XLSX, PPT, PPTX, TXT, CSV, ZIP, images</small>
                {uploadForm.file && (
                  <div className="file-info">
                    Selected: <strong>{uploadForm.file.name}</strong> ({formatFileSize(uploadForm.file.size)})
                  </div>
                )}
              </div>

              <div className="form-group">
                <label>Document Name *</label>
                <input
                  type="text"
                  value={uploadForm.document_name}
                  onChange={(e) => setUploadForm({ ...uploadForm, document_name: e.target.value })}
                  required
                  placeholder="Display name for the document"
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Document Type</label>
                  <select
                    value={uploadForm.document_type}
                    onChange={(e) => setUploadForm({ ...uploadForm, document_type: e.target.value })}
                  >
                    <option value="contract">Contract</option>
                    <option value="sow">Statement of Work (SOW)</option>
                    <option value="change_order">Change Order</option>
                    <option value="report">Report</option>
                    <option value="invoice">Invoice</option>
                    <option value="technical_doc">Technical Documentation</option>
                    <option value="presentation">Presentation</option>
                  </select>
                </div>

                <div className="form-group">
                  <label>Category</label>
                  <select
                    value={uploadForm.document_category}
                    onChange={(e) => setUploadForm({ ...uploadForm, document_category: e.target.value })}
                  >
                    <option value="Planning">Planning</option>
                    <option value="Execution">Execution</option>
                    <option value="Closure">Closure</option>
                    <option value="Legal">Legal</option>
                    <option value="Financial">Financial</option>
                    <option value="Technical">Technical</option>
                  </select>
                </div>

                <div className="form-group">
                  <label>Version</label>
                  <input
                    type="text"
                    value={uploadForm.version}
                    onChange={(e) => setUploadForm({ ...uploadForm, version: e.target.value })}
                    placeholder="1.0"
                  />
                </div>
              </div>

              <div className="form-group">
                <label>Description</label>
                <textarea
                  value={uploadForm.description}
                  onChange={(e) => setUploadForm({ ...uploadForm, description: e.target.value })}
                  rows="3"
                  placeholder="Brief description of the document..."
                />
              </div>

              <div className="form-group">
                <label>Tags (comma-separated)</label>
                <input
                  type="text"
                  value={uploadForm.tags}
                  onChange={(e) => setUploadForm({ ...uploadForm, tags: e.target.value })}
                  placeholder="contract, legal, signed"
                />
              </div>

              <div className="form-group">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={uploadForm.is_confidential}
                    onChange={(e) => setUploadForm({ ...uploadForm, is_confidential: e.target.checked })}
                  />
                  Mark as Confidential
                </label>
              </div>

              <div className="form-group">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={uploadForm.requires_approval}
                    onChange={(e) => setUploadForm({ ...uploadForm, requires_approval: e.target.checked })}
                  />
                  Requires Manager Approval
                </label>
              </div>

              <div className="form-actions">
                <button type="submit" className="btn btn-primary" disabled={uploading}>
                  {uploading ? 'Uploading...' : 'Upload Document'}
                </button>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => { setShowUploadForm(false); resetUploadForm(); }}
                  disabled={uploading}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Document Versions Modal */}
      {showVersions && (
        <div className="modal">
          <div className="modal-content">
            <div className="versions-header">
              <h3>Document Versions</h3>
              <button className="btn-close" onClick={() => setShowVersions(false)}>✕</button>
            </div>
            <div className="versions-list">
              {versions.map((ver) => (
                <div key={ver.id} className={`version-item ${ver.is_latest_version ? 'latest' : ''}`}>
                  <div className="version-info">
                    <div className="version-header">
                      <span className="version-number">v{ver.version}</span>
                      {ver.is_latest_version && <span className="latest-badge">Latest</span>}
                    </div>
                    <div className="version-details">
                      <div>Uploaded by {ver.uploaded_by_name}</div>
                      <div>{new Date(ver.uploaded_at).toLocaleString()}</div>
                      <div>{formatFileSize(ver.file_size)}</div>
                    </div>
                    {ver.version_notes && (
                      <div className="version-notes">{ver.version_notes}</div>
                    )}
                  </div>
                  <button
                    className="btn btn-sm btn-outline"
                    onClick={() => handleDownload(ver.id, ver.file_name)}
                  >
                    Download
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Documents Grid */}
      <div className="documents-grid">
        {documents.length === 0 ? (
          <p className="empty-state">No documents yet. Upload your first document.</p>
        ) : (
          documents.map((doc) => (
            <div key={doc.id} className={`document-card ${doc.is_confidential ? 'confidential' : ''}`}>
              <div className="document-icon">
                {getFileIcon(doc.file_type)}
                {doc.is_confidential && <span className="confidential-indicator">🔒</span>}
              </div>

              <div className="document-info">
                <h4>{doc.document_name}</h4>

                <div className="document-meta">
                  <span className="document-type">{doc.document_type?.replace('_', ' ')}</span>
                  <span className="document-version">v{doc.version}</span>
                  {doc.is_latest_version && <span className="latest-indicator">Latest</span>}
                </div>

                {doc.description && (
                  <p className="document-description">{doc.description}</p>
                )}

                <div className="document-details">
                  <div className="detail-row">
                    <span className="label">Category:</span>
                    <span>{doc.document_category}</span>
                  </div>
                  {doc.phase_name && (
                    <div className="detail-row">
                      <span className="label">Phase:</span>
                      <span>{doc.phase_name}</span>
                    </div>
                  )}
                  <div className="detail-row">
                    <span className="label">Size:</span>
                    <span>{formatFileSize(doc.file_size)}</span>
                  </div>
                  <div className="detail-row">
                    <span className="label">Uploaded:</span>
                    <span>{new Date(doc.uploaded_at).toLocaleDateString()}</span>
                  </div>
                  <div className="detail-row">
                    <span className="label">By:</span>
                    <span>{doc.uploaded_by_name}</span>
                  </div>
                  {doc.requires_approval && (
                    <div className="detail-row">
                      <span className="label">Status:</span>
                      {getApprovalBadge(doc.approval_status)}
                    </div>
                  )}
                </div>

                {doc.tags && doc.tags.length > 0 && (
                  <div className="document-tags">
                    {doc.tags.map((tag, index) => (
                      <span key={index} className="tag">{tag}</span>
                    ))}
                  </div>
                )}

                <div className="document-actions">
                  <button
                    className="btn btn-sm btn-primary"
                    onClick={() => handleDownload(doc.id, doc.file_name)}
                  >
                    Download
                  </button>
                  <button
                    className="btn btn-sm btn-outline"
                    onClick={() => fetchVersions(doc.id)}
                  >
                    Versions
                  </button>
                  <button
                    className="btn btn-sm btn-outline"
                    onClick={() => uploadNewVersion(doc)}
                  >
                    New Version
                  </button>
                  {userRole && ['manager', 'admin'].includes(userRole) &&
                   doc.requires_approval &&
                   doc.approval_status === 'pending_approval' && (
                    <button
                      className="btn btn-sm btn-success"
                      onClick={() => handleApprove(doc.id)}
                    >
                      Approve
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default ProjectDocuments;
