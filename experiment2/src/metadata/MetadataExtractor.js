import { franc } from 'franc';
import readingTime from 'reading-time';
import compromise from 'compromise';
import natural from 'natural';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';

/**
 * Metadata extractor for document-level and section-level metadata
 */
export class MetadataExtractor {
  constructor(options = {}) {
    this.options = {
      extractAuthors: true,
      detectLanguage: true,
      analyzeReadability: true,
      extractCategories: true,
      calculateQuality: true,
      detectPurpose: true,
      extractSources: true,
      ...options
    };

    this.stats = {
      documentsProcessed: 0,
      metadataFields: 0,
      processingTime: 0
    };
  }

  /**
   * Extract comprehensive metadata from document content
   * @param {object} documentContent - Parsed document content
   * @param {object} userMetadata - User-provided metadata overrides
   * @returns {Promise<object>} - Document metadata object
   */
  async extract(documentContent, userMetadata = {}) {
    const startTime = Date.now();
    this.stats.documentsProcessed++;

    try {
      const metadata = {
        // Basic required fields
        title: this.extractTitle(documentContent) || 'Untitled Document',
        created: new Date().toISOString(),
        modified: new Date().toISOString(),

        // Enhanced metadata
        ...await this.extractBasicMetadata(documentContent),
        ...await this.extractLinguisticMetadata(documentContent),
        ...await this.extractQualityMetadata(documentContent),
        ...await this.extractContentMetadata(documentContent),
        ...await this.extractProcessingMetadata(documentContent),

        // Embedding configuration
        embedding_model: this.options.embeddingModel || 'text-embedding-ada-002',
        embedding_dimension: this.options.embeddingDimension || 1536,

        // User overrides (highest priority)
        ...userMetadata
      };

      this.stats.metadataFields += Object.keys(metadata).length;
      this.stats.processingTime += Date.now() - startTime;

      return metadata;

    } catch (error) {
      throw new Error(`Metadata extraction failed: ${error.message}`);
    }
  }

  /**
   * Extract basic document metadata
   * @param {object} documentContent - Document content
   * @returns {Promise<object>} - Basic metadata
   */
  async extractBasicMetadata(documentContent) {
    const text = documentContent.rawText || '';
    
    return {
      description: this.generateDescription(text),
      summary: this.generateSummary(text),
      
      // Author detection
      authors: this.options.extractAuthors ? 
        await this.extractAuthors(documentContent) : [],

      // File information
      version: '1.0.0',
      status: 'draft',
      
      // Content classification
      tags: this.extractTags(text),
      keywords: this.extractKeywords(text),
      categories: this.options.extractCategories ? 
        this.extractCategories(text) : [],

      // Source information
      sources: this.options.extractSources ? 
        this.extractSources(text) : []
    };
  }

  /**
   * Extract linguistic metadata
   * @param {object} documentContent - Document content
   * @returns {Promise<object>} - Linguistic metadata
   */
  async extractLinguisticMetadata(documentContent) {
    const text = documentContent.rawText || '';
    
    const metadata = {};

    // Language detection
    if (this.options.detectLanguage) {
      const detectedLang = franc(text);
      metadata.language = this.mapLanguageCode(detectedLang);
      metadata.languages = [metadata.language]; // Could be enhanced for multilingual docs
    }

    // Readability analysis
    if (this.options.analyzeReadability) {
      metadata.readability = this.analyzeReadability(text);
    }

    // Audience analysis
    metadata.audience = this.analyzeAudience(text);

    return metadata;
  }

  /**
   * Extract quality metadata
   * @param {object} documentContent - Document content
   * @returns {Promise<object>} - Quality metadata
   */
  async extractQualityMetadata(documentContent) {
    if (!this.options.calculateQuality) return {};

    const text = documentContent.rawText || '';
    
    return {
      confidence: this.calculateConfidence(documentContent),
      quality_score: this.calculateQualityScore(documentContent),
      
      // Content completeness indicators
      completeness_indicators: {
        has_introduction: this.hasIntroduction(text),
        has_conclusion: this.hasConclusion(text),
        has_examples: this.hasExamples(text),
        has_references: this.hasCitations(text),
        balanced_structure: this.hasBalancedStructure(documentContent)
      }
    };
  }

  /**
   * Extract content metadata
   * @param {object} documentContent - Document content
   * @returns {Promise<object>} - Content metadata
   */
  async extractContentMetadata(documentContent) {
    const text = documentContent.rawText || '';
    
    return {
      // Purpose detection
      purpose: this.options.detectPurpose ? 
        this.detectDocumentPurpose(text) : 'documentation',

      // Domain detection
      domain: this.detectDomain(text),

      // Content statistics
      content_stats: {
        word_count: this.countWords(text),
        paragraph_count: this.countParagraphs(text),
        sentence_count: this.countSentences(text),
        character_count: text.length,
        has_images: (documentContent.images?.length || 0) > 0,
        has_tables: (documentContent.tables?.length || 0) > 0,
        image_count: documentContent.images?.length || 0,
        table_count: documentContent.tables?.length || 0
      }
    };
  }

  /**
   * Extract processing metadata
   * @param {object} documentContent - Document content
   * @returns {Promise<object>} - Processing metadata
   */
  async extractProcessingMetadata(documentContent) {
    return {
      processing: {
        extraction_method: 'automated',
        source_format: documentContent.type || 'unknown',
        preprocessed: true,
        validated: false,
        processing_timestamp: new Date().toISOString(),
        processing_version: '1.0.0'
      },

      // External IDs (could be enhanced with DOI detection, etc.)
      external_ids: this.extractExternalIds(documentContent)
    };
  }

  /**
   * Extract document title
   * @param {object} documentContent - Document content
   * @returns {string|null} - Extracted title
   */
  extractTitle(documentContent) {
    const text = documentContent.rawText || '';
    
    // Try to find title from first line or paragraph
    const lines = text.split('\n').map(line => line.trim()).filter(line => line);
    
    if (lines.length === 0) return null;

    const firstLine = lines[0];
    
    // Title heuristics
    if (firstLine.length < 200 && 
        firstLine.length > 5 && 
        !firstLine.endsWith('.') &&
        firstLine.match(/^[A-Z]/)) {
      return firstLine;
    }

    // Look for patterns like "Title: Something"
    const titleMatch = text.match(/(?:title|heading):\s*(.+)/i);
    if (titleMatch) {
      return titleMatch[1].trim();
    }

    // Use filename as fallback
    if (documentContent.sourceFile) {
      const basename = path.basename(documentContent.sourceFile, path.extname(documentContent.sourceFile));
      return basename.replace(/[_-]/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    }

    return null;
  }

  /**
   * Generate document description
   * @param {string} text - Document text
   * @returns {string} - Generated description
   */
  generateDescription(text) {
    if (!text) return '';

    // Take first few sentences as description
    const sentences = new natural.SentenceTokenizer().tokenize(text);
    const firstSentences = sentences.slice(0, 2).join(' ');
    
    return firstSentences.length > 300 ? 
      firstSentences.substring(0, 300) + '...' : 
      firstSentences;
  }

  /**
   * Generate document summary
   * @param {string} text - Document text
   * @returns {string} - Generated summary
   */
  generateSummary(text) {
    if (!text) return '';

    // Simple extractive summary - take key sentences
    const sentences = new natural.SentenceTokenizer().tokenize(text);
    
    // Score sentences by keyword frequency
    const keywords = this.extractKeywords(text);
    const scoredSentences = sentences.map(sentence => {
      const score = keywords.reduce((sum, keyword) => {
        return sum + (sentence.toLowerCase().includes(keyword.toLowerCase()) ? 1 : 0);
      }, 0);
      return { sentence, score };
    });

    // Take top scoring sentences
    const topSentences = scoredSentences
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map(item => item.sentence);

    return topSentences.join(' ');
  }

  /**
   * Extract authors from document
   * @param {object} documentContent - Document content
   * @returns {Promise<Array>} - Array of author objects
   */
  async extractAuthors(documentContent) {
    const text = documentContent.rawText || '';
    const authors = [];

    // Look for author patterns
    const authorPatterns = [
      /author[s]?:\s*(.+)/i,
      /by\s+([A-Z][a-z]+ [A-Z][a-z]+)/g,
      /written\s+by\s+([A-Z][a-z]+ [A-Z][a-z]+)/i
    ];

    for (const pattern of authorPatterns) {
      const matches = text.match(pattern);
      if (matches) {
        const authorText = matches[1] || matches[0];
        const names = this.parseAuthorNames(authorText);
        
        for (const name of names) {
          authors.push({
            name: name.trim(),
            role: 'primary'
          });
        }
        break;
      }
    }

    // If no explicit authors found, try NLP-based extraction
    if (authors.length === 0) {
      const doc = compromise(text);
      const people = doc.match('#Person').out('array');
      
      // Take first few people mentioned as potential authors
      for (const person of people.slice(0, 3)) {
        authors.push({
          name: person,
          role: 'contributor'
        });
      }
    }

    return authors;
  }

  /**
   * Parse author names from text
   * @param {string} text - Author text
   * @returns {Array} - Array of author names
   */
  parseAuthorNames(text) {
    // Split by common separators
    return text
      .split(/[,;&]|\sand\s/)
      .map(name => name.trim())
      .filter(name => name && name.match(/^[A-Z][a-z]+ [A-Z]/));
  }

  /**
   * Extract tags from text
   * @param {string} text - Document text
   * @returns {Array} - Array of tags
   */
  extractTags(text) {
    const doc = compromise(text);
    
    // Extract topics and important terms
    const topics = doc.match('#Topic').out('array');
    const organizations = doc.match('#Organization').out('array');
    const places = doc.match('#Place').out('array');

    const tags = [...topics, ...organizations, ...places]
      .map(tag => tag.toLowerCase())
      .filter(tag => tag.length > 2)
      .slice(0, 10);

    return [...new Set(tags)]; // Remove duplicates
  }

  /**
   * Extract keywords from text
   * @param {string} text - Document text
   * @returns {Array} - Array of keywords
   */
  extractKeywords(text) {
    const doc = compromise(text);
    
    // Extract nouns and important adjectives
    const nouns = doc.match('#Noun').out('array');
    const adjectives = doc.match('#Adjective').out('array');
    
    const keywords = [...nouns, ...adjectives]
      .map(word => word.toLowerCase())
      .filter(word => word.length > 3)
      .slice(0, 15);

    return [...new Set(keywords)]; // Remove duplicates
  }

  /**
   * Extract categories
   * @param {string} text - Document text
   * @returns {Array} - Array of category objects
   */
  extractCategories(text) {
    const categories = [];
    
    // Domain-based categorization
    const domains = {
      technology: ['software', 'computer', 'algorithm', 'data', 'system', 'programming'],
      science: ['research', 'study', 'experiment', 'analysis', 'hypothesis', 'theory'],
      business: ['company', 'market', 'customer', 'revenue', 'strategy', 'management'],
      education: ['learning', 'student', 'course', 'curriculum', 'teaching', 'academic'],
      healthcare: ['medical', 'patient', 'treatment', 'diagnosis', 'health', 'clinical']
    };

    const lowerText = text.toLowerCase();
    
    for (const [domain, keywords] of Object.entries(domains)) {
      const matches = keywords.filter(keyword => lowerText.includes(keyword));
      if (matches.length >= 2) {
        categories.push({
          scheme: 'domain',
          code: domain,
          label: domain.charAt(0).toUpperCase() + domain.slice(1)
        });
      }
    }

    return categories;
  }

  /**
   * Extract sources and citations
   * @param {string} text - Document text
   * @returns {Array} - Array of source objects
   */
  extractSources(text) {
    const sources = [];
    
    // Look for URL patterns
    const urlPattern = /https?:\/\/[^\s]+/g;
    const urls = text.match(urlPattern) || [];
    
    for (const url of urls) {
      sources.push({
        url: url,
        type: 'website'
      });
    }

    // Look for DOI patterns
    const doiPattern = /10\.\d{4,}\/[^\s]+/g;
    const dois = text.match(doiPattern) || [];
    
    for (const doi of dois) {
      sources.push({
        doi: doi,
        type: 'paper'
      });
    }

    return sources.slice(0, 10); // Limit sources
  }

  /**
   * Map language code from franc to standard codes
   * @param {string} langCode - Language code from franc
   * @returns {string} - Standard language code
   */
  mapLanguageCode(langCode) {
    const mapping = {
      'eng': 'en',
      'fra': 'fr',
      'deu': 'de',
      'spa': 'es',
      'ita': 'it',
      'por': 'pt',
      'rus': 'ru',
      'jpn': 'ja',
      'kor': 'ko',
      'zho': 'zh'
    };

    return mapping[langCode] || langCode || 'en';
  }

  /**
   * Analyze document readability
   * @param {string} text - Document text
   * @returns {object} - Readability metrics
   */
  analyzeReadability(text) {
    const stats = readingTime(text);
    const words = text.split(/\s+/).filter(word => word.length > 0);
    const sentences = new natural.SentenceTokenizer().tokenize(text);
    
    // Calculate average word length
    const avgWordLength = words.reduce((sum, word) => sum + word.length, 0) / words.length;
    
    // Calculate average sentence length
    const avgSentenceLength = words.length / sentences.length;
    
    // Simple Flesch Reading Ease approximation
    const avgSyllables = words.reduce((sum, word) => sum + this.countSyllables(word), 0) / words.length;
    const fleschScore = 206.835 - (1.015 * avgSentenceLength) - (84.6 * avgSyllables);
    
    // Flesch-Kincaid Grade Level
    const gradeLevel = (0.39 * avgSentenceLength) + (11.8 * avgSyllables) - 15.59;

    return {
      flesch_reading_ease: Math.max(0, Math.min(100, fleschScore)),
      flesch_kincaid: Math.max(0, gradeLevel),
      estimated_reading_time: stats.minutes,
      word_count: stats.words,
      avg_word_length: avgWordLength,
      avg_sentence_length: avgSentenceLength
    };
  }

  /**
   * Count syllables in a word (simple heuristic)
   * @param {string} word - Word to analyze
   * @returns {number} - Syllable count
   */
  countSyllables(word) {
    const vowels = word.match(/[aeiouy]/gi);
    let count = vowels ? vowels.length : 0;
    
    // Adjust for silent e
    if (word.endsWith('e')) count--;
    
    return Math.max(1, count);
  }

  /**
   * Analyze document audience
   * @param {string} text - Document text
   * @returns {object} - Audience analysis
   */
  analyzeAudience(text) {
    const readability = this.analyzeReadability(text);
    
    let primary = 'general';
    let expertise = 'intermediate';

    // Determine audience based on readability
    if (readability.flesch_kincaid > 16) {
      primary = 'academic';
      expertise = 'expert';
    } else if (readability.flesch_kincaid > 12) {
      primary = 'professional';
      expertise = 'advanced';
    } else if (readability.flesch_kincaid < 8) {
      primary = 'general';
      expertise = 'beginner';
    }

    // Check for technical language
    const technicalTerms = this.countTechnicalTerms(text);
    if (technicalTerms > 20) {
      primary = 'technical';
      expertise = 'advanced';
    }

    return {
      primary,
      expertise_level: expertise
    };
  }

  /**
   * Count technical terms in text
   * @param {string} text - Document text
   * @returns {number} - Count of technical terms
   */
  countTechnicalTerms(text) {
    const technicalPatterns = [
      /\b\w+tion\b/g,  // Words ending in -tion
      /\b\w+ment\b/g,  // Words ending in -ment
      /\b\w+ology\b/g, // Words ending in -ology
      /\b\w{8,}\b/g,   // Long words (8+ characters)
    ];

    let count = 0;
    for (const pattern of technicalPatterns) {
      const matches = text.match(pattern) || [];
      count += matches.length;
    }

    return count;
  }

  /**
   * Calculate confidence score
   * @param {object} documentContent - Document content
   * @returns {number} - Confidence score (0-1)
   */
  calculateConfidence(documentContent) {
    let score = 0.5; // Base score
    
    const text = documentContent.rawText || '';
    
    // Boost confidence for longer documents
    const wordCount = this.countWords(text);
    if (wordCount > 1000) score += 0.2;
    else if (wordCount > 500) score += 0.1;
    
    // Boost for structured content
    if (documentContent.images && documentContent.images.length > 0) score += 0.1;
    if (documentContent.tables && documentContent.tables.length > 0) score += 0.1;
    
    // Reduce for parsing warnings
    if (documentContent.warnings && documentContent.warnings.length > 0) {
      score -= documentContent.warnings.length * 0.05;
    }

    return Math.max(0, Math.min(1, score));
  }

  /**
   * Calculate quality score
   * @param {object} documentContent - Document content
   * @returns {number} - Quality score (0-1)
   */
  calculateQualityScore(documentContent) {
    let score = 0.5; // Base score
    
    const text = documentContent.rawText || '';
    
    // Structure indicators
    if (this.hasIntroduction(text)) score += 0.1;
    if (this.hasConclusion(text)) score += 0.1;
    if (this.hasExamples(text)) score += 0.1;
    if (this.hasCitations(text)) score += 0.1;
    
    // Content richness
    if (documentContent.images && documentContent.images.length > 0) score += 0.05;
    if (documentContent.tables && documentContent.tables.length > 0) score += 0.05;
    
    // Readability (penalty for very difficult text)
    const readability = this.analyzeReadability(text);
    if (readability.flesch_reading_ease < 30) score -= 0.1;
    
    return Math.max(0, Math.min(1, score));
  }

  /**
   * Detect document purpose
   * @param {string} text - Document text
   * @returns {string} - Document purpose
   */
  detectDocumentPurpose(text) {
    const lowerText = text.toLowerCase();
    
    // Purpose indicators
    const purposes = {
      instruction: ['how to', 'step', 'guide', 'tutorial', 'instructions'],
      reference: ['reference', 'manual', 'documentation', 'api', 'specification'],
      analysis: ['analysis', 'study', 'research', 'findings', 'results'],
      report: ['report', 'summary', 'overview', 'status', 'update'],
      proposal: ['proposal', 'recommend', 'suggest', 'plan', 'strategy']
    };

    let maxScore = 0;
    let detectedPurpose = 'documentation';

    for (const [purpose, keywords] of Object.entries(purposes)) {
      const score = keywords.reduce((sum, keyword) => {
        return sum + (lowerText.includes(keyword) ? 1 : 0);
      }, 0);
      
      if (score > maxScore) {
        maxScore = score;
        detectedPurpose = purpose;
      }
    }

    return detectedPurpose;
  }

  /**
   * Detect document domain
   * @param {string} text - Document text
   * @returns {string} - Document domain
   */
  detectDomain(text) {
    const lowerText = text.toLowerCase();
    
    const domains = {
      'computer science': ['algorithm', 'programming', 'software', 'computer', 'data'],
      'medicine': ['medical', 'patient', 'treatment', 'clinical', 'health'],
      'business': ['business', 'market', 'customer', 'revenue', 'company'],
      'education': ['education', 'learning', 'student', 'teaching', 'course'],
      'science': ['research', 'experiment', 'hypothesis', 'theory', 'study']
    };

    let maxScore = 0;
    let detectedDomain = 'general';

    for (const [domain, keywords] of Object.entries(domains)) {
      const score = keywords.reduce((sum, keyword) => {
        return sum + (lowerText.includes(keyword) ? 1 : 0);
      }, 0);
      
      if (score > maxScore) {
        maxScore = score;
        detectedDomain = domain;
      }
    }

    return detectedDomain;
  }

  /**
   * Extract external IDs
   * @param {object} documentContent - Document content
   * @returns {object} - External IDs
   */
  extractExternalIds(documentContent) {
    const text = documentContent.rawText || '';
    const ids = {};

    // DOI extraction
    const doiMatch = text.match(/10\.\d{4,}\/[^\s]+/);
    if (doiMatch) {
      ids.doi = doiMatch[0];
    }

    // ISBN extraction
    const isbnMatch = text.match(/ISBN[:\s]*(\d{3}-?\d{1,5}-?\d{1,7}-?\d{1,7}-?\d{1})/i);
    if (isbnMatch) {
      ids.isbn = isbnMatch[1];
    }

    return ids;
  }

  // Content analysis helper methods

  hasIntroduction(text) {
    return /\b(introduction|overview|background)\b/i.test(text);
  }

  hasConclusion(text) {
    return /\b(conclusion|summary|final)\b/i.test(text);
  }

  hasExamples(text) {
    return /\b(example|instance|case|illustration)\b/i.test(text);
  }

  hasCitations(text) {
    return /\b(reference|cite|source|bibliography)\b/i.test(text) || 
           text.includes('http') || text.includes('doi');
  }

  hasBalancedStructure(documentContent) {
    const text = documentContent.rawText || '';
    const paragraphs = this.countParagraphs(text);
    return paragraphs >= 3; // Very simple heuristic
  }

  countWords(text) {
    return text.trim().split(/\s+/).filter(word => word.length > 0).length;
  }

  countParagraphs(text) {
    return text.trim().split(/\n\s*\n/).filter(para => para.trim().length > 0).length;
  }

  countSentences(text) {
    return new natural.SentenceTokenizer().tokenize(text).length;
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
      metadataFields: 0,
      processingTime: 0
    };
  }
}