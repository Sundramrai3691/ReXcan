import mongoose, { Document as MongooseDocument, Schema } from 'mongoose';

export enum DocumentType {
  PDF = 'pdf',
  IMAGE = 'image',
}

export enum DocumentStatus {
  UPLOADED = 'uploaded',
  QUEUED = 'queued',
  PROCESSING = 'processing',
  PROCESSED = 'processed',
  FAILED = 'failed',
}

export interface IDocument extends MongooseDocument {
  userId: mongoose.Types.ObjectId;
  fileName: string;
  originalFileName: string;
  filePath: string;
  fileType: DocumentType;
  mimeType: string;
  fileSize: number; // in bytes
  status: DocumentStatus;
  queueJobId?: string;
  metadata?: {
    pageCount?: number;
    dimensions?: {
      width?: number;
      height?: number;
    };
  };
  errorMessage?: string;
  processedAt?: Date;
  selectedModel?: string; // AI model used for extraction: 'gemini', 'openai', 'groq', 'claude', 'rexcan', 'best'
  extractedData?: {
    invoiceNumber?: string;
    vendorName?: string;
    vendorId?: string;
    invoiceDate?: string;
    totalAmount?: number;
    amountSubtotal?: number;
    amountTax?: number;
    currency?: string;
    lineItems?: Array<{
      description?: string;
      quantity?: number;
      unitPrice?: number;
      total?: number;
    }>;
    taxInformation?: {
      taxRate?: number;
      taxAmount?: number;
    };
    rawExtraction?: Record<string, unknown>;
    // Python service fields
    fieldConfidences?: Record<string, number>;
    fieldReasons?: Record<string, string>;
    fieldSources?: Record<string, string>;
    timings?: Record<string, number>;
    llmUsed?: boolean;
    llmFields?: string[];
    dedupeHash?: string;
    isDuplicate?: boolean;
    isNearDuplicate?: boolean;
    nearDuplicates?: Array<{ job_id: string; similarity: number }>;
    arithmeticMismatch?: boolean;
    needsHumanReview?: boolean;
    llmCallReason?: string;
    // Validation flags for invalid invoices
    missingInvoiceId?: boolean;
    missingTotal?: boolean;
    missingVendorName?: boolean;
    missingDate?: boolean;
    isInvalid?: boolean;
    ocrBlocks?: Array<{
      text: string;
      bbox: number[];
      confidence: number;
      engine: string;
    }>;
  };
  pythonJobId?: string; // Job ID from Python service
  batchId?: string; // Batch ID for batch uploads
  createdAt: Date;
  updatedAt: Date;
}

const documentSchema = new Schema<IDocument>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User ID is required'],
      index: true,
    },
    fileName: {
      type: String,
      required: [true, 'File name is required'],
    },
    originalFileName: {
      type: String,
      required: [true, 'Original file name is required'],
    },
    filePath: {
      type: String,
      required: [true, 'File path is required'],
    },
    fileType: {
      type: String,
      enum: Object.values(DocumentType),
      required: [true, 'File type is required'],
    },
    mimeType: {
      type: String,
      required: [true, 'MIME type is required'],
    },
    fileSize: {
      type: Number,
      required: [true, 'File size is required'],
      min: [0, 'File size must be positive'],
    },
    status: {
      type: String,
      enum: Object.values(DocumentStatus),
      default: DocumentStatus.UPLOADED,
      index: true,
    },
    queueJobId: {
      type: String,
      index: true,
    },
    metadata: {
      pageCount: Number,
      dimensions: {
        width: Number,
        height: Number,
      },
    },
    errorMessage: String,
    processedAt: Date,
    selectedModel: String,
    extractedData: {
      invoiceNumber: String,
      vendorName: String,
      vendorId: String,
      invoiceDate: String,
      totalAmount: Number,
      amountSubtotal: Number,
      amountTax: Number,
      currency: String,
      lineItems: [{
        description: String,
        quantity: Number,
        unitPrice: Number,
        total: Number,
      }],
      taxInformation: {
        taxRate: Number,
        taxAmount: Number,
      },
      rawExtraction: Schema.Types.Mixed,
      // Python service fields
      fieldConfidences: Schema.Types.Mixed,
      fieldReasons: Schema.Types.Mixed,
      fieldSources: Schema.Types.Mixed,
      timings: Schema.Types.Mixed,
      llmUsed: Boolean,
      llmFields: [String],
      dedupeHash: String,
      isDuplicate: Boolean,
      isNearDuplicate: Boolean,
      nearDuplicates: Schema.Types.Mixed,
      arithmeticMismatch: Boolean,
      needsHumanReview: Boolean,
      llmCallReason: String,
      // Validation flags for invalid invoices
      missingInvoiceId: Boolean,
      missingTotal: Boolean,
      missingVendorName: Boolean,
      missingDate: Boolean,
      isInvalid: Boolean,
      ocrBlocks: Schema.Types.Mixed,
    },
    pythonJobId: String,
    batchId: String,
  },
  {
    timestamps: true,
    toJSON: {
      transform: (_doc: unknown, ret: Record<string, unknown>) => {
        // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
        delete ret.__v;
        // Transform _id to id for frontend compatibility
        if (ret._id) {
          ret.id = ret._id;
          // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
          delete ret._id;
        }
        return ret;
      },
    },
  }
);

// Indexes for efficient queries
documentSchema.index({ userId: 1, createdAt: -1 });
documentSchema.index({ status: 1, createdAt: -1 });
documentSchema.index({ queueJobId: 1 });
documentSchema.index({ 'extractedData.dedupeHash': 1 }); // Index for duplicate detection

export const Document = mongoose.model<IDocument>('Document', documentSchema);

