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

// Popular bands to display initially
const popularBands = [
    'Metallica', 'Iron Maiden', 'Black Sabbath', 'Slayer', 'Megadeth',
    'Judas Priest', 'Pantera', 'Opeth', 'Death', 'Slipknot',
    'System of a Down', 'Tool', 'Nightwish', 'Blind Guardian', 'Amon Amarth'
];

searchInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        searchBands();
    }
});

searchBtn.addEventListener('click', searchBands);
genreFilter.addEventListener('change', applyFilters);
countryFilter.addEventListener('change', applyFilters);
statusFilter.addEventListener('change', applyFilters);

// Load popular bands on page load
loadPopularBands();

async function loadPopularBands() {
    loading.style.display = 'block';
    resultsHeader.style.display = 'flex';
    
    try {
        // Fetch multiple popular bands
        const bandPromises = popularBands.map(band => 
            fetch(`https://www.metal-archives.com/search/ajax-band-search/?field=name&query=${encodeURIComponent(band)}&sEcho=1&iDisplayStart=0&iDisplayLength=1`)
                .then(res => {
                    if (!res.ok) return null;
                    const ct = res.headers.get('content-type') || '';
                    if (!ct.includes('application/json')) return null;
                    return res.json().then(data => data.aaData && data.aaData.length > 0 ? data.aaData[0] : null).catch(() => null);
                })
                .catch(() => null)
        );

        const resultsArr = await Promise.all(bandPromises);
        
        allBands = resultsArr
            .filter(band => band !== null)
            .map(band => ({
                name: extractText(band[0]),
                link: extractLink(band[0]),
                country: extractText(band[1]),
                genre: extractText(band[2]),
                status: extractText(band[3])
            }));

        loading.style.display = 'none';
        displayResults(allBands);
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
        const response = await fetch(`https://www.metal-archives.com/search/ajax-band-search/?field=name&query=${encodeURIComponent(query)}&sEcho=1&iDisplayStart=0&iDisplayLength=50`);

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

        if (data.aaData && data.aaData.length > 0) {
            allBands = data.aaData.map(band => ({
                name: extractText(band[0]),
                link: extractLink(band[0]),
                country: extractText(band[1]),
                genre: extractText(band[2]),
                status: extractText(band[3])
            }));
            resultsCount.textContent = `Search Results for "${query}"`;
            applyFilters();
        } else {
            results.innerHTML = '<div class="no-results">No bands found. Try another search term.</div>';
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
        const description = generateDescription(band);
        const genres = band.genre.split(/[,/]/).slice(0, 3);
        
        return `
            <div class="band-card">
                <div class="band-image-container">
                    <div class="band-logo">${band.name}</div>
                </div>
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
    applyFilters();
}

// Expose clearFilters for inline onclick usage
window.clearFilters = clearFilters;
