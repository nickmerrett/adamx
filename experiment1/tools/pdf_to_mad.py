#!/usr/bin/env python3
"""
PDF to MAD Format Converter

This tool uses IBM's Docling to convert PDF documents into the MAD format,
extracting text, structure, entities, and relationships for AI agent consumption.
"""

import argparse
import json
import os
import sys
import logging
from pathlib import Path
from typing import Dict, List, Tuple, Optional
import hashlib
import uuid
from datetime import datetime

try:
    from docling.document_converter import DocumentConverter
    from docling.datamodel.base_models import InputFormat
    from docling.datamodel.pipeline_options import PipelineOptions
    from docling.pipeline.standard_pdf_pipeline import StandardPdfPipeline
except ImportError:
    print("Error: Docling not installed. Install with: pip install docling")
    sys.exit(1)

try:
    import spacy
    from spacy import displacy
except ImportError:
    print("Warning: spaCy not installed. Entity extraction will be limited.")
    spacy = None

try:
    from sentence_transformers import SentenceTransformer
except ImportError:
    print("Warning: sentence-transformers not installed. Vector embeddings will be disabled.")
    SentenceTransformer = None

class PDFToMADConverter:
    """Converts PDF documents to MAD format using Docling and AI processing."""
    
    def __init__(self, embedding_model: str = "all-MiniLM-L6-v2", spacy_model: str = "en_core_web_sm"):
        self.logger = logging.getLogger(__name__)
        self.embedding_model_name = embedding_model
        self.spacy_model_name = spacy_model
        
        # Initialize Docling converter
        self.converter = DocumentConverter()
        
        # Initialize embedding model if available
        self.embedding_model = None
        if SentenceTransformer:
            try:
                self.embedding_model = SentenceTransformer(embedding_model)
                self.logger.info(f"Loaded embedding model: {embedding_model}")
            except Exception as e:
                self.logger.warning(f"Failed to load embedding model: {e}")
        
        # Initialize spaCy model if available
        self.nlp = None
        if spacy:
            try:
                self.nlp = spacy.load(spacy_model)
                self.logger.info(f"Loaded spaCy model: {spacy_model}")
            except OSError:
                self.logger.warning(f"spaCy model {spacy_model} not found. Run: python -m spacy download {spacy_model}")
    
    def convert_pdf_to_mad(self, pdf_path: str, output_dir: str = None, 
                          title: str = None, author: str = None) -> Dict:
        """
        Convert a PDF file to MAD format.
        
        Args:
            pdf_path: Path to the PDF file
            output_dir: Output directory for MAD files
            title: Document title (auto-extracted if None)
            author: Document author (auto-extracted if None)
            
        Returns:
            Dictionary containing conversion results and metadata
        """
        self.logger.info(f"Converting PDF: {pdf_path}")
        
        # Convert PDF using Docling
        docling_result = self.converter.convert(pdf_path)
        document = docling_result.document
        
        # Extract basic metadata
        if not title:
            title = self._extract_title(document) or Path(pdf_path).stem
        if not author:
            author = self._extract_author(document) or "Unknown"
            
        # Prepare output directory
        if not output_dir:
            output_dir = Path(pdf_path).parent / f"{Path(pdf_path).stem}_mad"
        output_dir = Path(output_dir)
        output_dir.mkdir(exist_ok=True)
        
        # Extract content and structure
        content_data = self._extract_content_structure(document)
        
        # Generate embeddings if model is available
        embeddings_data = {}
        if self.embedding_model:
            embeddings_data = self._generate_embeddings(content_data)
        
        # Extract entities and relationships
        entities_data = {}
        relationships_data = {}
        if self.nlp:
            entities_data, relationships_data = self._extract_entities_relationships(content_data)
        
        # Create MAD document structure
        mad_document = self._create_mad_document(
            title=title,
            author=author,
            content_data=content_data,
            embeddings_data=embeddings_data,
            entities_data=entities_data,
            relationships_data=relationships_data,
            source_pdf=pdf_path
        )
        
        # Write MAD files
        mad_files = self._write_mad_files(mad_document, output_dir)
        
        # Generate JavaScript for WASM integration
        js_code = self._generate_wasm_integration_code(mad_document)
        js_file = output_dir / "create_mad_document.js"
        with open(js_file, 'w', encoding='utf-8') as f:
            f.write(js_code)
        
        self.logger.info(f"MAD conversion completed. Output: {output_dir}")
        
        return {
            "status": "success",
            "output_directory": str(output_dir),
            "mad_files": mad_files,
            "javascript_file": str(js_file),
            "document_hash": mad_document["content_hash"],
            "statistics": {
                "pages": len(content_data.get("pages", [])),
                "text_chunks": len(content_data.get("text_chunks", [])),
                "entities": len(entities_data),
                "relationships": len(relationships_data),
                "embeddings": len(embeddings_data)
            }
        }
    
    def _extract_title(self, document) -> Optional[str]:
        """Extract document title from Docling document."""
        try:
            # Look for title in document metadata or first heading
            if hasattr(document, 'meta') and document.meta:
                if hasattr(document.meta, 'title') and document.meta.title:
                    return document.meta.title
            
            # Look for first heading in content
            for item in document.iterate_items():
                if hasattr(item, 'label') and item.label and 'title' in item.label.lower():
                    return item.text[:100]  # Limit title length
                if hasattr(item, 'tag') and item.tag and item.tag.lower() in ['h1', 'title']:
                    return item.text[:100]
            
            return None
        except Exception as e:
            self.logger.warning(f"Failed to extract title: {e}")
            return None
    
    def _extract_author(self, document) -> Optional[str]:
        """Extract document author from Docling document."""
        try:
            # Look for author in document metadata
            if hasattr(document, 'meta') and document.meta:
                if hasattr(document.meta, 'author') and document.meta.author:
                    return document.meta.author
                if hasattr(document.meta, 'creator') and document.meta.creator:
                    return document.meta.creator
            
            return None
        except Exception as e:
            self.logger.warning(f"Failed to extract author: {e}")
            return None
    
    def _extract_content_structure(self, document) -> Dict:
        """Extract structured content from Docling document."""
        content_data = {
            "pages": [],
            "text_chunks": [],
            "tables": [],
            "images": [],
            "headings": [],
            "full_text": "",
            "markdown": "",
            "html": ""
        }
        
        try:
            # Export to different formats
            content_data["markdown"] = document.export_to_markdown()
            content_data["html"] = document.export_to_html()
            
            # Extract structured elements
            for item in document.iterate_items():
                item_data = {
                    "id": str(uuid.uuid4()),
                    "text": getattr(item, 'text', ''),
                    "type": getattr(item, 'label', 'unknown'),
                    "page": getattr(item, 'page', 0)
                }
                
                if hasattr(item, 'bbox') and item.bbox:
                    item_data["bbox"] = {
                        "x": item.bbox.l,
                        "y": item.bbox.t, 
                        "width": item.bbox.r - item.bbox.l,
                        "height": item.bbox.b - item.bbox.t
                    }
                
                # Categorize content
                if item_data["type"] in ["title", "section-header", "page-header"]:
                    content_data["headings"].append(item_data)
                elif item_data["type"] == "table":
                    content_data["tables"].append(item_data)
                elif item_data["type"] == "figure":
                    content_data["images"].append(item_data)
                else:
                    content_data["text_chunks"].append(item_data)
                
                # Add to full text
                if item_data["text"].strip():
                    content_data["full_text"] += item_data["text"] + "\n\n"
            
            # Group by pages
            pages_dict = {}
            for item in content_data["text_chunks"] + content_data["headings"]:
                page_num = item.get("page", 0)
                if page_num not in pages_dict:
                    pages_dict[page_num] = []
                pages_dict[page_num].append(item)
            
            content_data["pages"] = [
                {"page_number": page_num, "content": items}
                for page_num, items in sorted(pages_dict.items())
            ]
            
        except Exception as e:
            self.logger.error(f"Failed to extract content structure: {e}")
        
        return content_data
    
    def _generate_embeddings(self, content_data: Dict) -> Dict:
        """Generate vector embeddings for text content."""
        embeddings_data = {}
        
        try:
            # Create embeddings for text chunks
            for chunk in content_data.get("text_chunks", []):
                if chunk["text"].strip():
                    embedding = self.embedding_model.encode(chunk["text"]).tolist()
                    embeddings_data[chunk["id"]] = {
                        "text": chunk["text"],
                        "embedding": embedding,
                        "type": chunk["type"],
                        "page": chunk.get("page", 0)
                    }
            
            # Create embeddings for headings
            for heading in content_data.get("headings", []):
                if heading["text"].strip():
                    embedding = self.embedding_model.encode(heading["text"]).tolist()
                    embeddings_data[heading["id"]] = {
                        "text": heading["text"],
                        "embedding": embedding,
                        "type": heading["type"],
                        "page": heading.get("page", 0)
                    }
            
            self.logger.info(f"Generated {len(embeddings_data)} embeddings")
            
        except Exception as e:
            self.logger.error(f"Failed to generate embeddings: {e}")
        
        return embeddings_data
    
    def _extract_entities_relationships(self, content_data: Dict) -> Tuple[Dict, Dict]:
        """Extract entities and relationships using spaCy NLP."""
        entities_data = {}
        relationships_data = {}
        
        try:
            # Process full text with spaCy
            doc = self.nlp(content_data["full_text"])
            
            # Extract named entities
            for ent in doc.ents:
                entity_id = f"entity_{ent.start}_{ent.end}"
                entities_data[entity_id] = {
                    "text": ent.text,
                    "label": ent.label_,
                    "description": spacy.explain(ent.label_),
                    "start": ent.start,
                    "end": ent.end,
                    "confidence": getattr(ent, 'confidence', 1.0)
                }
            
            # Extract relationships (simple co-occurrence based)
            entities_list = list(entities_data.items())
            for i, (id1, ent1) in enumerate(entities_list):
                for id2, ent2 in entities_list[i+1:]:
                    # Check if entities appear in same sentence/paragraph
                    distance = abs(ent1["start"] - ent2["start"])
                    if distance < 50:  # Threshold for co-occurrence
                        rel_id = f"rel_{id1}_{id2}"
                        relationships_data[rel_id] = {
                            "from": id1,
                            "to": id2,
                            "type": "CO_OCCURS",
                            "distance": distance,
                            "confidence": max(0.1, 1.0 - distance/50.0)
                        }
            
            self.logger.info(f"Extracted {len(entities_data)} entities and {len(relationships_data)} relationships")
            
        except Exception as e:
            self.logger.error(f"Failed to extract entities/relationships: {e}")
        
        return entities_data, relationships_data
    
    def _create_mad_document(self, **kwargs) -> Dict:
        """Create MAD document structure."""
        content_hash = hashlib.sha256(
            json.dumps(kwargs, sort_keys=True).encode()
        ).hexdigest()
        
        mad_document = {
            "format_version": "1.0",
            "document_id": str(uuid.uuid4()),
            "content_hash": content_hash,
            "metadata": {
                "title": kwargs["title"],
                "author": kwargs["author"],
                "created": datetime.now().isoformat(),
                "source_pdf": kwargs["source_pdf"],
                "extraction_tool": "docling",
                "conversion_tool": "pdf_to_mad.py"
            },
            "content": kwargs["content_data"],
            "embeddings": kwargs["embeddings_data"],
            "entities": kwargs["entities_data"],
            "relationships": kwargs["relationships_data"]
        }
        
        return mad_document
    
    def _write_mad_files(self, mad_document: Dict, output_dir: Path) -> Dict:
        """Write MAD document files."""
        files = {}
        
        # Write manifest
        manifest_file = output_dir / "manifest.json"
        with open(manifest_file, 'w', encoding='utf-8') as f:
            json.dump({
                "format_version": mad_document["format_version"],
                "document_id": mad_document["document_id"],
                "content_hash": mad_document["content_hash"],
                "metadata": mad_document["metadata"]
            }, f, indent=2)
        files["manifest"] = str(manifest_file)
        
        # Write content data
        content_file = output_dir / "content.json"
        with open(content_file, 'w', encoding='utf-8') as f:
            json.dump(mad_document["content"], f, indent=2)
        files["content"] = str(content_file)
        
        # Write embeddings
        if mad_document["embeddings"]:
            embeddings_file = output_dir / "embeddings.json"
            with open(embeddings_file, 'w', encoding='utf-8') as f:
                json.dump(mad_document["embeddings"], f, indent=2)
            files["embeddings"] = str(embeddings_file)
        
        # Write entities
        if mad_document["entities"]:
            entities_file = output_dir / "entities.json"
            with open(entities_file, 'w', encoding='utf-8') as f:
                json.dump(mad_document["entities"], f, indent=2)
            files["entities"] = str(entities_file)
        
        # Write relationships
        if mad_document["relationships"]:
            relationships_file = output_dir / "relationships.json"
            with open(relationships_file, 'w', encoding='utf-8') as f:
                json.dump(mad_document["relationships"], f, indent=2)
            files["relationships"] = str(relationships_file)
        
        # Write full MAD document
        full_file = output_dir / "document.json"
        with open(full_file, 'w', encoding='utf-8') as f:
            json.dump(mad_document, f, indent=2)
        files["full_document"] = str(full_file)
        
        return files
    
    def _generate_wasm_integration_code(self, mad_document: Dict) -> str:
        """Generate JavaScript code to create MAD document in WASM."""
        metadata = mad_document["metadata"]
        content = mad_document["content"]
        
        # Escape backticks in content
        escaped_backtick = '\\`'
        html_content = content.get('html', '').replace('`', escaped_backtick)
        markdown_content = content.get('markdown', '').replace('`', escaped_backtick)
        
        js_code = f"""// Auto-generated MAD document creation code
import init, {{ MadBuilder, McpServer }} from '../pkg/mad_runtime.js';

async function createDocumentFromPDF() {{
    // Initialize WASM
    await init();
    
    // Create document builder
    const builder = new MadBuilder("{metadata['title']}", "{metadata['author']}");
    
    // Add content
    const htmlContentId = builder.add_html_content(`{html_content}`);
    const markdownContentId = builder.add_markdown_content(`{markdown_content}`);
    
"""
        
        # Add embeddings if available
        if mad_document.get("embeddings"):
            js_code += "    // Add vector embeddings\n"
            for emb_id, emb_data in list(mad_document["embeddings"].items())[:5]:  # Limit for example
                js_code += f"    builder.add_vector_embedding(htmlContentId, {json.dumps(emb_data['embedding'])});\n"
        
        # Add entities if available
        if mad_document.get("entities"):
            js_code += "\n    // Create entities\n"
            for ent_id, ent_data in list(mad_document["entities"].items())[:10]:  # Limit for example
                properties = json.dumps({
                    "text": ent_data["text"],
                    "label": ent_data["label"],
                    "description": ent_data.get("description", "")
                })
                js_code += f"    builder.create_entity(\"{ent_id}\", \"{ent_data['label']}\", '{properties}');\n"
        
        # Add relationships if available
        if mad_document.get("relationships"):
            js_code += "\n    // Create relationships\n"
            for rel_id, rel_data in list(mad_document["relationships"].items())[:10]:  # Limit for example
                properties = json.dumps({
                    "type": rel_data["type"],
                    "distance": rel_data.get("distance", 0),
                    "confidence": rel_data.get("confidence", 1.0)
                })
                js_code += f"    builder.create_relationship(\"{rel_data['from']}\", \"{rel_data['to']}\", \"{rel_data['type']}\", '{properties}');\n"
        
        js_code += f"""
    // Build the document
    builder.build();
    const document = builder.get_document();
    
    // Create MCP server
    const mcpServer = new McpServer();
    mcpServer.set_document(document);
    
    console.log("MAD document created successfully!");
    console.log("Content hash:", document.calculate_content_hash());
    console.log("Document ID: {mad_document['document_id']}");
    
    return {{ document, mcpServer, builder }};
}}

// Export for use
export {{ createDocumentFromPDF }};

// Auto-run if in browser
if (typeof window !== 'undefined') {{
    window.createDocumentFromPDF = createDocumentFromPDF;
}}
"""
        
        return js_code

def main():
    """Command-line interface for PDF to MAD conversion."""
    parser = argparse.ArgumentParser(description="Convert PDF documents to MAD format using Docling")
    parser.add_argument("pdf_path", help="Path to PDF file to convert")
    parser.add_argument("-o", "--output", help="Output directory for MAD files")
    parser.add_argument("-t", "--title", help="Document title (auto-extracted if not provided)")
    parser.add_argument("-a", "--author", help="Document author (auto-extracted if not provided)")
    parser.add_argument("-e", "--embedding-model", default="all-MiniLM-L6-v2", 
                       help="Sentence transformer model for embeddings")
    parser.add_argument("-s", "--spacy-model", default="en_core_web_sm",
                       help="spaCy model for entity extraction")
    parser.add_argument("-v", "--verbose", action="store_true", help="Enable verbose logging")
    
    args = parser.parse_args()
    
    # Setup logging
    logging.basicConfig(
        level=logging.INFO if args.verbose else logging.WARNING,
        format='%(asctime)s - %(levelname)s - %(message)s'
    )
    
    # Check if PDF file exists
    if not os.path.exists(args.pdf_path):
        print(f"Error: PDF file not found: {args.pdf_path}")
        sys.exit(1)
    
    try:
        # Create converter
        converter = PDFToMADConverter(
            embedding_model=args.embedding_model,
            spacy_model=args.spacy_model
        )
        
        # Convert PDF
        result = converter.convert_pdf_to_mad(
            pdf_path=args.pdf_path,
            output_dir=args.output,
            title=args.title,
            author=args.author
        )
        
        print(f"✅ Conversion successful!")
        print(f"📁 Output directory: {result['output_directory']}")
        print(f"🔍 Document hash: {result['document_hash']}")
        print(f"📊 Statistics:")
        for key, value in result['statistics'].items():
            print(f"   {key}: {value}")
        
        print(f"\n🚀 To use the MAD document:")
        print(f"   1. Build WASM: cd mad && wasm-pack build --target web")
        print(f"   2. Run JavaScript: node {result['javascript_file']}")
        
    except Exception as e:
        print(f"❌ Conversion failed: {e}")
        if args.verbose:
            import traceback
            traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    main()