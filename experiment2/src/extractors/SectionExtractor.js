import natural from 'natural';
import compromise from 'compromise';
import { v4 as uuidv4 } from 'uuid';
import { createHash } from 'crypto';

/**
 * Section extractor that breaks document content into semantic sections
 */
export class SectionExtractor {
  constructor(options = {}) {
    this.options = {
      chunkSize: 500,
      chunkOverlap: 50,
      minSectionLength: 50,
      maxSectionLength: 2000,
      sentenceTokenizer: new natural.SentenceTokenizer(),
      ...options
    };

    this.stats = {
      documentsProcessed: 0,
      sectionsCreated: 0,
      processingTime: 0
    };
  }

  /**
   * Extract sections from parsed document content
   * @param {object} documentContent - Parsed document content
   * @returns {Promise<Array>} - Array of section objects
   */
  async extract(documentContent) {
    const startTime = Date.now();
    this.stats.documentsProcessed++;

    try {
      const sections = [];

      // Extract text sections
      const textSections = await this.extractTextSections(documentContent);
      sections.push(...textSections);

      // Extract image sections
      if (documentContent.images && documentContent.images.length > 0) {
        const imageSections = await this.extractImageSections(documentContent.images);
        sections.push(...imageSections);
      }

      // Extract table sections
      if (documentContent.tables && documentContent.tables.length > 0) {
        const tableSections = await this.extractTableSections(documentContent.tables);
        sections.push(...tableSections);
      }

      // Add section metadata
      await this.enrichSections(sections, documentContent);

      this.stats.sectionsCreated += sections.length;
      this.stats.processingTime += Date.now() - startTime;

      return sections;

    } catch (error) {
      throw new Error(`Section extraction failed: ${error.message}`);
    }
  }

  /**
   * Extract text-based sections from document
   * @param {object} documentContent - Document content
   * @returns {Promise<Array>} - Array of text sections
   */
  async extractTextSections(documentContent) {
    const sections = [];
    const text = documentContent.rawText || '';

    if (!text.trim()) return sections;

    // Split into paragraphs first
    const paragraphs = this.splitIntoParagraphs(text);
    
    // Detect headings and structure
    const structuredParagraphs = this.detectStructure(paragraphs);

    // Create sections from structured content
    for (const paragraph of structuredParagraphs) {
      if (paragraph.text.length < this.options.minSectionLength) {
        continue;
      }

      // Handle long paragraphs by chunking
      if (paragraph.text.length > this.options.maxSectionLength) {
        const chunks = this.chunkText(paragraph.text);
        for (let i = 0; i < chunks.length; i++) {
          sections.push(this.createTextSection(chunks[i], {
            ...paragraph,
            isChunk: true,
            chunkIndex: i,
            totalChunks: chunks.length
          }));
        }
      } else {
        sections.push(this.createTextSection(paragraph.text, paragraph));
      }
    }

    return sections;
  }

  /**
   * Extract image sections
   * @param {Array} images - Array of image objects
   * @returns {Promise<Array>} - Array of image sections
   */
  async extractImageSections(images) {
    const sections = [];

    for (const image of images) {
      sections.push({
        id: uuidv4(),
        type: 'image',
        content: {
          type: 'image',
          data: image.description || 'Image content'
        },
        image: {
          src: image.src || image.path,
          format: image.format,
          dimensions: image.dimensions,
          alt_text: image.altText || '',
          description: image.description || '',
          file_size: image.fileSize
        },
        metadata: {
          importance: 'medium',
          keywords: this.extractImageKeywords(image),
          purpose: 'illustration'
        }
      });
    }

    return sections;
  }

  /**
   * Extract table sections
   * @param {Array} tables - Array of table objects
   * @returns {Promise<Array>} - Array of table sections
   */
  async extractTableSections(tables) {
    const sections = [];

    for (let i = 0; i < tables.length; i++) {
      const table = tables[i];
      
      sections.push({
        id: uuidv4(),
        type: 'table',
        title: `Table ${i + 1}`,
        content: {
          type: 'table',
          data: `Table with ${table.rowCount} rows and ${table.columnCount} columns`
        },
        table: {
          structure: {
            rows: table.rowCount,
            columns: table.columnCount,
            has_header: this.detectTableHeader(table)
          },
          headers: this.extractTableHeaders(table),
          data: this.formatTableData(table),
          caption: `Table ${i + 1}`,
          statistics: this.calculateTableStats(table)
        },
        metadata: {
          importance: 'high',
          keywords: this.extractTableKeywords(table),
          purpose: 'data'
        }
      });
    }

    return sections;
  }

  /**
   * Split text into paragraphs
   * @param {string} text - Input text
   * @returns {Array} - Array of paragraph strings
   */
  splitIntoParagraphs(text) {
    return text
      .split(/\n\s*\n/)
      .map(para => para.trim())
      .filter(para => para.length > 0);
  }

  /**
   * Detect document structure (headings, lists, etc.)
   * @param {Array} paragraphs - Array of paragraph strings
   * @returns {Array} - Array of structured paragraph objects
   */
  detectStructure(paragraphs) {
    const structured = [];

    for (const paragraph of paragraphs) {
      const type = this.detectParagraphType(paragraph);
      const level = this.detectHeadingLevel(paragraph);

      structured.push({
        text: paragraph,
        type,
        level,
        sentences: this.options.sentenceTokenizer.tokenize(paragraph),
        wordCount: this.countWords(paragraph)
      });
    }

    return structured;
  }

  /**
   * Detect paragraph type
   * @param {string} text - Paragraph text
   * @returns {string} - Paragraph type
   */
  detectParagraphType(text) {
    const trimmed = text.trim();

    // Check for headings (simple heuristics)
    if (trimmed.length < 100 && 
        (trimmed.endsWith(':') || 
         trimmed.match(/^[A-Z][A-Za-z\s]{5,50}$/) ||
         trimmed.match(/^\d+\.\s/) ||
         trimmed.match(/^[IVX]+\.\s/))) {
      return 'heading';
    }

    // Check for lists
    if (trimmed.match(/^[\-\*\•]\s/) || trimmed.match(/^\d+\.\s/)) {
      return 'list';
    }

    // Check for quotes
    if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
      return 'quote';
    }

    // Check for code (simple heuristics)
    if (trimmed.match(/^\s*[{}\[\]();,]/) || 
        trimmed.includes('function') || 
        trimmed.includes('class ') ||
        trimmed.includes('import ')) {
      return 'code';
    }

    return 'paragraph';
  }

  /**
   * Detect heading level
   * @param {string} text - Text to analyze
   * @returns {number|null} - Heading level or null
   */
  detectHeadingLevel(text) {
    const trimmed = text.trim();

    // Roman numerals (level 1)
    if (trimmed.match(/^[IVX]+\.\s/)) return 1;

    // Numbers with periods (level 2)
    if (trimmed.match(/^\d+\.\s/)) return 2;

    // Short sentences ending with colon (level 3)
    if (trimmed.length < 80 && trimmed.endsWith(':')) return 3;

    // All caps short text (level 2)
    if (trimmed.length < 50 && trimmed === trimmed.toUpperCase()) return 2;

    return null;
  }

  /**
   * Chunk text into smaller pieces
   * @param {string} text - Text to chunk
   * @returns {Array} - Array of text chunks
   */
  chunkText(text) {
    const sentences = this.options.sentenceTokenizer.tokenize(text);
    const chunks = [];
    let currentChunk = '';

    for (const sentence of sentences) {
      if ((currentChunk + sentence).length > this.options.chunkSize && currentChunk) {
        chunks.push(currentChunk.trim());
        currentChunk = sentence;
      } else {
        currentChunk += (currentChunk ? ' ' : '') + sentence;
      }
    }

    if (currentChunk.trim()) {
      chunks.push(currentChunk.trim());
    }

    return chunks;
  }

  /**
   * Create a text section object
   * @param {string} text - Section text
   * @param {object} metadata - Section metadata
   * @returns {object} - Section object
   */
  createTextSection(text, metadata = {}) {
    return {
      id: uuidv4(),
      type: metadata.type || 'paragraph',
      level: metadata.level,
      content: text,
      metadata: {
        importance: this.assessImportance(text),
        keywords: this.extractKeywords(text),
        complexity: this.assessComplexity(text),
        concepts: this.extractConcepts(text),
        entities: this.extractEntities(text),
        purpose: this.detectPurpose(text),
        readability: this.analyzeReadability(text),
        embedding_hash: this.generateContentHash(text),
        ...(metadata.isChunk && {
          chunk_info: {
            index: metadata.chunkIndex,
            total: metadata.totalChunks
          }
        })
      }
    };
  }

  /**
   * Assess text importance
   * @param {string} text - Text to analyze
   * @returns {string} - Importance level
   */
  assessImportance(text) {
    const wordCount = this.countWords(text);
    const hasKeyTerms = text.match(/\b(important|critical|key|main|primary|essential)\b/i);
    const isShort = wordCount < 50;
    const isLong = wordCount > 300;

    if (hasKeyTerms || isShort) return 'high';
    if (isLong) return 'medium';
    return 'low';
  }

  /**
   * Extract keywords from text
   * @param {string} text - Text to analyze
   * @returns {Array} - Array of keywords
   */
  extractKeywords(text) {
    // Use compromise for basic NLP
    const doc = compromise(text);
    const nouns = doc.match('#Noun').out('array');
    const adjectives = doc.match('#Adjective').out('array');
    
    // Combine and filter
    const keywords = [...nouns, ...adjectives]
      .filter(word => word.length > 3)
      .slice(0, 10); // Limit to top 10

    return [...new Set(keywords)]; // Remove duplicates
  }

  /**
   * Assess text complexity
   * @param {string} text - Text to analyze
   * @returns {string} - Complexity level
   */
  assessComplexity(text) {
    const words = text.split(/\s+/);
    const avgWordLength = words.reduce((sum, word) => sum + word.length, 0) / words.length;
    const sentences = this.options.sentenceTokenizer.tokenize(text);
    const avgSentenceLength = words.length / sentences.length;

    if (avgWordLength > 7 || avgSentenceLength > 25) return 'expert';
    if (avgWordLength > 5 || avgSentenceLength > 20) return 'complex';
    if (avgWordLength > 4 || avgSentenceLength > 15) return 'moderate';
    return 'simple';
  }

  /**
   * Extract concepts from text
   * @param {string} text - Text to analyze
   * @returns {Array} - Array of concept objects
   */
  extractConcepts(text) {
    const doc = compromise(text);
    const topics = doc.match('#Place|#Person|#Organization|#Topic').out('array');
    
    return topics.slice(0, 5).map(topic => ({
      name: topic,
      weight: 1.0 // Simple weight, could be improved with TF-IDF
    }));
  }

  /**
   * Extract named entities
   * @param {string} text - Text to analyze
   * @returns {Array} - Array of entity objects
   */
  extractEntities(text) {
    const doc = compromise(text);
    const entities = [];

    // Extract different entity types
    const people = doc.match('#Person').out('array');
    const places = doc.match('#Place').out('array');
    const organizations = doc.match('#Organization').out('array');

    people.forEach(person => {
      entities.push({
        text: person,
        type: 'PERSON',
        confidence: 0.8
      });
    });

    places.forEach(place => {
      entities.push({
        text: place,
        type: 'GPE',
        confidence: 0.7
      });
    });

    organizations.forEach(org => {
      entities.push({
        text: org,
        type: 'ORG',
        confidence: 0.7
      });
    });

    return entities;
  }

  /**
   * Detect text purpose
   * @param {string} text - Text to analyze
   * @returns {string} - Purpose type
   */
  detectPurpose(text) {
    const lower = text.toLowerCase();

    if (lower.includes('introduction') || lower.includes('overview')) return 'introduction';
    if (lower.includes('conclusion') || lower.includes('summary')) return 'conclusion';
    if (lower.includes('for example') || lower.includes('such as')) return 'example';
    if (lower.includes('definition') || lower.includes('is defined as')) return 'definition';
    if (lower.includes('step') || lower.includes('process')) return 'procedure';
    if (lower.includes('analysis') || lower.includes('results')) return 'analysis';
    if (lower.includes('however') || lower.includes('therefore')) return 'transition';

    return 'explanation';
  }

  /**
   * Analyze text readability
   * @param {string} text - Text to analyze
   * @returns {object} - Readability metrics
   */
  analyzeReadability(text) {
    const words = text.split(/\s+/).filter(word => word.length > 0);
    const sentences = this.options.sentenceTokenizer.tokenize(text);
    
    return {
      word_count: words.length,
      sentence_count: sentences.length,
      avg_sentence_length: words.length / sentences.length,
      grade_level: this.calculateGradeLevel(words, sentences)
    };
  }

  /**
   * Calculate grade level (simplified Flesch-Kincaid)
   * @param {Array} words - Array of words
   * @param {Array} sentences - Array of sentences
   * @returns {number} - Grade level
   */
  calculateGradeLevel(words, sentences) {
    const avgSentenceLength = words.length / sentences.length;
    const avgSyllables = words.reduce((sum, word) => sum + this.countSyllables(word), 0) / words.length;
    
    // Simplified Flesch-Kincaid Grade Level
    return Math.round(0.39 * avgSentenceLength + 11.8 * avgSyllables - 15.59);
  }

  /**
   * Count syllables in a word (simple heuristic)
   * @param {string} word - Word to analyze
   * @returns {number} - Syllable count
   */
  countSyllables(word) {
    const vowels = word.match(/[aeiouy]/gi);
    return Math.max(1, vowels ? vowels.length : 1);
  }

  /**
   * Generate content hash for caching
   * @param {string} content - Content to hash
   * @returns {string} - Hash string
   */
  generateContentHash(content) {
    return createHash('md5').update(content).digest('hex');
  }

  /**
   * Extract keywords from image metadata
   * @param {object} image - Image object
   * @returns {Array} - Array of keywords
   */
  extractImageKeywords(image) {
    const keywords = [];
    
    if (image.description) {
      keywords.push(...this.extractKeywords(image.description));
    }
    
    if (image.altText) {
      keywords.push(...this.extractKeywords(image.altText));
    }

    return [...new Set(keywords)];
  }

  /**
   * Detect if table has header row
   * @param {object} table - Table object
   * @returns {boolean} - True if table has header
   */
  detectTableHeader(table) {
    if (!table.rows || table.rows.length === 0) return false;
    
    const firstRow = table.rows[0];
    const hasUniqueValues = new Set(firstRow).size === firstRow.length;
    const hasNoNumbers = !firstRow.some(cell => /^\d+(\.\d+)?$/.test(cell.toString()));
    
    return hasUniqueValues && hasNoNumbers;
  }

  /**
   * Extract table headers
   * @param {object} table - Table object
   * @returns {Array} - Array of header objects
   */
  extractTableHeaders(table) {
    if (!this.detectTableHeader(table)) return [];
    
    const firstRow = table.rows[0];
    return firstRow.map(cell => ({
      text: cell.toString(),
      data_type: this.detectColumnDataType(table, firstRow.indexOf(cell))
    }));
  }

  /**
   * Detect column data type
   * @param {object} table - Table object
   * @param {number} columnIndex - Column index
   * @returns {string} - Data type
   */
  detectColumnDataType(table, columnIndex) {
    const column = table.rows.slice(1).map(row => row[columnIndex]);
    
    if (column.every(cell => /^\d+$/.test(cell))) return 'number';
    if (column.every(cell => /^\d+\.\d+$/.test(cell))) return 'number';
    if (column.every(cell => /\d+%/.test(cell))) return 'percentage';
    if (column.every(cell => /^\$\d+/.test(cell))) return 'currency';
    if (column.some(cell => /\d{4}-\d{2}-\d{2}/.test(cell))) return 'date';
    
    return 'text';
  }

  /**
   * Format table data for ADF
   * @param {object} table - Table object
   * @returns {Array} - Formatted table data
   */
  formatTableData(table) {
    const hasHeader = this.detectTableHeader(table);
    const dataRows = hasHeader ? table.rows.slice(1) : table.rows;
    
    return dataRows.map(row => 
      row.map(cell => ({
        value: this.parseTableCellValue(cell),
        formatted_value: cell.toString(),
        data_type: this.detectCellDataType(cell)
      }))
    );
  }

  /**
   * Parse table cell value
   * @param {string} cell - Cell content
   * @returns {any} - Parsed value
   */
  parseTableCellValue(cell) {
    const str = cell.toString().trim();
    
    // Try to parse as number
    if (/^\d+$/.test(str)) return parseInt(str);
    if (/^\d+\.\d+$/.test(str)) return parseFloat(str);
    
    // Try to parse percentage
    if (/^\d+%$/.test(str)) return parseFloat(str.replace('%', '')) / 100;
    
    // Try to parse currency
    if (/^\$\d+/.test(str)) return parseFloat(str.replace(/[$,]/g, ''));
    
    return str;
  }

  /**
   * Detect cell data type
   * @param {string} cell - Cell content
   * @returns {string} - Data type
   */
  detectCellDataType(cell) {
    const str = cell.toString().trim();
    
    if (!str) return 'null';
    if (/^\d+$/.test(str) || /^\d+\.\d+$/.test(str)) return 'number';
    if (/^\d+%$/.test(str)) return 'percentage';
    if (/^\$\d+/.test(str)) return 'currency';
    if (/\d{4}-\d{2}-\d{2}/.test(str)) return 'date';
    if (/^(true|false)$/i.test(str)) return 'boolean';
    
    return 'text';
  }

  /**
   * Calculate table statistics
   * @param {object} table - Table object
   * @returns {object} - Table statistics
   */
  calculateTableStats(table) {
    const totalCells = table.rowCount * table.columnCount;
    const emptyCells = table.rows.flat().filter(cell => !cell || cell.toString().trim() === '').length;
    
    return {
      total_cells: totalCells,
      empty_cells: emptyCells,
      numeric_columns: this.findNumericColumns(table)
    };
  }

  /**
   * Find numeric columns in table
   * @param {object} table - Table object
   * @returns {Array} - Array of numeric column indices
   */
  findNumericColumns(table) {
    const numericColumns = [];
    
    for (let col = 0; col < table.columnCount; col++) {
      const columnData = table.rows.map(row => row[col]);
      const numericCount = columnData.filter(cell => 
        /^\d+(\.\d+)?$/.test(cell.toString())
      ).length;
      
      if (numericCount > columnData.length * 0.7) {
        numericColumns.push(col);
      }
    }
    
    return numericColumns;
  }

  /**
   * Extract keywords from table
   * @param {object} table - Table object
   * @returns {Array} - Array of keywords
   */
  extractTableKeywords(table) {
    const allText = table.rows.flat().join(' ');
    return this.extractKeywords(allText);
  }

  /**
   * Enrich sections with additional metadata
   * @param {Array} sections - Array of sections
   * @param {object} documentContent - Original document content
   */
  async enrichSections(sections, documentContent) {
    // Add sequential IDs and positions
    sections.forEach((section, index) => {
      section.metadata.sequence_number = index;
      section.metadata.position = index / sections.length;
    });

    // Detect temporal information
    sections.forEach(section => {
      section.metadata.temporal = {
        created: new Date().toISOString(),
        modified: new Date().toISOString()
      };
    });
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
   * Get extractor statistics
   * @returns {object} - Statistics object
   */
  getStats() {
    return { ...this.stats };
  }

  /**
   * Reset extractor statistics
   */
  reset() {
    this.stats = {
      documentsProcessed: 0,
      sectionsCreated: 0,
      processingTime: 0
    };
  }
}