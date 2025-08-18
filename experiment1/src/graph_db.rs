use wasm_bindgen::prelude::*;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet, VecDeque};

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct GraphNode {
    pub id: String,
    pub label: String,
    pub properties: HashMap<String, String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct GraphEdge {
    pub id: String,
    pub from: String,
    pub to: String,
    pub relationship: String,
    pub properties: HashMap<String, String>,
}

#[derive(Serialize, Deserialize)]
pub struct GraphPath {
    pub nodes: Vec<GraphNode>,
    pub edges: Vec<GraphEdge>,
    pub length: usize,
}

#[derive(Serialize, Deserialize)]
pub struct GraphQueryResult {
    pub nodes: Vec<GraphNode>,
    pub edges: Vec<GraphEdge>,
    pub paths: Vec<GraphPath>,
}

#[wasm_bindgen]
pub struct GraphDatabase {
    nodes: HashMap<String, GraphNode>,
    edges: HashMap<String, GraphEdge>,
    // Adjacency list for efficient traversal
    outgoing: HashMap<String, Vec<String>>, // node_id -> edge_ids
    incoming: HashMap<String, Vec<String>>, // node_id -> edge_ids
}

#[wasm_bindgen]
impl GraphDatabase {
    #[wasm_bindgen(constructor)]
    pub fn new() -> GraphDatabase {
        GraphDatabase {
            nodes: HashMap::new(),
            edges: HashMap::new(),
            outgoing: HashMap::new(),
            incoming: HashMap::new(),
        }
    }

    #[wasm_bindgen]
    pub fn add_node(&mut self, id: &str, label: &str, properties_json: &str) -> Result<(), JsValue> {
        let properties: HashMap<String, String> = serde_json::from_str(properties_json)
            .map_err(|e| JsValue::from_str(&e.to_string()))?;

        let node = GraphNode {
            id: id.to_string(),
            label: label.to_string(),
            properties,
        };

        self.nodes.insert(id.to_string(), node);
        self.outgoing.entry(id.to_string()).or_insert_with(Vec::new);
        self.incoming.entry(id.to_string()).or_insert_with(Vec::new);

        Ok(())
    }

    #[wasm_bindgen]
    pub fn add_edge(&mut self, from: &str, to: &str, relationship: &str, properties_json: &str) -> Result<String, JsValue> {
        let properties: HashMap<String, String> = serde_json::from_str(properties_json)
            .map_err(|e| JsValue::from_str(&e.to_string()))?;

        let edge_id = uuid::Uuid::new_v4().to_string();
        let edge = GraphEdge {
            id: edge_id.clone(),
            from: from.to_string(),
            to: to.to_string(),
            relationship: relationship.to_string(),
            properties,
        };

        // Ensure nodes exist
        if !self.nodes.contains_key(from) || !self.nodes.contains_key(to) {
            return Err(JsValue::from_str("Source or target node does not exist"));
        }

        self.edges.insert(edge_id.clone(), edge);
        
        // Update adjacency lists
        self.outgoing.entry(from.to_string()).or_insert_with(Vec::new).push(edge_id.clone());
        self.incoming.entry(to.to_string()).or_insert_with(Vec::new).push(edge_id.clone());

        Ok(edge_id)
    }

    #[wasm_bindgen]
    pub fn get_node(&self, id: &str) -> Option<String> {
        self.nodes.get(id).and_then(|node| serde_json::to_string(node).ok())
    }

    #[wasm_bindgen]
    pub fn get_neighbors(&self, node_id: &str, relationship_filter: Option<String>) -> String {
        let mut neighbors = Vec::new();

        if let Some(edge_ids) = self.outgoing.get(node_id) {
            for edge_id in edge_ids {
                if let Some(edge) = self.edges.get(edge_id) {
                    if let Some(ref filter) = relationship_filter {
                        if edge.relationship != *filter {
                            continue;
                        }
                    }
                    if let Some(target_node) = self.nodes.get(&edge.to) {
                        neighbors.push(target_node);
                    }
                }
            }
        }

        serde_json::to_string(&neighbors).unwrap_or_default()
    }

    #[wasm_bindgen]
    pub fn traverse(&self, start_node: &str, max_depth: usize, relationship_filter: Option<String>) -> String {
        let mut result = GraphQueryResult {
            nodes: Vec::new(),
            edges: Vec::new(),
            paths: Vec::new(),
        };

        let mut visited_nodes = HashSet::new();
        let mut visited_edges = HashSet::new();
        let mut queue = VecDeque::new();

        // BFS traversal
        queue.push_back((start_node.to_string(), 0));
        visited_nodes.insert(start_node.to_string());

        while let Some((current_node, depth)) = queue.pop_front() {
            if depth >= max_depth {
                continue;
            }

            if let Some(node) = self.nodes.get(&current_node) {
                if !result.nodes.iter().any(|n| n.id == node.id) {
                    result.nodes.push(node.clone());
                }
            }

            if let Some(edge_ids) = self.outgoing.get(&current_node) {
                for edge_id in edge_ids {
                    if visited_edges.contains(edge_id) {
                        continue;
                    }

                    if let Some(edge) = self.edges.get(edge_id) {
                        // Apply relationship filter
                        if let Some(ref filter) = relationship_filter {
                            if edge.relationship != *filter {
                                continue;
                            }
                        }

                        visited_edges.insert(edge_id.clone());
                        result.edges.push(edge.clone());

                        if !visited_nodes.contains(&edge.to) {
                            visited_nodes.insert(edge.to.clone());
                            queue.push_back((edge.to.clone(), depth + 1));
                        }
                    }
                }
            }
        }

        serde_json::to_string(&result).unwrap_or_default()
    }

    #[wasm_bindgen]
    pub fn find_shortest_path(&self, start: &str, end: &str, relationship_filter: Option<String>) -> String {
        let mut queue = VecDeque::new();
        let mut visited = HashSet::new();
        let mut parent: HashMap<String, String> = HashMap::new();
        let mut edge_to_parent = HashMap::new();

        queue.push_back(start.to_string());
        visited.insert(start.to_string());

        while let Some(current) = queue.pop_front() {
            if current == end {
                // Reconstruct path
                let mut path_nodes = Vec::new();
                let mut path_edges = Vec::new();
                let mut current_node = end.to_string();

                while let Some(prev_node) = parent.get(&current_node) {
                    if let Some(node) = self.nodes.get(&current_node) {
                        path_nodes.push(node.clone());
                    }
                    if let Some(edge_id) = edge_to_parent.get(&current_node) {
                        if let Some(edge) = self.edges.get(edge_id) {
                            path_edges.push(edge.clone());
                        }
                    }
                    current_node = prev_node.clone();
                }

                // Add start node
                if let Some(node) = self.nodes.get(start) {
                    path_nodes.push(node.clone());
                }

                path_nodes.reverse();
                path_edges.reverse();

                let path = GraphPath {
                    nodes: path_nodes.clone(),
                    edges: path_edges.clone(),
                    length: path_edges.len(),
                };

                let result = GraphQueryResult {
                    nodes: path_nodes,
                    edges: path_edges,
                    paths: vec![path],
                };

                return serde_json::to_string(&result).unwrap_or_default();
            }

            if let Some(edge_ids) = self.outgoing.get(&current) {
                for edge_id in edge_ids {
                    if let Some(edge) = self.edges.get(edge_id) {
                        // Apply relationship filter
                        if let Some(ref filter) = relationship_filter {
                            if edge.relationship != *filter {
                                continue;
                            }
                        }

                        if !visited.contains(&edge.to) {
                            visited.insert(edge.to.clone());
                            parent.insert(edge.to.clone(), current.clone());
                            edge_to_parent.insert(edge.to.clone(), edge_id.clone());
                            queue.push_back(edge.to.clone());
                        }
                    }
                }
            }
        }

        // No path found
        let result = GraphQueryResult {
            nodes: Vec::new(),
            edges: Vec::new(),
            paths: Vec::new(),
        };

        serde_json::to_string(&result).unwrap_or_default()
    }

    #[wasm_bindgen]
    pub fn query_by_properties(&self, node_properties: &str, edge_properties: &str) -> String {
        let node_filters: HashMap<String, String> = serde_json::from_str(node_properties)
            .unwrap_or_default();
        let edge_filters: HashMap<String, String> = serde_json::from_str(edge_properties)
            .unwrap_or_default();

        let mut matching_nodes = Vec::new();
        let mut matching_edges = Vec::new();

        // Filter nodes by properties
        for node in self.nodes.values() {
            let mut matches = true;
            for (key, value) in &node_filters {
                if node.properties.get(key) != Some(value) {
                    matches = false;
                    break;
                }
            }
            if matches {
                matching_nodes.push(node.clone());
            }
        }

        // Filter edges by properties
        for edge in self.edges.values() {
            let mut matches = true;
            for (key, value) in &edge_filters {
                if edge.properties.get(key) != Some(value) {
                    matches = false;
                    break;
                }
            }
            if matches {
                matching_edges.push(edge.clone());
            }
        }

        let result = GraphQueryResult {
            nodes: matching_nodes,
            edges: matching_edges,
            paths: Vec::new(),
        };

        serde_json::to_string(&result).unwrap_or_default()
    }

    #[wasm_bindgen]
    pub fn get_statistics(&self) -> String {
        let stats = serde_json::json!({
            "node_count": self.nodes.len(),
            "edge_count": self.edges.len(),
            "node_labels": self.get_unique_labels(),
            "relationship_types": self.get_unique_relationships(),
            "average_degree": self.calculate_average_degree()
        });

        serde_json::to_string(&stats).unwrap_or_default()
    }

    fn get_unique_labels(&self) -> Vec<String> {
        let mut labels: HashSet<String> = HashSet::new();
        for node in self.nodes.values() {
            labels.insert(node.label.clone());
        }
        labels.into_iter().collect()
    }

    fn get_unique_relationships(&self) -> Vec<String> {
        let mut relationships: HashSet<String> = HashSet::new();
        for edge in self.edges.values() {
            relationships.insert(edge.relationship.clone());
        }
        relationships.into_iter().collect()
    }

    fn calculate_average_degree(&self) -> f64 {
        if self.nodes.is_empty() {
            return 0.0;
        }

        let total_degree: usize = self.outgoing.values()
            .map(|edges| edges.len())
            .sum();

        total_degree as f64 / self.nodes.len() as f64
    }

    #[wasm_bindgen]
    pub fn export_cypher(&self) -> String {
        let mut cypher_statements = Vec::new();

        // Create nodes
        for node in self.nodes.values() {
            let props: Vec<String> = node.properties.iter()
                .map(|(k, v)| format!("{}: '{}'", k, v.replace("'", "\\'")))
                .collect();
            
            let props_str = if props.is_empty() {
                String::new()
            } else {
                format!(" {{{}}}", props.join(", "))
            };

            cypher_statements.push(format!(
                "CREATE ({}:{}{})",
                node.id, node.label, props_str
            ));
        }

        // Create relationships
        for edge in self.edges.values() {
            let props: Vec<String> = edge.properties.iter()
                .map(|(k, v)| format!("{}: '{}'", k, v.replace("'", "\\'")))
                .collect();
            
            let props_str = if props.is_empty() {
                String::new()
            } else {
                format!(" {{{}}}", props.join(", "))
            };

            cypher_statements.push(format!(
                "MATCH (a), (b) WHERE a.id = '{}' AND b.id = '{}' CREATE (a)-[:{}{}]->(b)",
                edge.from, edge.to, edge.relationship, props_str
            ));
        }

        cypher_statements.join(";\n") + ";"
    }
}