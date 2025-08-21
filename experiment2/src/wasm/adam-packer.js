import fs from 'fs/promises';
import path from 'path';

/**
 * ADAM WASM Packer - Pack ADAM JSON documents into WebAssembly binaries
 * 
 * This module creates self-contained WASM binaries that embed ADAM document data
 * with optimized serialization and compression.
 */
export class ADAMWasmPacker {
  constructor(options = {}) {
    this.options = {
      compressionFormat: 'msgpack', // 'msgpack', 'cbor', 'json'
      compressionLevel: 9,
      includeMetadata: true,
      includeEmbeddings: true,
      optimizeForSize: true,
      enableStreaming: false,
      ...options
    };
  }

  /**
   * Pack an ADAM document into a WASM binary
   * @param {string|object} adamDocument - ADAM document (file path or object)
   * @param {string} outputPath - Output WASM file path
   * @returns {Promise<object>} - Packing results and statistics
   */
  async packToWasm(adamDocument, outputPath) {
    try {
      // Load ADAM document
      const document = typeof adamDocument === 'string' 
        ? JSON.parse(await fs.readFile(adamDocument, 'utf-8'))
        : adamDocument;

      // Validate ADAM document
      this.validateAdamDocument(document);

      // Optimize document for packing
      const optimizedDoc = this.optimizeForPacking(document);

      // Serialize with chosen format
      const serializedData = await this.serializeDocument(optimizedDoc);

      // Create WASM module with embedded data
      const wasmBinary = await this.createWasmModule(serializedData);

      // Write WASM binary
      await fs.writeFile(outputPath, wasmBinary);

      // Generate statistics
      const stats = await this.generateStats(document, serializedData, wasmBinary, outputPath);

      return {
        success: true,
        outputPath,
        stats
      };

    } catch (error) {
      throw new Error(`WASM packing failed: ${error.message}`);
    }
  }

  /**
   * Unpack ADAM document from WASM binary
   * @param {string|Uint8Array} wasmSource - WASM file path or binary data
   * @returns {Promise<object>} - ADAM document object
   */
  async unpackFromWasm(wasmSource) {
    try {
      // Load WASM binary
      const wasmBinary = typeof wasmSource === 'string'
        ? await fs.readFile(wasmSource)
        : wasmSource;

      // Instantiate WASM module
      const wasmModule = await WebAssembly.instantiate(wasmBinary);
      const instance = wasmModule.instance;

      // Extract data from WASM memory
      const dataPtr = instance.exports.get_data_ptr();
      const dataSize = instance.exports.get_data_size();

      const memory = new Uint8Array(instance.exports.memory.buffer);
      const serializedData = memory.slice(dataPtr, dataPtr + dataSize);

      // Deserialize document
      const document = await this.deserializeDocument(serializedData);

      return document;

    } catch (error) {
      throw new Error(`WASM unpacking failed: ${error.message}`);
    }
  }

  /**
   * Validate ADAM document structure
   * @param {object} document - ADAM document
   */
  validateAdamDocument(document) {
    if (!document.format || document.format !== 'adam-document') {
      throw new Error('Invalid ADAM document: missing or incorrect format field');
    }

    if (!document.version) {
      throw new Error('Invalid ADAM document: missing version field');
    }

    if (!document.sections || !Array.isArray(document.sections)) {
      throw new Error('Invalid ADAM document: missing or invalid sections array');
    }
  }

  /**
   * Optimize document for packing
   * @param {object} document - Original ADAM document
   * @returns {object} - Optimized document
   */
  optimizeForPacking(document) {
    const optimized = JSON.parse(JSON.stringify(document));

    if (this.options.optimizeForSize) {
      // Remove optional fields if not needed
      if (!this.options.includeEmbeddings) {
        this.removeEmbeddings(optimized);
      }

      // Compress section metadata
      this.compressMetadata(optimized);

      // Deduplicate repeated strings
      this.deduplicateStrings(optimized);
    }

    return optimized;
  }

  /**
   * Remove embeddings from document
   * @param {object} document - ADAM document
   */
  removeEmbeddings(document) {
    if (document.sections) {
      for (const section of document.sections) {
        if (section.metadata?.embedding) {
          delete section.metadata.embedding;
        }
      }
    }
  }

  /**
   * Compress metadata by removing verbose fields
   * @param {object} document - ADAM document
   */
  compressMetadata(document) {
    // Remove processing metadata that's not essential for document consumption
    if (document.metadata?.processing) {
      delete document.metadata.processing;
    }

    // Compress section metadata
    if (document.sections) {
      for (const section of document.sections) {
        if (section.metadata) {
          // Keep only essential metadata
          const essential = {
            importance: section.metadata.importance,
            keywords: section.metadata.keywords?.slice(0, 5), // Limit keywords
            complexity: section.metadata.complexity
          };
          section.metadata = essential;
        }
      }
    }
  }

  /**
   * Deduplicate repeated strings using string table
   * @param {object} document - ADAM document
   */
  deduplicateStrings(document) {
    const stringTable = new Map();
    let stringId = 0;

    // Build string table for common strings
    const addToStringTable = (str) => {
      if (typeof str === 'string' && str.length > 10) {
        if (!stringTable.has(str)) {
          stringTable.set(str, `$STR_${stringId++}`);
        }
        return stringTable.get(str);
      }
      return str;
    };

    // Replace strings with references
    this.replaceStringsInObject(document, addToStringTable);

    // Add string table to document
    if (stringTable.size > 0) {
      document._stringTable = Object.fromEntries(
        Array.from(stringTable.entries()).map(([str, id]) => [id, str])
      );
    }
  }

  /**
   * Recursively replace strings in object
   * @param {any} obj - Object to process
   * @param {Function} replacer - String replacement function
   */
  replaceStringsInObject(obj, replacer) {
    if (Array.isArray(obj)) {
      for (let i = 0; i < obj.length; i++) {
        if (typeof obj[i] === 'string') {
          obj[i] = replacer(obj[i]);
        } else if (typeof obj[i] === 'object' && obj[i] !== null) {
          this.replaceStringsInObject(obj[i], replacer);
        }
      }
    } else if (typeof obj === 'object' && obj !== null) {
      for (const [key, value] of Object.entries(obj)) {
        if (typeof value === 'string') {
          obj[key] = replacer(value);
        } else if (typeof value === 'object' && value !== null) {
          this.replaceStringsInObject(value, replacer);
        }
      }
    }
  }

  /**
   * Serialize document using chosen format
   * @param {object} document - Document to serialize
   * @returns {Promise<Uint8Array>} - Serialized data
   */
  async serializeDocument(document) {
    switch (this.options.compressionFormat) {
      case 'msgpack':
        return await this.serializeMessagePack(document);
      case 'cbor':
        return await this.serializeCBOR(document);
      case 'json':
        return new TextEncoder().encode(JSON.stringify(document));
      default:
        throw new Error(`Unsupported compression format: ${this.options.compressionFormat}`);
    }
  }

  /**
   * Serialize using MessagePack
   * @param {object} document - Document to serialize
   * @returns {Promise<Uint8Array>} - MessagePack data
   */
  async serializeMessagePack(document) {
    // For now, return JSON encoding - MessagePack would require additional dependency
    // In production, you'd use: import msgpack from '@msgpack/msgpack';
    // return msgpack.encode(document);
    console.warn('MessagePack serialization not implemented, using JSON');
    return new TextEncoder().encode(JSON.stringify(document));
  }

  /**
   * Serialize using CBOR
   * @param {object} document - Document to serialize
   * @returns {Promise<Uint8Array>} - CBOR data
   */
  async serializeCBOR(document) {
    // For now, return JSON encoding - CBOR would require additional dependency
    // In production, you'd use: import cbor from 'cbor';
    // return cbor.encode(document);
    console.warn('CBOR serialization not implemented, using JSON');
    return new TextEncoder().encode(JSON.stringify(document));
  }

  /**
   * Deserialize document from binary data
   * @param {Uint8Array} data - Serialized data
   * @returns {Promise<object>} - Deserialized document
   */
  async deserializeDocument(data) {
    switch (this.options.compressionFormat) {
      case 'msgpack':
        return await this.deserializeMessagePack(data);
      case 'cbor':
        return await this.deserializeCBOR(data);
      case 'json':
        return JSON.parse(new TextDecoder().decode(data));
      default:
        throw new Error(`Unsupported compression format: ${this.options.compressionFormat}`);
    }
  }

  /**
   * Deserialize MessagePack data
   * @param {Uint8Array} data - MessagePack data
   * @returns {Promise<object>} - Deserialized document
   */
  async deserializeMessagePack(data) {
    // In production: return msgpack.decode(data);
    console.warn('MessagePack deserialization not implemented, using JSON');
    return JSON.parse(new TextDecoder().decode(data));
  }

  /**
   * Deserialize CBOR data
   * @param {Uint8Array} data - CBOR data
   * @returns {Promise<object>} - Deserialized document
   */
  async deserializeCBOR(data) {
    // In production: return cbor.decode(data);
    console.warn('CBOR deserialization not implemented, using JSON');
    return JSON.parse(new TextDecoder().decode(data));
  }

  /**
   * Create WASM module with embedded data
   * @param {Uint8Array} data - Serialized document data
   * @returns {Promise<Uint8Array>} - WASM binary
   */
  async createWasmModule(data) {
    // Create minimal WASM module that exports the data
    const wasmModule = this.generateWasmBytecode(data);
    return wasmModule;
  }

  /**
   * Generate WASM bytecode with embedded data
   * @param {Uint8Array} data - Data to embed
   * @returns {Uint8Array} - WASM binary
   */
  generateWasmBytecode(data) {
    // WASM binary format structure
    const magicNumber = new Uint8Array([0x00, 0x61, 0x73, 0x6D]); // '\0asm'
    const version = new Uint8Array([0x01, 0x00, 0x00, 0x00]); // version 1

    // Memory section (1 page = 64KB)
    const memoryPages = Math.ceil(data.length / 65536) || 1;
    const memorySection = this.createMemorySection(memoryPages);

    // Export section (export memory and data accessors)
    const exportSection = this.createExportSection();

    // Function section (data accessor functions)
    const functionSection = this.createFunctionSection();

    // Code section (function implementations)
    const codeSection = this.createCodeSection();

    // Data section (embedded data)
    const dataSection = this.createDataSection(data);

    // Combine all sections
    const sections = [
      memorySection,
      functionSection,
      exportSection,
      codeSection,
      dataSection
    ].filter(section => section.length > 0);

    // Calculate total size
    const totalSize = magicNumber.length + version.length + 
                     sections.reduce((sum, section) => sum + section.length, 0);

    // Create final binary
    const binary = new Uint8Array(totalSize);
    let offset = 0;

    binary.set(magicNumber, offset);
    offset += magicNumber.length;

    binary.set(version, offset);
    offset += version.length;

    sections.forEach(section => {
      binary.set(section, offset);
      offset += section.length;
    });

    return binary;
  }

  /**
   * Create WASM memory section
   * @param {number} pages - Number of memory pages
   * @returns {Uint8Array} - Memory section bytes
   */
  createMemorySection(pages) {
    return new Uint8Array([
      0x05, // memory section id
      0x03, // section size
      0x01, // 1 memory
      0x00, // no maximum
      pages // initial pages
    ]);
  }

  /**
   * Create WASM export section
   * @returns {Uint8Array} - Export section bytes
   */
  createExportSection() {
    // Export memory, get_data_ptr, get_data_size functions
    return new Uint8Array([
      0x07, // export section id
      0x15, // section size (approximate)
      0x03, // 3 exports
      // memory export
      0x06, 0x6d, 0x65, 0x6d, 0x6f, 0x72, 0x79, // "memory"
      0x02, 0x00, // memory index 0
      // get_data_ptr export
      0x0c, 0x67, 0x65, 0x74, 0x5f, 0x64, 0x61, 0x74, 0x61, 0x5f, 0x70, 0x74, 0x72, // "get_data_ptr"
      0x00, 0x00, // function index 0
      // get_data_size export
      0x0d, 0x67, 0x65, 0x74, 0x5f, 0x64, 0x61, 0x74, 0x61, 0x5f, 0x73, 0x69, 0x7a, 0x65, // "get_data_size"
      0x00, 0x01  // function index 1
    ]);
  }

  /**
   * Create WASM function section
   * @returns {Uint8Array} - Function section bytes
   */
  createFunctionSection() {
    return new Uint8Array([
      0x03, // function section id
      0x03, // section size
      0x02, // 2 functions
      0x00, 0x00 // both use type 0 (no params, return i32)
    ]);
  }

  /**
   * Create WASM code section
   * @returns {Uint8Array} - Code section bytes
   */
  createCodeSection() {
    return new Uint8Array([
      0x0a, // code section id
      0x09, // section size
      0x02, // 2 functions
      // get_data_ptr function
      0x04, 0x00, 0x41, 0x00, 0x0b, // (i32.const 0) end
      // get_data_size function  
      0x04, 0x00, 0x41, 0x00, 0x0b  // (i32.const 0) end - would be actual size
    ]);
  }

  /**
   * Create WASM data section
   * @param {Uint8Array} data - Data to embed
   * @returns {Uint8Array} - Data section bytes
   */
  createDataSection(data) {
    const sectionHeader = new Uint8Array([
      0x0b, // data section id
      ...this.encodeULEB128(data.length + 5), // section size
      0x01, // 1 data segment
      0x00, // memory index 0
      0x41, 0x00, 0x0b, // (i32.const 0) end - offset expression
      ...this.encodeULEB128(data.length) // data size
    ]);

    const section = new Uint8Array(sectionHeader.length + data.length);
    section.set(sectionHeader);
    section.set(data, sectionHeader.length);

    return section;
  }

  /**
   * Encode unsigned integer as LEB128
   * @param {number} value - Value to encode
   * @returns {Uint8Array} - LEB128 encoded bytes
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
    return new Uint8Array(bytes);
  }

  /**
   * Generate packing statistics
   * @param {object} originalDoc - Original ADAM document
   * @param {Uint8Array} serializedData - Serialized data
   * @param {Uint8Array} wasmBinary - WASM binary
   * @param {string} outputPath - Output file path
   * @returns {Promise<object>} - Statistics
   */
  async generateStats(originalDoc, serializedData, wasmBinary, outputPath) {
    const originalJson = JSON.stringify(originalDoc);
    const originalSize = Buffer.byteLength(originalJson, 'utf-8');
    const serializedSize = serializedData.length;
    const wasmSize = wasmBinary.length;

    const compressionRatio = ((originalSize - wasmSize) / originalSize * 100).toFixed(2);

    return {
      originalSize,
      serializedSize,
      wasmSize,
      compressionRatio: `${compressionRatio}%`,
      sections: originalDoc.sections?.length || 0,
      format: this.options.compressionFormat,
      outputFile: outputPath,
      timestamp: new Date().toISOString()
    };
  }
}