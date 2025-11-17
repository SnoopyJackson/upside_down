const searchInput = document.getElementById('searchInput');
const searchBtn = document.getElementById('searchBtn');
const loading = document.getElementById('loading');
const results = document.getElementById('results');
const errorDiv = document.getElementById('error');
const resultsHeader = document.getElementById('resultsHeader');
const resultsCount = document.getElementById('resultsCount');
const genreFilter = document.getElementById('genreFilter');
const countryFilter = document.getElementById('countryFilter');
const statusFilter = document.getElementById('statusFilter');

let allBands = [];

// Map country names from the select to ISO codes for MusicBrainz queries
const countryToISO = {
    'United States': 'US',
    'United Kingdom': 'GB',
    'Germany': 'DE',
    'Sweden': 'SE',
    'Norway': 'NO',
    'Finland': 'FI',
    'France': 'FR',
    'Italy': 'IT',
    'Poland': 'PL',
    'Canada': 'CA',
    'Brazil': 'BR',
    'Japan': 'JP'
};

searchInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        searchBands();
    }
});

searchBtn.addEventListener('click', searchBands);
genreFilter.addEventListener('change', () => { if (!searchInput.value.trim()) loadPopularBands(); else applyFilters(); });
countryFilter.addEventListener('change', () => { if (!searchInput.value.trim()) loadPopularBands(); else applyFilters(); });
statusFilter.addEventListener('change', () => { if (!searchInput.value.trim()) loadPopularBands(); else applyFilters(); });

// On load: show popular for current filters (or general metal tag)
loadPopularBands();

async function buildMusicBrainzQueryFromFilters() {
    // If user entered a search term, caller will use searchBands() instead.
    const parts = [];

    const genre = genreFilter.value;
    const country = countryFilter.value;

    if (genre) {
        // Use tag search for genre
        parts.push(`tag:"${genre}"`);
    } else {
        // default to metal tag
        parts.push('tag:"metal" OR tag:"heavy metal"');
    }

    if (country) {
        const iso = countryToISO[country];
        if (iso) parts.push(`country:${iso}`);
        else parts.push(`area:"${country}"`);
    }

    // Join parts with AND
    return parts.join(' AND ');
}

async function loadPopularBands() {
    loading.style.display = 'block';
    resultsHeader.style.display = 'flex';

    try {
        const query = await buildMusicBrainzQueryFromFilters();
        const url = `https://musicbrainz.org/ws/2/artist?query=${encodeURIComponent(query)}&fmt=json&limit=25`;
        const response = await fetch(url, { headers: { 'Accept': 'application/json', 'User-Agent': 'metla-example/1.0 ( your-email@example.com )' } });

        if (!response.ok) {
            showError(`MusicBrainz returned ${response.status}`);
            loading.style.display = 'none';
            return;
        }

        const contentType = response.headers.get('content-type') || '';
        if (!contentType.includes('application/json')) {
            showError('Unexpected response from MusicBrainz.');
            loading.style.display = 'none';
            return;
        }

        const data = await response.json();

        if (!data || !data.artists || data.artists.length === 0) {
            results.innerHTML = '<div class="no-results">No artists found for current filters.</div>';
            loading.style.display = 'none';
            return;
        }

        // Enrich with TheAudioDB similar to search flow
        allBands = await Promise.all(data.artists.map(async (artist) => {
            const band = {
                name: artist.name,
                link: `https://musicbrainz.org/artist/${artist.id}`,
                country: artist.country || (artist.area ? artist.area.name : 'Unknown'),
                genre: artist.type || (artist.tags && artist.tags.length ? artist.tags.map(t=>t.name).slice(0,3).join(', ') : 'Unknown'),
                status: (artist['life-span'] && artist['life-span'].ended) ? 'Split-up' : 'Active',
                thumb: null,
                description: ''
            };

            try {
                const taUrl = `https://theaudiodb.com/api/v1/json/2/search.php?s=${encodeURIComponent(artist.name)}`;
                const taRes = await fetch(taUrl);
                if (taRes.ok) {
                    const taData = await taRes.json().catch(() => null);
                    if (taData && taData.artists && taData.artists.length > 0) {
                        const a = taData.artists[0];
                        band.thumb = a.strArtistThumb || a.strArtistLogo || a.strArtistFanart || null;
                        band.description = a.strBiographyEN || a.strBiographyFR || '';
                    }
                }
            } catch (e) {
                console.warn('TheAudioDB fetch failed for', artist.name, e);
            }

            return band;
        }));

        // If a status filter is selected, apply it
        const statusValue = statusFilter.value;
        let filtered = allBands;
        if (statusValue) {
            if (statusValue === 'Active') filtered = allBands.filter(b => b.status === 'Active');
            else if (statusValue === 'Split-up') filtered = allBands.filter(b => b.status === 'Split-up');
        }

        loading.style.display = 'none';
        displayResults(filtered);
    } catch (error) {
        loading.style.display = 'none';
        console.error('Error loading popular bands:', error);
        results.innerHTML = '<div class="no-results">Error loading bands. Please try searching manually.</div>';
    }
}

async function searchBands() {
    const query = searchInput.value.trim();
    
    if (!query) {
        showError('Please enter a band name');
        return;
    }

    errorDiv.innerHTML = '';
    loading.style.display = 'block';
    results.innerHTML = '';
    resultsHeader.style.display = 'flex';
    searchBtn.disabled = true;

    try {
        // Use MusicBrainz artist search
        const response = await fetch(`https://musicbrainz.org/ws/2/artist?query=artist:${encodeURIComponent(query)}&fmt=json&limit=50`, {
            headers: {
                'Accept': 'application/json',
                // Identify the application per MusicBrainz requirements
                'User-Agent': 'metla-example/1.0 ( your-email@example.com )'
            }
        });

        if (!response.ok) {
            const msg = `Server returned ${response.status} ${response.statusText}`;
            showError(msg);
            console.error(msg);
            loading.style.display = 'none';
            searchBtn.disabled = false;
            return;
        }

        const contentType = response.headers.get('content-type') || '';
        if (!contentType.includes('application/json')) {
            const text = await response.text().catch(() => '[unable to read response body]');
            showError('Unexpected non-JSON response. This may be blocked by CORS or the endpoint returned HTML. See console for details.');
            console.error('Non-JSON response (first 1k chars):', text.slice(0, 1000));
            loading.style.display = 'none';
            searchBtn.disabled = false;
            return;
        }

        let data;
        try {
            data = await response.json();
        } catch (err) {
            const text = await response.text().catch(() => '[unable to read response body]');
            showError('Failed to parse JSON response. See console for a snippet.');
            console.error('Invalid JSON response snippet:', text.slice(0, 1000));
            loading.style.display = 'none';
            searchBtn.disabled = false;
            return;
        }

        loading.style.display = 'none';
        searchBtn.disabled = false;

        if (data && data.artists && data.artists.length > 0) {
            allBands = await Promise.all(data.artists.map(async (artist) => {
                const band = {
                    name: artist.name,
                    link: `https://musicbrainz.org/artist/${artist.id}`,
                    country: artist.country || (artist.area ? artist.area.name : 'Unknown'),
                    genre: artist.type || (artist.tags && artist.tags.length ? artist.tags.map(t=>t.name).slice(0,3).join(', ') : 'Unknown'),
                    status: (artist['life-span'] && artist['life-span'].ended) ? 'Split-up' : 'Active',
                    thumb: null,
                    description: ''
                };

                // Try fetching artwork/biography from TheAudioDB
                try {
                    const taUrl = `https://theaudiodb.com/api/v1/json/2/search.php?s=${encodeURIComponent(artist.name)}`;
                    const taRes = await fetch(taUrl);
                    if (taRes.ok) {
                        const taData = await taRes.json().catch(() => null);
                        if (taData && taData.artists && taData.artists.length > 0) {
                            const a = taData.artists[0];
                            band.thumb = a.strArtistThumb || a.strArtistLogo || a.strArtistFanart || null;
                            band.description = a.strBiographyEN || a.strBiographyFR || '';
                        }
                    }
                } catch (e) {
                    console.warn('TheAudioDB fetch failed for', artist.name, e);
                }

                return band;
            }));
            resultsCount.textContent = `Search Results for "${query}"`;
            applyFilters();
        } else {
            results.innerHTML = '<div class="no-results">No artists found. Try another search term.</div>';
        }
    } catch (error) {
        loading.style.display = 'none';
        searchBtn.disabled = false;
        if (error instanceof TypeError) {
            // Likely a network or CORS failure
            showError('Network or CORS error. The request was blocked or could not be completed. See console for details.');
            console.error('Network/CORS Error:', error);
        } else {
            showError('Error searching bands. Please try again.');
            console.error('Error:', error);
        }
    }
}

function applyFilters() {
    const genreValue = genreFilter.value.toLowerCase();
    const countryValue = countryFilter.value.toLowerCase();
    const statusValue = statusFilter.value.toLowerCase();

    const filtered = allBands.filter(band => {
        const matchGenre = !genreValue || band.genre.toLowerCase().includes(genreValue);
        const matchCountry = !countryValue || band.country.toLowerCase().includes(countryValue);
        const matchStatus = !statusValue || band.status.toLowerCase().includes(statusValue);
        return matchGenre && matchCountry && matchStatus;
    });

    displayResults(filtered);
}

function displayResults(bands) {
    if (bands.length === 0) {
        results.innerHTML = '<div class="no-results">No bands match your filters. Try adjusting your criteria.</div>';
        return;
    }

    resultsCount.textContent = `${bands.length} band${bands.length !== 1 ? 's' : ''}`;

    results.innerHTML = bands.map(band => {
        const description = band.description && band.description.length > 0 ? (band.description.length > 300 ? band.description.slice(0,300) + '…' : band.description) : generateDescription(band);
        const genres = (band.genre || '').toString().split(/[,/]/).slice(0, 3);
        const imageBlock = band.thumb ? `<img src="${band.thumb}" alt="${band.name} thumbnail" class="band-image">` : `<div class="band-logo">${band.name}</div>`;
        
        return `
            <div class="band-card">
                <div class="band-image-container">${imageBlock}</div>
                <div class="band-content">
                    <div class="band-name">${band.name}</div>
                    
                    <div class="band-description">
                        ${description}
                    </div>

                    <div style="margin-bottom: 15px;">
                        ${genres.map(g => `<span class="band-genre">${g.trim()}</span>`).join('')}
                    </div>

                    <div class="band-info"><strong>Country:</strong> ${band.country}</div>
                    <div class="band-info"><strong>Genre:</strong> ${band.genre}</div>
                    <div class="band-info"><strong>Status:</strong> ${band.status}</div>

                    <div class="band-footer">
                        <a href="${band.link}" target="_blank" class="band-link">View Full Profile →</a>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function generateDescription(band) {
    const descriptions = {
        'Active': `${band.name} is an active ${band.genre.toLowerCase()} band from ${band.country}. They continue to create and perform music, contributing to the metal scene with their unique sound and style.`,
        'Split-up': `${band.name} was a ${band.genre.toLowerCase()} band from ${band.country} that has since disbanded. Despite their split, their music continues to influence the metal community.`,
        'On hold': `${band.name} is a ${band.genre.toLowerCase()} band from ${band.country} that is currently on hiatus. Fans eagerly await their potential return to the metal scene.`,
        'Unknown': `${band.name} is a ${band.genre.toLowerCase()} band from ${band.country}. Information about their current activity status is currently unavailable.`,
        'Changed name': `${band.name} was a ${band.genre.toLowerCase()} band from ${band.country} that has since changed their name and continues under a different moniker.`
    };

    return descriptions[band.status] || `${band.name} is a ${band.genre.toLowerCase()} band from ${band.country}, known for their contributions to the metal music scene.`;
}

function extractText(html) {
    const temp = document.createElement('div');
    temp.innerHTML = html;
    return temp.textContent || temp.innerText || '';
}

function extractLink(html) {
    const temp = document.createElement('div');
    temp.innerHTML = html;
    const link = temp.querySelector('a');
    return link ? link.href : '#';
}

function showError(message) {
    errorDiv.innerHTML = `<div class="error">${message}</div>`;
}

function clearFilters() {
    genreFilter.value = '';
    countryFilter.value = '';
    statusFilter.value = '';
    if (searchInput.value.trim()) {
        applyFilters();
    } else {
        loadPopularBands();
    }
}

// Expose clearFilters for inline onclick usage
window.clearFilters = clearFilters;
