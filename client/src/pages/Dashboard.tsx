import { useState } from 'react';

import DocumentDetailsModal from '@/components/DocumentDetailsModal';
import DocumentsList from '@/components/DocumentsList';
import FileUpload from '@/components/FileUpload';
import ProcessingStatusLog from '@/components/ProcessingStatusLog';
import BatchProcessingStatus from '@/components/BatchProcessingStatus';
import { documentAPI } from '@/services/document.api';
import type { Document } from '@/types/document.types';
import { MODEL_OPTIONS, type AIModel } from '@/types/model.types';

const Dashboard = () => {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [selectedDocument, setSelectedDocument] = useState<Document | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedModel, setSelectedModel] = useState<AIModel>('best');
  const [uploadMode, setUploadMode] = useState<'single' | 'batch'>('single');
  const [batchUploadResult, setBatchUploadResult] = useState<{
    batchId: string;
    total: number;
    successful: number;
    failed: number;
  } | null>(null);

  const handleFileSelect = async (file: File) => {
    try {
      setIsUploading(true);
      setUploadError(null);
      setUploadSuccess(null);
      setBatchUploadResult(null);

      const response = await documentAPI.uploadDocument(file, selectedModel);

      if (response.success) {
        setUploadSuccess(`File "${file.name}" uploaded successfully!`);
        // Refresh documents list
        setRefreshTrigger((prev) => prev + 1);
        // Clear success message after 5 seconds
        setTimeout(() => setUploadSuccess(null), 5000);
      } else {
        throw new Error(response.message || 'Upload failed');
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : 'An error occurred while uploading the file';
      setUploadError(errorMessage);
    } finally {
      setIsUploading(false);
    }
  };

  const handleFilesSelect = async (files: File[]) => {
    try {
      setIsUploading(true);
      setUploadError(null);
      setUploadSuccess(null);
      setBatchUploadResult(null);

      const response = await documentAPI.uploadDocumentsBatch(files, selectedModel);

      if (response.success) {
        setBatchUploadResult({
          batchId: response.data.batchId,
          total: response.data.total,
          successful: response.data.successful,
          failed: response.data.failed,
        });
        setUploadSuccess(
          `Batch upload completed: ${response.data.successful} successful, ${response.data.failed} failed`
        );
        // Refresh documents list
        setRefreshTrigger((prev) => prev + 1);
        // Clear success message after 10 seconds
        setTimeout(() => {
          setUploadSuccess(null);
          setBatchUploadResult(null);
        }, 10000);
      } else {
        throw new Error(response.message || 'Batch upload failed');
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : 'An error occurred while uploading files';
      setUploadError(errorMessage);
    } finally {
      setIsUploading(false);
    }
  };

  const handleDocumentSelect = async (document: Document) => {
    // Ensure document has an ID
    if (!document.id) {
      console.error('Document ID is missing:', document);
      return;
    }

    // Fetch full document details including extracted data
    try {
      const response = await documentAPI.getDocument(document.id);
      if (response.success && response.data) {
        setSelectedDocument(response.data.document);
        setIsModalOpen(true);
      }
    } catch (error) {
      console.error('Error fetching document details:', error);
      // Fallback to using the document from the list
      setSelectedDocument(document);
      setIsModalOpen(true);
    }
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedDocument(null);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <div className="max-w-7xl mx-auto">
          {/* Header - Material Design 3 Style */}
          <div className="mb-8">
            <h1 className="text-4xl font-normal text-gray-900 mb-3 tracking-tight">
              Document Processing
            </h1>
            <p className="text-base text-gray-600 leading-relaxed">
              Upload invoices, receipts, and documents for intelligent extraction and processing
            </p>
          </div>

          {/* Upload Section - Material Design 3 Card */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200/60 p-6 sm:p-8 mb-6 transition-shadow hover:shadow-md">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
              <div>
                <h2 className="text-xl font-normal text-gray-900 mb-1">
                  Upload Document{uploadMode === 'batch' ? 's' : ''}
                </h2>
                <p className="text-sm text-gray-500">
                  Choose single or batch upload mode
                </p>
              </div>
              <div className="flex items-center gap-2 bg-gray-100 p-1 rounded-xl">
                <button
                  type="button"
                  onClick={() => {
                    setUploadMode('single');
                    setUploadError(null);
                    setUploadSuccess(null);
                    setBatchUploadResult(null);
                  }}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                    uploadMode === 'single'
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                  disabled={isUploading}
                >
                  Single
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setUploadMode('batch');
                    setUploadError(null);
                    setUploadSuccess(null);
                    setBatchUploadResult(null);
                  }}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                    uploadMode === 'batch'
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                  disabled={isUploading}
                >
                  Batch
                </button>
              </div>
            </div>

            {/* Model Selection Card - Material Design 3 */}
            <div className="mb-6 p-5 bg-gray-50/50 rounded-xl border border-gray-200/60">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2.5">
                  <div className="p-1.5 bg-blue-50 rounded-lg">
                    <svg
                      className="w-4 h-4 text-blue-600"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                      />
                    </svg>
                  </div>
                  <label
                    htmlFor="model-select"
                    className="text-sm font-medium text-gray-900"
                  >
                    AI Model
                  </label>
                </div>
                {MODEL_OPTIONS.find((opt) => opt.value === selectedModel)?.recommended && (
                  <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                    Recommended
                  </span>
                )}
              </div>
              
              <div className="relative">
                <select
                  id="model-select"
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value as AIModel)}
                  className="w-full px-4 py-3 pr-10 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white text-gray-900 font-medium transition-all duration-200 hover:border-gray-400 appearance-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                  disabled={isUploading}
                >
                  {MODEL_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                  <svg
                    className="w-5 h-5 text-gray-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 9l-7 7-7-7"
                    />
                  </svg>
                </div>
              </div>
            </div>

            {/* Success Message */}
            {uploadSuccess && (
              <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg">
                <p className="text-green-800 flex items-center">
                  <svg
                    className="w-5 h-5 mr-2"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                      clipRule="evenodd"
                    />
                  </svg>
                  {uploadSuccess}
                </p>
                {batchUploadResult && (
                  <div className="mt-3 pt-3 border-t border-green-200">
                    <div className="grid grid-cols-3 gap-4 text-sm">
                      <div>
                        <span className="text-green-700 font-medium">Total:</span>{' '}
                        <span className="text-green-900">{batchUploadResult.total}</span>
                      </div>
                      <div>
                        <span className="text-green-700 font-medium">Successful:</span>{' '}
                        <span className="text-green-900">{batchUploadResult.successful}</span>
                      </div>
                      <div>
                        <span className="text-green-700 font-medium">Failed:</span>{' '}
                        <span className="text-green-900">{batchUploadResult.failed}</span>
                      </div>
                    </div>
                    <p className="text-xs text-green-600 mt-2">
                      Batch ID: {batchUploadResult.batchId}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Error Message */}
            {uploadError && (
              <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-red-800 flex items-center">
                  <svg
                    className="w-5 h-5 mr-2"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                      clipRule="evenodd"
                    />
                  </svg>
                  {uploadError}
                </p>
              </div>
            )}

            <FileUpload
              onFileSelect={handleFileSelect}
              onFilesSelect={uploadMode === 'batch' ? handleFilesSelect : undefined}
              disabled={isUploading}
              maxSizeMB={50}
              acceptedTypes={['.pdf', '.jpg', '.jpeg', '.png', '.gif', '.webp']}
              multiple={uploadMode === 'batch'}
            />
          </div>

          {/* Documents List Section - Material Design 3 Card */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200/60 p-6 sm:p-8 mb-6 transition-shadow hover:shadow-md">
            <DocumentsList
              refreshTrigger={refreshTrigger}
              onDocumentSelect={handleDocumentSelect}
              onDocumentDeleted={() => {
                // Refresh documents list when a document is deleted
                setRefreshTrigger((prev) => prev + 1);
              }}
            />
          </div>

          {/* Batch Processing Status - Show if batch upload was performed */}
          {batchUploadResult && batchUploadResult.batchId && (
            <div className="mb-6">
              <BatchProcessingStatus
                batchId={batchUploadResult.batchId}
                onComplete={() => {
                  // Refresh documents list when batch processing completes
                  setRefreshTrigger((prev) => prev + 1);
                }}
              />
            </div>
          )}

          {/* Processing Status Log - Show for documents being processed (only if modal is not open to avoid duplicate polling) */}
          {selectedDocument && 
           selectedDocument.status === 'processing' && 
           selectedDocument.pythonJobId &&
           !isModalOpen && (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-medium text-gray-900 mb-4">
                Processing Status
              </h2>
              <ProcessingStatusLog
                pythonJobId={selectedDocument.pythonJobId}
                onComplete={() => {
                  // Refresh documents list when processing completes
                  setRefreshTrigger((prev) => prev + 1);
                }}
              />
            </div>
          )}
        </div>
      </div>

      {/* Document Details Modal */}
      <DocumentDetailsModal
        document={selectedDocument}
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        onDocumentDeleted={() => {
          // Refresh documents list and close modal when document is deleted
          setRefreshTrigger((prev) => prev + 1);
          handleCloseModal();
        }}
      />
    </div>
  );
};

export default Dashboard;
