#!/usr/bin/env node

import { SolidParser } from './webidParser.js';

async function parseWebId(webId) {
    const parser = new SolidParser();
    
    console.log('🔍 Fetching WebID as JSON-LD:', webId);
    console.log('');
    
    try {
        const result = await parser.getStorageFromWebId(webId);
        
        if (result.error) {
            console.error('❌ Error:', result.error);
            process.exit(1);
        }
        
        console.log('✅ Successfully parsed WebID profile!');
        console.log('');
        console.log('📦 Storage URL:', result.storage || 'Not found');
        console.log('👤 Name:', result.profile?.name || 'Not found');
        console.log('📧 Email:', result.profile?.email || 'Not found');
        console.log('🏢 Organization:', result.profile?.organization || 'Not found');
        console.log('💼 Role:', result.profile?.role || 'Not found');
        console.log('📝 Note:', result.profile?.note || 'Not found');
        console.log('📥 Inbox:', result.profile?.inbox || 'Not found');
        console.log('🔑 Account:', result.profile?.account || 'Not found');
        console.log('🆔 OIDC Issuer:', result.profile?.oidcIssuer || 'Not found');
        console.log('📋 Public Type Index:', result.profile?.publicTypeIndex || 'Not found');
        console.log('🔒 Private Type Index:', result.profile?.privateTypeIndex || 'Not found');
        console.log('⚙️ Preferences File:', result.profile?.preferencesFile || 'Not found');
        
        const trustedAppsCount = result.profile?.trustedApps?.length || 0;
        console.log(`🔐 Trusted Apps: ${trustedAppsCount} apps`);
        
        if (trustedAppsCount > 0) {
            console.log('');
            console.log('Trusted Apps:');
            result.profile.trustedApps.forEach((app, index) => {
                console.log(`  ${index + 1}. ${app.origin} (${app.modes.join(', ')})`);
            });
        }
        
        return result;
        
    } catch (error) {
        console.error('❌ Fatal error:', error.message);
        process.exit(1);
    }
}

function showUsage() {
    console.log('Usage: node webid-cli.js <webid-url>');
    console.log('');
    console.log('Examples:');
    console.log('  node webid-cli.js https://melvin.solidcommunity.net/profile/card#me');
    console.log('  node webid-cli.js https://example.solidcommunity.net/profile/card#me');
    console.log('');
    console.log('The script will fetch the WebID as JSON-LD and parse the profile information.');
}

// Parse command line arguments
const args = process.argv.slice(2);

if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    showUsage();
    process.exit(0);
}

const webId = args[0];

// Validate WebID format
try {
    new URL(webId);
} catch (error) {
    console.error('❌ Invalid WebID URL:', webId);
    console.error('Please provide a valid URL.');
    console.log('');
    showUsage();
    process.exit(1);
}

// Run the parser
parseWebId(webId);