use wasm_bindgen::prelude::*;
use crate::{MadDocument, DocumentMetadata};
use std::collections::HashMap;

#[wasm_bindgen]
pub struct MadBuilder {
    document: MadDocument,
    content_items: Vec<ContentItem>,
    embeddings: Vec<EmbeddingInfo>,
    entities: Vec<EntityInfo>,
}

#[derive(Clone)]
struct EmbeddingInfo {
    content_id: String,
    embedding: Vec<f32>,
}

#[derive(Clone)]
struct EntityInfo {
    id: String,
    label: String,
    properties_json: String,
}

#[derive(Clone)]
struct ContentItem {
    id: String,
    content_type: String,
    data: Vec<u8>,
    text_content: String,
    metadata: HashMap<String, String>,
}

#[wasm_bindgen]
impl MadBuilder {
    #[wasm_bindgen(constructor)]
    pub fn new(title: &str, author: &str) -> MadBuilder {
        MadBuilder {
            document: MadDocument::new(title, author),
            content_items: Vec::new(),
            embeddings: Vec::new(),
            entities: Vec::new(),
        }
    }

    #[wasm_bindgen]
    pub fn add_text_content(&mut self, text: &str, content_type: &str) -> Result<String, JsValue> {
        let id = uuid::Uuid::new_v4().to_string();
        let content_item = ContentItem {
            id: id.clone(),
            content_type: content_type.to_string(),
            data: text.as_bytes().to_vec(),
            text_content: text.to_string(),
            metadata: HashMap::new(),
        };
        
        self.content_items.push(content_item);
        Ok(id)
    }

    #[wasm_bindgen]
    pub fn add_binary_content(&mut self, data: &[u8], content_type: &str, description: &str) -> Result<String, JsValue> {
        let id = uuid::Uuid::new_v4().to_string();
        let content_item = ContentItem {
            id: id.clone(),
            content_type: content_type.to_string(),
            data: data.to_vec(),
            text_content: description.to_string(),
            metadata: HashMap::new(),
        };
        
        self.content_items.push(content_item);
        Ok(id)
    }

    #[wasm_bindgen]
    pub fn add_html_content(&mut self, html: &str) -> Result<String, JsValue> {
        let text_content = self.extract_text_from_html(html);
        let id = uuid::Uuid::new_v4().to_string();
        let content_item = ContentItem {
            id: id.clone(),
            content_type: "text/html".to_string(),
            data: html.as_bytes().to_vec(),
            text_content,
            metadata: HashMap::new(),
        };
        
        self.content_items.push(content_item);
        Ok(id)
    }

    #[wasm_bindgen]
    pub fn add_markdown_content(&mut self, markdown: &str) -> Result<String, JsValue> {
        let id = uuid::Uuid::new_v4().to_string();
        let content_item = ContentItem {
            id: id.clone(),
            content_type: "text/markdown".to_string(),
            data: markdown.as_bytes().to_vec(),
            text_content: markdown.to_string(),
            metadata: HashMap::new(),
        };
        
        self.content_items.push(content_item);
        Ok(id)
    }

    #[wasm_bindgen]
    pub fn add_vector_embedding(&mut self, content_id: &str, embedding: &[f32]) -> Result<(), JsValue> {
        // Find the content item to validate it exists
        let _content_item = self.content_items.iter()
            .find(|item| item.id == content_id)
            .ok_or_else(|| JsValue::from_str("Content item not found"))?;

        // Store embedding info in builder
        let embedding_info = EmbeddingInfo {
            content_id: content_id.to_string(),
            embedding: embedding.to_vec(),
        };
        self.embeddings.push(embedding_info);
        Ok(())
    }

    #[wasm_bindgen]
    pub fn create_entity(&mut self, id: &str, label: &str, properties_json: &str) -> Result<(), JsValue> {
        // Store entity info in builder
        let entity_info = EntityInfo {
            id: id.to_string(),
            label: label.to_string(),
            properties_json: properties_json.to_string(),
        };
        self.entities.push(entity_info);
        Ok(())
    }

    #[wasm_bindgen]
    pub fn create_relationship(&mut self, from: &str, to: &str, relationship: &str, properties_json: &str) -> Result<String, JsValue> {
        self.document.add_graph_edge(from, to, relationship, properties_json)
    }

    #[wasm_bindgen]
    pub fn auto_extract_entities(&mut self, content_id: &str, entity_types: &str) -> Result<String, JsValue> {
        let content_item = self.content_items.iter()
            .find(|item| item.id == content_id)
            .ok_or_else(|| JsValue::from_str("Content item not found"))?;

        let entity_type_list: Vec<String> = serde_json::from_str(entity_types)
            .map_err(|e| JsValue::from_str(&e.to_string()))?;

        // Simple entity extraction (in a real implementation, this would use NLP)
        let mut extracted_entities = Vec::new();
        
        for entity_type in entity_type_list {
            match entity_type.as_str() {
                "PERSON" => {
                    let names = self.extract_person_names(&content_item.text_content);
                    for name in names {
                        let entity_id = format!("person_{}", uuid::Uuid::new_v4());
                        let properties = serde_json::json!({
                            "name": name,
                            "type": "PERSON",
                            "source_content": content_id
                        });
                        self.document.add_graph_node(&entity_id, "Person", &properties.to_string())?;
                        extracted_entities.push(entity_id);
                    }
                },
                "ORGANIZATION" => {
                    let orgs = self.extract_organizations(&content_item.text_content);
                    for org in orgs {
                        let entity_id = format!("org_{}", uuid::Uuid::new_v4());
                        let properties = serde_json::json!({
                            "name": org,
                            "type": "ORGANIZATION",
                            "source_content": content_id
                        });
                        self.document.add_graph_node(&entity_id, "Organization", &properties.to_string())?;
                        extracted_entities.push(entity_id);
                    }
                },
                _ => {}
            }
        }

        serde_json::to_string(&extracted_entities).map_err(|e| JsValue::from_str(&e.to_string()))
    }

    #[wasm_bindgen]
    pub fn add_citation(&mut self, from_content: &str, to_content: &str, citation_type: &str) -> Result<String, JsValue> {
        let properties = serde_json::json!({
            "citation_type": citation_type,
            "created_at": js_sys::Date::now()
        });
        
        self.document.add_graph_edge(from_content, to_content, "CITES", &properties.to_string())
    }

    #[wasm_bindgen]
    pub fn build(&mut self) -> Result<(), JsValue> {
        // Initialize the document databases
        self.document.init_databases()?;

        // Add all content items to the document
        for item in &self.content_items {
            self.document.add_content(&item.content_type, &item.data[..], &item.text_content)?;
        }

        // Calculate final content hash
        self.document.calculate_content_hash();

        Ok(())
    }

    #[wasm_bindgen]
    pub fn create_fresh_document(&self) -> MadDocument {
        // Create a completely fresh document and rebuild it
        let mut new_doc = MadDocument::new(&self.document.metadata.title, &self.document.metadata.author);
        
        // Initialize databases
        let _ = new_doc.init_databases();
        
        // Re-add all content
        for item in &self.content_items {
            let _ = new_doc.add_content(&item.content_type, &item.data[..], &item.text_content);
        }
        
        // Note: Vectors and graph data need to be added separately via JavaScript
        // since they're stored in the builder, not the internal document
        
        // Calculate hash
        new_doc.calculate_content_hash();
        
        new_doc
    }

    #[wasm_bindgen]
    pub fn get_document(self) -> MadDocument {
        self.document
    }

    #[wasm_bindgen]
    pub fn export_manifest(&self) -> String {
        let metadata = self.document.get_metadata();
        let manifest = serde_json::json!({
            "format_version": "1.0",
            "document_metadata": serde_json::from_str::<serde_json::Value>(&metadata).unwrap_or_default(),
            "content_items": self.content_items.len(),
            "has_vectors": !self.content_items.is_empty(),
            "has_graph": true,
            "created_at": js_sys::Date::now(),
            "tools": [
                "mad_search",
                "mad_vector_search", 
                "mad_graph_query",
                "mad_export",
                "mad_metadata"
            ]
        });

        serde_json::to_string(&manifest).unwrap_or_default()
    }

    #[wasm_bindgen]
    pub fn get_content_items_json(&self) -> String {
        // Export content items as JSON for manual reconstruction
        let items: Vec<serde_json::Value> = self.content_items.iter().map(|item| {
            serde_json::json!({
                "id": item.id,
                "content_type": item.content_type,
                "text_content": item.text_content,
                "data_base64": base64::encode(&item.data)
            })
        }).collect();
        
        serde_json::to_string(&items).unwrap_or_default()
    }

    #[wasm_bindgen]
    pub fn get_embeddings_json(&self) -> String {
        // Export embeddings as JSON
        let embeddings: Vec<serde_json::Value> = self.embeddings.iter().map(|emb| {
            serde_json::json!({
                "content_id": emb.content_id,
                "embedding": emb.embedding
            })
        }).collect();
        
        serde_json::to_string(&embeddings).unwrap_or_default()
    }

    #[wasm_bindgen]
    pub fn get_entities_json(&self) -> String {
        // Export entities as JSON
        let entities: Vec<serde_json::Value> = self.entities.iter().map(|ent| {
            serde_json::json!({
                "id": ent.id,
                "label": ent.label,
                "properties_json": ent.properties_json
            })
        }).collect();
        
        serde_json::to_string(&entities).unwrap_or_default()
    }

    #[wasm_bindgen]
    pub fn export_package(&self) -> Result<Vec<u8>, JsValue> {
        // In a real implementation, this would create a ZIP or TAR archive
        // containing all the database files, WASM runtime, and manifest
        let manifest = self.export_manifest();
        Ok(manifest.as_bytes().to_vec())
    }

    // Helper methods for entity extraction (simplified)
    fn extract_text_from_html(&self, html: &str) -> String {
        // Simple HTML tag removal (in production, use a proper HTML parser)
        let mut text = html.to_string();
        
        // Remove script and style tags with their content
        while let Some(start) = text.find("<script") {
            if let Some(end) = text[start..].find("</script>") {
                text.replace_range(start..start + end + 9, "");
            } else {
                break;
            }
        }
        
        while let Some(start) = text.find("<style") {
            if let Some(end) = text[start..].find("</style>") {
                text.replace_range(start..start + end + 8, "");
            } else {
                break;
            }
        }

        // Remove all HTML tags
        let mut in_tag = false;
        let mut result = String::new();
        
        for ch in text.chars() {
            match ch {
                '<' => in_tag = true,
                '>' => in_tag = false,
                _ if !in_tag => result.push(ch),
                _ => {}
            }
        }

        // Clean up whitespace
        result.split_whitespace().collect::<Vec<_>>().join(" ")
    }

    fn extract_person_names(&self, text: &str) -> Vec<String> {
        // Simplified name extraction (in production, use NLP)
        let mut names = Vec::new();
        
        // Look for capitalized words that might be names
        let words: Vec<&str> = text.split_whitespace().collect();
        let mut i = 0;
        
        while i < words.len() {
            let word = words[i];
            if word.len() > 1 && word.chars().next().unwrap().is_uppercase() {
                // Check if next word is also capitalized (potential full name)
                if i + 1 < words.len() {
                    let next_word = words[i + 1];
                    if next_word.len() > 1 && next_word.chars().next().unwrap().is_uppercase() {
                        // Remove punctuation
                        let clean_word = word.trim_end_matches(&['.', ',', '!', '?', ';', ':'][..]);
                        let clean_next = next_word.trim_end_matches(&['.', ',', '!', '?', ';', ':'][..]);
                        
                        if clean_word.chars().all(|c| c.is_alphabetic()) && 
                           clean_next.chars().all(|c| c.is_alphabetic()) {
                            names.push(format!("{} {}", clean_word, clean_next));
                            i += 2;
                            continue;
                        }
                    }
                }
            }
            i += 1;
        }
        
        // Remove duplicates
        names.sort();
        names.dedup();
        names
    }

    fn extract_organizations(&self, text: &str) -> Vec<String> {
        // Simplified organization extraction
        let mut orgs = Vec::new();
        
        // Look for common organization patterns
        let org_patterns = ["Inc.", "Corp.", "LLC", "Ltd.", "Company", "Foundation", "Institute"];
        
        for pattern in &org_patterns {
            let words: Vec<&str> = text.split_whitespace().collect();
            for (i, word) in words.iter().enumerate() {
                if word.contains(pattern) {
                    // Try to get the organization name (look back for capitalized words)
                    let mut org_words = Vec::new();
                    let mut j = i;
                    
                    // Look backward for capitalized words
                    while j > 0 {
                        j -= 1;
                        let prev_word = words[j];
                        if prev_word.len() > 1 && prev_word.chars().next().unwrap().is_uppercase() {
                            org_words.insert(0, prev_word.trim_end_matches(&['.', ',', '!', '?', ';', ':'][..]));
                        } else {
                            break;
                        }
                    }
                    
                    // Add the word with the pattern
                    org_words.push(word.trim_end_matches(&['.', ',', '!', '?', ';', ':'][..]));
                    
                    if !org_words.is_empty() {
                        orgs.push(org_words.join(" "));
                    }
                }
            }
        }
        
        // Remove duplicates
        orgs.sort();
        orgs.dedup();
        orgs
    }
}