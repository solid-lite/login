#!/usr/bin/env node

import { NostrParser } from './nostrParser.js';

async function parseNostrDid(pubkey) {
    const parser = new NostrParser();
    const didId = `did:nostr:${pubkey}`;
    
    console.log('🔍 Fetching Nostr DID document:', didId);
    console.log('');
    
    try {
        const result = await parser.getStorageFromDid(didId);
        
        if (result.error) {
            console.error('❌ Error:', result.error);
            process.exit(1);
        }
        
        console.log('✅ Successfully parsed Nostr DID document!');
        console.log('');
        console.log('🆔 DID:', result.didId);
        console.log('📦 Storage URL:', result.storage || 'Not found');
        
        // Display services
        if (result.services) {
            if (result.services.website) {
                console.log('🌐 Website:', result.services.website.serviceEndpoint || 'Not found');
            }
            
            if (result.services.bitcoin) {
                console.log('');
                console.log('₿ Bitcoin Addresses:');
                
                if (result.services.bitcoin.btc) {
                    console.log('  🟠 Mainnet (Taproot):', result.services.bitcoin.btc.serviceEndpoint);
                }
                
                if (result.services.bitcoin.tbtc4) {
                    console.log('  🟡 Testnet (Taproot):', result.services.bitcoin.tbtc4.serviceEndpoint);
                }
            }
        }
        
        // Display verification methods
        const verificationCount = Object.keys(result.verificationMethods || {}).length;
        console.log('');
        console.log(`🔐 Verification Methods: ${verificationCount} methods`);
        
        if (verificationCount > 0) {
            console.log('');
            console.log('Verification Methods:');
            Object.values(result.verificationMethods).forEach((method, index) => {
                console.log(`  ${index + 1}. ${method.type} (${method.id})`);
            });
        }
        
        // Display authentication and assertion methods
        if (result.didDocument) {
            const authCount = result.didDocument.authentication?.length || 0;
            const assertionCount = result.didDocument.assertionMethod?.length || 0;
            
            console.log('');
            console.log(`🔑 Authentication Methods: ${authCount}`);
            console.log(`✅ Assertion Methods: ${assertionCount}`);
        }
        
        return result;
        
    } catch (error) {
        console.error('❌ Fatal error:', error.message);
        process.exit(1);
    }
}

function showUsage() {
    console.log('Usage: node nostr-cli.js <nostr-pubkey>');
    console.log('');
    console.log('Examples:');
    console.log('  node nostr-cli.js 0c6c9abf38464a70af7cd5b5e76e65a94ebdcda4cd84d6209fdd48cc3c436b1f');
    console.log('  node nostr-cli.js 23ef0b2571cfe4b7f07ef26c637c94e01aee02cd414a7b4ec33c2d4ecff8d0c2');
    console.log('');
    console.log('The script will fetch the Nostr DID document and parse the services and verification methods.');
}

function isValidNostrPubkey(pubkey) {
    // Nostr public keys are 64 character hex strings
    return /^[0-9a-f]{64}$/i.test(pubkey);
}

// Parse command line arguments
const args = process.argv.slice(2);

if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    showUsage();
    process.exit(0);
}

const pubkey = args[0];

// Validate pubkey format
if (!isValidNostrPubkey(pubkey)) {
    console.error('❌ Invalid Nostr public key:', pubkey);
    console.error('Please provide a valid 64-character hex string.');
    console.log('');
    showUsage();
    process.exit(1);
}

// Run the parser
parseNostrDid(pubkey);