# MCP Test Harness

A standalone web-based test harness for interacting with stdio-based MCP servers using ADAM files via HTTP bridge.

## Architecture

```
Web Browser → HTTP Bridge → stdio MCP Server
     ↑              ↑              ↑
Test Harness   Express.js    ADAM MCP Server
```

## Components

### 1. MCP HTTP Bridge (`mcp-http-bridge.js`)
- Express.js server that bridges HTTP requests to stdio MCP servers
- Spawns and manages MCP server processes
- Translates HTTP API calls to JSON-RPC stdio communication
- Handles request queuing and timeouts

### 2. Test Harness (`mcp-test-harness.html`)
- Web-based UI for testing MCP tools
- ADAM file loading (WASM/JSON)
- Tool discovery and parameter input
- Real-time communication logging

## Setup

1. **Install dependencies:**
   ```bash
   cd hack
   npm install
   ```

2. **Start the HTTP Bridge:**
   ```bash
   npm start
   # or
   node mcp-http-bridge.js
   ```

3. **Open test harness:**
   Open `mcp-test-harness.html` in a web browser

## Usage

1. **Start HTTP Bridge**: Run `node mcp-http-bridge.js` (default port 8080)
2. **Load ADAM file**: Upload ADAM WASM or JSON file in browser
3. **Connect**: Click "Connect to MCP Server" (connects to bridge)
4. **Start MCP Server**: Bridge automatically starts stdio MCP server
5. **List Tools**: Discover available MCP tools
6. **Execute Tools**: Select tool, fill parameters, execute

## HTTP Bridge Endpoints

### Server Management
- `POST /mcp/start` - Start stdio MCP server
- `POST /mcp/stop` - Stop MCP server
- `GET /mcp/status` - Server status
- `GET /health` - Bridge health check

### MCP Communication
- `POST /mcp/request` - Send raw JSON-RPC request
- `GET /mcp/tools` - List available tools
- `POST /mcp/tools/:name` - Execute specific tool
- `GET /mcp/resources` - List resources

## Configuration

### HTTP Bridge Options
```javascript
const bridge = new MCPHttpBridge({
  port: 8080,                    // Bridge port
  host: 'localhost',             // Bridge host
  timeout: 30000,                // Request timeout (ms)
  maxConcurrentRequests: 10,     // Max concurrent requests
  corsEnabled: true              // Enable CORS
});
```

### Environment Variables
- `BRIDGE_PORT` - HTTP bridge port (default: 8080)
- `BRIDGE_HOST` - HTTP bridge host (default: localhost)

## ADAM File Support

- **WASM Files**: Extracts ADAM JSON from WASM memory
- **JSON Files**: Direct ADAM JSON parsing
- **Mock Data**: Fallback for testing when parsing fails

## MCP Server Integration

The bridge expects stdio-based MCP servers that communicate via:
- **stdin**: JSON-RPC requests (one per line)
- **stdout**: JSON-RPC responses (one per line)
- **stderr**: Error/debug output

Example MCP server command:
```bash
node src/wasm/adam-mcp-server.js path/to/adam-file.wasm
```

## Error Handling

- **Connection failures**: Clear error messages with troubleshooting
- **Request timeouts**: Configurable timeout with cleanup
- **Server crashes**: Automatic reconnection attempts
- **Invalid requests**: JSON-RPC error responses

## Development

### Running in Development
```bash
npm run dev  # Watches for changes
```

### Testing
1. Start bridge: `npm start`
2. Open `mcp-test-harness.html` in browser
3. Test with sample ADAM files

### Debugging
- Bridge logs all requests/responses to console
- Test harness logs all communication in web UI
- Enable verbose logging by setting `DEBUG=1`

## ADAM Document Viewer

### Overview
`adam-document-viewer.html` - A standalone web tool for rendering ADAM documents in a human-readable format.

### Features
- **Document Upload**: Drag & drop ADAM WASM or JSON files
- **Rich Text Rendering**: Beautiful typography and layout for document content
- **Table of Contents**: Auto-generated navigation with smooth scrolling
- **Search**: Real-time text search with highlighting
- **Metadata Display**: Document and section metadata in sidebar
- **Relationships**: Visual display of document relationships
- **Statistics**: Word count, section count, and relationship metrics
- **Responsive Design**: Works on desktop and mobile devices

### Usage
1. Open `adam-document-viewer.html` in any web browser
2. Upload an ADAM document (WASM or JSON format)
3. Browse sections using the table of contents
4. Search for specific text using the search box
5. View metadata and relationships in the sidebar

### Document Structure Support
- **Sections**: Automatically numbered with titles and content
- **Metadata**: Document-level and section-level metadata
- **Relationships**: Cross-references and links between sections
- **Content Formatting**: Automatic paragraph detection and formatting

### File Format Support
- **ADAM WASM**: Extracts JSON data from WebAssembly memory
- **ADAM JSON**: Direct JSON parsing
- **Fallback**: Graceful error handling for invalid formats