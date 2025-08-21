import fs from 'fs/promises';
import path from 'path';

/**
 * Schema validator for ADAM documents
 */

/**
 * Validate ADAM document against schema
 * @param {object} document - ADAM document to validate
 * @returns {Promise<boolean>} - True if valid
 */
export async function validateSchema(document) {
  try {
    // Basic structure validation
    if (!isValidBasicStructure(document)) {
      return false;
    }

    // Validate metadata
    if (!isValidMetadata(document.metadata)) {
      return false;
    }

    // Validate sections
    if (!isValidSections(document.sections)) {
      return false;
    }

    // Validate relationships
    if (!isValidRelationships(document.sections)) {
      return false;
    }

    return true;

  } catch (error) {
    console.warn(`Schema validation error: ${error.message}`);
    return false;
  }
}

/**
 * Validate basic document structure
 * @param {object} document - Document to validate
 * @returns {boolean} - True if valid
 */
function isValidBasicStructure(document) {
  // Required top-level fields
  const requiredFields = ['format', 'version', 'metadata', 'sections'];
  
  for (const field of requiredFields) {
    if (!document.hasOwnProperty(field)) {
      console.warn(`Missing required field: ${field}`);
      return false;
    }
  }

  // Check format
  if (document.format !== 'adam-document') {
    console.warn(`Invalid format: ${document.format}`);
    return false;
  }

  // Check version format
  if (!/^\d+\.\d+\.\d+$/.test(document.version)) {
    console.warn(`Invalid version format: ${document.version}`);
    return false;
  }

  // Check sections is array
  if (!Array.isArray(document.sections)) {
    console.warn('Sections must be an array');
    return false;
  }

  // Check minimum sections
  if (document.sections.length === 0) {
    console.warn('Document must have at least one section');
    return false;
  }

  return true;
}

/**
 * Validate metadata
 * @param {object} metadata - Metadata to validate
 * @returns {boolean} - True if valid
 */
function isValidMetadata(metadata) {
  if (!metadata || typeof metadata !== 'object') {
    console.warn('Metadata must be an object');
    return false;
  }

  // Required metadata fields
  const requiredFields = ['title', 'created', 'modified'];
  
  for (const field of requiredFields) {
    if (!metadata.hasOwnProperty(field)) {
      console.warn(`Missing required metadata field: ${field}`);
      return false;
    }
  }

  // Validate dates
  if (!isValidDate(metadata.created)) {
    console.warn(`Invalid created date: ${metadata.created}`);
    return false;
  }

  if (!isValidDate(metadata.modified)) {
    console.warn(`Invalid modified date: ${metadata.modified}`);
    return false;
  }

  // Validate authors if present
  if (metadata.authors && !isValidAuthors(metadata.authors)) {
    return false;
  }

  return true;
}

/**
 * Validate sections array
 * @param {Array} sections - Sections to validate
 * @returns {boolean} - True if valid
 */
function isValidSections(sections) {
  const sectionIds = new Set();
  const validTypes = [
    'paragraph', 'heading', 'list', 'code', 'quote', 
    'image', 'table', 'math', 'figure', 'diagram', 'chart', 'custom'
  ];

  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];

    // Required section fields
    if (!section.id || !section.type || section.content === undefined) {
      console.warn(`Section ${i} missing required fields (id, type, content)`);
      return false;
    }

    // Check ID uniqueness
    if (sectionIds.has(section.id)) {
      console.warn(`Duplicate section ID: ${section.id}`);
      return false;
    }
    sectionIds.add(section.id);

    // Check type validity
    if (!validTypes.includes(section.type)) {
      console.warn(`Invalid section type: ${section.type}`);
      return false;
    }

    // Validate level for headings
    if (section.level !== undefined) {
      if (!Number.isInteger(section.level) || section.level < 1 || section.level > 6) {
        console.warn(`Invalid heading level: ${section.level}`);
        return false;
      }
    }

    // Validate content structure
    if (!isValidContent(section.content, section.type)) {
      console.warn(`Invalid content for section ${section.id}`);
      return false;
    }

    // Validate metadata if present
    if (section.metadata && !isValidSectionMetadata(section.metadata)) {
      console.warn(`Invalid metadata for section ${section.id}`);
      return false;
    }
  }

  return true;
}

/**
 * Validate section content
 * @param {any} content - Content to validate
 * @param {string} sectionType - Section type
 * @returns {boolean} - True if valid
 */
function isValidContent(content, sectionType) {
  // Content can be string or structured object
  if (typeof content === 'string') {
    return true; // String content is always valid
  }

  if (typeof content === 'object' && content !== null) {
    // Structured content must have type and data
    if (!content.type || content.data === undefined) {
      return false;
    }

    // Type should match or be compatible with section type
    const compatibleTypes = {
      'image': ['image'],
      'figure': ['image'],
      'diagram': ['image'],
      'chart': ['image'],
      'table': ['table'],
      'code': ['code'],
      'math': ['math'],
      'custom': ['custom']
    };

    const allowed = compatibleTypes[sectionType];
    if (allowed && !allowed.includes(content.type)) {
      return false;
    }

    return true;
  }

  return false;
}

/**
 * Validate section metadata
 * @param {object} metadata - Metadata to validate
 * @returns {boolean} - True if valid
 */
function isValidSectionMetadata(metadata) {
  if (typeof metadata !== 'object' || metadata === null) {
    return false;
  }

  // Validate importance levels
  if (metadata.importance) {
    const validImportance = ['low', 'medium', 'high', 'critical'];
    if (!validImportance.includes(metadata.importance)) {
      return false;
    }
  }

  // Validate complexity levels
  if (metadata.complexity) {
    const validComplexity = ['simple', 'moderate', 'complex', 'expert'];
    if (!validComplexity.includes(metadata.complexity)) {
      return false;
    }
  }

  // Validate priority
  if (metadata.priority !== undefined) {
    if (!Number.isInteger(metadata.priority) || metadata.priority < 1 || metadata.priority > 10) {
      return false;
    }
  }

  // Validate arrays
  const arrayFields = ['keywords', 'concepts', 'entities', 'references', 'annotations'];
  for (const field of arrayFields) {
    if (metadata[field] && !Array.isArray(metadata[field])) {
      return false;
    }
  }

  // Validate embedding
  if (metadata.embedding) {
    if (!Array.isArray(metadata.embedding) || 
        !metadata.embedding.every(val => typeof val === 'number')) {
      return false;
    }
  }

  return true;
}

/**
 * Validate relationships between sections
 * @param {Array} sections - Sections array
 * @returns {boolean} - True if valid
 */
function isValidRelationships(sections) {
  const sectionIds = new Set(sections.map(s => s.id));

  for (const section of sections) {
    if (!section.relationships) continue;

    const relationships = section.relationships;

    // Validate parent/child relationships
    if (relationships.parent && !sectionIds.has(relationships.parent)) {
      console.warn(`Invalid parent reference in section ${section.id}: ${relationships.parent}`);
      return false;
    }

    if (relationships.children) {
      if (!Array.isArray(relationships.children)) {
        console.warn(`Children must be array in section ${section.id}`);
        return false;
      }
      
      for (const childId of relationships.children) {
        if (!sectionIds.has(childId)) {
          console.warn(`Invalid child reference in section ${section.id}: ${childId}`);
          return false;
        }
      }
    }

    // Validate dependencies
    if (relationships.dependencies) {
      if (!Array.isArray(relationships.dependencies)) {
        console.warn(`Dependencies must be array in section ${section.id}`);
        return false;
      }
      
      for (const depId of relationships.dependencies) {
        if (!sectionIds.has(depId)) {
          console.warn(`Invalid dependency reference in section ${section.id}: ${depId}`);
          return false;
        }
      }
    }

    // Validate semantic similarity
    if (relationships.semantic_similarity) {
      if (!Array.isArray(relationships.semantic_similarity)) {
        console.warn(`Semantic similarity must be array in section ${section.id}`);
        return false;
      }

      for (const sim of relationships.semantic_similarity) {
        if (!sim.section_id || typeof sim.similarity_score !== 'number') {
          console.warn(`Invalid semantic similarity format in section ${section.id}`);
          return false;
        }

        if (!sectionIds.has(sim.section_id)) {
          console.warn(`Invalid semantic similarity reference in section ${section.id}: ${sim.section_id}`);
          return false;
        }

        if (sim.similarity_score < 0 || sim.similarity_score > 1) {
          console.warn(`Invalid similarity score in section ${section.id}: ${sim.similarity_score}`);
          return false;
        }
      }
    }
  }

  return true;
}

/**
 * Validate authors array
 * @param {Array} authors - Authors to validate
 * @returns {boolean} - True if valid
 */
function isValidAuthors(authors) {
  if (!Array.isArray(authors)) {
    console.warn('Authors must be an array');
    return false;
  }

  const validRoles = ['primary', 'contributor', 'reviewer', 'editor'];

  for (const author of authors) {
    if (typeof author !== 'object' || !author.name) {
      console.warn('Each author must have a name');
      return false;
    }

    if (author.role && !validRoles.includes(author.role)) {
      console.warn(`Invalid author role: ${author.role}`);
      return false;
    }

    if (author.email && !isValidEmail(author.email)) {
      console.warn(`Invalid author email: ${author.email}`);
      return false;
    }
  }

  return true;
}

/**
 * Validate date string
 * @param {string} dateString - Date to validate
 * @returns {boolean} - True if valid
 */
function isValidDate(dateString) {
  if (typeof dateString !== 'string') return false;
  
  const date = new Date(dateString);
  return !isNaN(date.getTime()) && dateString === date.toISOString();
}

/**
 * Validate email address
 * @param {string} email - Email to validate
 * @returns {boolean} - True if valid
 */
function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Generate validation report
 * @param {object} document - Document to validate
 * @returns {Promise<object>} - Validation report
 */
export async function generateValidationReport(document) {
  const report = {
    valid: false,
    errors: [],
    warnings: [],
    statistics: {
      total_sections: 0,
      sections_by_type: {},
      sections_with_embeddings: 0,
      sections_with_relationships: 0
    }
  };

  try {
    // Collect validation errors
    const originalWarn = console.warn;
    const warnings = [];
    console.warn = (message) => warnings.push(message);

    report.valid = await validateSchema(document);
    report.warnings = warnings;

    console.warn = originalWarn;

    // Generate statistics
    if (document.sections) {
      report.statistics.total_sections = document.sections.length;

      for (const section of document.sections) {
        // Count by type
        const type = section.type;
        report.statistics.sections_by_type[type] = 
          (report.statistics.sections_by_type[type] || 0) + 1;

        // Count embeddings
        if (section.metadata?.embedding) {
          report.statistics.sections_with_embeddings++;
        }

        // Count relationships
        if (section.relationships && Object.keys(section.relationships).length > 0) {
          report.statistics.sections_with_relationships++;
        }
      }
    }

  } catch (error) {
    report.errors.push(`Validation error: ${error.message}`);
  }

  return report;
}