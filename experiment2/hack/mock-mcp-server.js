#!/usr/bin/env node

/**
 * Mock MCP Server for testing the HTTP Bridge
 * This is a simple implementation that responds to basic MCP protocol messages
 */

process.stdin.setEncoding('utf8');
process.stdout.setEncoding('utf8');

let initialized = false;

// Handle incoming MCP messages
process.stdin.on('data', (data) => {
  const lines = data.toString().split('\n').filter(line => line.trim());
  
  for (const line of lines) {
    try {
      const request = JSON.parse(line);
      handleMCPRequest(request);
    } catch (error) {
      console.error(`Failed to parse request: ${line}`, error);
    }
  }
});

function handleMCPRequest(request) {
  const { jsonrpc, method, params, id } = request;
  
  let response;
  
  switch (method) {
    case 'initialize':
      initialized = true;
      response = {
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: '1.0',
          serverInfo: {
            name: 'mock-adam-server',
            version: '1.0.0'
          },
          capabilities: {
            tools: {},
            resources: {}
          }
        }
      };
      break;
      
    case 'tools/list':
      response = {
        jsonrpc: '2.0',
        id,
        result: {
          tools: [
            {
              name: 'search_content',
              description: 'Search ADAM document sections by content',
              inputSchema: {
                type: 'object',
                properties: {
                  query: { type: 'string', description: 'Search query' },
                  limit: { type: 'number', description: 'Max results', default: 10 }
                },
                required: ['query']
              }
            },
            {
              name: 'get_section',
              description: 'Get a specific section by ID',
              inputSchema: {
                type: 'object',
                properties: {
                  sectionId: { type: 'string', description: 'Section ID' }
                },
                required: ['sectionId']
              }
            },
            {
              name: 'list_headings',
              description: 'List all document headings',
              inputSchema: {
                type: 'object',
                properties: {
                  maxLevel: { type: 'number', description: 'Maximum heading level', default: 3 }
                }
              }
            }
          ]
        }
      };
      break;
      
    case 'tools/call':
      const toolName = params?.name;
      const toolArgs = params?.arguments || {};
      
      switch (toolName) {
        case 'search_content':
          response = {
            jsonrpc: '2.0',
            id,
            result: {
              content: [
                {
                  type: 'text',
                  text: `Mock search results for: "${toolArgs.query}"\n\nFound 3 matching sections:\n\n1. Section ID: abc-123\n   Type: heading\n   Content: "Terms and Conditions"\n   Level: 1\n\n2. Section ID: def-456\n   Type: paragraph\n   Content: "Important changes effective August 2025..."\n\n3. Section ID: ghi-789\n   Type: heading\n   Content: "Daily Limits"\n   Level: 2`
                }
              ]
            }
          };
          break;
          
        case 'get_section':
          response = {
            jsonrpc: '2.0',
            id,
            result: {
              content: [
                {
                  type: 'text',
                  text: `Mock section details for ID: ${toolArgs.sectionId}\n\nSection Type: heading\nLevel: 1\nTitle: "Terms and Conditions"\nContent: "Deposit accounts for personal customers (No longer available for sale) Terms and Conditions. Effective date: 22 April 2025"\n\nMetadata:\n- Importance: high\n- Keywords: ["terms", "conditions", "deposit", "accounts"]\n- Purpose: introduction`
                }
              ]
            }
          };
          break;
          
        case 'list_headings':
          response = {
            jsonrpc: '2.0',
            id,
            result: {
              content: [
                {
                  type: 'text',
                  text: `Document Outline (max level ${toolArgs.maxLevel || 3}):\n\n1. Terms and Conditions (Level 1)\n   1.1 Important Changes (Level 2)\n       1.1.1 Daily Limits (Level 3)\n   1.2 Section - Other Bank Charges (Level 2)\n   1.3 A guide to using your card (Level 2)\n\n2. Summary of Features and Benefits (Level 1)\n   2.1 Transaction Accounts (Level 2)\n   2.2 Interest rate types (Level 2)\n\n3. Westpac Acknowledgment (Level 1)`
                }
              ]
            }
          };
          break;
          
        default:
          response = {
            jsonrpc: '2.0',
            id,
            error: {
              code: -32601,
              message: `Unknown tool: ${toolName}`
            }
          };
      }
      break;
      
    case 'resources/list':
      response = {
        jsonrpc: '2.0',
        id,
        result: {
          resources: [
            {
              uri: 'adam://document/metadata',
              name: 'Document Metadata',
              description: 'ADAM document metadata and statistics',
              mimeType: 'application/json'
            },
            {
              uri: 'adam://document/outline',
              name: 'Document Outline',
              description: 'Hierarchical document structure',
              mimeType: 'application/json'
            }
          ]
        }
      };
      break;
      
    default:
      response = {
        jsonrpc: '2.0',
        id,
        error: {
          code: -32601,
          message: `Unknown method: ${method}`
        }
      };
  }
  
  if (response) {
    process.stdout.write(JSON.stringify(response) + '\n');
  }
}

// Handle process signals
process.on('SIGTERM', () => {
  console.error('Mock MCP server received SIGTERM');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.error('Mock MCP server received SIGINT');
  process.exit(0);
});

console.error('Mock MCP server started - waiting for initialization...');