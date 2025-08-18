use wasm_bindgen::prelude::*;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Serialize, Deserialize)]
pub struct McpRequest {
    pub method: String,
    pub params: HashMap<String, serde_json::Value>,
    pub id: Option<String>,
}

#[derive(Serialize, Deserialize)]
pub struct McpResponse {
    pub result: Option<serde_json::Value>,
    pub error: Option<McpError>,
    pub id: Option<String>,
}

#[derive(Serialize, Deserialize)]
pub struct McpError {
    pub code: i32,
    pub message: String,
}

#[derive(Serialize, Deserialize)]
pub struct Tool {
    pub name: String,
    pub description: String,
    pub input_schema: serde_json::Value,
}

#[derive(Serialize, Deserialize)]
pub struct Resource {
    pub uri: String,
    pub name: String,
    pub description: String,
    pub mime_type: String,
}

#[wasm_bindgen]
pub struct McpServer {
    document: Option<crate::MadDocument>,
    tools: Vec<Tool>,
    resources: Vec<Resource>,
}

#[wasm_bindgen]
impl McpServer {
    #[wasm_bindgen(constructor)]
    pub fn new() -> McpServer {
        let mut server = McpServer {
            document: None,
            tools: Vec::new(),
            resources: Vec::new(),
        };
        server.init_tools();
        server
    }

    fn init_tools(&mut self) {
        // Initialize MCP tools for document access
        self.tools.push(Tool {
            name: "mad_search".to_string(),
            description: "Search document content using full-text search".to_string(),
            input_schema: serde_json::json!({
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "Search query"
                    }
                },
                "required": ["query"]
            }),
        });

        self.tools.push(Tool {
            name: "mad_vector_search".to_string(),
            description: "Search document content using vector similarity".to_string(),
            input_schema: serde_json::json!({
                "type": "object",
                "properties": {
                    "embedding": {
                        "type": "array",
                        "items": {"type": "number"},
                        "description": "Query embedding vector"
                    },
                    "top_k": {
                        "type": "integer",
                        "description": "Number of results to return",
                        "default": 5
                    }
                },
                "required": ["embedding"]
            }),
        });

        self.tools.push(Tool {
            name: "mad_graph_query".to_string(),
            description: "Query the document's knowledge graph".to_string(),
            input_schema: serde_json::json!({
                "type": "object",
                "properties": {
                    "node_id": {
                        "type": "string",
                        "description": "Starting node ID for graph traversal"
                    },
                    "relationship": {
                        "type": "string",
                        "description": "Relationship type to follow"
                    },
                    "depth": {
                        "type": "integer",
                        "description": "Maximum traversal depth",
                        "default": 1
                    }
                }
            }),
        });

        self.tools.push(Tool {
            name: "mad_export".to_string(),
            description: "Export document content in various formats".to_string(),
            input_schema: serde_json::json!({
                "type": "object",
                "properties": {
                    "format": {
                        "type": "string",
                        "enum": ["html", "markdown", "json", "pdf"],
                        "description": "Export format"
                    },
                    "include_metadata": {
                        "type": "boolean",
                        "description": "Include document metadata",
                        "default": true
                    }
                },
                "required": ["format"]
            }),
        });

        self.tools.push(Tool {
            name: "mad_metadata".to_string(),
            description: "Get document metadata and statistics".to_string(),
            input_schema: serde_json::json!({
                "type": "object",
                "properties": {},
                "additionalProperties": false
            }),
        });
    }

    #[wasm_bindgen]
    pub fn set_document(&mut self, document: crate::MadDocument) {
        self.document = Some(document);
        self.update_resources();
    }

    fn update_resources(&mut self) {
        self.resources.clear();
        if let Some(ref doc) = self.document {
            let metadata = doc.get_metadata();
            if let Ok(meta) = serde_json::from_str::<crate::DocumentMetadata>(&metadata) {
                self.resources.push(Resource {
                    uri: format!("mad://{}/content", meta.id),
                    name: format!("{} - Content", meta.title),
                    description: "Document content and media".to_string(),
                    mime_type: "application/vnd.mad.content".to_string(),
                });

                self.resources.push(Resource {
                    uri: format!("mad://{}/vectors", meta.id),
                    name: format!("{} - Vector Index", meta.title),
                    description: "Vector embeddings for semantic search".to_string(),
                    mime_type: "application/vnd.mad.vectors".to_string(),
                });

                self.resources.push(Resource {
                    uri: format!("mad://{}/graph", meta.id),
                    name: format!("{} - Knowledge Graph", meta.title),
                    description: "Entity relationships and knowledge graph".to_string(),
                    mime_type: "application/vnd.mad.graph".to_string(),
                });
            }
        }
    }

    #[wasm_bindgen]
    pub fn handle_request(&self, request_json: &str) -> String {
        let request: McpRequest = match serde_json::from_str(request_json) {
            Ok(req) => req,
            Err(e) => {
                return serde_json::to_string(&McpResponse {
                    result: None,
                    error: Some(McpError {
                        code: -32700,
                        message: format!("Parse error: {}", e),
                    }),
                    id: None,
                }).unwrap_or_default();
            }
        };

        let result = match request.method.as_str() {
            "initialize" => self.handle_initialize(),
            "tools/list" => self.handle_tools_list(),
            "tools/call" => self.handle_tool_call(&request.params),
            "resources/list" => self.handle_resources_list(),
            "resources/read" => self.handle_resource_read(&request.params),
            _ => Err(McpError {
                code: -32601,
                message: "Method not found".to_string(),
            }),
        };

        let response = match result {
            Ok(data) => McpResponse {
                result: Some(data),
                error: None,
                id: request.id,
            },
            Err(error) => McpResponse {
                result: None,
                error: Some(error),
                id: request.id,
            },
        };

        serde_json::to_string(&response).unwrap_or_default()
    }

    fn handle_initialize(&self) -> Result<serde_json::Value, McpError> {
        Ok(serde_json::json!({
            "protocolVersion": "2024-11-05",
            "capabilities": {
                "tools": {},
                "resources": {}
            },
            "serverInfo": {
                "name": "mad-server",
                "version": "1.0.0"
            }
        }))
    }

    fn handle_tools_list(&self) -> Result<serde_json::Value, McpError> {
        Ok(serde_json::json!({
            "tools": self.tools
        }))
    }

    fn handle_tool_call(&self, params: &HashMap<String, serde_json::Value>) -> Result<serde_json::Value, McpError> {
        let tool_name = params.get("name")
            .and_then(|v| v.as_str())
            .ok_or_else(|| McpError {
                code: -32602,
                message: "Missing tool name".to_string(),
            })?;

        let arguments = params.get("arguments")
            .ok_or_else(|| McpError {
                code: -32602,
                message: "Missing arguments".to_string(),
            })?;

        match tool_name {
            "mad_search" => self.handle_search(arguments),
            "mad_vector_search" => self.handle_vector_search(arguments),
            "mad_graph_query" => self.handle_graph_query(arguments),
            "mad_export" => self.handle_export(arguments),
            "mad_metadata" => self.handle_metadata(),
            _ => Err(McpError {
                code: -32602,
                message: "Unknown tool".to_string(),
            }),
        }
    }

    fn handle_search(&self, args: &serde_json::Value) -> Result<serde_json::Value, McpError> {
        let query = args.get("query")
            .and_then(|v| v.as_str())
            .ok_or_else(|| McpError {
                code: -32602,
                message: "Missing query parameter".to_string(),
            })?;

        if let Some(ref doc) = self.document {
            match doc.search_content(query) {
                Ok(results) => {
                    let parsed: serde_json::Value = serde_json::from_str(&results)
                        .unwrap_or_else(|_| serde_json::json!([]));
                    Ok(serde_json::json!({
                        "content": [{
                            "type": "text",
                            "text": format!("Search results for '{}': {}", query, results)
                        }]
                    }))
                },
                Err(e) => Err(McpError {
                    code: -32000,
                    message: format!("Search error: {:?}", e),
                }),
            }
        } else {
            Err(McpError {
                code: -32000,
                message: "No document loaded".to_string(),
            })
        }
    }

    fn handle_vector_search(&self, args: &serde_json::Value) -> Result<serde_json::Value, McpError> {
        let embedding = args.get("embedding")
            .and_then(|v| v.as_array())
            .ok_or_else(|| McpError {
                code: -32602,
                message: "Missing or invalid embedding parameter".to_string(),
            })?;

        let embedding_vec: Result<Vec<f32>, _> = embedding.iter()
            .map(|v| v.as_f64().map(|f| f as f32))
            .collect::<Option<Vec<_>>>()
            .ok_or_else(|| McpError {
                code: -32602,
                message: "Invalid embedding format".to_string(),
            });

        let embedding_vec = embedding_vec?;
        let top_k = args.get("top_k")
            .and_then(|v| v.as_u64())
            .unwrap_or(5) as usize;

        if let Some(ref doc) = self.document {
            let results = doc.vector_similarity_search(&embedding_vec, top_k);
            Ok(serde_json::json!({
                "content": [{
                    "type": "text",
                    "text": format!("Vector search results: {}", results)
                }]
            }))
        } else {
            Err(McpError {
                code: -32000,
                message: "No document loaded".to_string(),
            })
        }
    }

    fn handle_graph_query(&self, _args: &serde_json::Value) -> Result<serde_json::Value, McpError> {
        // Placeholder for graph query implementation
        Ok(serde_json::json!({
            "content": [{
                "type": "text",
                "text": "Graph query functionality not yet implemented"
            }]
        }))
    }

    fn handle_export(&self, args: &serde_json::Value) -> Result<serde_json::Value, McpError> {
        let format = args.get("format")
            .and_then(|v| v.as_str())
            .ok_or_else(|| McpError {
                code: -32602,
                message: "Missing format parameter".to_string(),
            })?;

        if let Some(ref doc) = self.document {
            let metadata = doc.get_metadata();
            match format {
                "json" => Ok(serde_json::json!({
                    "content": [{
                        "type": "text",
                        "text": format!("Document metadata: {}", metadata)
                    }]
                })),
                _ => Ok(serde_json::json!({
                    "content": [{
                        "type": "text",
                        "text": format!("Export format '{}' not yet implemented", format)
                    }]
                })),
            }
        } else {
            Err(McpError {
                code: -32000,
                message: "No document loaded".to_string(),
            })
        }
    }

    fn handle_metadata(&self) -> Result<serde_json::Value, McpError> {
        if let Some(ref doc) = self.document {
            let metadata = doc.get_metadata();
            Ok(serde_json::json!({
                "content": [{
                    "type": "text",
                    "text": metadata
                }]
            }))
        } else {
            Err(McpError {
                code: -32000,
                message: "No document loaded".to_string(),
            })
        }
    }

    fn handle_resources_list(&self) -> Result<serde_json::Value, McpError> {
        Ok(serde_json::json!({
            "resources": self.resources
        }))
    }

    fn handle_resource_read(&self, params: &HashMap<String, serde_json::Value>) -> Result<serde_json::Value, McpError> {
        let uri = params.get("uri")
            .and_then(|v| v.as_str())
            .ok_or_else(|| McpError {
                code: -32602,
                message: "Missing URI parameter".to_string(),
            })?;

        // Parse the MAD URI and return appropriate content
        Ok(serde_json::json!({
            "contents": [{
                "uri": uri,
                "mimeType": "text/plain",
                "text": format!("Content for resource: {}", uri)
            }]
        }))
    }

    #[wasm_bindgen]
    pub fn get_tools_json(&self) -> String {
        serde_json::to_string(&self.tools).unwrap_or_default()
    }

    #[wasm_bindgen]
    pub fn get_resources_json(&self) -> String {
        serde_json::to_string(&self.resources).unwrap_or_default()
    }
}