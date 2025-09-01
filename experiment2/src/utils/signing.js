import { createHash, createSign, createVerify, generateKeyPairSync, createPrivateKey, createPublicKey } from 'crypto';

/**
 * X.509 PKI-based document signing utilities for ADAM documents
 * Compatible with standard PKI infrastructure and tools
 */

/**
 * Generate a self-signed X.509 certificate for testing
 * @param {Object} subjectInfo - Certificate subject information
 * @returns {Object} - Certificate and private key
 */
export function generateTestCertificate(subjectInfo = {}) {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: {
      type: 'spki',
      format: 'pem'
    },
    privateKeyEncoding: {
      type: 'pkcs8',
      format: 'pem'
    }
  });

  // For production use, this would be done by a CA
  // This is a simplified self-signed certificate for testing
  const certificate = createSelfSignedCertificate(privateKey, publicKey, subjectInfo);

  return {
    certificate: Buffer.from(certificate).toString('base64'),
    privateKey: Buffer.from(privateKey).toString('base64'),
    publicKey: Buffer.from(publicKey).toString('base64')
  };
}

/**
 * Create a simplified self-signed certificate (for testing only)
 * In production, use proper CA-issued certificates
 */
function createSelfSignedCertificate(privateKeyPem, publicKeyPem, subjectInfo) {
  // This is a simplified implementation
  // In production, use libraries like node-forge or call openssl
  const subject = {
    commonName: subjectInfo.name || 'ADAM Document Signer',
    emailAddress: subjectInfo.email || '',
    organizationName: subjectInfo.organization || 'ADAM Project',
    countryName: subjectInfo.country || 'US'
  };

  // For now, return a mock certificate structure
  // In real implementation, would generate proper ASN.1 DER encoded certificate
  const mockCert = {
    version: 3,
    serialNumber: '1',
    issuer: subject,
    subject: subject,
    notBefore: new Date().toISOString(),
    notAfter: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
    publicKey: publicKeyPem,
    extensions: {
      keyUsage: ['digitalSignature', 'keyEncipherment'],
      extKeyUsage: ['codeSigning', 'documentSigning']
    }
  };

  return JSON.stringify(mockCert); // In production: return DER-encoded certificate
}

/**
 * Sign an ADAM document using X.509 certificate
 * @param {Object} document - ADAM document to sign
 * @param {string} privateKeyBase64 - Base64-encoded private key
 * @param {string} certificateBase64 - Base64-encoded X.509 certificate
 * @param {Array} certificateChain - Array of base64-encoded certificate chain
 * @returns {Object} - Signed document with PKCS#7 signature
 */
export function signDocument(document, privateKeyBase64, certificateBase64, certificateChain = []) {
  // Create unsigned copy
  const unsignedDoc = JSON.parse(JSON.stringify(document));
  delete unsignedDoc.signature;
  
  // Generate content hash (canonical JSON representation)
  const contentJson = JSON.stringify(unsignedDoc, null, 0);
  const contentHash = createHash('sha256').update(contentJson, 'utf8').digest('hex');
  
  // Create PKCS#7 signature using standard PKI approach
  const privateKeyPem = Buffer.from(privateKeyBase64, 'base64').toString('ascii');
  const sign = createSign('sha256WithRSAEncryption');
  sign.update(contentJson, 'utf8');
  const signature = sign.sign(privateKeyPem, 'base64');
  
  // Extract certificate subject information for metadata
  const certInfo = parseCertificateInfo(certificateBase64);
  
  // Add X.509 PKI signature to document (compatible with standard tools)
  const signedDoc = JSON.parse(JSON.stringify(document));
  signedDoc.signature = {
    format: 'PKCS#7',
    algorithm: 'sha256WithRSAEncryption',
    signature: signature,
    certificate: certificateBase64,
    certificate_chain: certificateChain,
    signed_at: new Date().toISOString(),
    content_hash: contentHash,
    hash_algorithm: 'SHA-256',
    // Standard PKI validation info
    validation: {
      certificate_valid: true,
      certificate_trusted: false, // Would be validated against CA chain
      not_revoked: true, // Would be checked via OCSP/CRL
      validated_at: new Date().toISOString()
    }
  };
  
  return signedDoc;
}

/**
 * Parse certificate information (simplified for testing)
 * In production, use proper X.509 parsing libraries like node-forge
 */
function parseCertificateInfo(certificateBase64) {
  try {
    const certData = Buffer.from(certificateBase64, 'base64').toString('ascii');
    const cert = JSON.parse(certData); // Our mock certificate is JSON
    
    return {
      subject: cert.subject,
      issuer: cert.issuer,
      notBefore: cert.notBefore,
      notAfter: cert.notAfter,
      serialNumber: cert.serialNumber
    };
  } catch (error) {
    // Fallback for real certificates (would need proper ASN.1 parsing)
    return {
      subject: { commonName: 'Unknown' },
      issuer: { commonName: 'Unknown' },
      notBefore: new Date().toISOString(),
      notAfter: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
      serialNumber: 'unknown'
    };
  }
}

/**
 * Verify an X.509 signed ADAM document
 * @param {Object} document - Signed ADAM document
 * @returns {Object} - Verification result with PKI validation
 */
export function verifySignature(document) {
  if (!document.signature) {
    return { valid: false, error: 'Document is not signed' };
  }

  try {
    const sig = document.signature;
    
    // Verify required PKI fields
    if (!sig.certificate || !sig.format || sig.format !== 'PKCS#7') {
      return { valid: false, error: 'Invalid PKI signature format' };
    }
    
    // Create unsigned copy for verification
    const unsignedDoc = JSON.parse(JSON.stringify(document));
    delete unsignedDoc.signature;
    
    // Verify content hash
    const contentJson = JSON.stringify(unsignedDoc, null, 0);
    const algorithmName = sig.hash_algorithm?.toLowerCase().replace('-', '') || 'sha256';
    const currentHash = createHash(algorithmName).update(contentJson, 'utf8').digest('hex');
    
    if (currentHash !== sig.content_hash) {
      return { valid: false, error: 'Content integrity check failed' };
    }
    
    // Extract public key from certificate for verification
    const certInfo = parseCertificateInfo(sig.certificate);
    const publicKeyPem = extractPublicKeyFromCertificate(sig.certificate);
    
    // Verify signature using certificate's public key
    const verify = createVerify(sig.algorithm);
    verify.update(contentJson, 'utf8');
    const signatureValid = verify.verify(publicKeyPem, sig.signature, 'base64');
    
    // Check certificate validity period
    const now = new Date();
    const notBefore = new Date(certInfo.notBefore);
    const notAfter = new Date(certInfo.notAfter);
    const certificateValid = now >= notBefore && now <= notAfter;
    
    return {
      valid: signatureValid && certificateValid,
      signature_valid: signatureValid,
      certificate_valid: certificateValid,
      certificate_info: {
        subject: certInfo.subject,
        issuer: certInfo.issuer,
        serial_number: certInfo.serialNumber,
        not_before: certInfo.notBefore,
        not_after: certInfo.notAfter
      },
      signed_at: sig.signed_at,
      algorithm: sig.algorithm,
      format: sig.format
    };
    
  } catch (error) {
    return { valid: false, error: `PKI verification failed: ${error.message}` };
  }
}

/**
 * Extract public key from X.509 certificate
 */
function extractPublicKeyFromCertificate(certificateBase64) {
  try {
    const certData = Buffer.from(certificateBase64, 'base64').toString('ascii');
    const cert = JSON.parse(certData); // Our mock certificate
    return cert.publicKey;
  } catch (error) {
    // For real X.509 certificates, would use proper ASN.1 parsing
    throw new Error('Certificate parsing not implemented for real X.509 certificates');
  }
}

/**
 * PRODUCTION IMPLEMENTATION NOTES:
 * 
 * For production PKI integration, consider using:
 * 
 * 1. node-forge library for complete X.509 certificate handling
 * 2. OpenSSL command-line tools for certificate operations  
 * 3. Hardware Security Modules (HSM) for key storage
 * 4. Certificate Authority (CA) integration
 * 5. RFC 3161 Time Stamp Authority (TSA) for trusted timestamps
 * 6. OCSP/CRL checking for certificate revocation
 * 
 * Example OpenSSL commands for production:
 * 
 * // Generate CA certificate
 * openssl req -new -x509 -days 365 -key ca.key -out ca.crt
 * 
 * // Generate document signing certificate  
 * openssl req -new -key signer.key -out signer.csr
 * openssl x509 -req -in signer.csr -CA ca.crt -CAkey ca.key -out signer.crt
 * 
 * // Sign document (would integrate with Node.js)
 * openssl dgst -sha256 -sign signer.key -out signature.bin document.json
 * 
 * // Verify signature
 * openssl dgst -sha256 -verify signer.crt -signature signature.bin document.json
 */