import { createHash } from 'crypto';

/**
 * Embedding generator for creating vector representations of content
 * Note: This is a mock implementation. In production, you'd integrate with
 * services like OpenAI, Cohere, or local models like sentence-transformers
 */
export class EmbeddingGenerator {
  constructor(options = {}) {
    this.options = {
      model: 'text-embedding-ada-002',
      dimension: 1536,
      batchSize: 100,
      maxRetries: 3,
      retryDelay: 1000,
      ...options
    };

    this.stats = {
      totalEmbeddings: 0,
      successfulEmbeddings: 0,
      failedEmbeddings: 0,
      processingTime: 0,
      cacheHits: 0
    };

    // Simple in-memory cache
    this.cache = new Map();
  }

  /**
   * Generate embeddings for all sections
   * @param {Array} sections - Array of section objects
   * @returns {Promise<void>} - Updates sections in place
   */
  async generateEmbeddings(sections) {
    const startTime = Date.now();
    
    try {
      // Process sections in batches
      const batches = this.createBatches(sections, this.options.batchSize);
      
      for (const batch of batches) {
        await this.processBatch(batch);
      }

      this.stats.processingTime += Date.now() - startTime;

    } catch (error) {
      throw new Error(`Embedding generation failed: ${error.message}`);
    }
  }

  /**
   * Process a batch of sections
   * @param {Array} batch - Batch of sections
   * @returns {Promise<void>}
   */
  async processBatch(batch) {
    const promises = batch.map(section => this.generateSectionEmbedding(section));
    await Promise.all(promises);
  }

  /**
   * Generate embedding for a single section
   * @param {object} section - Section object
   * @returns {Promise<void>} - Updates section in place
   */
  async generateSectionEmbedding(section) {
    try {
      this.stats.totalEmbeddings++;

      // Get text content for embedding
      const textContent = this.extractTextContent(section);
      const contentHash = this.generateContentHash(textContent);

      // Check cache first
      if (this.cache.has(contentHash)) {
        section.metadata.embedding = this.cache.get(contentHash);
        section.metadata.embedding_hash = contentHash;
        this.stats.cacheHits++;
        this.stats.successfulEmbeddings++;
        return;
      }

      // Generate embedding
      const embedding = await this.generateEmbedding(textContent);
      
      // Store in section
      section.metadata.embedding = embedding;
      section.metadata.embedding_hash = contentHash;

      // Cache the result
      this.cache.set(contentHash, embedding);

      this.stats.successfulEmbeddings++;

    } catch (error) {
      this.stats.failedEmbeddings++;
      console.warn(`Failed to generate embedding for section ${section.id}: ${error.message}`);
      
      // Set placeholder embedding
      section.metadata.embedding = this.generatePlaceholderEmbedding();
      section.metadata.embedding_hash = 'placeholder';
    }
  }

  /**
   * Extract text content from section for embedding
   * @param {object} section - Section object
   * @returns {string} - Text content
   */
  extractTextContent(section) {
    let content = '';

    // Handle different content types
    if (typeof section.content === 'string') {
      content = section.content;
    } else if (section.content && section.content.data) {
      content = section.content.data;
    }

    // Add title if available
    if (section.title) {
      content = section.title + '\n' + content;
    }

    // Add image alt text and description
    if (section.image) {
      if (section.image.alt_text) {
        content += '\n' + section.image.alt_text;
      }
      if (section.image.description) {
        content += '\n' + section.image.description;
      }
      if (section.image.generated_description) {
        content += '\n' + section.image.generated_description;
      }
      if (section.image.ocr_text) {
        content += '\n' + section.image.ocr_text;
      }
    }

    // Add table caption and summary
    if (section.table) {
      if (section.table.caption) {
        content += '\n' + section.table.caption;
      }
      if (section.table.summary) {
        content += '\n' + section.table.summary;
      }
      
      // Add header information
      if (section.table.headers) {
        const headerText = section.table.headers.map(h => h.text).join(' ');
        content += '\n' + headerText;
      }
    }

    return content.trim();
  }

  /**
   * Generate embedding vector
   * @param {string} text - Text to embed
   * @returns {Promise<Array>} - Embedding vector
   */
  async generateEmbedding(text) {
    // Mock implementation - in production, call actual embedding API
    return this.mockEmbedding(text);
  }

  /**
   * Mock embedding generation (for development/testing)
   * Creates a pseudo-random but deterministic vector based on text content
   * @param {string} text - Text to embed
   * @returns {Array} - Mock embedding vector
   */
  mockEmbedding(text) {
    const hash = createHash('sha256').update(text).digest();
    const vector = [];
    
    // Generate deterministic vector from hash
    for (let i = 0; i < this.options.dimension; i++) {
      const byteIndex = i % hash.length;
      const value = (hash[byteIndex] - 128) / 128; // Normalize to [-1, 1]
      vector.push(value);
    }

    // Normalize vector to unit length
    const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
    return vector.map(val => val / magnitude);
  }

  /**
   * Generate real embedding using OpenAI API (example implementation)
   * @param {string} text - Text to embed
   * @returns {Promise<Array>} - Embedding vector
   */
  async generateOpenAIEmbedding(text) {
    // This is an example - you'd need to implement actual API calls
    
    const maxRetries = this.options.maxRetries;
    let lastError;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        // Example API call structure (not functional without API key)
        /*
        const response = await fetch('https://api.openai.com/v1/embeddings', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: this.options.model,
            input: text.substring(0, 8000) // Limit input length
          })
        });

        if (!response.ok) {
          throw new Error(`API error: ${response.status}`);
        }

        const data = await response.json();
        return data.data[0].embedding;
        */

        // For now, return mock embedding
        return this.mockEmbedding(text);

      } catch (error) {
        lastError = error;
        
        if (attempt < maxRetries - 1) {
          await this.sleep(this.options.retryDelay * Math.pow(2, attempt));
        }
      }
    }

    throw lastError;
  }

  /**
   * Generate visual embedding for images (placeholder)
   * @param {object} imageSection - Image section
   * @returns {Promise<void>}
   */
  async generateVisualEmbedding(imageSection) {
    if (!imageSection.image) return;

    try {
      // This would integrate with models like CLIP for visual embeddings
      // For now, generate based on available text descriptions
      
      let textualContent = '';
      if (imageSection.image.alt_text) textualContent += imageSection.image.alt_text + ' ';
      if (imageSection.image.description) textualContent += imageSection.image.description + ' ';
      if (imageSection.image.generated_description) textualContent += imageSection.image.generated_description;

      if (textualContent.trim()) {
        imageSection.image.visual_embedding = await this.generateEmbedding(textualContent);
        imageSection.image.visual_embedding_model = 'text-based-fallback';
      }

    } catch (error) {
      console.warn(`Failed to generate visual embedding: ${error.message}`);
    }
  }

  /**
   * Generate placeholder embedding
   * @returns {Array} - Placeholder embedding vector
   */
  generatePlaceholderEmbedding() {
    return new Array(this.options.dimension).fill(0);
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
   * Create batches from sections array
   * @param {Array} sections - Sections to batch
   * @param {number} batchSize - Size of each batch
   * @returns {Array} - Array of batches
   */
  createBatches(sections, batchSize) {
    const batches = [];
    for (let i = 0; i < sections.length; i += batchSize) {
      batches.push(sections.slice(i, i + batchSize));
    }
    return batches;
  }

  /**
   * Sleep for specified duration
   * @param {number} ms - Milliseconds to sleep
   * @returns {Promise} - Promise that resolves after delay
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Calculate cosine similarity between two vectors
   * @param {Array} a - First vector
   * @param {Array} b - Second vector
   * @returns {number} - Cosine similarity (-1 to 1)
   */
  cosineSimilarity(a, b) {
    if (a.length !== b.length) {
      throw new Error('Vectors must have the same dimension');
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    if (normA === 0 || normB === 0) {
      return 0;
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /**
   * Find most similar sections using embeddings
   * @param {object} targetSection - Section to find similarities for
   * @param {Array} allSections - All sections to compare against
   * @param {number} topK - Number of most similar sections to return
   * @returns {Array} - Array of similarity objects
   */
  findSimilarSections(targetSection, allSections, topK = 5) {
    if (!targetSection.metadata.embedding) {
      return [];
    }

    const similarities = [];

    for (const section of allSections) {
      if (section.id === targetSection.id || !section.metadata.embedding) {
        continue;
      }

      const similarity = this.cosineSimilarity(
        targetSection.metadata.embedding,
        section.metadata.embedding
      );

      similarities.push({
        section_id: section.id,
        similarity_score: similarity
      });
    }

    // Sort by similarity score (descending) and return top K
    return similarities
      .sort((a, b) => b.similarity_score - a.similarity_score)
      .slice(0, topK);
  }

  /**
   * Update sections with similarity relationships
   * @param {Array} sections - Array of sections
   * @param {number} similarityThreshold - Minimum similarity threshold
   */
  updateSimilarityRelationships(sections, similarityThreshold = 0.5) {
    for (const section of sections) {
      const similarities = this.findSimilarSections(section, sections, 10);
      
      // Filter by threshold and add to relationships
      const semanticSimilarities = similarities.filter(
        sim => sim.similarity_score >= similarityThreshold
      );

      if (semanticSimilarities.length > 0) {
        if (!section.relationships) {
          section.relationships = {};
        }
        section.relationships.semantic_similarity = semanticSimilarities;
      }
    }
  }

  /**
   * Clear embedding cache
   */
  clearCache() {
    this.cache.clear();
  }

  /**
   * Get cache size
   * @returns {number} - Number of cached embeddings
   */
  getCacheSize() {
    return this.cache.size;
  }

  /**
   * Get embedding statistics
   * @returns {object} - Statistics object
   */
  getStats() {
    return {
      ...this.stats,
      cacheSize: this.cache.size,
      cacheHitRate: this.stats.totalEmbeddings > 0 
        ? this.stats.cacheHits / this.stats.totalEmbeddings 
        : 0
    };
  }

  /**
   * Reset statistics
   */
  reset() {
    this.stats = {
      totalEmbeddings: 0,
      successfulEmbeddings: 0,
      failedEmbeddings: 0,
      processingTime: 0,
      cacheHits: 0
    };
  }
}