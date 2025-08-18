# MAD Format Specification
## Multi-Agent Document (MAD) Format v1.0

### Overview
MAD is a self-contained, immutable document format that encapsulates:
- Human-readable content (PDF-like rendering)
- Vector embeddings for semantic search
- Graph relationships for knowledge mapping
- Metadata and provenance information

### Architecture
```
┌─────────────────────────────────────┐
│           MAD Container             │
│  ┌─────────────────────────────────┐│
│  │        WASM Runtime             ││
│  │  ┌─────────────────────────────┐││
│  │  │     Content Database        │││
│  │  │  - Document text/HTML       │││
│  │  │  - Images/media assets      │││
│  │  │  - Metadata                 │││
│  │  └─────────────────────────────┘││
│  │  ┌─────────────────────────────┐││
│  │  │     Vector Database         │││
│  │  │  - Text embeddings          │││
│  │  │  - Image embeddings         │││
│  │  │  - Semantic indices         │││
│  │  └─────────────────────────────┘││
│  │  ┌─────────────────────────────┐││
│  │  │     Graph Database          │││
│  │  │  - Entity relationships     │││
│  │  │  - Citation networks        │││
│  │  │  - Knowledge graphs         │││
│  │  └─────────────────────────────┘││
│  │  ┌─────────────────────────────┐││
│  │  │      MCP Server             │││
│  │  │  - Query interface          │││
│  │  │  - Export functions         │││
│  │  │  - Access control           │││
│  │  └─────────────────────────────┘││
│  └─────────────────────────────────┘│
└─────────────────────────────────────┘
```

### File Format Structure
```
mad_document.mad
├── manifest.json          # Document metadata and schema version
├── content.db             # SQLite database with document content
├── vectors.db             # Vector database (e.g., Chroma/DuckDB)
├── graph.db               # Graph database (e.g., embedded Neo4j)
├── runtime.wasm           # WASM runtime with embedded MCP server
└── checksum.sha256        # Content integrity verification
```

### Content Addressing & Immutability
- Each MAD document has a unique content hash (SHA-256)
- Changes create new documents with new hashes
- Content is cryptographically signed for integrity
- Supports content deduplication via hash comparison

### MCP Interface
The embedded MCP server provides:
- `mad://query` - Full-text and semantic search
- `mad://graph` - Graph traversal and relationship queries  
- `mad://export` - Content export in various formats
- `mad://metadata` - Document metadata and provenance
- `mad://render` - Human-readable content rendering

### Sharing & Distribution
- Content-addressed storage enables P2P sharing
- IPFS/BitTorrent integration for distributed access
- Atomic updates via content hashing
- Offline-first design with sync capabilities