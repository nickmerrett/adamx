import natural from 'natural';

/**
 * Relationship detector for finding connections between document sections
 */
export class RelationshipDetector {
  constructor(options = {}) {
    this.options = {
      similarityThreshold: 0.3,
      keywordThreshold: 0.2,
      maxRelationships: 10,
      detectHierarchical: true,
      detectSequential: true,
      detectSemantic: true,
      detectReferential: true,
      ...options
    };

    this.stats = {
      sectionsProcessed: 0,
      relationshipsDetected: 0,
      processingTime: 0
    };

    // TF-IDF for keyword-based similarity
    this.tfidf = new natural.TfIdf();
  }

  /**
   * Detect relationships between all sections
   * @param {Array} sections - Array of section objects
   * @returns {Promise<void>} - Updates sections in place
   */
  async detectRelationships(sections) {
    const startTime = Date.now();
    this.stats.sectionsProcessed += sections.length;

    try {
      // Build TF-IDF corpus
      this.buildTfIdfCorpus(sections);

      // Detect different types of relationships
      if (this.options.detectHierarchical) {
        this.detectHierarchicalRelationships(sections);
      }

      if (this.options.detectSequential) {
        this.detectSequentialRelationships(sections);
      }

      if (this.options.detectSemantic) {
        this.detectSemanticRelationships(sections);
      }

      if (this.options.detectReferential) {
        this.detectReferentialRelationships(sections);
      }

      // Detect content dependencies
      this.detectContentDependencies(sections);

      // Calculate relationship statistics
      this.calculateRelationshipStats(sections);

      this.stats.processingTime += Date.now() - startTime;

    } catch (error) {
      throw new Error(`Relationship detection failed: ${error.message}`);
    }
  }

  /**
   * Build TF-IDF corpus from sections
   * @param {Array} sections - Array of sections
   */
  buildTfIdfCorpus(sections) {
    this.tfidf = new natural.TfIdf();
    
    sections.forEach(section => {
      const text = this.extractTextForAnalysis(section);
      this.tfidf.addDocument(text);
    });
  }

  /**
   * Extract text content for analysis
   * @param {object} section - Section object
   * @returns {string} - Text content
   */
  extractTextForAnalysis(section) {
    let text = '';

    // Main content
    if (typeof section.content === 'string') {
      text += section.content;
    } else if (section.content?.data) {
      text += section.content.data;
    }

    // Title
    if (section.title) {
      text += ' ' + section.title;
    }

    // Keywords
    if (section.metadata?.keywords) {
      text += ' ' + section.metadata.keywords.join(' ');
    }

    // Image descriptions
    if (section.image?.description) {
      text += ' ' + section.image.description;
    }
    if (section.image?.alt_text) {
      text += ' ' + section.image.alt_text;
    }

    // Table content
    if (section.table?.caption) {
      text += ' ' + section.table.caption;
    }

    return text.trim();
  }

  /**
   * Detect hierarchical relationships (parent-child)
   * @param {Array} sections - Array of sections
   */
  detectHierarchicalRelationships(sections) {
    for (let i = 0; i < sections.length; i++) {
      const section = sections[i];
      
      // Skip if not a heading
      if (section.type !== 'heading' || !section.level) continue;

      // Find parent (previous heading with lower level)
      for (let j = i - 1; j >= 0; j--) {
        const potentialParent = sections[j];
        
        if (potentialParent.type === 'heading' && 
            potentialParent.level && 
            potentialParent.level < section.level) {
          
          this.addRelationship(section, 'parent', potentialParent.id);
          this.addRelationship(potentialParent, 'children', section.id);
          break;
        }
      }

      // Find children (following sections with higher level)
      for (let j = i + 1; j < sections.length; j++) {
        const potentialChild = sections[j];
        
        // Stop if we hit a heading at same or lower level
        if (potentialChild.type === 'heading' && 
            potentialChild.level && 
            potentialChild.level <= section.level) {
          break;
        }

        // If it's a direct child (one level deeper)
        if (potentialChild.type === 'heading' && 
            potentialChild.level === (section.level + 1)) {
          
          this.addRelationship(section, 'children', potentialChild.id);
          this.addRelationship(potentialChild, 'parent', section.id);
        } else if (potentialChild.type !== 'heading') {
          // Regular content under this heading
          this.addRelationship(potentialChild, 'parent', section.id);
          this.addRelationship(section, 'children', potentialChild.id);
        }
      }
    }
  }

  /**
   * Detect sequential relationships (follows/precedes)
   * @param {Array} sections - Array of sections
   */
  detectSequentialRelationships(sections) {
    for (let i = 0; i < sections.length; i++) {
      const section = sections[i];

      // Previous section
      if (i > 0) {
        const prevSection = sections[i - 1];
        
        // Check for strong sequential indicators
        if (this.hasSequentialIndicators(section, prevSection)) {
          this.addRelationship(section, 'follows', prevSection.id);
          this.addRelationship(prevSection, 'precedes', section.id);
        }
      }

      // Next section
      if (i < sections.length - 1) {
        const nextSection = sections[i + 1];
        
        if (this.hasSequentialIndicators(nextSection, section)) {
          this.addRelationship(section, 'precedes', nextSection.id);
          this.addRelationship(nextSection, 'follows', section.id);
        }
      }
    }
  }

  /**
   * Check for sequential indicators between sections
   * @param {object} current - Current section
   * @param {object} previous - Previous section
   * @returns {boolean} - True if sections are sequentially related
   */
  hasSequentialIndicators(current, previous) {
    const currentText = this.extractTextForAnalysis(current).toLowerCase();
    const previousText = this.extractTextForAnalysis(previous).toLowerCase();

    // Check for explicit sequential markers
    const sequentialMarkers = [
      'next', 'then', 'after', 'following', 'subsequently', 'furthermore',
      'moreover', 'additionally', 'also', 'in addition', 'second', 'third',
      'finally', 'lastly', 'step', 'phase'
    ];

    const hasMarkers = sequentialMarkers.some(marker => 
      currentText.includes(marker)
    );

    // Check for similar content themes
    const keywordSimilarity = this.calculateKeywordSimilarity(current, previous);
    
    // Check for numbered sequences
    const hasNumbering = this.detectNumberedSequence(current, previous);

    return hasMarkers || keywordSimilarity > 0.4 || hasNumbering;
  }

  /**
   * Detect numbered sequences
   * @param {object} current - Current section
   * @param {object} previous - Previous section
   * @returns {boolean} - True if sections are in numbered sequence
   */
  detectNumberedSequence(current, previous) {
    const currentTitle = current.title || '';
    const previousTitle = previous.title || '';

    // Look for patterns like "1.", "2.", "Step 1", "Step 2", etc.
    const currentNum = this.extractNumber(currentTitle);
    const previousNum = this.extractNumber(previousTitle);

    if (currentNum !== null && previousNum !== null) {
      return currentNum === previousNum + 1;
    }

    return false;
  }

  /**
   * Extract number from text
   * @param {string} text - Text to analyze
   * @returns {number|null} - Extracted number or null
   */
  extractNumber(text) {
    const matches = text.match(/(\d+)/);
    return matches ? parseInt(matches[1]) : null;
  }

  /**
   * Detect semantic relationships using embeddings
   * @param {Array} sections - Array of sections
   */
  detectSemanticRelationships(sections) {
    for (let i = 0; i < sections.length; i++) {
      const section = sections[i];
      
      if (!section.metadata?.embedding) continue;

      // Find semantically similar sections
      const similarities = [];

      for (let j = 0; j < sections.length; j++) {
        if (i === j || !sections[j].metadata?.embedding) continue;

        const similarity = this.cosineSimilarity(
          section.metadata.embedding,
          sections[j].metadata.embedding
        );

        if (similarity >= this.options.similarityThreshold) {
          similarities.push({
            section_id: sections[j].id,
            similarity_score: Math.round(similarity * 10000) / 10000  // Round to 4 decimal places
          });
        }
      }

      // Sort by similarity and limit results
      similarities.sort((a, b) => b.similarity_score - a.similarity_score);
      
      if (similarities.length > 0) {
        const topSimilar = similarities.slice(0, this.options.maxRelationships);
        this.addRelationship(section, 'semantic_similarity', topSimilar);
        
        // Add reciprocal relationships
        for (const similar of topSimilar) {
          const relatedSection = sections.find(s => s.id === similar.section_id);
          if (relatedSection) {
            this.addRelationship(relatedSection, 'related', section.id);
          }
        }
      }
    }
  }

  /**
   * Detect referential relationships (explicit references)
   * @param {Array} sections - Array of sections
   */
  detectReferentialRelationships(sections) {
    // Build reference patterns
    const referencePatterns = this.buildReferencePatterns(sections);

    for (const section of sections) {
      const text = this.extractTextForAnalysis(section);
      
      // Find references in text
      for (const pattern of referencePatterns) {
        if (text.includes(pattern.text) && pattern.sectionId !== section.id) {
          this.addRelationship(section, 'references', pattern.sectionId);
          
          // Add reverse reference
          const referencedSection = sections.find(s => s.id === pattern.sectionId);
          if (referencedSection) {
            this.addRelationship(referencedSection, 'referenced_by', section.id);
          }
        }
      }
    }
  }

  /**
   * Build reference patterns from section titles and headings
   * @param {Array} sections - Array of sections
   * @returns {Array} - Array of reference patterns
   */
  buildReferencePatterns(sections) {
    const patterns = [];

    for (const section of sections) {
      // Use section titles as reference patterns
      if (section.title && section.title.length > 5) {
        patterns.push({
          text: section.title,
          sectionId: section.id
        });
      }

      // Use heading content as patterns
      if (section.type === 'heading' && 
          typeof section.content === 'string' && 
          section.content.length > 5) {
        patterns.push({
          text: section.content,
          sectionId: section.id
        });
      }

      // Use figure/table captions
      if (section.image?.caption) {
        patterns.push({
          text: section.image.caption,
          sectionId: section.id
        });
      }

      if (section.table?.caption) {
        patterns.push({
          text: section.table.caption,
          sectionId: section.id
        });
      }
    }

    return patterns;
  }

  /**
   * Detect content dependencies
   * @param {Array} sections - Array of sections
   */
  detectContentDependencies(sections) {
    for (let i = 0; i < sections.length; i++) {
      const section = sections[i];
      const text = this.extractTextForAnalysis(section).toLowerCase();

      // Look for dependency indicators
      const dependencyMarkers = [
        'as mentioned', 'as discussed', 'as shown', 'as described',
        'previously', 'above', 'earlier', 'before', 'prerequisite',
        'requires', 'depends on', 'based on', 'building on'
      ];

      for (const marker of dependencyMarkers) {
        if (text.includes(marker)) {
          // Find potential dependency targets in previous sections
          const dependencies = this.findDependencyTargets(section, sections.slice(0, i));
          
          for (const depId of dependencies) {
            this.addRelationship(section, 'depends_on', depId);
            
            const depSection = sections.find(s => s.id === depId);
            if (depSection) {
              this.addRelationship(depSection, 'supports', section.id);
            }
          }
          break;
        }
      }
    }
  }

  /**
   * Find dependency targets in previous sections
   * @param {object} section - Current section
   * @param {Array} previousSections - Previous sections to search
   * @returns {Array} - Array of section IDs that this section depends on
   */
  findDependencyTargets(section, previousSections) {
    const dependencies = [];
    const sectionKeywords = new Set(section.metadata?.keywords || []);

    // Look for sections with overlapping keywords
    for (const prevSection of previousSections) {
      const prevKeywords = new Set(prevSection.metadata?.keywords || []);
      const overlap = [...sectionKeywords].filter(k => prevKeywords.has(k));
      
      if (overlap.length >= 2) {
        dependencies.push(prevSection.id);
      }
    }

    // Limit dependencies
    return dependencies.slice(0, 3);
  }

  /**
   * Calculate keyword similarity between sections
   * @param {object} section1 - First section
   * @param {object} section2 - Second section
   * @returns {number} - Similarity score (0-1)
   */
  calculateKeywordSimilarity(section1, section2) {
    const keywords1 = new Set(section1.metadata?.keywords || []);
    const keywords2 = new Set(section2.metadata?.keywords || []);
    
    if (keywords1.size === 0 || keywords2.size === 0) return 0;

    const intersection = [...keywords1].filter(k => keywords2.has(k));
    const union = [...new Set([...keywords1, ...keywords2])];
    
    return intersection.length / union.length; // Jaccard similarity
  }

  /**
   * Calculate cosine similarity between vectors
   * @param {Array} a - First vector
   * @param {Array} b - Second vector
   * @returns {number} - Cosine similarity
   */
  cosineSimilarity(a, b) {
    if (!a || !b || a.length !== b.length) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    if (normA === 0 || normB === 0) return 0;

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /**
   * Add relationship to section
   * @param {object} section - Section object
   * @param {string} relationshipType - Type of relationship
   * @param {string|Array|object} target - Target of relationship
   */
  addRelationship(section, relationshipType, target) {
    if (!section.relationships) {
      section.relationships = {};
    }

    if (relationshipType === 'semantic_similarity') {
      section.relationships[relationshipType] = target;
    } else if (Array.isArray(section.relationships[relationshipType])) {
      if (!section.relationships[relationshipType].includes(target)) {
        section.relationships[relationshipType].push(target);
      }
    } else if (section.relationships[relationshipType]) {
      // Convert to array if not already
      if (section.relationships[relationshipType] !== target) {
        section.relationships[relationshipType] = [
          section.relationships[relationshipType],
          target
        ];
      }
    } else {
      section.relationships[relationshipType] = target;
    }

    this.stats.relationshipsDetected++;
  }

  /**
   * Calculate relationship statistics
   * @param {Array} sections - Array of sections
   */
  calculateRelationshipStats(sections) {
    let totalRelationships = 0;
    const relationshipTypes = {};

    for (const section of sections) {
      if (section.relationships) {
        for (const [type, targets] of Object.entries(section.relationships)) {
          relationshipTypes[type] = (relationshipTypes[type] || 0) + 1;
          
          if (Array.isArray(targets)) {
            totalRelationships += targets.length;
          } else if (type === 'semantic_similarity' && Array.isArray(targets)) {
            totalRelationships += targets.length;
          } else {
            totalRelationships += 1;
          }
        }
      }
    }

    this.stats.totalRelationships = totalRelationships;
    this.stats.relationshipTypes = relationshipTypes;
  }

  /**
   * Validate relationships (remove broken references)
   * @param {Array} sections - Array of sections
   */
  validateRelationships(sections) {
    const sectionIds = new Set(sections.map(s => s.id));

    for (const section of sections) {
      if (!section.relationships) continue;

      for (const [type, targets] of Object.entries(section.relationships)) {
        if (type === 'semantic_similarity') continue; // Skip similarity objects

        if (Array.isArray(targets)) {
          section.relationships[type] = targets.filter(id => sectionIds.has(id));
          
          if (section.relationships[type].length === 0) {
            delete section.relationships[type];
          }
        } else if (typeof targets === 'string' && !sectionIds.has(targets)) {
          delete section.relationships[type];
        }
      }

      // Remove empty relationships object
      if (Object.keys(section.relationships).length === 0) {
        delete section.relationships;
      }
    }
  }

  /**
   * Get relationship statistics
   * @returns {object} - Statistics object
   */
  getStats() {
    return { ...this.stats };
  }

  /**
   * Reset detector statistics
   */
  reset() {
    this.stats = {
      sectionsProcessed: 0,
      relationshipsDetected: 0,
      processingTime: 0
    };
    
    this.tfidf = new natural.TfIdf();
  }
}