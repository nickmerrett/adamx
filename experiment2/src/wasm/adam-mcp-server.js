import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListResourcesRequestSchema, ListToolsRequestSchema, ReadResourceRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { SimpleADAMPacker } from './simple-packer.js';

/**
 * ADAM MCP Server - Model Context Protocol server for ADAM documents embedded in WASM
 * 
 * Provides tools and resources for querying, searching, and analyzing ADAM documents
 * directly from WebAssembly binaries.
 */
export class ADAMMCPServer {
  constructor(wasmPath) {
    this.wasmPath = wasmPath;
    this.document = null;
    this.server = new Server(
      { name: 'adam-document-server', version: '1.0.0' },
      { capabilities: { tools: {}, resources: {} } }
    );
    
    this.setupTools();
    this.setupResources();
  }

  /**
   * Initialize the server by loading the ADAM document from WASM
   */
  async initialize() {
    try {
      const packer = new SimpleADAMPacker();
      this.document = await packer.unpack(this.wasmPath);
      console.log(`✅ Loaded ADAM document: ${this.document.metadata?.title || 'Untitled'}`);
      console.log(`📊 Sections: ${this.document.sections?.length || 0}`);
      return true;
    } catch (error) {
      console.error(`❌ Failed to load ADAM document: ${error.message}`);
      return false;
    }
  }

  /**
   * Setup MCP tools for document interaction
   */
  setupTools() {
    // Tool: Search sections by content
    this.server.tool('search_content', {
      description: 'Search ADAM document sections by content',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query text' },
          limit: { type: 'number', description: 'Maximum results to return', default: 10 },
          section_type: { type: 'string', description: 'Filter by section type (optional)' }
        },
        required: ['query']
      }
    }, async (request) => {
      if (!this.document) {
        throw new Error('Document not loaded');
      }

      const { query, limit = 10, section_type } = request.params.arguments;
      const results = this.searchContent(query, limit, section_type);
      
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            query,
            total_results: results.length,
            results: results.map(r => ({
              section_id: r.id,
              type: r.type,
              title: r.title,
              content_preview: typeof r.content === 'string' 
                ? r.content.substring(0, 200) + '...'
                : `[${r.content?.type || 'structured'}]`,
              relevance_score: r.score,
              metadata: {
                importance: r.metadata?.importance,
                keywords: r.metadata?.keywords?.slice(0, 5)
              }
            }))
          }, null, 2)
        }]
      };
    });

    // Tool: Get section by ID
    this.server.tool('get_section', {
      description: 'Retrieve a specific section by ID',
      inputSchema: {
        type: 'object',
        properties: {
          section_id: { type: 'string', description: 'Section ID to retrieve' }
        },
        required: ['section_id']
      }
    }, async (request) => {
      if (!this.document) {
        throw new Error('Document not loaded');
      }

      const { section_id } = request.params.arguments;
      const section = this.document.sections.find(s => s.id === section_id);
      
      if (!section) {
        throw new Error(`Section not found: ${section_id}`);
      }

      return {
        content: [{
          type: 'text',
          text: JSON.stringify(section, null, 2)
        }]
      };
    });

    // Tool: Get document metadata
    this.server.tool('get_metadata', {
      description: 'Get ADAM document metadata and statistics',
      inputSchema: {
        type: 'object',
        properties: {}
      }
    }, async (request) => {
      if (!this.document) {
        throw new Error('Document not loaded');
      }

      const stats = this.getDocumentStats();
      
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            metadata: this.document.metadata,
            statistics: stats
          }, null, 2)
        }]
      };
    });

    // Tool: Find related sections
    this.server.tool('find_related', {
      description: 'Find sections related to a given section ID',
      inputSchema: {
        type: 'object',
        properties: {
          section_id: { type: 'string', description: 'Reference section ID' },
          relationship_type: { 
            type: 'string', 
            description: 'Type of relationship to search for',
            enum: ['semantic_similarity', 'parent', 'children', 'follows', 'precedes', 'references']
          },
          limit: { type: 'number', description: 'Maximum results', default: 5 }
        },
        required: ['section_id']
      }
    }, async (request) => {
      if (!this.document) {
        throw new Error('Document not loaded');
      }

      const { section_id, relationship_type, limit = 5 } = request.params.arguments;
      const relatedSections = this.findRelatedSections(section_id, relationship_type, limit);
      
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            reference_section: section_id,
            relationship_type: relationship_type || 'all',
            related_sections: relatedSections
          }, null, 2)
        }]
      };
    });

    // Tool: Extract keywords and concepts
    this.server.tool('extract_concepts', {
      description: 'Extract key concepts and keywords from the document',
      inputSchema: {
        type: 'object',
        properties: {
          section_type: { type: 'string', description: 'Filter by section type (optional)' },
          limit: { type: 'number', description: 'Maximum concepts to return', default: 20 }
        }
      }
    }, async (request) => {
      if (!this.document) {
        throw new Error('Document not loaded');
      }

      const { section_type, limit = 20 } = request.params.arguments;
      const concepts = this.extractConcepts(section_type, limit);
      
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            total_concepts: concepts.length,
            concepts: concepts.slice(0, limit)
          }, null, 2)
        }]
      };
    });

    // Tool: Get document outline/structure
    this.server.tool('get_outline', {
      description: 'Get hierarchical outline of the document structure',
      inputSchema: {
        type: 'object',
        properties: {
          max_depth: { type: 'number', description: 'Maximum depth to show', default: 3 }
        }
      }
    }, async (request) => {
      if (!this.document) {
        throw new Error('Document not loaded');
      }

      const { max_depth = 3 } = request.params.arguments;
      const outline = this.buildDocumentOutline(max_depth);
      
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            document_title: this.document.metadata?.title,
            outline: outline
          }, null, 2)
        }]
      };
    });
  }

  /**
   * Setup MCP resources for document access
   */
  setupResources() {
    // Resource: Document sections by type
    this.server.resource('sections://{type}', {
      description: 'Access document sections by type',
      mimeType: 'application/json'
    }, async (request) => {
      if (!this.document) {
        throw new Error('Document not loaded');
      }

      const sectionType = request.params.path.replace('sections://', '');
      const sections = this.document.sections.filter(s => 
        sectionType === 'all' || s.type === sectionType
      );

      return {
        contents: [{
          uri: request.params.uri,
          mimeType: 'application/json',
          text: JSON.stringify({
            section_type: sectionType,
            count: sections.length,
            sections: sections.map(s => ({
              id: s.id,
              type: s.type,
              title: s.title,
              content_preview: typeof s.content === 'string' 
                ? s.content.substring(0, 100) + '...'
                : `[${s.content?.type}]`
            }))
          }, null, 2)
        }]
      };
    });

    // Resource: Document metadata
    this.server.resource('metadata://document', {
      description: 'Complete document metadata',
      mimeType: 'application/json'
    }, async (request) => {
      if (!this.document) {
        throw new Error('Document not loaded');
      }

      return {
        contents: [{
          uri: request.params.uri,
          mimeType: 'application/json',
          text: JSON.stringify(this.document.metadata, null, 2)
        }]
      };
    });

    // Resource: Section relationships
    this.server.resource('relationships://{section_id}', {
      description: 'Get relationships for a specific section',
      mimeType: 'application/json'
    }, async (request) => {
      if (!this.document) {
        throw new Error('Document not loaded');
      }

      const sectionId = request.params.path.replace('relationships://', '');
      const section = this.document.sections.find(s => s.id === sectionId);
      
      if (!section) {
        throw new Error(`Section not found: ${sectionId}`);
      }

      return {
        contents: [{
          uri: request.params.uri,
          mimeType: 'application/json',
          text: JSON.stringify({
            section_id: sectionId,
            relationships: section.relationships || {},
            expanded_relationships: this.expandRelationships(section.relationships || {})
          }, null, 2)
        }]
      };
    });
  }

  /**
   * Search document content
   */
  searchContent(query, limit, sectionType) {
    const queryLower = query.toLowerCase();
    const results = [];

    for (const section of this.document.sections) {
      if (sectionType && section.type !== sectionType) continue;

      let score = 0;
      const contentText = typeof section.content === 'string' 
        ? section.content 
        : JSON.stringify(section.content);
      
      // Content matching
      const contentLower = contentText.toLowerCase();
      if (contentLower.includes(queryLower)) {
        score += 10;
        // Boost score for exact phrase matches
        if (contentLower.indexOf(queryLower) !== -1) {
          score += 5;
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
        results.push({ ...section, score });
      }
    }

    // Sort by score and limit results
    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  /**
   * Find sections related to a given section
   */
  findRelatedSections(sectionId, relationshipType, limit) {
    const section = this.document.sections.find(s => s.id === sectionId);
    if (!section || !section.relationships) {
      return [];
    }

    const related = [];
    const relationships = section.relationships;

    if (relationshipType) {
      // Get specific relationship type
      const targets = relationships[relationshipType];
      if (targets) {
        if (Array.isArray(targets)) {
          for (const target of targets.slice(0, limit)) {
            if (typeof target === 'object' && target.section_id) {
              // Semantic similarity case
              const relatedSection = this.document.sections.find(s => s.id === target.section_id);
              if (relatedSection) {
                related.push({
                  section_id: relatedSection.id,
                  type: relatedSection.type,
                  title: relatedSection.title,
                  relationship: relationshipType,
                  score: target.similarity_score
                });
              }
            } else {
              // Simple ID reference
              const relatedSection = this.document.sections.find(s => s.id === target);
              if (relatedSection) {
                related.push({
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
            related.push({
              section_id: relatedSection.id,
              type: relatedSection.type,
              title: relatedSection.title,
              relationship: relationshipType
            });
          }
        }
      }
    } else {
      // Get all relationships
      for (const [relType, targets] of Object.entries(relationships)) {
        if (Array.isArray(targets)) {
          for (const target of targets) {
            if (related.length >= limit) break;
            // Handle both semantic similarity objects and simple IDs
            const targetId = typeof target === 'object' ? target.section_id : target;
            const relatedSection = this.document.sections.find(s => s.id === targetId);
            if (relatedSection) {
              related.push({
                section_id: relatedSection.id,
                type: relatedSection.type,
                title: relatedSection.title,
                relationship: relType,
                score: target.similarity_score
              });
            }
          }
        }
      }
    }

    return related.slice(0, limit);
  }

  /**
   * Extract key concepts from document
   */
  extractConcepts(sectionType, limit) {
    const conceptFreq = new Map();
    
    for (const section of this.document.sections) {
      if (sectionType && section.type !== sectionType) continue;
      
      if (section.metadata?.keywords) {
        for (const keyword of section.metadata.keywords) {
          conceptFreq.set(keyword, (conceptFreq.get(keyword) || 0) + 1);
        }
      }
    }

    return Array.from(conceptFreq.entries())
      .map(([concept, frequency]) => ({ concept, frequency }))
      .sort((a, b) => b.frequency - a.frequency)
      .slice(0, limit);
  }

  /**
   * Build document outline from headings
   */
  buildDocumentOutline(maxDepth) {
    const outline = [];
    const headings = this.document.sections.filter(s => s.type === 'heading');
    
    for (const heading of headings) {
      const level = heading.level || 1;
      if (level <= maxDepth) {
        outline.push({
          id: heading.id,
          level: level,
          title: heading.title || (typeof heading.content === 'string' ? heading.content : 'Untitled'),
          children_count: this.countChildSections(heading.id)
        });
      }
    }

    return outline;
  }

  /**
   * Count child sections for a heading
   */
  countChildSections(headingId) {
    const heading = this.document.sections.find(s => s.id === headingId);
    if (!heading?.relationships?.children) return 0;
    
    const children = heading.relationships.children;
    return Array.isArray(children) ? children.length : 1;
  }

  /**
   * Get document statistics
   */
  getDocumentStats() {
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
      document_version: this.document.version
    };
  }

  /**
   * Expand relationship IDs to include section details
   */
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
          } else {
            const section = this.document.sections.find(s => s.id === target);
            return {
              section_id: target,
              section_title: section?.title,
              section_type: section?.type
            };
          }
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

  /**
   * Start the MCP server
   */
  async start() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
  }
}

/**
 * Create and start ADAM MCP Server
 */
export async function createADAMMCPServer(wasmPath) {
  const server = new ADAMMCPServer(wasmPath);
  
  if (await server.initialize()) {
    console.log('🚀 Starting ADAM MCP Server...');
    await server.start();
    console.log('✅ ADAM MCP Server running');
  } else {
    console.error('❌ Failed to initialize ADAM MCP Server');
    process.exit(1);
  }
}