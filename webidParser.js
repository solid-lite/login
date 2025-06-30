/**
 * SolidParser - Parse WebID profiles and extract storage endpoints
 * 
 * Parses Solid Protocol WebID documents in JSON-LD format to extract:
 * - Storage endpoints (pim:storage)
 * - Profile information (name, email, organization)
 * - Trusted applications
 * - Type indexes (public/private)
 * 
 * Usage:
 *   const parser = new SolidParser();
 *   const result = await parser.getStorageFromWebId('https://example.com/profile/card#me');
 *   console.log(result.storage); // Storage URL
 */
export class SolidParser {
    constructor() {
        this.namespaces = {
            'foaf': 'http://xmlns.com/foaf/0.1/',
            'vcard': 'http://www.w3.org/2006/vcard/ns#',
            'solid': 'http://www.w3.org/ns/solid/terms#',
            'pim': 'http://www.w3.org/ns/pim/space#',
            'ldp': 'http://www.w3.org/ns/ldp#',
            'acl': 'http://www.w3.org/ns/auth/acl#',
            'schema': 'http://schema.org/',
            'activitypub': 'https://www.w3.org/TR/activitypub/#'
        };
    }

    /**
     * Get storage endpoint from WebID URL
     * @param {string} webId - WebID URL (e.g., 'https://example.com/profile/card#me')
     * @returns {Promise<Object>} Result with storage URL, profile data, or error
     */
    async getStorageFromWebId(webId) {
        try {
            const response = await fetch(webId, {
                headers: {
                    'Accept': 'application/ld+json'
                }
            });

            if (!response.ok) {
                throw new Error(`Failed to fetch WebID: ${response.status} ${response.statusText}`);
            }

            const contentType = response.headers.get('content-type') || '';
            const data = await response.text();

            let jsonLD;
            if (contentType.includes('application/ld+json') || contentType.includes('application/json')) {
                jsonLD = JSON.parse(data);
            } else {
                throw new Error(`Expected JSON-LD format, got: ${contentType}`);
            }

            const parsed = this.parse(jsonLD);
            
            if (parsed.error) {
                throw new Error(parsed.error);
            }

            return {
                storage: parsed.profile?.storage || null,
                profile: parsed.profile,
                webId: webId
            };

        } catch (error) {
            return {
                error: `Failed to get storage from WebID: ${error.message}`,
                storage: null,
                profile: null,
                webId: webId
            };
        }
    }



    /**
     * Parse JSON-LD WebID document
     * @param {Array} jsonLD - JSON-LD array from WebID document
     * @returns {Object} Parsed profile, trusted apps, contacts, and resources
     */
    parse(jsonLD) {
        if (!Array.isArray(jsonLD)) {
            return this.parseError('Expected JSON-LD array format');
        }

        const result = {
            profile: null,
            trustedApps: [],
            contacts: {},
            resources: {},
            raw: jsonLD
        };

        const entityMap = new Map();
        
        jsonLD.forEach(entity => {
            const id = entity['@id'];
            if (id) {
                entityMap.set(id, entity);
            }
        });

        const mainProfile = this.findMainProfile(jsonLD);
        if (mainProfile) {
            result.profile = this.parseProfile(mainProfile, entityMap);
            result.trustedApps = this.parseTrustedApps(mainProfile, entityMap);
        }

        result.contacts = this.parseContacts(jsonLD);
        result.resources = this.parseResources(jsonLD);

        return result;
    }

    findMainProfile(jsonLD) {
        // First, merge all entities with the same @id
        const mergedEntities = new Map();
        
        for (const entity of jsonLD) {
            const id = entity['@id'];
            if (id) {
                if (mergedEntities.has(id)) {
                    // Merge properties
                    const existing = mergedEntities.get(id);
                    for (const [key, value] of Object.entries(entity)) {
                        if (key !== '@id') {
                            if (existing[key]) {
                                // If property already exists, merge arrays
                                if (Array.isArray(existing[key]) && Array.isArray(value)) {
                                    existing[key] = [...existing[key], ...value];
                                } else if (Array.isArray(existing[key])) {
                                    existing[key].push(value);
                                } else if (Array.isArray(value)) {
                                    existing[key] = [existing[key], ...value];
                                } else {
                                    existing[key] = [existing[key], value];
                                }
                            } else {
                                existing[key] = value;
                            }
                        }
                    }
                } else {
                    mergedEntities.set(id, { ...entity });
                }
            }
        }
        
        // Now find the main profile from merged entities
        for (const entity of mergedEntities.values()) {
            const types = entity['@type'] || [];
            if (types.includes('http://xmlns.com/foaf/0.1/Person') || 
                types.includes('http://schema.org/Person')) {
                return entity;
            }
        }
        
        // Fallback to finding by #me
        for (const entity of mergedEntities.values()) {
            if (entity['@id'] && entity['@id'].includes('#me')) {
                return entity;
            }
        }
        
        return null;
    }

    parseProfile(profileEntity, entityMap) {
        const profile = {
            id: profileEntity['@id'],
            name: this.getValue(profileEntity, 'http://xmlns.com/foaf/0.1/name') ||
                  this.getValue(profileEntity, 'http://www.w3.org/2006/vcard/ns#fn'),
            email: this.getEmailFromProfile(profileEntity, entityMap),
            organization: this.getValue(profileEntity, 'http://www.w3.org/2006/vcard/ns#organization-name'),
            role: this.getValue(profileEntity, 'http://www.w3.org/2006/vcard/ns#role'),
            note: this.getValue(profileEntity, 'http://www.w3.org/2006/vcard/ns#note'),
            inbox: this.getValue(profileEntity, 'http://www.w3.org/ns/ldp#inbox'),
            storage: this.getValue(profileEntity, 'http://www.w3.org/ns/pim/space#storage'),
            account: this.getValue(profileEntity, 'http://www.w3.org/ns/solid/terms#account'),
            oidcIssuer: this.getValue(profileEntity, 'http://www.w3.org/ns/solid/terms#oidcIssuer'),
            publicTypeIndex: this.getValue(profileEntity, 'http://www.w3.org/ns/solid/terms#publicTypeIndex'),
            privateTypeIndex: this.getValue(profileEntity, 'http://www.w3.org/ns/solid/terms#privateTypeIndex'),
            preferencesFile: this.getValue(profileEntity, 'http://www.w3.org/ns/pim/space#preferencesFile'),
            following: this.getValue(profileEntity, 'https://www.w3.org/TR/activitypub/#following'),
            address: this.getAddressFromProfile(profileEntity, entityMap)
        };

        return profile;
    }

    getEmailFromProfile(profileEntity, entityMap) {
        const emailRefs = this.getValues(profileEntity, 'http://www.w3.org/2006/vcard/ns#hasEmail');
        
        for (const emailRef of emailRefs) {
            if (typeof emailRef === 'string' && emailRef.startsWith('#')) {
                const emailEntity = entityMap.get(profileEntity['@id'].split('#')[0] + emailRef);
                if (emailEntity) {
                    const emailValue = this.getValue(emailEntity, 'http://www.w3.org/2006/vcard/ns#value');
                    if (emailValue && emailValue.startsWith('mailto:')) {
                        return emailValue.substring(7);
                    }
                }
            }
        }
        
        return null;
    }

    getAddressFromProfile(profileEntity, entityMap) {
        const addressRefs = this.getValues(profileEntity, 'http://www.w3.org/2006/vcard/ns#hasAddress');
        
        for (const addressRef of addressRefs) {
            if (typeof addressRef === 'string' && addressRef.startsWith('#')) {
                const addressEntity = entityMap.get(profileEntity['@id'].split('#')[0] + addressRef);
                if (addressEntity) {
                    return {
                        streetAddress: this.getValue(addressEntity, 'http://www.w3.org/2006/vcard/ns#street-address')
                    };
                }
            }
        }
        
        return null;
    }

    parseTrustedApps(profileEntity, entityMap) {
        const trustedAppRefs = this.getValues(profileEntity, 'http://www.w3.org/ns/auth/acl#trustedApp');
        const trustedApps = [];

        for (const appRef of trustedAppRefs) {
            if (typeof appRef === 'string') {
                const appEntity = entityMap.get(appRef);
                if (appEntity) {
                    const app = {
                        id: appRef,
                        origin: this.getValue(appEntity, 'http://www.w3.org/ns/auth/acl#origin'),
                        modes: this.getValues(appEntity, 'http://www.w3.org/ns/auth/acl#mode')
                    };
                    trustedApps.push(app);
                }
            }
        }

        return trustedApps;
    }

    parseContacts(jsonLD) {
        const contacts = {};
        
        for (const entity of jsonLD) {
            if (entity['@id'] && entity['@id'].includes('friends.ttl')) {
                const inbox = this.getValue(entity, 'http://www.w3.org/ns/ldp#inbox');
                if (inbox) {
                    contacts.friendsInbox = inbox;
                }
            }
        }

        return contacts;
    }

    parseResources(jsonLD) {
        const resources = {};
        
        for (const entity of jsonLD) {
            const types = entity['@type'] || [];
            
            if (types.includes('http://xmlns.com/foaf/0.1/PersonalProfileDocument')) {
                resources.profileDocument = {
                    id: entity['@id'],
                    maker: this.getValue(entity, 'http://xmlns.com/foaf/0.1/maker'),
                    primaryTopic: this.getValue(entity, 'http://xmlns.com/foaf/0.1/primaryTopic')
                };
            }
        }

        return resources;
    }

    getValue(entity, predicate) {
        const values = entity[predicate];
        if (!values || !Array.isArray(values) || values.length === 0) {
            return null;
        }
        
        const firstValue = values[0];
        if (firstValue['@value']) {
            return firstValue['@value'];
        }
        if (firstValue['@id']) {
            return firstValue['@id'];
        }
        
        return firstValue;
    }

    getValues(entity, predicate) {
        const values = entity[predicate];
        if (!values || !Array.isArray(values)) {
            return [];
        }
        
        return values.map(value => {
            if (value['@value']) {
                return value['@value'];
            }
            if (value['@id']) {
                return value['@id'];
            }
            return value;
        });
    }

    parseTypeIndex(jsonLD) {
        if (!Array.isArray(jsonLD)) {
            return { error: 'Expected JSON-LD array format for type index' };
        }

        const typeRegistrations = [];
        
        for (const entity of jsonLD) {
            const types = entity['@type'] || [];
            
            if (types.includes('http://www.w3.org/ns/solid/terms#TypeRegistration')) {
                const registration = {
                    id: entity['@id'],
                    forClass: this.getValue(entity, 'http://www.w3.org/ns/solid/terms#forClass'),
                    instance: this.getValue(entity, 'http://www.w3.org/ns/solid/terms#instance'),
                    instanceContainer: this.getValue(entity, 'http://www.w3.org/ns/solid/terms#instanceContainer'),
                    label: this.getReadableClassName(this.getValue(entity, 'http://www.w3.org/ns/solid/terms#forClass'))
                };
                
                typeRegistrations.push(registration);
            }
        }

        return {
            registrations: typeRegistrations,
            raw: jsonLD,
            totalRegistrations: typeRegistrations.length
        };
    }

    getReadableClassName(classUri) {
        if (!classUri) return 'Unknown Class';
        
        const knownClasses = {
            'http://xmlns.com/foaf/0.1/Person': 'Person',
            'http://schema.org/MediaObject': 'Media Object',
            'http://schema.org/TextDigitalDocument': 'Text Document',
            'http://purl.org/dc/terms/BibliographicResource': 'Bibliographic Resource',
            'http://www.w3.org/ns/pim/space#Workspace': 'Workspace',
            'http://www.w3.org/2002/01/bookmark#Bookmark': 'Bookmark',
            'http://rdfs.org/sioc/ns#Post': 'Post',
            'http://www.w3.org/ns/oa#Annotation': 'Annotation',
            'http://xmlns.com/foaf/0.1/Image': 'Image',
            'http://www.w3.org/ns/pim/meeting#Meeting': 'Meeting',
            'http://www.w3.org/2006/vcard/ns#AddressBook': 'Address Book',
            'http://www.w3.org/ns/activitystreams#Note': 'Note',
            'http://www.w3.org/ns/solid/terms#Chat': 'Chat',
            'http://www.w3.org/ns/solid/terms#Inbox': 'Inbox',
            'http://www.w3.org/2002/01/bookmark#Bookmark': 'Bookmark'
        };

        if (knownClasses[classUri]) {
            return knownClasses[classUri];
        }

        if (classUri.includes('#')) {
            return classUri.split('#').pop();
        }
        
        if (classUri.includes('/')) {
            return classUri.split('/').pop();
        }

        return classUri;
    }

    parseTurtleTypeIndex(turtleText) {
        try {
            const typeRegistrations = [];
            
            // Simple regex-based parsing for Turtle type registrations
            // This looks for solid:TypeRegistration patterns
            const lines = turtleText.split('\n').map(line => line.trim());
            
            let currentRegistration = null;
            let inRegistration = false;
            
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                
                // Look for type registration blocks
                if (line.includes('solid:TypeRegistration') || line.includes('<http://www.w3.org/ns/solid/terms#TypeRegistration>')) {
                    inRegistration = true;
                    currentRegistration = {
                        id: null,
                        forClass: null,
                        instance: null,
                        instanceContainer: null,
                        label: null
                    };
                    
                    // Try to extract the subject from the current or previous line
                    if (line.includes('<') && line.includes('>')) {
                        const match = line.match(/<([^>]+)>/);
                        if (match) {
                            currentRegistration.id = match[1];
                        }
                    }
                    continue;
                }
                
                if (inRegistration && line === '.') {
                    // End of current registration
                    if (currentRegistration && currentRegistration.forClass) {
                        currentRegistration.label = this.getReadableClassName(currentRegistration.forClass);
                        typeRegistrations.push(currentRegistration);
                    }
                    currentRegistration = null;
                    inRegistration = false;
                    continue;
                }
                
                if (inRegistration) {
                    // Extract forClass
                    if (line.includes('solid:forClass') || line.includes('<http://www.w3.org/ns/solid/terms#forClass>')) {
                        const match = line.match(/<([^>]+)>/);
                        if (match) {
                            currentRegistration.forClass = match[1];
                        }
                    }
                    
                    // Extract instance
                    if (line.includes('solid:instance') || line.includes('<http://www.w3.org/ns/solid/terms#instance>')) {
                        const match = line.match(/<([^>]+)>/);
                        if (match) {
                            currentRegistration.instance = match[1];
                        }
                    }
                    
                    // Extract instanceContainer
                    if (line.includes('solid:instanceContainer') || line.includes('<http://www.w3.org/ns/solid/terms#instanceContainer>')) {
                        const match = line.match(/<([^>]+)>/);
                        if (match) {
                            currentRegistration.instanceContainer = match[1];
                        }
                    }
                }
            }
            
            // Handle case where file doesn't end with a period
            if (currentRegistration && currentRegistration.forClass) {
                currentRegistration.label = this.getReadableClassName(currentRegistration.forClass);
                typeRegistrations.push(currentRegistration);
            }

            return {
                registrations: typeRegistrations,
                raw: turtleText,
                totalRegistrations: typeRegistrations.length,
                format: 'turtle'
            };
            
        } catch (error) {
            console.error('Error parsing Turtle type index:', error);
            return {
                error: 'Failed to parse Turtle type index: ' + error.message,
                raw: turtleText,
                format: 'turtle'
            };
        }
    }

    parseError(message) {
        return {
            error: message,
            profile: null,
            trustedApps: [],
            contacts: {},
            resources: {}
        };
    }

    formatModesList(modes) {
        return modes.map(mode => {
            if (mode.includes('#')) {
                return mode.split('#').pop();
            }
            return mode;
        }).join(', ');
    }

    getOriginDisplayName(origin) {
        try {
            const url = new URL(origin);
            return url.hostname;
        } catch {
            return origin;
        }
    }
}