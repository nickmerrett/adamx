/**
 * Output formatter for converting processed content to ADAM format
 */
export class OutputFormatter {
  constructor(options = {}) {
    this.options = {
      includeStats: false,
      compactOutput: false,
      validateSchema: true,
      ...options
    };

    this.stats = {
      documentsFormatted: 0,
      sectionsFormatted: 0,
      processingTime: 0
    };
  }

  /**
   * Format processed content into ADAM document
   * @param {object} data - Processed document data
   * @returns {Promise<object>} - ADAM document object
   */
  async format(data) {
    const startTime = Date.now();
    this.stats.documentsFormatted++;

    try {
      const { metadata, sections, options } = data;

      // Build ADAM document structure
      const adamDocument = {
        format: 'adam-document',
        version: '1.0.0',
        metadata: this.formatMetadata(metadata),
        sections: this.formatSections(sections),
        ...(this.shouldIncludeIndex(sections) && {
          index: this.buildIndex(sections)
        })
      };

      // Add processing statistics if requested
      if (this.options.includeStats && options) {
        adamDocument.processing_stats = this.buildProcessingStats(options);
      }

      this.stats.sectionsFormatted += sections.length;
      this.stats.processingTime += Date.now() - startTime;

      return adamDocument;

    } catch (error) {
      throw new Error(`Output formatting failed: ${error.message}`);
    }
  }

  /**
   * Format document metadata
   * @param {object} metadata - Raw metadata
   * @returns {object} - Formatted metadata
   */
  formatMetadata(metadata) {
    const formatted = {
      // Required fields
      title: metadata.title,
      created: metadata.created,
      modified: metadata.modified,

      // Basic information
      ...(metadata.subtitle && { subtitle: metadata.subtitle }),
      ...(metadata.description && { description: metadata.description }),
      ...(metadata.summary && { summary: metadata.summary }),
      ...(metadata.abstract && { abstract: metadata.abstract }),

      // Authors
      ...(metadata.authors && metadata.authors.length > 0 && {
        authors: this.formatAuthors(metadata.authors)
      }),

      // Publishing information
      ...(metadata.published && { published: metadata.published }),
      ...(metadata.version && { version: metadata.version }),
      ...(metadata.revision && { revision: metadata.revision }),
      ...(metadata.status && { status: metadata.status }),

      // License and copyright
      ...(metadata.license && { license: this.formatLicense(metadata.license) }),
      ...(metadata.copyright && { copyright: this.formatCopyright(metadata.copyright) }),

      // Classification
      ...(metadata.categories && metadata.categories.length > 0 && {
        categories: metadata.categories
      }),
      ...(metadata.tags && metadata.tags.length > 0 && { tags: metadata.tags }),
      ...(metadata.keywords && metadata.keywords.length > 0 && { keywords: metadata.keywords }),

      // Language
      language: metadata.language || 'en',
      ...(metadata.languages && metadata.languages.length > 1 && {
        languages: metadata.languages
      }),

      // Audience
      ...(metadata.audience && { audience: metadata.audience }),

      // Content information
      ...(metadata.purpose && { purpose: metadata.purpose }),
      ...(metadata.domain && { domain: metadata.domain }),
      ...(metadata.confidence !== undefined && { confidence: metadata.confidence }),
      ...(metadata.quality_score !== undefined && { quality_score: metadata.quality_score }),

      // Readability
      ...(metadata.readability && { readability: metadata.readability }),

      // Sources
      ...(metadata.sources && metadata.sources.length > 0 && {
        sources: this.formatSources(metadata.sources)
      }),

      // Embeddings
      ...(metadata.embedding_model && { embedding_model: metadata.embedding_model }),
      ...(metadata.embedding_dimension && { embedding_dimension: metadata.embedding_dimension }),

      // Processing
      ...(metadata.processing && { processing: metadata.processing }),

      // External IDs
      ...(metadata.external_ids && Object.keys(metadata.external_ids).length > 0 && {
        external_ids: metadata.external_ids
      }),

      // Custom fields
      ...(metadata.custom && { custom: metadata.custom })
    };

    // Remove undefined values if compacting
    return this.options.compactOutput ? this.removeUndefined(formatted) : formatted;
  }

  /**
   * Format authors array
   * @param {Array} authors - Authors array
   * @returns {Array} - Formatted authors
   */
  formatAuthors(authors) {
    return authors.map(author => {
      if (typeof author === 'string') {
        return { name: author, role: 'primary' };
      }
      
      return {
        name: author.name,
        ...(author.email && { email: author.email }),
        ...(author.affiliation && { affiliation: author.affiliation }),
        role: author.role || 'contributor',
        ...(author.orcid && { orcid: author.orcid })
      };
    });
  }

  /**
   * Format license information
   * @param {object|string} license - License information
   * @returns {object} - Formatted license
   */
  formatLicense(license) {
    if (typeof license === 'string') {
      return { name: license };
    }
    
    return {
      ...(license.name && { name: license.name }),
      ...(license.url && { url: license.url }),
      ...(license.text && { text: license.text })
    };
  }

  /**
   * Format copyright information
   * @param {object} copyright - Copyright information
   * @returns {object} - Formatted copyright
   */
  formatCopyright(copyright) {
    return {
      ...(copyright.year && { year: copyright.year }),
      ...(copyright.holder && { holder: copyright.holder }),
      ...(copyright.notice && { notice: copyright.notice })
    };
  }

  /**
   * Format sources array
   * @param {Array} sources - Sources array
   * @returns {Array} - Formatted sources
   */
  formatSources(sources) {
    return sources.map(source => ({
      ...(source.title && { title: source.title }),
      ...(source.url && { url: source.url }),
      ...(source.doi && { doi: source.doi }),
      ...(source.citation && { citation: source.citation }),
      type: source.type || 'website'
    }));
  }

  /**
   * Format sections array
   * @param {Array} sections - Sections array
   * @returns {Array} - Formatted sections
   */
  formatSections(sections) {
    return sections.map(section => this.formatSection(section));
  }

  /**
   * Format individual section
   * @param {object} section - Section object
   * @returns {object} - Formatted section
   */
  formatSection(section) {
    const formatted = {
      // Required fields
      id: section.id,
      type: section.type,
      content: section.content,

      // Optional basic fields
      ...(section.level && { level: section.level }),
      ...(section.title && { title: section.title }),

      // Image data
      ...(section.image && { image: this.formatImageData(section.image) }),

      // Table data
      ...(section.table && { table: this.formatTableData(section.table) }),

      // Metadata
      metadata: this.formatSectionMetadata(section.metadata || {}),

      // Relationships
      ...(section.relationships && Object.keys(section.relationships).length > 0 && {
        relationships: this.formatRelationships(section.relationships)
      })
    };

    return this.options.compactOutput ? this.removeUndefined(formatted) : formatted;
  }

  /**
   * Format image data
   * @param {object} imageData - Image data
   * @returns {object} - Formatted image data
   */
  formatImageData(imageData) {
    return {
      src: imageData.src,
      ...(imageData.format && { format: imageData.format }),
      ...(imageData.dimensions && { dimensions: imageData.dimensions }),
      ...(imageData.file_size && { file_size: imageData.file_size }),
      ...(imageData.alt_text && { alt_text: imageData.alt_text }),
      ...(imageData.caption && { caption: imageData.caption }),
      ...(imageData.title && { title: imageData.title }),
      ...(imageData.description && { description: imageData.description }),
      ...(imageData.generated_description && { generated_description: imageData.generated_description }),
      ...(imageData.ocr_text && { ocr_text: imageData.ocr_text }),
      ...(imageData.visual_elements && imageData.visual_elements.length > 0 && {
        visual_elements: imageData.visual_elements
      }),
      ...(imageData.colors && { colors: imageData.colors }),
      ...(imageData.visual_embedding && { visual_embedding: imageData.visual_embedding }),
      ...(imageData.visual_embedding_model && { visual_embedding_model: imageData.visual_embedding_model }),
      ...(imageData.exif && Object.keys(imageData.exif).length > 0 && {
        exif: imageData.exif
      }),
      ...(imageData.processing && { processing: imageData.processing })
    };
  }

  /**
   * Format table data
   * @param {object} tableData - Table data
   * @returns {object} - Formatted table data
   */
  formatTableData(tableData) {
    return {
      ...(tableData.structure && { structure: tableData.structure }),
      ...(tableData.headers && tableData.headers.length > 0 && {
        headers: tableData.headers
      }),
      ...(tableData.data && tableData.data.length > 0 && {
        data: tableData.data
      }),
      ...(tableData.caption && { caption: tableData.caption }),
      ...(tableData.summary && { summary: tableData.summary }),
      ...(tableData.statistics && { statistics: tableData.statistics }),
      ...(tableData.relationships && { relationships: tableData.relationships }),
      ...(tableData.extraction && { extraction: tableData.extraction }),
      ...(tableData.semantic && { semantic: tableData.semantic }),
      ...(tableData.accessibility && { accessibility: tableData.accessibility })
    };
  }

  /**
   * Format section metadata
   * @param {object} metadata - Section metadata
   * @returns {object} - Formatted metadata
   */
  formatSectionMetadata(metadata) {
    return {
      ...(metadata.importance && { importance: metadata.importance }),
      ...(metadata.priority && { priority: metadata.priority }),
      ...(metadata.complexity && { complexity: metadata.complexity }),
      ...(metadata.keywords && metadata.keywords.length > 0 && {
        keywords: metadata.keywords
      }),
      ...(metadata.concepts && metadata.concepts.length > 0 && {
        concepts: metadata.concepts
      }),
      ...(metadata.entities && metadata.entities.length > 0 && {
        entities: metadata.entities
      }),
      ...(metadata.references && metadata.references.length > 0 && {
        references: metadata.references
      }),
      ...(metadata.context && { context: metadata.context }),
      ...(metadata.purpose && { purpose: metadata.purpose }),
      ...(metadata.tone && { tone: metadata.tone }),
      ...(metadata.readability && { readability: metadata.readability }),
      ...(metadata.quality && { quality: metadata.quality }),
      ...(metadata.temporal && { temporal: metadata.temporal }),
      ...(metadata.processing && { processing: metadata.processing }),
      ...(metadata.embedding && { embedding: metadata.embedding }),
      ...(metadata.embedding_hash && { embedding_hash: metadata.embedding_hash }),
      ...(metadata.annotations && metadata.annotations.length > 0 && {
        annotations: metadata.annotations
      }),
      ...(metadata.custom && { custom: metadata.custom })
    };
  }

  /**
   * Format relationships
   * @param {object} relationships - Relationships object
   * @returns {object} - Formatted relationships
   */
  formatRelationships(relationships) {
    const formatted = {};

    // Handle different relationship types
    for (const [type, value] of Object.entries(relationships)) {
      if (type === 'semantic_similarity') {
        // Keep semantic similarity as-is (it's already formatted)
        formatted[type] = value;
      } else if (Array.isArray(value)) {
        // Array relationships
        if (value.length > 0) {
          formatted[type] = value;
        }
      } else if (value) {
        // Single relationships
        formatted[type] = value;
      }
    }

    return formatted;
  }

  /**
   * Build document index
   * @param {Array} sections - Sections array
   * @returns {object} - Index object
   */
  buildIndex(sections) {
    const index = {
      sections_by_type: {},
      sections_by_keyword: {},
      sections_by_importance: {},
      sections_by_level: {},
      document_outline: []
    };

    // Index by type
    for (const section of sections) {
      const type = section.type;
      if (!index.sections_by_type[type]) {
        index.sections_by_type[type] = [];
      }
      index.sections_by_type[type].push(section.id);
    }

    // Index by keywords
    for (const section of sections) {
      const keywords = section.metadata?.keywords || [];
      for (const keyword of keywords) {
        if (!index.sections_by_keyword[keyword]) {
          index.sections_by_keyword[keyword] = [];
        }
        index.sections_by_keyword[keyword].push(section.id);
      }
    }

    // Index by importance
    for (const section of sections) {
      const importance = section.metadata?.importance || 'medium';
      if (!index.sections_by_importance[importance]) {
        index.sections_by_importance[importance] = [];
      }
      index.sections_by_importance[importance].push(section.id);
    }

    // Index by heading level
    for (const section of sections) {
      if (section.type === 'heading' && section.level) {
        const level = section.level;
        if (!index.sections_by_level[level]) {
          index.sections_by_level[level] = [];
        }
        index.sections_by_level[level].push({
          id: section.id,
          title: section.title || section.content.substring(0, 50) + '...',
          level: level
        });
      }
    }

    // Build document outline from headings
    index.document_outline = this.buildDocumentOutline(sections);

    // Add embedding index if sections have embeddings
    const sectionsWithEmbeddings = sections.filter(s => s.metadata?.embedding);
    if (sectionsWithEmbeddings.length > 0) {
      index.embedding_index = {
        index_type: 'simple',
        section_vectors: {}
      };

      for (const section of sectionsWithEmbeddings) {
        index.embedding_index.section_vectors[section.id] = section.metadata.embedding;
      }
    }

    return index;
  }

  /**
   * Build hierarchical document outline from heading sections
   * @param {Array} sections - All sections
   * @returns {Array} - Hierarchical outline
   */
  buildDocumentOutline(sections) {
    const headingSections = sections.filter(s => s.type === 'heading' && s.level);
    const outline = [];
    const stack = [];

    for (const section of headingSections) {
      const outlineItem = {
        id: section.id,
        title: section.title || section.content.substring(0, 50) + '...',
        level: section.level,
        children: []
      };

      // Find the correct parent in the hierarchy
      while (stack.length > 0 && stack[stack.length - 1].level >= section.level) {
        stack.pop();
      }

      if (stack.length === 0) {
        // Top level item
        outline.push(outlineItem);
      } else {
        // Child of the last item in stack
        stack[stack.length - 1].children.push(outlineItem);
      }

      stack.push(outlineItem);
    }

    return outline;
  }

  /**
   * Build processing statistics
   * @param {object} options - Pipeline options
   * @returns {object} - Processing statistics
   */
  buildProcessingStats(options) {
    return {
      pipeline_version: '1.0.0',
      processing_date: new Date().toISOString(),
      options_used: {
        embedding_model: options.embeddingModel,
        chunk_size: options.chunkSize,
        detect_images: options.detectImages,
        detect_tables: options.detectTables,
        detect_relationships: options.detectRelationships
      }
    };
  }

  /**
   * Determine if index should be included
   * @param {Array} sections - Sections array
   * @returns {boolean} - Whether to include index
   */
  shouldIncludeIndex(sections) {
    // Include index for documents with more than 10 sections
    return sections.length > 10;
  }

  /**
   * Remove undefined values from object
   * @param {object} obj - Object to clean
   * @returns {object} - Cleaned object
   */
  removeUndefined(obj) {
    const cleaned = {};
    
    for (const [key, value] of Object.entries(obj)) {
      if (value !== undefined) {
        if (Array.isArray(value)) {
          if (value.length > 0) {
            cleaned[key] = value;
          }
        } else if (typeof value === 'object' && value !== null) {
          const cleanedValue = this.removeUndefined(value);
          if (Object.keys(cleanedValue).length > 0) {
            cleaned[key] = cleanedValue;
          }
        } else {
          cleaned[key] = value;
        }
      }
    }
    
    return cleaned;
  }

  /**
   * Format document for pretty printing
   * @param {object} document - ADF document
   * @returns {string} - Pretty formatted JSON
   */
  prettyFormat(document) {
    return JSON.stringify(document, null, 2);
  }

  /**
   * Format document for compact storage
   * @param {object} document - ADF document
   * @returns {string} - Compact JSON
   */
  compactFormat(document) {
    return JSON.stringify(document);
  }

  /**
   * Get formatter statistics
   * @returns {object} - Statistics object
   */
  getStats() {
    return { ...this.stats };
  }

  /**
   * Reset formatter statistics
   */
  reset() {
    this.stats = {
      documentsFormatted: 0,
      sectionsFormatted: 0,
      processingTime: 0
    };
  }
}