#!/usr/bin/env python3
"""
Example usage of the PDF to MAD converter
"""

import os
import sys
from pathlib import Path

# Add tools directory to path
sys.path.append(str(Path(__file__).parent))

from pdf_to_mad import PDFToMADConverter

def example_conversion():
    """Example of converting a PDF to MAD format."""
    
    # Initialize converter
    converter = PDFToMADConverter(
        embedding_model="all-MiniLM-L6-v2",  # Lightweight embedding model
        spacy_model="en_core_web_sm"         # Standard English model
    )
    
    # Example PDF path (you would replace this with an actual PDF)
    pdf_path = "example_document.pdf"
    
    # Check if example PDF exists
    if not os.path.exists(pdf_path):
        print(f"⚠️  Example PDF not found: {pdf_path}")
        print("📝 To test the converter:")
        print("   1. Place a PDF file named 'example_document.pdf' in this directory")
        print("   2. Or run: python3 pdf_to_mad.py your_document.pdf")
        return
    
    try:
        # Convert PDF to MAD format
        result = converter.convert_pdf_to_mad(
            pdf_path=pdf_path,
            output_dir="example_output",
            title="Example Research Paper",  # Optional: auto-extracted if not provided
            author="AI Researcher"           # Optional: auto-extracted if not provided
        )
        
        print("🎉 Conversion completed successfully!")
        print(f"📁 Output: {result['output_directory']}")
        print(f"🔍 Document Hash: {result['document_hash']}")
        print("\n📊 Statistics:")
        for key, value in result['statistics'].items():
            print(f"   {key}: {value}")
        
        print(f"\n📋 Generated Files:")
        for file_type, file_path in result['mad_files'].items():
            print(f"   {file_type}: {file_path}")
        
        print(f"\n🚀 Next Steps:")
        print(f"   1. Build WASM: cd ../mad && wasm-pack build --target web")
        print(f"   2. Test JavaScript: node {result['javascript_file']}")
        print(f"   3. View content: cat {result['mad_files']['content']}")
        
    except Exception as e:
        print(f"❌ Conversion failed: {e}")
        import traceback
        traceback.print_exc()

def test_with_arxiv_pdf():
    """Test with a PDF from arXiv (demonstrates Docling's capabilities)."""
    
    print("🔬 Testing with arXiv PDF...")
    
    # Use Docling's example - download a paper from arXiv
    arxiv_url = "https://arxiv.org/pdf/2408.09869"  # Docling paper itself!
    
    converter = PDFToMADConverter()
    
    try:
        result = converter.convert_pdf_to_mad(
            pdf_path=arxiv_url,  # Docling can handle URLs directly
            output_dir="arxiv_docling_paper_mad",
            title="Docling Technical Report",
            author="IBM Research"
        )
        
        print("🎉 arXiv PDF conversion completed!")
        print(f"📁 Output: {result['output_directory']}")
        print(f"🔍 Hash: {result['document_hash']}")
        
        # Show some extracted content
        import json
        content_file = Path(result['mad_files']['content'])
        with open(content_file) as f:
            content = json.load(f)
            
        print(f"\n📄 Extracted {len(content.get('text_chunks', []))} text chunks")
        print(f"📊 Found {len(content.get('tables', []))} tables")
        print(f"🖼️  Found {len(content.get('images', []))} images")
        print(f"📚 Found {len(content.get('headings', []))} headings")
        
        # Show first few headings
        if content.get('headings'):
            print("\n📋 Document Structure:")
            for i, heading in enumerate(content['headings'][:5]):
                print(f"   {i+1}. {heading['text'][:80]}...")
        
    except Exception as e:
        print(f"❌ arXiv conversion failed: {e}")
        print("💡 Make sure you have internet connection for downloading the PDF")

if __name__ == "__main__":
    print("🔄 PDF to MAD Converter - Example Usage")
    print("=" * 50)
    
    # Choose which example to run
    import sys
    if len(sys.argv) > 1 and sys.argv[1] == "--arxiv":
        test_with_arxiv_pdf()
    else:
        example_conversion()
        print("\n💡 To test with arXiv paper: python3 example_usage.py --arxiv")