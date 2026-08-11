import mammoth from 'mammoth';
import { log } from './logger';

/**
 * Extract readable text from various document formats
 * @param fileData - Base64 encoded document data
 * @param fileName - Original filename to determine document type
 * @returns Promise<string> - Extracted text content
 */
export async function extractDocumentText(fileData: string, fileName: string): Promise<string> {
  try {
    // Convert base64 to Buffer
    const buffer = Buffer.from(fileData, 'base64');
    
    // Determine file type from filename extension
    const extension = fileName.toLowerCase().split('.').pop();
    
    log(`Extracting text from ${extension} document: ${fileName}`, "document-extractor");
    
    switch (extension) {
      case 'pdf':
        return await extractPdfText(buffer);
      
      case 'docx':
        return await extractDocxText(buffer);
      
      case 'doc':
        // Note: mammoth primarily supports .docx, not .doc
        // For older .doc files, we'll attempt docx extraction but it may fail
        log(`Warning: .doc files are not fully supported, attempting docx extraction`, "document-extractor");
        return await extractDocxText(buffer);
      
      default:
        // For unknown file types, attempt to treat as text
        log(`Unknown file type: ${extension}, attempting text extraction`, "document-extractor");
        return buffer.toString('utf-8');
    }
    
  } catch (error) {
    log(`Error extracting text from document ${fileName}: ${error}`, "document-extractor");
    
    // Return a meaningful error message for the model
    return `[Document text extraction failed: ${error instanceof Error ? error.message : String(error)}. File type: ${fileName.split('.').pop()?.toUpperCase() || 'unknown'}]`;
  }
}

/**
 * Extract text from PDF files using pdf-parse (dynamic import)
 */
async function extractPdfText(buffer: Buffer): Promise<string> {
  try {
    // Import pdf-parse using require() in try-catch for better compatibility
    log(`Attempting to load pdf-parse library`, "document-extractor");
    
    let pdfParse;
    try {
      // Try require first
      pdfParse = require('pdf-parse');
    } catch (requireError) {
      log(`require() failed, trying dynamic import: ${requireError}`, "document-extractor");
      // Fallback to dynamic import
      const pdfModule = await import('pdf-parse');
      pdfParse = pdfModule.default || pdfModule;
    }
    
    if (!pdfParse || typeof pdfParse !== 'function') {
      throw new Error(`PDF parsing library not available - found: ${typeof pdfParse}`);
    }
    
    log(`PDF parse function loaded successfully`, "document-extractor");
    const data = await pdfParse(buffer);
    const text = data.text.trim();
    
    if (!text || text.length === 0) {
      return '[PDF document appears to be empty or contains only images/graphics with no extractable text]';
    }
    
    log(`Successfully extracted ${text.length} characters from PDF`, "document-extractor");
    return text;
    
  } catch (error) {
    log(`PDF parsing error: ${error}`, "document-extractor");
    throw new Error(`Failed to extract text from PDF: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Extract text from DOCX files using mammoth
 */
async function extractDocxText(buffer: Buffer): Promise<string> {
  try {
    const result = await mammoth.extractRawText({ buffer });
    const text = result.value.trim();
    
    if (!text || text.length === 0) {
      return '[DOCX document appears to be empty or contains only images/graphics with no extractable text]';
    }
    
    // Log any conversion warnings
    if (result.messages && result.messages.length > 0) {
      log(`DOCX conversion warnings: ${result.messages.map(m => m.message).join(', ')}`, "document-extractor");
    }
    
    log(`Successfully extracted ${text.length} characters from DOCX`, "document-extractor");
    return text;
    
  } catch (error) {
    log(`DOCX parsing error: ${error}`, "document-extractor");
    throw new Error(`Failed to extract text from DOCX: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Validate and clean extracted text for the model analysis
 */
export function validateExtractedText(text: string, maxLength: number = 100000): string {
  // Remove excessive whitespace and normalize line breaks
  let cleanText = text
    .replace(/\r\n/g, '\n')  // Normalize line endings
    .replace(/\n{3,}/g, '\n\n')  // Reduce excessive line breaks
    .replace(/[ \t]{2,}/g, ' ')  // Reduce excessive spaces
    .trim();
  
  // Truncate if too long to avoid token limits
  if (cleanText.length > maxLength) {
    log(`Truncating document text from ${cleanText.length} to ${maxLength} characters`, "document-extractor");
    cleanText = cleanText.substring(0, maxLength) + '\n\n[Document content truncated due to length]';
  }
  
  return cleanText;
}