import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { extractInvoiceDataFromImage as geminiExtractImage, extractInvoiceDataFromPDF as geminiExtractPDF } from './gemini.service.js';
import type { InvoiceExtractionResult } from './gemini.service.js';

/**
 * Extracts invoice data from an image using Anthropic Claude API
 * TODO: Implement actual Claude API integration
 * Currently falls back to Gemini as a placeholder
 */
export async function extractInvoiceDataFromImage(
  imagePath: string
): Promise<InvoiceExtractionResult> {
  try {
    if (!env.apiKeys.anthropic) {
      logger.warn('ANTHROPIC_API_KEY is not configured, falling back to Gemini');
      return geminiExtractImage(imagePath);
    }

    logger.info(`Extracting invoice data from image using Claude: ${imagePath}`);
    
    // TODO: Implement Claude API integration
    // For now, fall back to Gemini
    logger.warn('Claude API integration not yet implemented, using Gemini as fallback');
    return geminiExtractImage(imagePath);
  } catch (error) {
    logger.error(`Error extracting invoice data from ${imagePath}:`, error);
    throw error;
  }
}

/**
 * Extracts invoice data from a PDF file using Anthropic Claude API
 * TODO: Implement actual Claude API integration
 * Currently falls back to Gemini as a placeholder
 */
export async function extractInvoiceDataFromPDF(
  pdfPath: string
): Promise<InvoiceExtractionResult> {
  try {
    if (!env.apiKeys.anthropic) {
      logger.warn('ANTHROPIC_API_KEY is not configured, falling back to Gemini');
      return geminiExtractPDF(pdfPath);
    }

    logger.info(`Extracting invoice data from PDF using Claude: ${pdfPath}`);
    
    // TODO: Implement Claude API integration
    // For now, fall back to Gemini
    logger.warn('Claude API integration not yet implemented, using Gemini as fallback');
    return geminiExtractPDF(pdfPath);
  } catch (error) {
    logger.error(`Error extracting invoice data from ${pdfPath}:`, error);
    throw error;
  }
}

