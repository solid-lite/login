/**
 * NostrParser - Parse Nostr DID documents and extract storage services
 * 
 * Parses DID documents for did:nostr identifiers to extract:
 * - Storage service endpoints
 * - Website/domain links
 * - Bitcoin addresses (mainnet/testnet taproot)
 * - Verification methods for authentication
 * 
 * Usage:
 *   const parser = new NostrParser();
 *   const result = await parser.getStorageFromDid('did:nostr:0c6c9abf...');
 *   console.log(result.storage); // Storage URL
 */
export class NostrParser {
    constructor() {
        this.contexts = {
            'did': 'https://www.w3.org/ns/did/v1',
            'nostr': 'https://w3id.org/nostr/context',
            'security': 'https://w3id.org/security/suites/ed25519-2020/v1'
        };
        
        this.serviceTypes = {
            'Storage': 'storage',
            'Website': 'website',
            'LinkedDomains': 'linkedDomains',
            'TaprootAddress': 'taprootAddress'
        };
    }

    /**
     * Get storage endpoint from Nostr DID
     * @param {string} didId - Nostr DID (e.g., 'did:nostr:0c6c9abf...' or just the pubkey)
     * @returns {Promise<Object>} Result with storage URL, services, verification methods, or error
     */
    async getStorageFromDid(didId) {
        try {
            const didUrl = this.constructDidUrl(didId);
            
            const response = await fetch(didUrl, {
                headers: {
                    'Accept': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error(`Failed to fetch DID document: ${response.status} ${response.statusText}`);
            }

            const didDocument = await response.json();
            const parsed = this.parse(didDocument);
            
            if (parsed.error) {
                throw new Error(parsed.error);
            }

            return {
                storage: parsed.services?.storage?.serviceEndpoint || null,
                services: parsed.services,
                verificationMethods: parsed.verificationMethods,
                didId: didId,
                didDocument: didDocument
            };

        } catch (error) {
            return {
                error: `Failed to get storage from DID: ${error.message}`,
                storage: null,
                services: null,
                verificationMethods: null,
                didId: didId
            };
        }
    }

    constructDidUrl(didId) {
        if (didId.startsWith('did:nostr:')) {
            const pubkey = didId.replace('did:nostr:', '');
            return `https://nostr.social/.well-known/did/nostr/${pubkey}.json`;
        }
        throw new Error(`Unsupported DID format: ${didId}`);
    }

    /**
     * Parse DID document JSON
     * @param {Object} didDocument - DID document object
     * @returns {Object} Parsed services, verification methods, and metadata
     */
    parse(didDocument) {
        if (!didDocument || typeof didDocument !== 'object') {
            return this.parseError('Invalid DID document format');
        }

        if (!didDocument.id || !didDocument.id.startsWith('did:nostr:')) {
            return this.parseError('Invalid or missing DID identifier');
        }

        const result = {
            id: didDocument.id,
            context: didDocument['@context'] || [],
            verificationMethods: this.parseVerificationMethods(didDocument.verificationMethod || []),
            authentication: didDocument.authentication || [],
            assertionMethod: didDocument.assertionMethod || [],
            services: this.parseServices(didDocument.service || []),
            raw: didDocument
        };

        return result;
    }

    parseVerificationMethods(verificationMethods) {
        const methods = {};
        
        for (const method of verificationMethods) {
            const methodId = method.id;
            methods[methodId] = {
                id: methodId,
                controller: method.controller,
                type: method.type,
                publicKeyJwk: method.publicKeyJwk,
                publicKeyMultibase: method.publicKeyMultibase
            };
        }

        return methods;
    }

    parseServices(services) {
        const parsedServices = {};
        
        for (const service of services) {
            const serviceId = service.id;
            const serviceType = Array.isArray(service.type) ? service.type[0] : service.type;
            
            const serviceData = {
                id: serviceId,
                type: service.type,
                serviceEndpoint: service.serviceEndpoint,
                network: service.network
            };

            if (serviceType === 'Storage') {
                parsedServices.storage = serviceData;
            } else if (serviceType === 'Website' || (Array.isArray(service.type) && service.type.includes('Website'))) {
                parsedServices.website = serviceData;
            } else if (serviceType === 'TaprootAddress') {
                if (!parsedServices.bitcoin) {
                    parsedServices.bitcoin = {};
                }
                const network = service.network || 'unknown';
                parsedServices.bitcoin[network] = serviceData;
            } else {
                parsedServices[serviceType.toLowerCase()] = serviceData;
            }
        }

        return parsedServices;
    }

    parseError(message) {
        return {
            error: message,
            id: null,
            context: [],
            verificationMethods: {},
            authentication: [],
            assertionMethod: [],
            services: {}
        };
    }

    extractPubkeyFromDid(didId) {
        if (didId && didId.startsWith('did:nostr:')) {
            return didId.replace('did:nostr:', '');
        }
        return null;
    }

    formatServiceEndpoint(service) {
        if (!service || !service.serviceEndpoint) {
            return null;
        }
        
        try {
            const url = new URL(service.serviceEndpoint);
            return url.toString();
        } catch {
            return service.serviceEndpoint;
        }
    }
}