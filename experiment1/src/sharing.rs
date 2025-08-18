use wasm_bindgen::prelude::*;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Serialize, Deserialize)]
pub struct MadRegistry {
    pub documents: HashMap<String, DocumentEntry>,
    pub peers: HashMap<String, PeerInfo>,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct DocumentEntry {
    pub hash: String,
    pub title: String,
    pub author: String,
    pub size_bytes: u64,
    pub created: u64,
    pub last_accessed: u64,
    pub access_count: u32,
    pub availability: Vec<String>, // List of peer IDs that have this document
}

#[derive(Serialize, Deserialize, Clone)]
pub struct PeerInfo {
    pub id: String,
    pub address: String,
    pub last_seen: u64,
    pub documents: Vec<String>, // List of document hashes
    pub reliability_score: f32,
}

#[derive(Serialize, Deserialize)]
pub struct ShareRequest {
    pub document_hash: String,
    pub recipient_peers: Vec<String>,
    pub access_level: String, // "read", "annotate", "fork"
    pub expiration: Option<u64>,
}

#[derive(Serialize, Deserialize)]
pub struct SyncManifest {
    pub documents: Vec<DocumentSync>,
    pub last_sync: u64,
    pub sync_version: u32,
}

#[derive(Serialize, Deserialize)]
pub struct DocumentSync {
    pub hash: String,
    pub local_version: u64,
    pub remote_version: u64,
    pub sync_status: String, // "up-to-date", "needs-pull", "needs-push", "conflict"
}

#[wasm_bindgen]
pub struct SharingManager {
    registry: MadRegistry,
    local_peer_id: String,
    storage_root: String,
}

#[wasm_bindgen]
impl SharingManager {
    #[wasm_bindgen(constructor)]
    pub fn new(peer_id: &str, storage_root: &str) -> SharingManager {
        SharingManager {
            registry: MadRegistry {
                documents: HashMap::new(),
                peers: HashMap::new(),
            },
            local_peer_id: peer_id.to_string(),
            storage_root: storage_root.to_string(),
        }
    }

    #[wasm_bindgen]
    pub fn register_document(&mut self, hash: &str, title: &str, author: &str, size_bytes: u64) -> Result<(), JsValue> {
        let entry = DocumentEntry {
            hash: hash.to_string(),
            title: title.to_string(),
            author: author.to_string(),
            size_bytes,
            created: js_sys::Date::now() as u64,
            last_accessed: js_sys::Date::now() as u64,
            access_count: 0,
            availability: vec![self.local_peer_id.clone()],
        };

        self.registry.documents.insert(hash.to_string(), entry);
        Ok(())
    }

    #[wasm_bindgen]
    pub fn register_peer(&mut self, peer_id: &str, address: &str) -> Result<(), JsValue> {
        let peer = PeerInfo {
            id: peer_id.to_string(),
            address: address.to_string(),
            last_seen: js_sys::Date::now() as u64,
            documents: Vec::new(),
            reliability_score: 1.0,
        };

        self.registry.peers.insert(peer_id.to_string(), peer);
        Ok(())
    }

    #[wasm_bindgen]
    pub fn create_share_link(&self, document_hash: &str, access_level: &str, expiration_hours: Option<u32>) -> Result<String, JsValue> {
        let expiration = expiration_hours.map(|hours| {
            js_sys::Date::now() as u64 + (hours as u64 * 60 * 60 * 1000)
        });

        let share_request = ShareRequest {
            document_hash: document_hash.to_string(),
            recipient_peers: Vec::new(),
            access_level: access_level.to_string(),
            expiration,
        };

        // Create a shareable link format
        let share_data = serde_json::to_string(&share_request)
            .map_err(|e| JsValue::from_str(&e.to_string()))?;
        
        let encoded_data = base64::encode(share_data);
        Ok(format!("mad://share/{}", encoded_data))
    }

    #[wasm_bindgen]
    pub fn parse_share_link(&self, share_link: &str) -> Result<String, JsValue> {
        if !share_link.starts_with("mad://share/") {
            return Err(JsValue::from_str("Invalid MAD share link"));
        }

        let encoded_data = share_link.strip_prefix("mad://share/")
            .ok_or_else(|| JsValue::from_str("Invalid share link format"))?;

        let decoded_data = base64::decode(encoded_data)
            .map_err(|e| JsValue::from_str(&e.to_string()))?;

        let share_data = String::from_utf8(decoded_data)
            .map_err(|e| JsValue::from_str(&e.to_string()))?;

        let share_request: ShareRequest = serde_json::from_str(&share_data)
            .map_err(|e| JsValue::from_str(&e.to_string()))?;

        // Check if link has expired
        if let Some(exp) = share_request.expiration {
            if js_sys::Date::now() as u64 > exp {
                return Err(JsValue::from_str("Share link has expired"));
            }
        }

        Ok(serde_json::to_string(&share_request)
            .map_err(|e| JsValue::from_str(&e.to_string()))?)
    }

    #[wasm_bindgen]
    pub fn find_document_peers(&self, document_hash: &str) -> String {
        if let Some(doc_entry) = self.registry.documents.get(document_hash) {
            let peer_info: Vec<&PeerInfo> = doc_entry.availability.iter()
                .filter_map(|peer_id| self.registry.peers.get(peer_id))
                .collect();

            serde_json::to_string(&peer_info).unwrap_or_default()
        } else {
            "[]".to_string()
        }
    }

    #[wasm_bindgen]
    pub fn create_sync_manifest(&self) -> String {
        let document_syncs: Vec<DocumentSync> = self.registry.documents.iter()
            .map(|(hash, entry)| DocumentSync {
                hash: hash.clone(),
                local_version: entry.last_accessed,
                remote_version: 0, // Would be fetched from peers
                sync_status: "up-to-date".to_string(),
            })
            .collect();

        let manifest = SyncManifest {
            documents: document_syncs,
            last_sync: js_sys::Date::now() as u64,
            sync_version: 1,
        };

        serde_json::to_string(&manifest).unwrap_or_default()
    }

    #[wasm_bindgen]
    pub fn generate_ipfs_hash(&self, document_hash: &str) -> String {
        // In a real implementation, this would interface with IPFS
        // For now, we'll create a mock IPFS hash based on the MAD hash
        format!("Qm{}", hex::encode(&document_hash.as_bytes()[..20]))
    }

    #[wasm_bindgen]
    pub fn create_torrent_info(&self, document_hash: &str) -> Result<String, JsValue> {
        let doc_entry = self.registry.documents.get(document_hash)
            .ok_or_else(|| JsValue::from_str("Document not found"))?;

        let torrent_info = serde_json::json!({
            "info_hash": document_hash,
            "name": doc_entry.title,
            "length": doc_entry.size_bytes,
            "piece_length": 32768, // 32KB pieces
            "pieces": self.calculate_piece_hashes(document_hash),
            "trackers": [
                "mad://tracker.mad-network.org:8080",
                "mad://backup.mad-network.org:8080"
            ],
            "created_by": "MAD Format v1.0",
            "creation_date": doc_entry.created / 1000, // Unix timestamp
            "mad_specific": {
                "format_version": "1.0",
                "content_hash": document_hash,
                "author": doc_entry.author,
                "has_mcp_server": true
            }
        });

        Ok(torrent_info.to_string())
    }

    #[wasm_bindgen]
    pub fn get_availability_stats(&self, document_hash: &str) -> String {
        if let Some(doc_entry) = self.registry.documents.get(document_hash) {
            let available_peers = doc_entry.availability.len();
            let total_peers = self.registry.peers.len();
            let availability_ratio = if total_peers > 0 {
                available_peers as f32 / total_peers as f32
            } else {
                0.0
            };

            let stats = serde_json::json!({
                "document_hash": document_hash,
                "available_peers": available_peers,
                "total_peers": total_peers,
                "availability_ratio": availability_ratio,
                "access_count": doc_entry.access_count,
                "last_accessed": doc_entry.last_accessed,
                "redundancy_level": if available_peers >= 3 { "high" } else if available_peers >= 2 { "medium" } else { "low" }
            });

            stats.to_string()
        } else {
            serde_json::json!({"error": "Document not found"}).to_string()
        }
    }

    #[wasm_bindgen]
    pub fn export_portable_package(&self, document_hash: &str) -> Result<String, JsValue> {
        let doc_entry = self.registry.documents.get(document_hash)
            .ok_or_else(|| JsValue::from_str("Document not found"))?;

        // Create a portable package descriptor
        let package = serde_json::json!({
            "format": "MAD_PORTABLE_v1.0",
            "document": {
                "hash": document_hash,
                "title": doc_entry.title,
                "author": doc_entry.author,
                "size": doc_entry.size_bytes
            },
            "components": {
                "manifest": "manifest.json",
                "content_db": "content.db",
                "vector_db": "vectors.db", 
                "graph_db": "graph.db",
                "wasm_runtime": "runtime.wasm",
                "mcp_config": "mcp_config.json"
            },
            "verification": {
                "content_hash": document_hash,
                "package_signature": self.generate_package_signature(document_hash),
                "integrity_check": "sha256"
            },
            "sharing": {
                "ipfs_hash": self.generate_ipfs_hash(document_hash),
                "torrent_info": "document.torrent",
                "peer_discovery": "mad://discovery.mad-network.org"
            },
            "created": js_sys::Date::now(),
            "version": "1.0"
        });

        Ok(package.to_string())
    }

    // Helper methods
    fn calculate_piece_hashes(&self, _document_hash: &str) -> Vec<String> {
        // In a real implementation, this would calculate piece hashes for the document
        // For now, return mock hashes
        vec![
            "d4b1a7c2e8f3a9b5c6d7e8f9a0b1c2d3e4f5".to_string(),
            "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8".to_string(),
        ]
    }

    fn generate_package_signature(&self, document_hash: &str) -> String {
        // In a real implementation, this would create a cryptographic signature
        use sha2::{Sha256, Digest};
        let mut hasher = Sha256::new();
        hasher.update(document_hash);
        hasher.update(&self.local_peer_id);
        hasher.update(&js_sys::Date::now().to_string());
        hex::encode(hasher.finalize())
    }

    #[wasm_bindgen]
    pub fn get_registry_json(&self) -> String {
        serde_json::to_string(&self.registry).unwrap_or_default()
    }

    #[wasm_bindgen]
    pub fn update_peer_reliability(&mut self, peer_id: &str, success: bool) {
        if let Some(peer) = self.registry.peers.get_mut(peer_id) {
            if success {
                peer.reliability_score = (peer.reliability_score * 0.9 + 0.1).min(1.0);
            } else {
                peer.reliability_score = (peer.reliability_score * 0.9).max(0.0);
            }
            peer.last_seen = js_sys::Date::now() as u64;
        }
    }
}