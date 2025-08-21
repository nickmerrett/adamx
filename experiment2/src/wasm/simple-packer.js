import fs from 'fs/promises';
import zlib from 'zlib';
import { promisify } from 'util';

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

/**
 * Simplified ADAM WASM Packer using embedded data approach
 * Creates WASM modules with compressed ADAM document data
 */
export class SimpleADAMPacker {
  constructor(options = {}) {
    this.options = {
      compression: 'gzip', // 'gzip', 'none'
      removeEmbeddings: false,
      optimizeMetadata: true,
      ...options
    };
  }

  /**
   * Pack ADAM document into WASM binary
   * @param {string} inputPath - Input ADAM JSON file
   * @param {string} outputPath - Output WASM file
   * @returns {Promise<object>} - Packing results
   */
  async pack(inputPath, outputPath) {
    try {
      console.log(`📦 Packing ADAM document: ${inputPath}`);

      // Load ADAM document
      const adamDoc = JSON.parse(await fs.readFile(inputPath, 'utf-8'));
      
      // Optimize document
      const optimized = this.optimizeDocument(adamDoc);
      
      // Serialize to JSON
      const jsonData = JSON.stringify(optimized);
      const jsonBytes = Buffer.from(jsonData, 'utf-8');
      
      // Apply compression
      const compressedData = this.options.compression === 'gzip' 
        ? await gzip(jsonBytes)
        : jsonBytes;
      
      // Create WASM module with embedded data
      const wasmBinary = this.createWasmWithEmbeddedData(compressedData);
      
      // Write WASM file
      await fs.writeFile(outputPath, wasmBinary);
      
      // Generate statistics
      const stats = {
        originalSize: jsonBytes.length,
        compressedSize: compressedData.length,
        wasmSize: wasmBinary.length,
        compressionRatio: ((jsonBytes.length - compressedData.length) / jsonBytes.length * 100).toFixed(1),
        sections: adamDoc.sections?.length || 0,
        format: this.options.compression,
        optimizations: {
          embeddingsRemoved: this.options.removeEmbeddings,
          metadataOptimized: this.options.optimizeMetadata
        }
      };
      
      console.log(`✅ WASM packing completed!`);
      console.log(`📊 Original: ${this.formatBytes(stats.originalSize)}`);
      console.log(`🗜️  Compressed: ${this.formatBytes(stats.compressedSize)} (${stats.compressionRatio}% reduction)`);
      console.log(`📦 WASM: ${this.formatBytes(stats.wasmSize)}`);
      console.log(`📄 Sections: ${stats.sections}`);
      
      return { success: true, stats, outputPath };
      
    } catch (error) {
      throw new Error(`WASM packing failed: ${error.message}`);
    }
  }

  /**
   * Unpack ADAM document from WASM binary
   * @param {string} wasmPath - WASM file path
   * @returns {Promise<object>} - ADAM document
   */
  async unpack(wasmPath) {
    try {
      console.log(`📂 Unpacking WASM file: ${wasmPath}`);
      
      const wasmBinary = await fs.readFile(wasmPath);
      
      // Extract embedded data from WASM
      const embeddedData = this.extractEmbeddedData(wasmBinary);
      
      // Decompress if needed
      const jsonData = this.options.compression === 'gzip'
        ? await gunzip(embeddedData)
        : embeddedData;
      
      // Parse JSON
      const adamDoc = JSON.parse(jsonData.toString('utf-8'));
      
      console.log(`✅ WASM unpacking completed!`);
      console.log(`📄 Document: ${adamDoc.metadata?.title || 'Untitled'}`);
      console.log(`📊 Sections: ${adamDoc.sections?.length || 0}`);
      
      return adamDoc;
      
    } catch (error) {
      throw new Error(`WASM unpacking failed: ${error.message}`);
    }
  }

  /**
   * Optimize ADAM document for packing
   * @param {object} doc - Original ADAM document
   * @returns {object} - Optimized document
   */
  optimizeDocument(doc) {
    const optimized = JSON.parse(JSON.stringify(doc));

    // Remove embeddings if requested
    if (this.options.removeEmbeddings && optimized.sections) {
      let removedEmbeddings = 0;
      for (const section of optimized.sections) {
        if (section.metadata?.embedding) {
          delete section.metadata.embedding;
          removedEmbeddings++;
        }
      }
      console.log(`🔧 Removed ${removedEmbeddings} embeddings`);
    }

    // Optimize metadata
    if (this.options.optimizeMetadata) {
      this.optimizeMetadata(optimized);
    }

    return optimized;
  }

  /**
   * Optimize metadata by removing verbose processing info
   * @param {object} doc - ADAM document
   */
  optimizeMetadata(doc) {
    let fieldsRemoved = 0;

    // Remove processing metadata from document level
    if (doc.metadata?.processing) {
      delete doc.metadata.processing;
      fieldsRemoved++;
    }

    // Optimize section metadata
    if (doc.sections) {
      for (const section of doc.sections) {
        if (section.metadata) {
          // Remove verbose fields
          const verboseFields = ['processing_confidence', 'extraction_method', 'analysis_timestamp'];
          for (const field of verboseFields) {
            if (section.metadata[field]) {
              delete section.metadata[field];
              fieldsRemoved++;
            }
          }

          // Limit keywords to top 5
          if (section.metadata.keywords && section.metadata.keywords.length > 5) {
            section.metadata.keywords = section.metadata.keywords.slice(0, 5);
          }
        }
      }
    }

    if (fieldsRemoved > 0) {
      console.log(`🔧 Optimized ${fieldsRemoved} metadata fields`);
    }
  }

  /**
   * Create WASM binary with embedded data and MCP server capabilities
   * This creates a WASM module that stores data and exports MCP functions
   * @param {Buffer} data - Data to embed
   * @returns {Buffer} - WASM binary
   */
  createWasmWithEmbeddedData(data) {
    // WASM binary format: magic number + version + sections
    const magic = Buffer.from([0x00, 0x61, 0x73, 0x6D]); // '\0asm'
    const version = Buffer.from([0x01, 0x00, 0x00, 0x00]); // version 1
    
    // Type section: define function signature () -> i32
    const typeSection = this.createSection(1, Buffer.from([
      0x01, // 1 type
      0x60, // func type
      0x00, // 0 params
      0x01, 0x7F // 1 result: i32
    ]));
    
    // Function section: declare 2 functions of type 0
    const functionSection = this.createSection(3, Buffer.from([
      0x02, // 2 functions
      0x00, 0x00 // both use type 0
    ]));
    
    // Memory section: 1 memory with at least enough pages for data
    const pages = Math.max(1, Math.ceil(data.length / 65536));
    const memorySection = this.createSection(5, Buffer.from([
      0x01, // 1 memory
      0x00, // no maximum limit
      pages // initial pages
    ]));
    
    // Export section: export memory and functions
    const exportSection = this.createSection(7, Buffer.concat([
      Buffer.from([0x03]), // 3 exports
      // Export memory
      this.createExport('memory', 2, 0),
      // Export get_data_ptr function
      this.createExport('get_data_ptr', 0, 0),
      // Export get_data_size function  
      this.createExport('get_data_size', 0, 1)
    ]));
    
    // Code section: implement functions
    const codeSection = this.createSection(10, Buffer.concat([
      Buffer.from([0x02]), // 2 functions
      // get_data_ptr: returns 0 (data starts at memory offset 0)
      this.createFunction(Buffer.from([0x41, 0x00, 0x0B])), // i32.const 0, end
      // get_data_size: returns data length
      this.createFunction(Buffer.concat([
        Buffer.from([0x41]), // i32.const
        this.encodeULEB128(data.length),
        Buffer.from([0x0B]) // end
      ]))
    ]));
    
    // Data section: embed the actual data
    const dataSection = this.createSection(11, Buffer.concat([
      Buffer.from([0x01]), // 1 data segment
      Buffer.from([0x00]), // memory index 0
      Buffer.from([0x41, 0x00, 0x0B]), // offset expression: i32.const 0, end
      this.encodeULEB128(data.length), // data size
      data // actual data
    ]));
    
    // Combine all sections
    return Buffer.concat([
      magic,
      version,
      typeSection,
      functionSection,
      memorySection,
      exportSection,
      codeSection,
      dataSection
    ]);
  }

  /**
   * Create WASM section with header
   * @param {number} sectionId - Section ID
   * @param {Buffer} content - Section content
   * @returns {Buffer} - Complete section
   */
  createSection(sectionId, content) {
    return Buffer.concat([
      Buffer.from([sectionId]),
      this.encodeULEB128(content.length),
      content
    ]);
  }

  /**
   * Create WASM export entry
   * @param {string} name - Export name
   * @param {number} kind - Export kind (0=func, 1=table, 2=memory, 3=global)
   * @param {number} index - Export index
   * @returns {Buffer} - Export entry
   */
  createExport(name, kind, index) {
    const nameBytes = Buffer.from(name, 'utf-8');
    return Buffer.concat([
      this.encodeULEB128(nameBytes.length),
      nameBytes,
      Buffer.from([kind]),
      this.encodeULEB128(index)
    ]);
  }

  /**
   * Create WASM function body
   * @param {Buffer} code - Function bytecode
   * @returns {Buffer} - Function with size prefix
   */
  createFunction(code) {
    // Function body: locals count (0) + code
    const body = Buffer.concat([
      Buffer.from([0x00]), // 0 locals
      code
    ]);
    return Buffer.concat([
      this.encodeULEB128(body.length),
      body
    ]);
  }

  /**
   * Encode number as unsigned LEB128
   * @param {number} value - Value to encode
   * @returns {Buffer} - LEB128 encoded value
   */
  encodeULEB128(value) {
    const bytes = [];
    do {
      let byte = value & 0x7F;
      value >>>= 7;
      if (value !== 0) {
        byte |= 0x80;
      }
      bytes.push(byte);
    } while (value !== 0);
    return Buffer.from(bytes);
  }

  /**
   * Extract embedded data from WASM binary
   * @param {Buffer} wasmBinary - WASM binary
   * @returns {Buffer} - Extracted data
   */
  extractEmbeddedData(wasmBinary) {
    // Verify WASM magic number
    if (wasmBinary.length < 8 || 
        wasmBinary[0] !== 0x00 || wasmBinary[1] !== 0x61 || 
        wasmBinary[2] !== 0x73 || wasmBinary[3] !== 0x6D) {
      throw new Error('Invalid WASM magic number');
    }
    
    // Look for data section (section ID 11)
    let offset = 8; // Skip magic and version
    
    while (offset < wasmBinary.length) {
      if (offset >= wasmBinary.length) {
        throw new Error('Unexpected end of WASM binary while reading section ID');
      }
      
      const sectionId = wasmBinary[offset++];
      
      if (offset >= wasmBinary.length) {
        throw new Error('Unexpected end of WASM binary while reading section size');
      }
      
      const sectionSize = this.decodeULEB128(wasmBinary, offset);
      const sectionSizeBytes = this.getULEB128Size(wasmBinary, offset);
      offset += sectionSizeBytes;
      
      if (sectionId === 11) { // Data section
        // Skip: segment count (1) 
        if (offset >= wasmBinary.length) {
          throw new Error('Unexpected end of WASM binary in data section');
        }
        const segmentCount = wasmBinary[offset++];
        
        // Skip: memory index (0)
        if (offset >= wasmBinary.length) {
          throw new Error('Unexpected end of WASM binary reading memory index');
        }
        const memoryIndex = wasmBinary[offset++];
        
        // Skip: offset expr (i32.const 0, end) = [0x41, 0x00, 0x0B]
        if (offset + 3 > wasmBinary.length) {
          throw new Error('Unexpected end of WASM binary reading offset expression');
        }
        offset += 3; // Skip offset expression
        
        // Read data size
        if (offset >= wasmBinary.length) {
          throw new Error('Unexpected end of WASM binary reading data size');
        }
        
        const dataSize = this.decodeULEB128(wasmBinary, offset);
        const dataSizeBytes = this.getULEB128Size(wasmBinary, offset);
        offset += dataSizeBytes;
        
        // Extract data
        if (offset + dataSize > wasmBinary.length) {
          throw new Error(`Insufficient data: expected ${dataSize} bytes, but only ${wasmBinary.length - offset} available`);
        }
        
        return wasmBinary.slice(offset, offset + dataSize);
      } else {
        // Skip other sections
        offset += sectionSize;
      }
    }
    
    throw new Error('No data section found in WASM binary');
  }

  /**
   * Decode unsigned LEB128
   * @param {Buffer} buffer - Buffer containing LEB128
   * @param {number} offset - Start offset
   * @returns {number} - Decoded value
   */
  decodeULEB128(buffer, offset) {
    let result = 0;
    let shift = 0;
    
    while (offset < buffer.length) {
      const byte = buffer[offset++];
      result |= (byte & 0x7F) << shift;
      if ((byte & 0x80) === 0) break;
      shift += 7;
    }
    
    return result;
  }

  /**
   * Get size of LEB128 encoding
   * @param {Buffer} buffer - Buffer containing LEB128
   * @param {number} offset - Start offset
   * @returns {number} - Size in bytes
   */
  getULEB128Size(buffer, offset) {
    let size = 0;
    while (offset + size < buffer.length) {
      if ((buffer[offset + size] & 0x80) === 0) {
        size++;
        break;
      }
      size++;
    }
    return size;
  }

  /**
   * Format bytes as human-readable string
   * @param {number} bytes - Number of bytes
   * @returns {string} - Formatted string
   */
  formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return (bytes / Math.pow(k, i)).toFixed(1) + ' ' + sizes[i];
  }
}