use wasm_bindgen::prelude::*;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

pub mod mcp_server;
pub mod graph_db;
pub mod builder;
pub mod sharing;
pub use mcp_server::McpServer;
pub use graph_db::GraphDatabase;
pub use builder::MadBuilder;
pub use sharing::SharingManager;

#[wasm_bindgen]
extern "C" {
    #[wasm_bindgen(js_namespace = console)]
    fn log(s: &str);
}

macro_rules! console_log {
    ($($t:tt)*) => (log(&format_args!($($t)*).to_string()))
}

#[derive(Serialize, Deserialize, Clone)]
pub struct DocumentMetadata {
    pub id: String,
    pub title: String,
    pub author: String,
    pub created: u64,
    pub content_hash: String,
    pub version: String,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct ContentItem {
    pub id: String,
    pub content_type: String,
    pub data: String, // base64 encoded
    pub text_content: String,
    pub metadata: HashMap<String, String>,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct VectorEmbedding {
    pub id: String,
    pub content: String,
    pub embedding: Vec<f32>,
    pub metadata: HashMap<String, String>,
}

#[derive(Serialize, Deserialize)]
pub struct GraphNode {
    pub id: String,
    pub label: String,
    pub properties: HashMap<String, String>,
}

#[derive(Serialize, Deserialize)]
pub struct GraphEdge {
    pub from: String,
    pub to: String,
    pub relationship: String,
    pub properties: HashMap<String, String>,
}

#[wasm_bindgen]
pub struct MadDocument {
    metadata: DocumentMetadata,
    content_items: Vec<ContentItem>,
    vectors: Vec<VectorEmbedding>,
    graph_db: GraphDatabase,
}

#[wasm_bindgen]
impl MadDocument {
    #[wasm_bindgen(constructor)]
    pub fn new(title: &str, author: &str) -> MadDocument {
        let id = uuid::Uuid::new_v4().to_string();
        let metadata = DocumentMetadata {
            id: id.clone(),
            title: title.to_string(),
            author: author.to_string(),
            created: js_sys::Date::now() as u64,
            content_hash: String::new(),
            version: "1.0".to_string(),
        };

        MadDocument {
            metadata,
            content_items: Vec::new(),
            vectors: Vec::new(),
            graph_db: GraphDatabase::new(),
        }
    }

    #[wasm_bindgen]
    pub fn init_databases(&mut self) -> Result<(), JsValue> {
        // No initialization needed for in-memory storage
        Ok(())
    }

    #[wasm_bindgen]
    pub fn add_content(&mut self, content_type: &str, data: &[u8], text_content: &str) -> Result<String, JsValue> {
        let id = uuid::Uuid::new_v4().to_string();
        
        let content_item = ContentItem {
            id: id.clone(),
            content_type: content_type.to_string(),
            data: base64::encode(data),
            text_content: text_content.to_string(),
            metadata: HashMap::new(),
        };
        
        self.content_items.push(content_item);
        Ok(id)
    }

    #[wasm_bindgen]
    pub fn add_vector_embedding(&mut self, content_id: &str, content: &str, embedding: &[f32]) {
        let vector = VectorEmbedding {
            id: content_id.to_string(),
            content: content.to_string(),
            embedding: embedding.to_vec(),
            metadata: HashMap::new(),
        };
        self.vectors.push(vector);
    }

    #[wasm_bindgen]
    pub fn add_graph_node(&mut self, id: &str, label: &str, properties_json: &str) -> Result<(), JsValue> {
        self.graph_db.add_node(id, label, properties_json)
    }

    #[wasm_bindgen]
    pub fn add_graph_edge(&mut self, from: &str, to: &str, relationship: &str, properties_json: &str) -> Result<String, JsValue> {
        self.graph_db.add_edge(from, to, relationship, properties_json)
    }

    #[wasm_bindgen]
    pub fn query_graph(&self, start_node: &str, max_depth: usize, relationship_filter: Option<String>) -> String {
        self.graph_db.traverse(start_node, max_depth, relationship_filter)
    }

    #[wasm_bindgen]
    pub fn find_path(&self, start: &str, end: &str, relationship_filter: Option<String>) -> String {
        self.graph_db.find_shortest_path(start, end, relationship_filter)
    }

    #[wasm_bindgen]
    pub fn search_content(&self, query: &str) -> Result<String, JsValue> {
        let query_lower = query.to_lowercase();
        let results: Vec<String> = self.content_items
            .iter()
            .filter(|item| item.text_content.to_lowercase().contains(&query_lower))
            .map(|item| {
                format!(
                    "{{\"id\": \"{}\", \"content_type\": \"{}\"}}",
                    item.id, item.content_type
                )
            })
            .collect();

        Ok(format!("[{}]", results.join(",")))
    }

    #[wasm_bindgen]
    pub fn vector_similarity_search(&self, query_embedding: &[f32], top_k: usize) -> String {
        let mut similarities: Vec<(f32, &VectorEmbedding)> = self.vectors
            .iter()
            .map(|v| {
                let similarity = cosine_similarity(query_embedding, &v.embedding);
                (similarity, v)
            })
            .collect();

        similarities.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap());
        similarities.truncate(top_k);

        let results: Vec<String> = similarities
            .iter()
            .map(|(score, v)| {
                format!(
                    "{{\"id\": \"{}\", \"content\": \"{}\", \"score\": {}}}",
                    v.id, v.content, score
                )
            })
            .collect();

        format!("[{}]", results.join(","))
    }

    #[wasm_bindgen]
    pub fn get_metadata(&self) -> String {
        serde_json::to_string(&self.metadata).unwrap_or_default()
    }

    #[wasm_bindgen]
    pub fn calculate_content_hash(&mut self) -> String {
        use sha2::{Sha256, Digest};
        
        let mut hasher = Sha256::new();
        hasher.update(serde_json::to_string(&self.metadata).unwrap_or_default());
        hasher.update(serde_json::to_string(&self.content_items).unwrap_or_default());
        hasher.update(serde_json::to_string(&self.vectors).unwrap_or_default());
        hasher.update(self.graph_db.export_cypher());
        
        let result = hasher.finalize();
        let hash = hex::encode(result);
        self.metadata.content_hash = hash.clone();
        hash
    }
}

fn cosine_similarity(a: &[f32], b: &[f32]) -> f32 {
    if a.len() != b.len() {
        return 0.0;
    }

    let dot_product: f32 = a.iter().zip(b.iter()).map(|(x, y)| x * y).sum();
    let norm_a: f32 = a.iter().map(|x| x * x).sum::<f32>().sqrt();
    let norm_b: f32 = b.iter().map(|x| x * x).sum::<f32>().sqrt();

    if norm_a == 0.0 || norm_b == 0.0 {
        0.0
    } else {
        dot_product / (norm_a * norm_b)
    }
}

#[wasm_bindgen(start)]
pub fn main() {
    console_log!("MAD Runtime initialized");
}