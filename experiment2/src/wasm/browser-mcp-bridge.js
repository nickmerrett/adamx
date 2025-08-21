/**
 * Browser MCP Bridge - WebAssembly-JavaScript bridge for MCP operations
 * 
 * Provides a browser-compatible interface for interacting with ADAM documents
 * embedded in WebAssembly modules through MCP-like operations.
 */
export class BrowserMCPBridge {
  constructor(wasmModule, adamDocument) {
    this.wasmModule = wasmModule;
    this.document = adamDocument;
    this.initialized = false;
  }

  /**
   * Initialize the MCP bridge
   */
  async initialize() {
    try {
      if (!this.document) {
        throw new Error('ADAM document not provided');
      }
      
      this.initialized = true;
      console.log(`✅ ADAM MCP Bridge initialized`);
      console.log(`📄 Document: ${this.document.metadata?.title || 'Untitled'}`);
      console.log(`📊 Sections: ${this.document.sections?.length || 0}`);
      
      return true;
    } catch (error) {
      console.error(`❌ Failed to initialize MCP bridge: ${error.message}`);
      return false;
    }
  }

  /**
   * Execute MCP-style tool calls
   */
  async callTool(toolName, params = {}) {
    if (!this.initialized) {
      throw new Error('MCP bridge not initialized');
    }

    switch (toolName) {
      case 'search_content':
        return this.searchContent(params);
      case 'get_section':
        return this.getSection(params);
      case 'get_metadata':
        return this.getMetadata(params);
      case 'find_related':
        return this.findRelated(params);
      case 'extract_concepts':
        return this.extractConcepts(params);
      case 'get_outline':
        return this.getOutline(params);
      default:
        throw new Error(`Unknown tool: ${toolName}`);
    }
  }

  /**
   * Access MCP-style resources
   */
  async getResource(resourceUri) {
    if (!this.initialized) {
      throw new Error('MCP bridge not initialized');
    }

    if (resourceUri.startsWith('sections://')) {
      const sectionType = resourceUri.replace('sections://', '');
      return this.getSectionsByType(sectionType);
    }
    
    if (resourceUri === 'metadata://document') {
      return {
        uri: resourceUri,
        mimeType: 'application/json',
        content: this.document.metadata
      };
    }
    
    if (resourceUri.startsWith('relationships://')) {
      const sectionId = resourceUri.replace('relationships://', '');
      return this.getSectionRelationships(sectionId);
    }
    
    throw new Error(`Unknown resource: ${resourceUri}`);
  }

  /**
   * List available tools
   */
  getAvailableTools() {
    return [
      {
        name: 'search_content',
        description: 'Search ADAM document sections by content',
        parameters: {
          query: { type: 'string', required: true },
          limit: { type: 'number', default: 10 },
          section_type: { type: 'string', optional: true }
        }
      },
      {
        name: 'get_section',
        description: 'Retrieve a specific section by ID',
        parameters: {
          section_id: { type: 'string', required: true }
        }
      },
      {
        name: 'get_metadata',
        description: 'Get ADAM document metadata and statistics',
        parameters: {}
      },
      {
        name: 'find_related',
        description: 'Find sections related to a given section ID',
        parameters: {
          section_id: { type: 'string', required: true },
          relationship_type: { type: 'string', optional: true },
          limit: { type: 'number', default: 5 }
        }
      },
      {
        name: 'extract_concepts',
        description: 'Extract key concepts and keywords from the document',
        parameters: {
          section_type: { type: 'string', optional: true },
          limit: { type: 'number', default: 20 }
        }
      },
      {
        name: 'get_outline',
        description: 'Get hierarchical outline of the document structure',
        parameters: {
          max_depth: { type: 'number', default: 3 }
        }
      }
    ];
  }

  /**
   * List available resources
   */
  getAvailableResources() {
    const sectionTypes = [...new Set(this.document.sections.map(s => s.type))];
    const resources = [
      {
        uri: 'metadata://document',
        description: 'Complete document metadata',
        mimeType: 'application/json'
      }
    ];

    // Add section type resources
    for (const type of sectionTypes) {
      resources.push({
        uri: `sections://${type}`,
        description: `All sections of type: ${type}`,
        mimeType: 'application/json'
      });
    }

    // Add relationship resources for each section
    for (const section of this.document.sections) {
      if (section.relationships) {
        resources.push({
          uri: `relationships://${section.id}`,
          description: `Relationships for section: ${section.title || section.id}`,
          mimeType: 'application/json'
        });
      }
    }

    return resources;
  }

  // Tool implementations

  async searchContent({ query, limit = 10, section_type }) {
    const queryLower = query.toLowerCase();
    const results = [];

    for (const section of this.document.sections) {
      if (section_type && section.type !== section_type) continue;

      let score = 0;
      const contentText = typeof section.content === 'string' 
        ? section.content 
        : JSON.stringify(section.content);
      
      const contentLower = contentText.toLowerCase();
      if (contentLower.includes(queryLower)) {
        score += 10;
        // Boost for exact matches
        const queryIndex = contentLower.indexOf(queryLower);
        if (queryIndex !== -1) {
          score += 5;
          // Boost if query appears near beginning
          if (queryIndex < 100) score += 3;
        }
      }

      // Title matching (higher weight)
      if (section.title && section.title.toLowerCase().includes(queryLower)) {
        score += 20;
      }

      // Keywords matching
      if (section.metadata?.keywords) {
        for (const keyword of section.metadata.keywords) {
          if (keyword.toLowerCase().includes(queryLower)) {
            score += 3;
          }
        }
      }

      if (score > 0) {
        results.push({
          section_id: section.id,
          type: section.type,
          title: section.title,
          content_preview: typeof section.content === 'string' 
            ? section.content.substring(0, 200) + '...'
            : `[${section.content?.type || 'structured'}]`,
          relevance_score: score,
          metadata: {
            importance: section.metadata?.importance,
            keywords: section.metadata?.keywords?.slice(0, 5)
          }
        });
      }
    }

    return {
      query,
      total_results: results.length,
      results: results
        .sort((a, b) => b.relevance_score - a.relevance_score)
        .slice(0, limit)
    };
  }

  async getSection({ section_id }) {
    const section = this.document.sections.find(s => s.id === section_id);
    if (!section) {
      throw new Error(`Section not found: ${section_id}`);
    }
    return section;
  }

  async getMetadata(params) {
    const stats = this.calculateDocumentStats();
    return {
      metadata: this.document.metadata,
      statistics: stats
    };
  }

  async findRelated({ section_id, relationship_type, limit = 5 }) {
    const section = this.document.sections.find(s => s.id === section_id);
    if (!section || !section.relationships) {
      return {
        reference_section: section_id,
        relationship_type: relationship_type || 'all',
        related_sections: []
      };
    }

    const related = [];
    const relationships = section.relationships;

    if (relationship_type && relationships[relationship_type]) {
      const targets = relationships[relationship_type];
      this.processRelationshipTargets(targets, relationship_type, related, limit);
    } else if (!relationship_type) {
      // Get all relationships
      for (const [relType, targets] of Object.entries(relationships)) {
        if (related.length >= limit) break;
        this.processRelationshipTargets(targets, relType, related, limit - related.length);
      }
    }

    return {
      reference_section: section_id,
      relationship_type: relationship_type || 'all',
      related_sections: related.slice(0, limit)
    };
  }

  async extractConcepts({ section_type, limit = 20 }) {
    const conceptFreq = new Map();
    
    for (const section of this.document.sections) {
      if (section_type && section.type !== section_type) continue;
      
      if (section.metadata?.keywords) {
        for (const keyword of section.metadata.keywords) {
          conceptFreq.set(keyword, (conceptFreq.get(keyword) || 0) + 1);
        }
      }
      
      // Also extract from tags if available
      if (this.document.metadata?.tags) {
        for (const tag of this.document.metadata.tags) {
          conceptFreq.set(tag, (conceptFreq.get(tag) || 0) + 1);
        }
      }
    }

    const concepts = Array.from(conceptFreq.entries())
      .map(([concept, frequency]) => ({ concept, frequency }))
      .sort((a, b) => b.frequency - a.frequency)
      .slice(0, limit);

    return {
      total_concepts: concepts.length,
      section_type: section_type || 'all',
      concepts: concepts
    };
  }

  async getOutline({ max_depth = 3 }) {
    const outline = [];
    const headings = this.document.sections
      .filter(s => s.type === 'heading')
      .sort((a, b) => (a.order || 0) - (b.order || 0));
    
    for (const heading of headings) {
      const level = heading.level || 1;
      if (level <= max_depth) {
        outline.push({
          id: heading.id,
          level: level,
          title: heading.title || (typeof heading.content === 'string' ? heading.content : 'Untitled'),
          children_count: this.countChildSections(heading.id),
          section_type: heading.type
        });
      }
    }

    return {
      document_title: this.document.metadata?.title,
      max_depth: max_depth,
      outline: outline
    };
  }

  // Resource implementations

  async getSectionsByType(sectionType) {
    const sections = this.document.sections.filter(s => 
      sectionType === 'all' || s.type === sectionType
    );

    return {
      uri: `sections://${sectionType}`,
      mimeType: 'application/json',
      content: {
        section_type: sectionType,
        count: sections.length,
        sections: sections.map(s => ({
          id: s.id,
          type: s.type,
          title: s.title,
          content_preview: typeof s.content === 'string' 
            ? s.content.substring(0, 100) + '...'
            : `[${s.content?.type}]`,
          metadata_preview: {
            importance: s.metadata?.importance,
            keywords: s.metadata?.keywords?.slice(0, 3)
          }
        }))
      }
    };
  }

  async getSectionRelationships(sectionId) {
    const section = this.document.sections.find(s => s.id === sectionId);
    if (!section) {
      throw new Error(`Section not found: ${sectionId}`);
    }

    return {
      uri: `relationships://${sectionId}`,
      mimeType: 'application/json',
      content: {
        section_id: sectionId,
        section_title: section.title,
        relationships: section.relationships || {},
        expanded_relationships: this.expandRelationships(section.relationships || {})
      }
    };
  }

  // Helper methods

  processRelationshipTargets(targets, relationshipType, results, limit) {
    if (Array.isArray(targets)) {
      for (const target of targets.slice(0, limit)) {
        if (results.length >= limit) break;
        
        if (typeof target === 'object' && target.section_id) {
          // Semantic similarity case
          const relatedSection = this.document.sections.find(s => s.id === target.section_id);
          if (relatedSection) {
            results.push({
              section_id: relatedSection.id,
              type: relatedSection.type,
              title: relatedSection.title,
              relationship: relationshipType,
              score: target.similarity_score
            });
          }
        } else if (typeof target === 'string') {
          // Simple ID reference
          const relatedSection = this.document.sections.find(s => s.id === target);
          if (relatedSection) {
            results.push({
              section_id: relatedSection.id,
              type: relatedSection.type,
              title: relatedSection.title,
              relationship: relationshipType
            });
          }
        }
      }
    } else if (typeof targets === 'string') {
      const relatedSection = this.document.sections.find(s => s.id === targets);
      if (relatedSection) {
        results.push({
          section_id: relatedSection.id,
          type: relatedSection.type,
          title: relatedSection.title,
          relationship: relationshipType
        });
      }
    }
  }

  expandRelationships(relationships) {
    const expanded = {};
    
    for (const [relType, targets] of Object.entries(relationships)) {
      if (Array.isArray(targets)) {
        expanded[relType] = targets.map(target => {
          if (typeof target === 'object' && target.section_id) {
            const section = this.document.sections.find(s => s.id === target.section_id);
            return {
              ...target,
              section_title: section?.title,
              section_type: section?.type
            };
          } else if (typeof target === 'string') {
            const section = this.document.sections.find(s => s.id === target);
            return {
              section_id: target,
              section_title: section?.title,
              section_type: section?.type
            };
          }
          return target;
        });
      } else if (typeof targets === 'string') {
        const section = this.document.sections.find(s => s.id === targets);
        expanded[relType] = {
          section_id: targets,
          section_title: section?.title,
          section_type: section?.type
        };
      } else {
        expanded[relType] = targets;
      }
    }
    
    return expanded;
  }

  countChildSections(headingId) {
    const heading = this.document.sections.find(s => s.id === headingId);
    if (!heading?.relationships?.children) return 0;
    
    const children = heading.relationships.children;
    return Array.isArray(children) ? children.length : 1;
  }

  calculateDocumentStats() {
    const sectionTypes = {};
    let withEmbeddings = 0;
    let withRelationships = 0;
    let totalWords = 0;

    for (const section of this.document.sections) {
      sectionTypes[section.type] = (sectionTypes[section.type] || 0) + 1;
      
      if (section.metadata?.embedding) withEmbeddings++;
      if (section.relationships) withRelationships++;
      
      if (typeof section.content === 'string') {
        totalWords += section.content.split(/\s+/).length;
      }
    }

    return {
      total_sections: this.document.sections.length,
      section_types: sectionTypes,
      sections_with_embeddings: withEmbeddings,
      sections_with_relationships: withRelationships,
      estimated_word_count: totalWords,
      document_format: this.document.format,
      document_version: this.document.version,
      last_modified: this.document.metadata?.modified
    };
  }
}

/**
 * Create MCP bridge from WASM binary
 */
export async function createMCPBridgeFromWasm(wasmBinary) {
  try {
    // This would be implemented with actual WASM instantiation
    // For now, return a placeholder that shows the intended interface
    
    console.log('🔧 Creating MCP bridge from WASM binary...');
    
    // In a real implementation:
    // 1. Instantiate the WASM module
    // 2. Extract the ADAM document data
    // 3. Create the bridge with the document
    
    return {
      wasmModule: null, // Would contain actual WASM instance
      createBridge: (adamDocument) => new BrowserMCPBridge(null, adamDocument)
    };
    
  } catch (error) {
    throw new Error(`Failed to create MCP bridge from WASM: ${error.message}`);
  }
}