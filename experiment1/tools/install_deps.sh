#!/bin/bash
# Installation script for PDF to MAD conversion tool dependencies

set -e

echo "🔧 Installing PDF to MAD conversion tool dependencies..."

# Check if Python is available
if ! command -v python3 &> /dev/null; then
    echo "❌ Python 3 is required but not installed."
    exit 1
fi

echo "📦 Installing Python packages..."
pip3 install -r requirements.txt

echo "🧠 Downloading spaCy language models..."
python3 -m spacy download en_core_web_sm

# Optional: Download larger model for better accuracy
read -p "📚 Download larger spaCy model (en_core_web_lg) for better accuracy? [y/N]: " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    python3 -m spacy download en_core_web_lg
fi

echo "🔍 Verifying installation..."

# Test Docling
python3 -c "
try:
    from docling.document_converter import DocumentConverter
    print('✅ Docling installed successfully')
except ImportError as e:
    print(f'❌ Docling installation failed: {e}')
    exit(1)
"

# Test sentence-transformers
python3 -c "
try:
    from sentence_transformers import SentenceTransformer
    print('✅ sentence-transformers installed successfully')
except ImportError as e:
    print(f'❌ sentence-transformers installation failed: {e}')
"

# Test spaCy
python3 -c "
try:
    import spacy
    nlp = spacy.load('en_core_web_sm')
    print('✅ spaCy and language model installed successfully')
except ImportError as e:
    print(f'❌ spaCy installation failed: {e}')
except OSError as e:
    print(f'❌ spaCy language model not found: {e}')
    print('Run: python -m spacy download en_core_web_sm')
"

echo "🎉 Installation complete!"
echo "📖 Usage: python3 pdf_to_mad.py <pdf_file> [options]"
echo "📚 Examples:"
echo "   python3 pdf_to_mad.py document.pdf"
echo "   python3 pdf_to_mad.py document.pdf -o output_folder -t 'Custom Title'"