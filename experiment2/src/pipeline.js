import { DocumentParser } from './parsers/DocumentParser.js';
import { SectionExtractor } from './extractors/SectionExtractor.js';
import { EmbeddingGenerator } from './embeddings/EmbeddingGenerator.js';
import { RelationshipDetector } from './relationships/RelationshipDetector.js';
import { MetadataExtractor } from './metadata/MetadataExtractor.js';
import { OutputFormatter } from './formatters/OutputFormatter.js';
import { validateSchema } from './utils/validator.js';
import { Logger } from './utils/logger.js';

/**
 * Main pipeline class for converting documents to ADAM (Agentic Document Augmentation Markup)
 */
export class ADAMPipeline {
  constructor(options = {}) {
    this.options = {
      embeddingModel: 'text-embedding-ada-002',
      embeddingDimension: 1536,
      chunkSize: 500,
      chunkOverlap: 50,
      detectImages: true,
      detectTables: true,
      generateThumbnails: true,
      analyzeReadability: true,
      extractEntities: true,
      detectRelationships: true,
      validateOutput: true,
      ...options
    };

    this.logger = new Logger();
    this.parser = new DocumentParser();
    this.sectionExtractor = new SectionExtractor(this.options);
    this.embeddingGenerator = new EmbeddingGenerator(this.options);
    this.relationshipDetector = new RelationshipDetector();
    this.metadataExtractor = new MetadataExtractor(this.options);
    this.outputFormatter = new OutputFormatter();
  }

  /**
   * Convert a document file to ADAM format
   * @param {string} filePath - Path to the input document
   * @param {object} metadata - Optional metadata overrides
   * @returns {Promise<object>} - ADAM document object
   */
  async convert(filePath, metadata = {}) {
    try {
      this.logger.info(`Starting conversion of: ${filePath}`);

      // Stage 1: Parse document
      this.logger.info('Stage 1: Parsing document...');
      let rawContent;
      try {
        rawContent = await this.parser.parse(filePath);
        this.logger.info(`✓ Stage 1 completed: Extracted ${rawContent.rawText?.length || 0} characters`);
      } catch (error) {
        this.logger.error(`✗ Stage 1 failed: ${error.message}`);
        throw error;
      }

      // Stage 2: Extract sections
      this.logger.info('Stage 2: Extracting sections...');
      let sections;
      try {
        sections = await this.sectionExtractor.extract(rawContent);
        this.logger.info(`✓ Stage 2 completed: Created ${sections.length} sections`);
      } catch (error) {
        this.logger.error(`✗ Stage 2 failed: ${error.message}`);
        throw error;
      }

      // Stage 3: Generate embeddings
      this.logger.info('Stage 3: Generating embeddings...');
      try {
        await this.embeddingGenerator.generateEmbeddings(sections);
        this.logger.info(`✓ Stage 3 completed: Generated embeddings for ${sections.length} sections`);
      } catch (error) {
        this.logger.error(`✗ Stage 3 failed: ${error.message}`);
        throw error;
      }

      // Stage 4: Detect relationships
      this.logger.info('Stage 4: Detecting relationships...');
      try {
        await this.relationshipDetector.detectRelationships(sections);
        this.logger.info(`✓ Stage 4 completed: Detected relationships`);
      } catch (error) {
        this.logger.error(`✗ Stage 4 failed: ${error.message}`);
        throw error;
      }

      // Stage 5: Extract metadata
      this.logger.info('Stage 5: Extracting metadata...');
      let documentMetadata;
      try {
        documentMetadata = await this.metadataExtractor.extract(rawContent, metadata);
        this.logger.info(`✓ Stage 5 completed: Extracted document metadata`);
      } catch (error) {
        this.logger.error(`✗ Stage 5 failed: ${error.message}`);
        throw error;
      }

      // Stage 6: Format output
      this.logger.info('Stage 6: Formatting output...');
      let adamDocument;
      try {
        adamDocument = await this.outputFormatter.format({
          metadata: documentMetadata,
          sections,
          options: this.options
        });
        this.logger.info(`✓ Stage 6 completed: Formatted ADAM document`);
      } catch (error) {
        this.logger.error(`✗ Stage 6 failed: ${error.message}`);
        throw error;
      }

      // Stage 7: Validate (optional)
      if (this.options.validateOutput) {
        this.logger.info('Stage 7: Validating output...');
        try {
          const isValid = await validateSchema(adamDocument);
          if (!isValid) {
            throw new Error('Generated document does not conform to ADAM schema');
          }
          this.logger.info(`✓ Stage 7 completed: Validation passed`);
        } catch (error) {
          this.logger.error(`✗ Stage 7 failed: ${error.message}`);
          throw error;
        }
      }

      this.logger.success(`Conversion completed successfully. Generated ${sections.length} sections.`);
      return adamDocument;

    } catch (error) {
      this.logger.error(`Conversion failed: ${error.message}`);
      if (this.logger.currentLevel >= 3) { // Debug level
        this.logger.debug(`Stack trace: ${error.stack}`);
      }
      throw error;
    }
  }

  /**
   * Convert multiple documents in batch
   * @param {string[]} filePaths - Array of file paths
   * @param {object} options - Batch processing options
   * @returns {Promise<object[]>} - Array of ADAM documents
   */
  async convertBatch(filePaths, options = {}) {
    const results = [];
    const { parallel = false, maxConcurrency = 3 } = options;

    if (parallel) {
      // Process documents in parallel with concurrency limit
      const semaphore = new Array(maxConcurrency).fill(null);
      const promises = filePaths.map(async (filePath, index) => {
        await new Promise(resolve => {
          const check = () => {
            const available = semaphore.indexOf(null);
            if (available !== -1) {
              semaphore[available] = index;
              resolve();
            } else {
              setTimeout(check, 100);
            }
          };
          check();
        });

        try {
          const result = await this.convert(filePath);
          results[index] = result;
        } catch (error) {
          results[index] = { error: error.message, filePath };
        } finally {
          const slot = semaphore.indexOf(index);
          if (slot !== -1) semaphore[slot] = null;
        }
      });

      await Promise.all(promises);
    } else {
      // Process documents sequentially
      for (const filePath of filePaths) {
        try {
          const result = await this.convert(filePath);
          results.push(result);
        } catch (error) {
          results.push({ error: error.message, filePath });
        }
      }
    }

    return results;
  }

  /**
   * Get pipeline statistics
   * @returns {object} - Pipeline performance metrics
   */
  getStats() {
    return {
      parser: this.parser.getStats(),
      sectionExtractor: this.sectionExtractor.getStats(),
      embeddingGenerator: this.embeddingGenerator.getStats(),
      relationshipDetector: this.relationshipDetector.getStats(),
      metadataExtractor: this.metadataExtractor.getStats()
    };
  }

  /**
   * Reset pipeline state
   */
  reset() {
    this.parser.reset();
    this.sectionExtractor.reset();
    this.embeddingGenerator.reset();
    this.relationshipDetector.reset();
    this.metadataExtractor.reset();
  }
}

export default ADAMPipeline;