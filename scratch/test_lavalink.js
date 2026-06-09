const fetch = require('node-fetch');

async function testLavalink() {
    const host = 'https://lavalink-2026-production-515e.up.railway.app';
    const auth = 'cecili@ccc';
    
    console.log('Testing Lavalink node at:', host);
    
    try {
        // 1. Get info
        console.log('\n--- 1. Fetching /v4/info ---');
        const infoRes = await fetch(`${host}/v4/info`, {
            headers: { 'Authorization': auth }
        });
        if (infoRes.ok) {
            const info = await infoRes.json();
            console.log('Lavalink Info:', JSON.stringify(info, null, 2));
        } else {
            console.error('Info request failed with status:', infoRes.status, await infoRes.text());
        }
        
        // 2. Try search
        console.log('\n--- 2. Fetching /v4/loadtracks for search ---');
        const searchRes = await fetch(`${host}/v4/loadtracks?identifier=ytsearch:test`, {
            headers: { 'Authorization': auth }
        });
        if (searchRes.ok) {
            const searchResult = await searchRes.json();
            console.log('Search loadType:', searchResult.loadType);
            if (searchResult.loadType === 'error') {
                console.log('Search Error Detail:', searchResult.data);
            } else if (searchResult.loadType === 'empty') {
                console.log('Search returned EMPTY (no results).');
            } else {
                console.log(`Search succeeded! Found ${searchResult.data?.tracks?.length || 0} tracks.`);
            }
        } else {
            console.error('Search request failed with status:', searchRes.status, await searchRes.text());
        }
    } catch (e) {
        console.error('Error during testing:', e);
    }
}

testLavalink();
