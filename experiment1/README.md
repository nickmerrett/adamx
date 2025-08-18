# MAD Format (Multi-Agent Document)

A self-contained, immutable document format that encapsulates human-readable content alongside AI-optimized data structures, served via WebAssembly and MCP (Model Context Protocol).

## Overview

MAD documents combine:
- **Human-readable content** (like PDF rendering)
- **Vector embeddings** for semantic search
- **Knowledge graphs** for relationship mapping
- **MCP server** for programmatic access
- **Content addressing** for immutability and sharing

## Architecture

```
┌─────────────────────────────────────┐
│           MAD Container             │
│  ┌─────────────────────────────────┐│
│  │        WASM Runtime             ││
│  │  ┌─────────────────────────────┐││
│  │  │     Content Database        │││
│  │  │  - Document text/HTML       │││
│  │  │  - Images/media assets      │││
│  │  │  - Full-text search         │││
│  │  └─────────────────────────────┘││
│  │  ┌─────────────────────────────┐││
│  │  │     Vector Database         │││
│  │  │  - Text embeddings          │││
│  │  │  - Semantic similarity      │││
│  │  └─────────────────────────────┘││
│  │  ┌─────────────────────────────┐││
│  │  │     Graph Database          │││
│  │  │  - Entity relationships     │││
│  │  │  - Knowledge graphs         │││
│  │  │  - Citation networks        │││
│  │  └─────────────────────────────┘││
│  │  ┌─────────────────────────────┐││
│  │  │      MCP Server             │││
│  │  │  - Query interface          │││
│  │  │  - Tool definitions         │││
│  │  └─────────────────────────────┘││
│  └─────────────────────────────────┘│
└─────────────────────────────────────┘
```

## Key Features

### 🔒 Immutability & Content Addressing
- Each document has a unique SHA-256 content hash
- Changes create new documents with new hashes
- Cryptographic integrity verification
- Content deduplication via hash comparison

### 🤖 AI-First Design
- Vector embeddings for semantic search
- Knowledge graph for relationship queries
- Entity extraction and relationship mapping
- Full-text search with metadata

### 🌐 Distributed Sharing
- IPFS integration for distributed storage
- BitTorrent-style P2P sharing
- Content-addressed networking
- Offline-first with sync capabilities

### 🔧 MCP Integration
- Embedded MCP server in each document
- Standardized tool interface for AI agents
- Query capabilities across all data modalities
- Export functions for various formats

## PDF to MAD Conversion Tool

The `tools/` directory contains a Python-based conversion tool that uses IBM's Docling to convert PDF documents into MAD format.

### Installation

```bash
cd tools/
./install_deps.sh
```

This installs:
- **Docling**: IBM's AI-powered PDF conversion toolkit
- **sentence-transformers**: For generating vector embeddings
- **spaCy**: For NLP entity extraction

### Converting PDFs

```bash
# Basic conversion
python3 pdf_to_mad.py document.pdf

# With custom output directory and metadata
python3 pdf_to_mad.py document.pdf -o output_folder -t "Custom Title" -a "Author Name"

# Test with arXiv paper
python3 example_usage.py --arxiv
```

### Features

- **Advanced PDF parsing** via Docling's AI models
- **Automatic text extraction** with layout preservation
- **Entity recognition** using spaCy NLP
- **Vector embeddings** for semantic search
- **Knowledge graph generation** from extracted entities
- **Multi-format export** (HTML, Markdown, JSON)

## Usage

### Building from Source

```bash
# Install Rust and wasm-pack
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
cargo install wasm-pack

# Build the WASM module
cd mad/
wasm-pack build --target web --out-dir pkg
```

### Creating a MAD Document

```javascript
import init, { MadBuilder } from './pkg/mad_runtime.js';

// Initialize WASM
await init();

// Create document
const builder = new MadBuilder("My Document", "Author Name");

// Add content
const contentId = builder.add_html_content(`
    <h1>Introduction</h1>
    <p>This is my document content...</p>
`);

// Add vector embedding
const embedding = [0.1, 0.2, 0.3, ...]; // Your embedding vector
builder.add_vector_embedding(contentId, embedding);

// Create knowledge graph
builder.create_entity("entity1", "Person", JSON.stringify({
    name: "John Doe",
    role: "Researcher"
}));

// Build document
builder.build();
const document = builder.get_document();
```

### Querying via MCP

```javascript
import { McpServer } from './pkg/mad_runtime.js';

const mcpServer = new McpServer();
mcpServer.set_document(document);

// Search content
const searchRequest = {
    method: "tools/call",
    params: {
        name: "mad_search",
        arguments: { query: "research" }
    }
};

const response = mcpServer.handle_request(JSON.stringify(searchRequest));
console.log(JSON.parse(response));
```

### Sharing Documents

```javascript
import { SharingManager } from './pkg/mad_runtime.js';

const sharingManager = new SharingManager("peer_id", "/storage/path");

// Register document
const hash = document.calculate_content_hash();
sharingManager.register_document(hash, "Title", "Author", fileSize);

// Create share link
const shareLink = sharingManager.create_share_link(hash, "read", 24);
console.log("Share link:", shareLink);

// Export for distribution
const package = sharingManager.export_portable_package(hash);
const ipfsHash = sharingManager.generate_ipfs_hash(hash);
```

## MCP Tools

MAD documents expose these MCP tools:

### `mad_search`
Full-text search across document content
```json
{
    "query": "search terms"
}
```

### `mad_vector_search`
Semantic similarity search using embeddings
```json
{
    "embedding": [0.1, 0.2, ...],
    "top_k": 5
}
```

### `mad_graph_query`
Knowledge graph traversal and relationship queries
```json
{
    "node_id": "entity1",
    "relationship": "RELATED_TO",
    "depth": 2
}
```

### `mad_export`
Export content in various formats
```json
{
    "format": "html|markdown|json|pdf",
    "include_metadata": true
}
```

### `mad_metadata`
Get document metadata and statistics
```json
{}
```

## File Format

```
document.mad
├── manifest.json          # Document metadata
├── content.db             # SQLite with content + FTS
├── vectors.db             # Vector embeddings
├── graph.db               # Knowledge graph
├── runtime.wasm           # WASM runtime + MCP server
└── checksum.sha256        # Integrity verification
```

## Sharing Protocols

### Content-Addressed URLs
```
mad://[content-hash]                    # Direct content access
mad://share/[encoded-share-request]     # Shareable links
mad://peer/[peer-id]/[content-hash]     # Peer-specific access
```

### P2P Distribution
- IPFS integration for content-addressed storage
- BitTorrent protocol for efficient distribution
- DHT-based peer discovery
- Redundancy and availability tracking

## Security & Privacy

- Content integrity via cryptographic hashing
- Optional encryption for sensitive documents
- Peer-to-peer sharing without central authority
- Granular access controls (read, annotate, fork)

## Roadmap

- [ ] Real-time collaboration features
- [ ] Advanced NLP entity extraction
- [ ] Blockchain-based provenance tracking
- [ ] Integration with major AI frameworks
- [ ] Mobile and desktop applications

## Contributing

This is a proof-of-concept implementation. Contributions welcome for:
- Performance optimizations
- Additional export formats
- Enhanced sharing protocols
- Security improvements

## License

MIT License - see LICENSE file for details.