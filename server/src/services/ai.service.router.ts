import { logger } from '../utils/logger.js';
import {
  extractInvoiceDataFromImage as geminiExtractImage,
  extractInvoiceDataFromPDF as geminiExtractPDF,
} from './gemini.service.js';
import {
  extractInvoiceDataFromImage as openaiExtractImage,
  extractInvoiceDataFromPDF as openaiExtractPDF,
} from './openai.service.js';
import {
  extractInvoiceDataFromImage as groqExtractImage,
  extractInvoiceDataFromPDF as groqExtractPDF,
} from './groq.service.js';
import {
  extractInvoiceDataFromImage as claudeExtractImage,
  extractInvoiceDataFromPDF as claudeExtractPDF,
} from './claude.service.js';
import {
  extractInvoiceDataFromImage as rexcanExtractImage,
  extractInvoiceDataFromPDF as rexcanExtractPDF,
} from './rexcan.service.js';
import type { InvoiceExtractionResult } from './gemini.service.js';

export type AIModel = 'gemini' | 'openai' | 'groq' | 'claude' | 'rexcan' | 'best';

/**
 * Resolves 'best' model to the actual recommended model
 * Currently defaults to 'gemini' as the best model
 */
export function resolveBestModel(selectedModel: string): AIModel {
  if (selectedModel === 'best') {
    return 'gemini'; // Gemini is the recommended best model
  }
  return selectedModel as AIModel;
}

/**
 * Router service that selects the appropriate AI service based on the model
 */
export class AIServiceRouter {
  /**
   * Extract invoice data from an image using the specified model
   */
  static async extractInvoiceDataFromImage(
    imagePath: string,
    model: string = 'best'
  ): Promise<InvoiceExtractionResult> {
    const resolvedModel = resolveBestModel(model);
    logger.info(`Using ${resolvedModel} model for image extraction: ${imagePath}`);

    switch (resolvedModel) {
      case 'gemini':
        return geminiExtractImage(imagePath);
      case 'openai':
        return openaiExtractImage(imagePath);
      case 'groq':
        return groqExtractImage(imagePath);
      case 'claude':
        return claudeExtractImage(imagePath);
      case 'rexcan':
        return rexcanExtractImage(imagePath);
      default:
        logger.warn(`Unknown model ${resolvedModel}, falling back to Gemini`);
        return geminiExtractImage(imagePath);
    }
  }

  /**
   * Extract invoice data from a PDF using the specified model
   */
  static async extractInvoiceDataFromPDF(
    pdfPath: string,
    model: string = 'best'
  ): Promise<InvoiceExtractionResult> {
    const resolvedModel = resolveBestModel(model);
    logger.info(`Using ${resolvedModel} model for PDF extraction: ${pdfPath}`);

    switch (resolvedModel) {
      case 'gemini':
        return geminiExtractPDF(pdfPath);
      case 'openai':
        return openaiExtractPDF(pdfPath);
      case 'groq':
        return groqExtractPDF(pdfPath);
      case 'claude':
        return claudeExtractPDF(pdfPath);
      case 'rexcan':
        return rexcanExtractPDF(pdfPath);
      default:
        logger.warn(`Unknown model ${resolvedModel}, falling back to Gemini`);
        return geminiExtractPDF(pdfPath);
    }
  }
}

