import mammoth from 'mammoth';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';

/**
 * Document parser for various file formats
 */
export class DocumentParser {
  constructor() {
    this.stats = {
      totalDocuments: 0,
      successfulParsing: 0,
      failedParsing: 0,
      processingTime: 0
    };
  }

  /**
   * Parse a document file and extract structured content
   * @param {string} filePath - Path to the document file
   * @returns {Promise<object>} - Parsed document content
   */
  async parse(filePath) {
    const startTime = Date.now();
    this.stats.totalDocuments++;

    try {
      const extension = path.extname(filePath).toLowerCase();
      let result;

      switch (extension) {
        case '.docx':
          result = await this.parseDocx(filePath);
          break;
        case '.pdf':
          result = await this.parsePdf(filePath);
          break;
        default:
          throw new Error(`Unsupported file format: ${extension}`);
      }

      this.stats.successfulParsing++;
      this.stats.processingTime += Date.now() - startTime;

      return {
        ...result,
        sourceFile: filePath,
        fileExtension: extension,
        parseTimestamp: new Date().toISOString(),
        processingTimeMs: Date.now() - startTime
      };

    } catch (error) {
      this.stats.failedParsing++;
      throw new Error(`Failed to parse ${filePath}: ${error.message}`);
    }
  }

  /**
   * Parse DOCX file
   * @param {string} filePath - Path to DOCX file
   * @returns {Promise<object>} - Parsed content
   */
  async parseDocx(filePath) {
    const buffer = await fs.readFile(filePath);
    
    // Extract text and basic formatting
    const textResult = await mammoth.extractRawText({ buffer });
    const htmlResult = await mammoth.convertToHtml({ buffer });

    // Parse images
    const images = await this.extractDocxImages(buffer);

    // Parse tables
    const tables = await this.extractDocxTables(htmlResult.value);

    return {
      type: 'docx',
      rawText: textResult.value,
      html: htmlResult.value,
      images,
      tables,
      metadata: {
        wordCount: this.countWords(textResult.value),
        paragraphCount: this.countParagraphs(textResult.value),
        hasImages: images.length > 0,
        hasTables: tables.length > 0
      },
      warnings: [...textResult.messages, ...htmlResult.messages]
    };
  }

  /**
   * Parse PDF file
   * @param {string} filePath - Path to PDF file
   * @returns {Promise<object>} - Parsed content
   */
  async parsePdf(filePath) {
    try {
      console.log(`Reading PDF file: ${filePath}`);
      
      // Read PDF file as buffer
      const data = new Uint8Array(await fs.readFile(filePath));
      
      console.log(`PDF file size: ${data.length} bytes`);
      
      // Load PDF document
      const loadingTask = pdfjs.getDocument({
        data: data,
        verbosity: 0 // Suppress PDF.js console output
      });
      
      const pdfDocument = await loadingTask.promise;
      console.log(`PDF loaded successfully. Pages: ${pdfDocument.numPages}`);
      
      let fullText = '';
      const pageTexts = [];
      
      // Extract text from each page
      for (let pageNum = 1; pageNum <= pdfDocument.numPages; pageNum++) {
        console.log(`Processing page ${pageNum}/${pdfDocument.numPages}`);
        
        const page = await pdfDocument.getPage(pageNum);
        const textContent = await page.getTextContent();
        
        // Combine text items from the page
        const pageText = textContent.items
          .map(item => item.str)
          .join(' ')
          .replace(/\s+/g, ' ') // Normalize whitespace
          .trim();
        
        if (pageText) {
          pageTexts.push({
            pageNumber: pageNum,
            text: pageText
          });
          fullText += pageText + '\n\n';
        }
        
        // Clean up page resources
        page.cleanup();
      }
      
      // Clean up document resources
      pdfDocument.cleanup();
      
      console.log(`Extracted ${fullText.length} characters from ${pdfDocument.numPages} pages`);
      
      // Extract images (placeholder for now)
      const images = await this.extractPdfImages(data);

      // Extract tables using text analysis
      const tables = this.extractPdfTables(fullText);

      const fileStats = await fs.stat(filePath);

      return {
        type: 'pdf',
        rawText: fullText.trim(),
        pages: pdfDocument.numPages,
        pageTexts: pageTexts,
        images,
        tables,
        metadata: {
          wordCount: this.countWords(fullText),
          paragraphCount: this.countParagraphs(fullText),
          pageCount: pdfDocument.numPages,
          hasImages: images.length > 0,
          hasTables: tables.length > 0,
          fileSize: fileStats.size,
          fileName: path.basename(filePath),
          extractedText: true
        }
      };
      
    } catch (error) {
      console.error(`PDF parsing error: ${error.message}`);
      throw new Error(`PDF parsing failed: ${error.message}`);
    }
  }

  /**
   * Extract images from DOCX
   * @param {Buffer} buffer - DOCX file buffer
   * @returns {Promise<Array>} - Array of image objects
   */
  async extractDocxImages(buffer) {
    try {
      // This is a simplified implementation
      // In a real implementation, you'd need to parse the DOCX structure
      // and extract embedded images
      return [];
    } catch (error) {
      console.warn('Failed to extract images from DOCX:', error.message);
      return [];
    }
  }

  /**
   * Extract images from PDF
   * @param {Buffer} buffer - PDF file buffer
   * @returns {Promise<Array>} - Array of image objects
   */
  async extractPdfImages(buffer) {
    try {
      // This would require a more sophisticated PDF parser
      // For now, return empty array
      return [];
    } catch (error) {
      console.warn('Failed to extract images from PDF:', error.message);
      return [];
    }
  }

  /**
   * Extract tables from HTML (DOCX conversion)
   * @param {string} html - HTML content
   * @returns {Array} - Array of table objects
   */
  extractDocxTables(html) {
    const tables = [];
    
    // Use regex to find table patterns
    const tableRegex = /<table[^>]*>(.*?)<\/table>/gis;
    let match;

    while ((match = tableRegex.exec(html)) !== null) {
      const tableHtml = match[0];
      const table = this.parseHtmlTable(tableHtml);
      if (table) {
        tables.push(table);
      }
    }

    return tables;
  }

  /**
   * Extract tables from PDF text (basic pattern matching)
   * @param {string} text - PDF text content
   * @returns {Array} - Array of potential table objects
   */
  extractPdfTables(text) {
    const tables = [];
    const lines = text.split('\n');
    
    // Look for table-like patterns (multiple columns separated by spaces/tabs)
    let currentTable = null;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // Skip empty lines
      if (!line) continue;
      
      // Check if line looks like a table row (multiple columns)
      const columns = line.split(/\s{2,}|\t/).filter(col => col.trim());
      
      if (columns.length >= 2) {
        if (!currentTable) {
          currentTable = {
            rows: [],
            startLine: i,
            columnCount: columns.length
          };
        }
        
        if (columns.length === currentTable.columnCount) {
          currentTable.rows.push(columns);
        } else {
          // Column count changed, end current table
          if (currentTable.rows.length >= 2) {
            tables.push(this.formatPdfTable(currentTable));
          }
          currentTable = {
            rows: [columns],
            startLine: i,
            columnCount: columns.length
          };
        }
      } else {
        // Not a table row, end current table if it exists
        if (currentTable && currentTable.rows.length >= 2) {
          tables.push(this.formatPdfTable(currentTable));
        }
        currentTable = null;
      }
    }
    
    // Handle table at end of document
    if (currentTable && currentTable.rows.length >= 2) {
      tables.push(this.formatPdfTable(currentTable));
    }
    
    return tables;
  }

  /**
   * Parse HTML table into structured format
   * @param {string} tableHtml - HTML table string
   * @returns {object|null} - Structured table object
   */
  parseHtmlTable(tableHtml) {
    try {
      const rows = [];
      const rowRegex = /<tr[^>]*>(.*?)<\/tr>/gis;
      let rowMatch;

      while ((rowMatch = rowRegex.exec(tableHtml)) !== null) {
        const rowHtml = rowMatch[1];
        const cells = [];
        const cellRegex = /<t[hd][^>]*>(.*?)<\/t[hd]>/gis;
        let cellMatch;

        while ((cellMatch = cellRegex.exec(rowHtml)) !== null) {
          // Remove HTML tags and clean up text
          const cellText = cellMatch[1]
            .replace(/<[^>]*>/g, '')
            .replace(/&nbsp;/g, ' ')
            .trim();
          cells.push(cellText);
        }

        if (cells.length > 0) {
          rows.push(cells);
        }
      }

      if (rows.length === 0) return null;

      return {
        type: 'html_table',
        rows,
        columnCount: Math.max(...rows.map(row => row.length)),
        rowCount: rows.length
      };

    } catch (error) {
      console.warn('Failed to parse HTML table:', error.message);
      return null;
    }
  }

  /**
   * Format PDF table into structured format
   * @param {object} tableData - Raw table data
   * @returns {object} - Structured table object
   */
  formatPdfTable(tableData) {
    return {
      type: 'text_table',
      rows: tableData.rows,
      columnCount: tableData.columnCount,
      rowCount: tableData.rows.length,
      startLine: tableData.startLine
    };
  }

  /**
   * Count words in text
   * @param {string} text - Input text
   * @returns {number} - Word count
   */
  countWords(text) {
    return text.trim().split(/\s+/).filter(word => word.length > 0).length;
  }

  /**
   * Count paragraphs in text
   * @param {string} text - Input text
   * @returns {number} - Paragraph count
   */
  countParagraphs(text) {
    return text.trim().split(/\n\s*\n/).filter(para => para.trim().length > 0).length;
  }

  /**
   * Get parser statistics
   * @returns {object} - Statistics object
   */
  getStats() {
    return { ...this.stats };
  }

  /**
   * Reset parser statistics
   */
  reset() {
    this.stats = {
      totalDocuments: 0,
      successfulParsing: 0,
      failedParsing: 0,
      processingTime: 0
    };
  }
}