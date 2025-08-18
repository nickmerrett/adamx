# Agent-Optimized Document Format (ADF)

A JSON-based document format designed specifically for optimal processing by AI agents and Large Language Models (LLMs). This format breaks documents into granular sections with rich metadata, vector embeddings, and comprehensive support for multimedia content.

## 🎯 Purpose

Traditional document formats like PDF, DOCX, or HTML are optimized for human consumption. ADF is designed for:

- **AI/Agent Processing**: Structured for efficient parsing and understanding by AI systems
- **Granular Access**: Section-based architecture enables precise content retrieval
- **Semantic Understanding**: Rich metadata and embeddings support semantic search and analysis
- **Multimodal Content**: Native support for text, images, tables, and other content types
- **Graph Relationships**: Document sections can reference and relate to each other

## 📋 Schema Overview

### Core Structure

```json
{
  "format": "agent-document",
  "version": "1.0.0",
  "metadata": { /* Rich document metadata */ },
  "sections": [ /* Array of content sections */ ],
  "index": { /* Optional indexes for fast lookup */ }
}
```

### Section Types

- **Text Content**: `paragraph`, `heading`, `list`, `quote`, `code`
- **Visual Content**: `image`, `figure`, `diagram`, `chart`
- **Structured Data**: `table`, `math`
- **Custom**: `custom` for domain-specific content

## 🔧 Key Features

### 1. Rich Metadata System

**Document-level metadata** includes:
- Author information with roles and affiliations
- Publishing details (version, license, copyright)
- Classification and categorization
- Quality metrics and confidence scores
- Source references and citations
- Processing history and validation status

**Section-level metadata** provides:
- Content analysis (complexity, concepts, entities)
- Quality assessments (completeness, accuracy, clarity)
- Temporal information (creation, modification, expiration)
- Processing flags and confidence scores
- Rich annotations and comments

### 2. Vector Embeddings

- **Text embeddings**: Semantic vectors for each section's content
- **Visual embeddings**: Image similarity vectors using models like CLIP
- **Embedding validation**: Content hashes for cache invalidation
- **Similarity relationships**: Pre-computed semantic similarity scores

### 3. Graph Relationships

Sections can be connected through:
- **Hierarchical**: Parent-child relationships
- **Dependencies**: Required prerequisite sections  
- **References**: Internal and external links
- **Semantic similarity**: AI-computed content relationships

### 4. Image Support

Comprehensive image handling with:
- **Storage options**: URLs, file paths, or base64 encoding
- **AI analysis**: Generated descriptions, OCR text extraction
- **Visual elements**: Object detection with bounding boxes
- **Color analysis**: Dominant colors and palette extraction
- **Multiple formats**: JPEG, PNG, GIF, WebP, SVG, PDF support
- **Thumbnails**: Generated previews in various sizes

### 5. Table Support

Structured table representation featuring:
- **Rich headers**: Typed columns with descriptions and formatting
- **Cell metadata**: Individual cell properties, spanning, styling
- **Statistical analysis**: Automatic computation of column statistics
- **Data relationships**: Primary/foreign key definitions
- **Extraction tracking**: Source format and confidence scores
- **Accessibility**: Screen reader descriptions and key insights

## 🚀 Usage Examples

### Basic Text Section

```json
{
  "id": "intro-1",
  "type": "paragraph", 
  "content": "Machine learning enables computers to learn from data...",
  "metadata": {
    "importance": "high",
    "keywords": ["machine learning", "AI", "data"],
    "embedding": [0.15, -0.18, 0.25, 0.08],
    "complexity": "moderate"
  }
}
```

### Image Section

```json
{
  "id": "fig-1",
  "type": "figure",
  "content": {"type": "image", "data": "ML workflow diagram"},
  "image": {
    "src": "data:image/png;base64,...",
    "alt_text": "Diagram showing ML workflow steps",
    "generated_description": "Flowchart with data input, training, and prediction",
    "visual_embedding": [0.2, -0.1, 0.4, 0.15],
    "visual_elements": [
      {
        "type": "text", 
        "label": "Training Data",
        "confidence": 0.95,
        "bounding_box": {"x": 0.1, "y": 0.2, "width": 0.15, "height": 0.1}
      }
    ]
  }
}
```

### Table Section

```json
{
  "id": "table-1",
  "type": "table",
  "table": {
    "headers": [
      {"text": "Algorithm", "data_type": "text"},
      {"text": "Accuracy", "data_type": "percentage"}
    ],
    "data": [
      [
        {"value": "Random Forest", "data_type": "text"},
        {"value": 0.92, "formatted_value": "92%", "data_type": "percentage"}
      ]
    ],
    "statistics": {
      "numeric_columns": [1],
      "column_stats": [{"column_index": 1, "mean": 0.92}]
    }
  }
}
```

## 🔍 Search and Indexing

The format supports multiple indexing strategies:

### Vector Search
- Semantic similarity using embedding vectors
- Cross-modal search (text-to-image, image-to-text)
- Content clustering and recommendation

### Metadata Search  
- Keyword and tag-based filtering
- Importance and quality scoring
- Temporal and freshness-based ranking

### Structured Search
- Entity-based queries
- Table data filtering and aggregation
- Graph traversal and relationship queries

## 🛠️ Implementation Guide

### Validation

Use the provided JSON Schema (`agent-document-schema.json`) to validate documents:

```bash
# Using ajv-cli
ajv validate -s agent-document-schema.json -d your-document.json
```

### Creating Documents

1. **Start with metadata**: Define document properties and embedding configuration
2. **Section by section**: Break content into logical paragraph-sized chunks
3. **Add relationships**: Link related sections together
4. **Generate embeddings**: Create vectors for semantic search
5. **Build indexes**: Create lookup structures for performance

### Processing Pipeline

Typical document processing workflow:

```
Raw Content → Section Extraction → Metadata Generation → 
Embedding Creation → Relationship Detection → Validation → Storage
```

## 📊 Performance Considerations

### Storage
- **Embeddings**: Can significantly increase file size
- **Images**: Base64 encoding vs external references
- **Compression**: JSON compression recommended for large documents

### Processing
- **Lazy loading**: Load sections on demand
- **Caching**: Cache embeddings and computed metadata  
- **Indexing**: Pre-build indexes for frequent queries
- **Validation**: Validate incrementally during creation

## 🔧 Extensibility

The format is designed for extensibility:

### Custom Fields
- `custom` objects at document and section levels
- `additionalProperties: true` allows any custom fields
- Domain-specific extensions encouraged

### Custom Content Types
- `custom` section type for specialized content
- Structured content data field for complex types
- Plugin architecture for processing custom types

### Integration Points
- External identifier mappings
- Processing pipeline hooks
- Custom embedding models
- Specialized analysis tools

## 🎯 Use Cases

### Document Analysis
- Academic paper processing
- Technical documentation analysis  
- Legal document review
- Content quality assessment

### Knowledge Management
- Corporate knowledge bases
- Research repositories
- Educational content systems
- FAQ and support documentation

### AI Training
- Dataset preparation for language models
- Multimodal training data curation
- Knowledge graph construction
- Semantic search system development

### Content Creation
- AI-assisted writing tools
- Automated document generation
- Content recommendation systems
- Cross-document analysis tools

## 📄 Schema Reference

### Required Fields
- `format`: Must be "agent-document"
- `version`: Semantic version string
- `metadata.title`: Document title
- `metadata.created`: Creation timestamp
- `metadata.modified`: Last modification timestamp
- `sections`: Array of content sections (minimum 1)

### Section Required Fields
- `id`: Unique section identifier
- `type`: Section content type
- `content`: Section content (text or structured)

## 🤝 Contributing

This is an evolving format designed to meet the needs of the AI/agent community. Contributions and feedback are welcome for:

- Additional content types
- Metadata enhancements  
- Performance optimizations
- Use case examples
- Integration tools

## 📚 Examples

See the complete example in `agent-document-schema.json` showing a machine learning tutorial with:
- Rich document metadata
- Text sections with embeddings
- Image with AI analysis
- Comparison table with statistics
- Cross-section relationships

## 🔗 Related Standards

- **JSON Schema**: Used for format validation
- **Dublin Core**: Metadata inspiration
- **Schema.org**: Structured data concepts
- **IIIF**: Image handling approaches
- **OpenAPI**: API documentation patterns

---

*Agent-Optimized Document Format - Designed for the AI-first future of content processing*