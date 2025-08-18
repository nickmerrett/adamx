// Example: Creating a MAD document
import init, { MadBuilder, McpServer } from './pkg/mad_runtime.js';

async function createMadDocument() {
    // Initialize the WASM module
    await init();

    // Create a new document
    const builder = new MadBuilder("Research Paper: AI and Knowledge Graphs", "Dr. Jane Smith");

    // Add various types of content
    const textContentId = builder.add_text_content(
        "This paper explores the intersection of artificial intelligence and knowledge graphs...",
        "text/plain"
    );

    const htmlContentId = builder.add_html_content(`
        <h1>Introduction</h1>
        <p>Knowledge graphs have become increasingly important in AI applications...</p>
        <h2>Related Work</h2>
        <p>Previous research by <strong>John Doe</strong> and <strong>Alice Johnson</strong> has shown...</p>
    `);

    const markdownContentId = builder.add_markdown_content(`
# Methodology

## Data Collection
- Source 1: Academic papers from arXiv
- Source 2: Industry reports
- Source 3: Survey responses

## Analysis Framework
The analysis follows a three-stage process:
1. Data preprocessing
2. Entity extraction
3. Relationship mapping
    `);

    // Add vector embeddings (mock embeddings for example)
    const mockEmbedding = new Array(384).fill(0).map(() => Math.random());
    builder.add_vector_embedding(textContentId, mockEmbedding);

    // Create entities and relationships
    builder.create_entity("person_1", "Person", JSON.stringify({
        name: "John Doe",
        affiliation: "MIT",
        research_area: "Knowledge Graphs"
    }));

    builder.create_entity("person_2", "Person", JSON.stringify({
        name: "Alice Johnson", 
        affiliation: "Stanford",
        research_area: "Machine Learning"
    }));

    builder.create_entity("paper_1", "Publication", JSON.stringify({
        title: "Foundations of Knowledge Graphs",
        year: "2020",
        venue: "AAAI"
    }));

    // Create relationships
    builder.create_relationship("person_1", "paper_1", "AUTHORED", JSON.stringify({
        role: "first_author"
    }));

    builder.create_relationship("person_1", "person_2", "COLLABORATES_WITH", JSON.stringify({
        projects: ["KG Research Initiative"]
    }));

    // Add citations
    builder.add_citation(htmlContentId, "paper_1", "REFERENCES");

    // Auto-extract entities from content
    const extractedEntities = builder.auto_extract_entities(
        htmlContentId, 
        JSON.stringify(["PERSON", "ORGANIZATION"])
    );
    console.log("Extracted entities:", extractedEntities);

    // Build the document
    builder.build();

    // Get the completed document
    const document = builder.get_document();

    // Create MCP server for the document
    const mcpServer = new McpServer();
    mcpServer.set_document(document);

    console.log("Document created successfully!");
    console.log("Content hash:", document.calculate_content_hash());

    // Example MCP queries
    await testMcpQueries(mcpServer);

    return { document, mcpServer, builder };
}

async function testMcpQueries(mcpServer) {
    console.log("\n=== Testing MCP Queries ===");

    // Test search
    const searchRequest = {
        method: "tools/call",
        params: {
            name: "mad_search",
            arguments: { query: "knowledge graphs" }
        },
        id: "1"
    };

    const searchResponse = mcpServer.handle_request(JSON.stringify(searchRequest));
    console.log("Search results:", JSON.parse(searchResponse));

    // Test metadata
    const metadataRequest = {
        method: "tools/call", 
        params: {
            name: "mad_metadata",
            arguments: {}
        },
        id: "2"
    };

    const metadataResponse = mcpServer.handle_request(JSON.stringify(metadataRequest));
    console.log("Metadata:", JSON.parse(metadataResponse));

    // Test tools list
    const toolsRequest = {
        method: "tools/list",
        params: {},
        id: "3"
    };

    const toolsResponse = mcpServer.handle_request(JSON.stringify(toolsRequest));
    console.log("Available tools:", JSON.parse(toolsResponse));
}

// Example of sharing the document
async function shareDocument(builder, document) {
    const { SharingManager } = await import('./pkg/mad_runtime.js');
    
    const sharingManager = new SharingManager("peer_123", "/mad/storage");
    
    // Register the document
    const hash = document.calculate_content_hash();
    const manifest = builder.export_manifest();
    const manifestData = JSON.parse(manifest);
    
    sharingManager.register_document(
        hash,
        manifestData.document_metadata.title,
        manifestData.document_metadata.author,
        1024 * 1024 // 1MB example size
    );

    // Create share link
    const shareLink = sharingManager.create_share_link(hash, "read", 24); // 24 hours
    console.log("Share link:", shareLink);

    // Create portable package
    const portablePackage = sharingManager.export_portable_package(hash);
    console.log("Portable package info:", JSON.parse(portablePackage));

    // Generate IPFS hash for distributed storage
    const ipfsHash = sharingManager.generate_ipfs_hash(hash);
    console.log("IPFS hash:", ipfsHash);

    return sharingManager;
}

// Run the example
if (typeof window !== 'undefined') {
    // Browser environment
    window.createMadDocument = createMadDocument;
    window.shareDocument = shareDocument;
} else {
    // Node.js environment
    createMadDocument().then(({ document, mcpServer, builder }) => {
        console.log("Document creation completed");
        return shareDocument(builder, document);
    }).then((sharingManager) => {
        console.log("Sharing setup completed");
    }).catch(console.error);
}

export { createMadDocument, shareDocument };