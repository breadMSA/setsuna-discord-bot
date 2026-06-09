const fetch = globalThis.fetch;
const spotify = require('spotify-url-info')(fetch);

async function test() {
    try {
        const url = 'https://open.spotify.com/playlist/37i9dQZF1DX10zKzsJ2jva'; // Spotify playlist (e.g. Viva Latino)
        console.log('Fetching details for:', url);
        const details = await spotify.getDetails(url);
        console.log('Result preview:', details.preview);
        console.log('Result tracks length:', details.tracks.length);
        console.log('First track details:', JSON.stringify(details.tracks[0], null, 2));
    } catch (err) {
        console.error('Error:', err);
    }
}

test();
