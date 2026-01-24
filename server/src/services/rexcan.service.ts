import { logger } from '../utils/logger.js';
import { extractInvoiceDataFromImage as geminiExtractImage, extractInvoiceDataFromPDF as geminiExtractPDF } from './gemini.service.js';
import type { InvoiceExtractionResult } from './gemini.service.js';

/**
 * Extracts invoice data using ReXcan's custom optimized model
 * TODO: Implement ReXcan's custom model integration
 * Currently falls back to Gemini as a placeholder
 */
export async function extractInvoiceDataFromImage(
  imagePath: string
): Promise<InvoiceExtractionResult> {
  try {
    logger.info(`Extracting invoice data from image using ReXcan: ${imagePath}`);
    
    // TODO: Implement ReXcan custom model integration
    // This could be a fine-tuned model, ensemble model, or custom pipeline
    // For now, fall back to Gemini
    logger.warn('ReXcan custom model not yet implemented, using Gemini as fallback');
    return geminiExtractImage(imagePath);
  } catch (error) {
    logger.error(`Error extracting invoice data from ${imagePath}:`, error);
    throw error;
  }
}

/**
 * Extracts invoice data from a PDF file using ReXcan's custom optimized model
 * TODO: Implement ReXcan's custom model integration
 * Currently falls back to Gemini as a placeholder
 */
export async function extractInvoiceDataFromPDF(
  pdfPath: string
): Promise<InvoiceExtractionResult> {
  try {
    logger.info(`Extracting invoice data from PDF using ReXcan: ${pdfPath}`);
    
    // TODO: Implement ReXcan custom model integration
    // This could be a fine-tuned model, ensemble model, or custom pipeline
    // For now, fall back to Gemini
    logger.warn('ReXcan custom model not yet implemented, using Gemini as fallback');
    return geminiExtractPDF(pdfPath);
  } catch (error) {
    logger.error(`Error extracting invoice data from ${pdfPath}:`, error);
    throw error;
  }
}

