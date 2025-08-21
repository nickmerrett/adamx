import fs from 'fs/promises';
import zlib from 'zlib';
import { promisify } from 'util';
import { SimpleADAMPacker } from './simple-packer.js';
import { BrowserMCPBridge } from './browser-mcp-bridge.js';

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

/**
 * Enhanced ADAM WASM Packer with integrated MCP server capabilities
 * 
 * Creates self-contained WASM modules that embed both ADAM document data
 * and MCP server functionality for document querying and analysis.
 */
export class ADAMMCPPacker extends SimpleADAMPacker {
  constructor(options = {}) {
    super(options);
    this.mcpEnabled = options.enableMCP !== false; // Default: true
    this.mcpOptions = {
      includeSearchIndex: true,
      cacheRelationships: true,
      enableStreaming: false,
      ...options.mcpOptions
    };
  }

  /**
   * Pack ADAM document with MCP server capabilities
   * @param {string} inputPath - Input ADAM JSON file
   * @param {string} outputPath - Output WASM file
   * @returns {Promise<object>} - Enhanced packing results
   */
  async packWithMCP(inputPath, outputPath) {
    try {
      console.log(`📦 Packing ADAM document with MCP server: ${inputPath}`);

      // Load ADAM document
      const adamDoc = JSON.parse(await fs.readFile(inputPath, 'utf-8'));
      
      // Optimize document
      const optimized = this.optimizeDocument(adamDoc);
      
      // Build MCP metadata if enabled
      const mcpMetadata = this.mcpEnabled ? this.buildMCPMetadata(optimized) : null;
      
      // Create enhanced document package
      const documentPackage = {
        document: optimized,
        mcp_metadata: mcpMetadata,
        version: '1.0.0',
        capabilities: this.getCapabilities()
      };
      
      // Serialize to JSON
      const jsonData = JSON.stringify(documentPackage);
      const jsonBytes = Buffer.from(jsonData, 'utf-8');
      
      // Apply compression
      const compressedData = this.options.compression === 'gzip' 
        ? await gzip(jsonBytes)
        : jsonBytes;
      
      // Create enhanced WASM module
      const wasmBinary = this.createEnhancedWasmModule(compressedData, mcpMetadata);
      
      // Write WASM file
      await fs.writeFile(outputPath, wasmBinary);
      
      // Generate enhanced statistics
      const stats = {
        originalSize: jsonBytes.length,
        compressedSize: compressedData.length,
        wasmSize: wasmBinary.length,
        compressionRatio: ((jsonBytes.length - compressedData.length) / jsonBytes.length * 100).toFixed(1),
        sections: adamDoc.sections?.length || 0,
        format: this.options.compression,
        mcpEnabled: this.mcpEnabled,
        capabilities: this.getCapabilities(),
        optimizations: {
          embeddingsRemoved: this.options.removeEmbeddings,
          metadataOptimized: this.options.optimizeMetadata,
          searchIndexBuilt: mcpMetadata?.search_index ? true : false,
          relationshipsCached: mcpMetadata?.relationship_cache ? true : false
        }
      };
      
      console.log(`✅ MCP-enabled WASM packing completed!`);
      console.log(`📊 Original: ${this.formatBytes(stats.originalSize)}`);
      console.log(`🗜️  Compressed: ${this.formatBytes(stats.compressedSize)} (${stats.compressionRatio}% reduction)`);
      console.log(`📦 WASM+MCP: ${this.formatBytes(stats.wasmSize)}`);
      console.log(`🔧 MCP Tools: ${stats.capabilities.tools.length}`);
      console.log(`📋 MCP Resources: ${stats.capabilities.resources.length}`);
      console.log(`📄 Sections: ${stats.sections}`);
      
      return { success: true, stats, outputPath };
      
    } catch (error) {
      throw new Error(`MCP WASM packing failed: ${error.message}`);
    }
  }

  /**
   * Unpack ADAM document with MCP bridge
   * @param {string} wasmPath - WASM file path
   * @returns {Promise<object>} - Enhanced unpacking result
   */
  async unpackWithMCP(wasmPath) {
    try {
      console.log(`📂 Unpacking MCP-enabled WASM file: ${wasmPath}`);
      
      const wasmBinary = await fs.readFile(wasmPath);
      
      // Extract embedded data from WASM
      const embeddedData = this.extractEmbeddedData(wasmBinary);
      
      // Decompress if needed
      const jsonData = this.options.compression === 'gzip'
        ? await gunzip(embeddedData)
        : embeddedData;
      
      // Parse enhanced document package
      const documentPackage = JSON.parse(jsonData.toString('utf-8'));
      const adamDoc = documentPackage.document;
      const mcpMetadata = documentPackage.mcp_metadata;
      
      // Create MCP bridge if metadata exists
      let mcpBridge = null;
      if (mcpMetadata) {
        mcpBridge = new BrowserMCPBridge(null, adamDoc);
        await mcpBridge.initialize();
        
        // Restore cached data if available
        if (mcpMetadata.search_index) {
          mcpBridge.searchIndex = mcpMetadata.search_index;
        }
        if (mcpMetadata.relationship_cache) {
          mcpBridge.relationshipCache = mcpMetadata.relationship_cache;
        }
      }
      
      console.log(`✅ MCP WASM unpacking completed!`);
      console.log(`📄 Document: ${adamDoc.metadata?.title || 'Untitled'}`);
      console.log(`📊 Sections: ${adamDoc.sections?.length || 0}`);
      if (mcpBridge) {
        console.log(`🔧 MCP Bridge: Ready`);
        console.log(`🛠️  Available Tools: ${mcpBridge.getAvailableTools().length}`);
        console.log(`📋 Available Resources: ${mcpBridge.getAvailableResources().length}`);
      }
      
      return {
        document: adamDoc,
        mcpBridge: mcpBridge,
        metadata: mcpMetadata,
        capabilities: documentPackage.capabilities
      };
      
    } catch (error) {
      throw new Error(`MCP WASM unpacking failed: ${error.message}`);
    }
  }

  /**
   * Build MCP metadata for enhanced functionality
   * @param {object} document - ADAM document
   * @returns {object} - MCP metadata
   */
  buildMCPMetadata(document) {
    const metadata = {
      version: '1.0.0',
      created: new Date().toISOString(),
      capabilities: this.getCapabilities()
    };

    // Build search index if enabled
    if (this.mcpOptions.includeSearchIndex) {
      metadata.search_index = this.buildSearchIndex(document);
      console.log(`🔍 Built search index: ${Object.keys(metadata.search_index).length} terms`);
    }

    // Cache relationships if enabled
    if (this.mcpOptions.cacheRelationships) {
      metadata.relationship_cache = this.buildRelationshipCache(document);
      console.log(`🔗 Cached relationships: ${Object.keys(metadata.relationship_cache).length} sections`);
    }

    // Build section type index
    metadata.section_type_index = this.buildSectionTypeIndex(document);

    // Build keyword frequency map
    metadata.keyword_frequency = this.buildKeywordFrequency(document);

    return metadata;
  }

  /**
   * Build search index for faster content queries
   * @param {object} document - ADAM document
   * @returns {object} - Search index
   */
  buildSearchIndex(document) {
    const index = {};
    
    for (const section of document.sections) {
      const contentText = typeof section.content === 'string' 
        ? section.content 
        : JSON.stringify(section.content);
      
      // Tokenize content
      const words = contentText.toLowerCase()
        .split(/\W+/)
        .filter(word => word.length > 2);
      
      // Index words
      for (const word of words) {
        if (!index[word]) {
          index[word] = [];
        }
        
        if (!index[word].includes(section.id)) {
          index[word].push(section.id);
        }
      }
      
      // Index keywords
      if (section.metadata?.keywords) {
        for (const keyword of section.metadata.keywords) {
          const keywordLower = keyword.toLowerCase();
          if (!index[keywordLower]) {
            index[keywordLower] = [];
          }
          if (!index[keywordLower].includes(section.id)) {
            index[keywordLower].push(section.id);
          }
        }
      }
    }
    
    return index;
  }

  /**
   * Build relationship cache for faster traversal
   * @param {object} document - ADAM document
   * @returns {object} - Relationship cache
   */
  buildRelationshipCache(document) {
    const cache = {};
    
    for (const section of document.sections) {
      if (section.relationships) {
        cache[section.id] = {};
        
        for (const [relType, targets] of Object.entries(section.relationships)) {
          cache[section.id][relType] = this.resolveRelationshipTargets(targets, document);
        }
      }
    }
    
    return cache;
  }

  /**
   * Resolve relationship targets to include section details
   * @param {any} targets - Relationship targets
   * @param {object} document - ADAM document
   * @returns {any} - Resolved targets
   */
  resolveRelationshipTargets(targets, document) {
    if (Array.isArray(targets)) {
      return targets.map(target => {
        if (typeof target === 'object' && target.section_id) {
          const section = document.sections.find(s => s.id === target.section_id);
          return {
            ...target,
            section_title: section?.title,
            section_type: section?.type
          };
        } else if (typeof target === 'string') {
          const section = document.sections.find(s => s.id === target);
          return {
            section_id: target,
            section_title: section?.title,
            section_type: section?.type
          };
        }
        return target;
      });
    } else if (typeof targets === 'string') {
      const section = document.sections.find(s => s.id === targets);
      return {
        section_id: targets,
        section_title: section?.title,
        section_type: section?.type
      };
    }
    
    return targets;
  }

  /**
   * Build section type index
   * @param {object} document - ADAM document
   * @returns {object} - Section type index
   */
  buildSectionTypeIndex(document) {
    const index = {};
    
    for (const section of document.sections) {
      if (!index[section.type]) {
        index[section.type] = [];
      }
      index[section.type].push(section.id);
    }
    
    return index;
  }

  /**
   * Build keyword frequency map
   * @param {object} document - ADAM document
   * @returns {object} - Keyword frequency
   */
  buildKeywordFrequency(document) {
    const frequency = {};
    
    for (const section of document.sections) {
      if (section.metadata?.keywords) {
        for (const keyword of section.metadata.keywords) {
          frequency[keyword] = (frequency[keyword] || 0) + 1;
        }
      }
    }
    
    return frequency;
  }

  /**
   * Get MCP capabilities
   * @returns {object} - Capabilities object
   */
  getCapabilities() {
    return {
      tools: [
        'search_content',
        'get_section', 
        'get_metadata',
        'find_related',
        'extract_concepts',
        'get_outline'
      ],
      resources: [
        'sections://{type}',
        'metadata://document',
        'relationships://{section_id}'
      ],
      features: {
        search_index: this.mcpOptions.includeSearchIndex,
        relationship_cache: this.mcpOptions.cacheRelationships,
        streaming: this.mcpOptions.enableStreaming
      }
    };
  }

  /**
   * Create enhanced WASM module with MCP capabilities
   * @param {Buffer} data - Compressed data
   * @param {object} mcpMetadata - MCP metadata
   * @returns {Buffer} - Enhanced WASM binary
   */
  createEnhancedWasmModule(data, mcpMetadata) {
    // For now, use the base implementation
    // In a full implementation, this would add additional exports for MCP operations
    return this.createWasmWithEmbeddedData(data);
  }
}

// Re-export the MCP packer as default
export { ADAMMCPPacker as default };