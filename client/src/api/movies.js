const SERVER_STORAGE_KEY = 'dvdrack_server_url';
const API_TOKEN_STORAGE_KEY = 'dvdrack_api_token';

export function getServerUrl() {
  return localStorage.getItem(SERVER_STORAGE_KEY) || import.meta.env.VITE_SERVER_BASE_URL || '';
}

export function setServerUrl(url) {
  // Remove trailing slash
  const cleaned = url.replace(/\/$/, '');
  localStorage.setItem(SERVER_STORAGE_KEY, cleaned);
}

export function hasServerUrl() {
  return !!getServerUrl();
}

export function getApiToken() {
  return localStorage.getItem(API_TOKEN_STORAGE_KEY) || '';
}

export function setApiToken(token) {
  localStorage.setItem(API_TOKEN_STORAGE_KEY, token);
}

function getAuthHeaders() {
  const token = getApiToken();
  if (token) {
    return { 'Authorization': `Bearer ${token}` };
  }
  return {};
}

function getBaseUrl() {
  const serverBase = getServerUrl();
  return serverBase ? `${serverBase}/api` : '/api';
}

export async function testServerConnection(url) {
  try {
    const testUrl = url.replace(/\/$/, '');
    console.log('Testing connection to:', `${testUrl}/api/health`);

    const res = await fetch(`${testUrl}/api/health`, {
      method: 'GET',
      mode: 'cors',
      headers: {
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(10000)
    });

    console.log('Response status:', res.status);

    if (!res.ok) {
      throw new Error(`Server responded with ${res.status}`);
    }

    const data = await res.json();
    console.log('Health check response:', data);

    return { success: true };
  } catch (err) {
    console.error('Connection test failed:', err);
    let errorMessage = err.message;

    if (err.name === 'TypeError' && err.message.includes('fetch')) {
      errorMessage = 'Network error - cannot reach server. Check URL and ensure server is running.';
    } else if (err.name === 'AbortError') {
      errorMessage = 'Connection timeout - server took too long to respond.';
    }

    return { success: false, error: errorMessage };
  }
}

export async function getServerConfig() {
  const res = await fetch(`${getBaseUrl()}/config`);
  return res.json();
}

export async function getMovies(params = {}) {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`${getBaseUrl()}/movies${qs ? '?' + qs : ''}`, {
    headers: getAuthHeaders()
  });
  if (!res.ok && res.status === 401) {
    return { error: 'Unauthorized' };
  }
  return res.json();
}

export async function getMovie(id) {
  const res = await fetch(`${getBaseUrl()}/movies/${id}`, {
    headers: getAuthHeaders()
  });
  if (!res.ok && res.status === 401) {
    return { error: 'Unauthorized' };
  }
  return res.json();
}

export async function getTvEntries(tmdbId) {
  const res = await fetch(`${getBaseUrl()}/tv/${tmdbId}`, {
    headers: getAuthHeaders()
  });
  if (!res.ok && res.status === 401) {
    return { error: 'Unauthorized' };
  }
  return res.json();
}

export async function getStats() {
  const res = await fetch(`${getBaseUrl()}/stats`, {
    headers: getAuthHeaders()
  });
  if (!res.ok && res.status === 401) {
    return { error: 'Unauthorized' };
  }
  return res.json();
}

export async function lookupUPCs(upcs, service = 'upcitemdb') {
  const res = await fetch(`${getBaseUrl()}/lookup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify({ upcs, service }),
  });
  return res.json();
}

export async function lookupUPCDatabase(upc) {
  const res = await fetch(`${getBaseUrl()}/lookup/upcdatabase`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify({ upc }),
  });
  return res.json();
}

export async function saveBatch(movies) {
  const res = await fetch(`${getBaseUrl()}/movies/batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify({ movies }),
  });
  return res.json();
}

export async function updateMovie(id, data) {
  const res = await fetch(`${getBaseUrl()}/movies/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function deleteMovie(id) {
  await fetch(`${getBaseUrl()}/movies/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders()
  });
}

export async function deleteCachedImage(movieId, imageUrl) {
  const res = await fetch(`${getBaseUrl()}/movies/${movieId}/cached-image`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify({ image_url: imageUrl })
  });
  return res.json();
}

export async function searchTMDb(query) {
  const res = await fetch(`${getBaseUrl()}/tmdb/search?q=${encodeURIComponent(query)}`, {
    headers: getAuthHeaders()
  });
  return res.json();
}

export async function getTMDbDetail(tmdbId, mediaType = 'movie') {
  const res = await fetch(`${getBaseUrl()}/tmdb/${mediaType}/${tmdbId}`, {
    headers: getAuthHeaders()
  });
  return res.json();
}

export async function getTMDbPosters(tmdbId, mediaType = 'movie') {
  const res = await fetch(`${getBaseUrl()}/tmdb/${mediaType}/${tmdbId}/posters`, {
    headers: getAuthHeaders()
  });
  return res.json();
}

export async function clearCache(upc) {
  const res = await fetch(`${getBaseUrl()}/cache/${upc}`, {
    method: 'DELETE',
    headers: getAuthHeaders()
  });
  return res.json();
}

export async function clearUPCDBCache(upc) {
  const res = await fetch(`${getBaseUrl()}/cache/upcdb/${upc}`, {
    method: 'DELETE',
    headers: getAuthHeaders()
  });
  return res.json();
}

export async function clearBarcodeLookupCache(upc) {
  const res = await fetch(`${getBaseUrl()}/cache/barcodelookup/${upc}`, {
    method: 'DELETE',
    headers: getAuthHeaders()
  });
  return res.json();
}

export async function clearBluRayCache(upc) {
  const res = await fetch(`${getBaseUrl()}/cache/bluray/${upc}`, {
    method: 'DELETE',
    headers: getAuthHeaders()
  });
  return res.json();
}

export function getImageUrl(relativeUrl) {
  if (!relativeUrl) return null;
  // If it's already a full URL, return as-is
  if (relativeUrl.startsWith('http://') || relativeUrl.startsWith('https://')) {
    return relativeUrl;
  }
  // Otherwise prepend the server URL
  const serverUrl = getServerUrl();
  if (serverUrl) {
    return `${serverUrl}${relativeUrl}`;
  }
  return relativeUrl;
}

export function retryImageCache(onProgress) {
  return new Promise((resolve, reject) => {
    localStorage.setItem('cache_operation_active', 'retry');

    const token = getApiToken();
    const url = `${getBaseUrl()}/cache/retry-images${token ? `?token=${encodeURIComponent(token)}` : ''}`;
    const eventSource = new EventSource(url);

    const items = [];
    let successCount = 0;
    let failCount = 0;

    const cleanup = () => {
      eventSource.close();
      localStorage.removeItem('cache_operation_active');
    };

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.done) {
          cleanup();
          resolve({
            success: successCount,
            failed: failCount,
            total: items.length,
            items
          });
          return;
        }

        if (data.error) {
          cleanup();
          reject(new Error(data.error));
          return;
        }

        if (data.message) {
          cleanup();
          resolve({
            success: 0,
            failed: 0,
            total: 0,
            message: data.message,
            items: []
          });
          return;
        }

        items.push(data);
        if (data.status === 'success') successCount++;
        else failCount++;

        if (onProgress) onProgress(data);
      } catch (err) {
        cleanup();
        reject(err);
      }
    };

    eventSource.onerror = () => {
      cleanup();
      reject(new Error('Connection error'));
    };
  });
}

export function resetImageCache(onProgress) {
  return new Promise((resolve, reject) => {
    localStorage.setItem('cache_operation_active', 'reset');

    const token = getApiToken();
    const url = `${getBaseUrl()}/cache/reset-images${token ? `?token=${encodeURIComponent(token)}` : ''}`;
    const eventSource = new EventSource(url);

    const items = [];
    let successCount = 0;
    let failCount = 0;

    const cleanup = () => {
      eventSource.close();
      localStorage.removeItem('cache_operation_active');
    };

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.done) {
          cleanup();
          resolve({
            success: successCount,
            failed: failCount,
            total: items.length,
            items
          });
          return;
        }

        if (data.error) {
          cleanup();
          reject(new Error(data.error));
          return;
        }

        if (data.message) {
          cleanup();
          resolve({
            success: 0,
            failed: 0,
            total: 0,
            message: data.message,
            items: []
          });
          return;
        }

        items.push(data);
        if (data.status === 'success') successCount++;
        else failCount++;

        if (onProgress) onProgress(data);
      } catch (err) {
        cleanup();
        reject(err);
      }
    };

    eventSource.onerror = () => {
      cleanup();
      reject(new Error('Connection error'));
    };
  });
}

// Normalization helpers for client-side filtering
function normalizeEdition(edition) {
  if (!edition) return '';
  const normalized = edition.trim()
  if (/^4k(\s+uhd)?$/i.test(normalized)) return '4K UHD'
  if (/^blu-?ray$/i.test(normalized)) return 'Blu-ray'
  if (/^dvd$/i.test(normalized)) return 'DVD'
  const lowerCase = normalized.toLowerCase()
  if (lowerCase === 'steelbook') return 'Steelbook'
  if (lowerCase === 'collector\'s edition' || lowerCase === 'collectors edition') return 'Collector\'s Edition'
  if (lowerCase === 'limited edition') return 'Limited Edition'
  if (lowerCase === 'special edition') return 'Special Edition'
  if (lowerCase === 'extended edition') return 'Extended Edition'
  if (lowerCase === 'director\'s cut' || lowerCase === 'directors cut') return "Director's Cut"
  return normalized
}

function normalizeGenre(genre) {
  if (!genre) return '';
  const trimmed = genre.trim()
  if (/^sci-fi$/i.test(trimmed)) return 'Science Fiction'
  return trimmed
}

function groupByShow(movies) {
  const grouped = new Map()

  for (const movie of movies) {
    const key = movie.tmdb_id || `no-tmdb-${movie.id}`

    if (!grouped.has(key)) {
      grouped.set(key, {
        ...movie,
        entries: [movie], // Keep all UPC entries
        seasons: []
      })
    } else {
      const group = grouped.get(key)
      group.entries.push(movie)
    }
  }

  // Extract season badges from season_info field
  for (const [_, group] of grouped) {
    const seasons = new Set()
    for (const entry of group.entries) {
      if (entry.season_info) {
        const seasonMatch = entry.season_info.match(/Season (\d+)/i)
        const seasonsMatch = entry.season_info.match(/Seasons (\d+[-–]\d+)/i)
        const seriesMatch = entry.season_info.match(/Series (\d+)/i)
        const completeMatch = entry.season_info.match(/Complete Series/i)
        const boxSetMatch = entry.season_info.match(/Box Set/i)

        if (seasonMatch) seasons.add(`S${seasonMatch[1]}`)
        else if (seasonsMatch) seasons.add(seasonsMatch[1])
        else if (seriesMatch) seasons.add(`Series ${seriesMatch[1]}`)
        else if (completeMatch) seasons.add('Complete')
        else if (boxSetMatch) seasons.add('Box Set')
      }
    }
    group.seasons = Array.from(seasons).sort((a, b) => {
      if (a.startsWith('S') && b.startsWith('S')) {
        return parseInt(a.slice(1)) - parseInt(b.slice(1))
      }
      return a.localeCompare(b)
    })
  }

  return Array.from(grouped.values())
}

export async function getPersistentCollection() {
  const search = sessionStorage.getItem('dvdrack_search') || ''
  
  let selectedMediaTypes = ['movie', 'tv']
  try {
    const cached = sessionStorage.getItem('dvdrack_selectedMediaTypes')
    if (cached) selectedMediaTypes = JSON.parse(cached)
  } catch {}

  let selectedEditions = []
  try {
    const cached = sessionStorage.getItem('dvdrack_selectedEditions')
    if (cached) selectedEditions = JSON.parse(cached)
  } catch {}

  let selectedGenres = []
  try {
    const cached = sessionStorage.getItem('dvdrack_selectedGenres')
    if (cached) selectedGenres = JSON.parse(cached)
  } catch {}

  let selectedDirectors = []
  try {
    const cached = sessionStorage.getItem('dvdrack_selectedDirectors')
    if (cached) selectedDirectors = JSON.parse(cached)
  } catch {}

  let selectedYears = []
  try {
    const cached = sessionStorage.getItem('dvdrack_selectedYears')
    if (cached) selectedYears = JSON.parse(cached)
  } catch {}

  const sortBy = sessionStorage.getItem('dvdrack_sortBy') || 'title'
  const sortOrder = sessionStorage.getItem('dvdrack_sortOrder') || 'asc'

  // Fetch from server
  const mediaType = selectedMediaTypes.length === 2 ? 'all' : selectedMediaTypes.length === 1 ? selectedMediaTypes[0] : 'all'
  const movies = await getMovies({ search, media_type: mediaType, sort_by: sortBy, sort_order: sortOrder })

  if (movies.error) {
    return []
  }

  // Filter client-side
  let filtered = movies

  if (selectedEditions.length > 0) {
    filtered = filtered.filter(movie => {
      if (!movie.edition) return false
      const movieEditions = movie.edition.split(/\s*\+\s*|\s*,\s*|\s+and\s+/i).map(e => normalizeEdition(e))
      return selectedEditions.some(selected => movieEditions.includes(selected))
    })
  }

  if (selectedGenres.length > 0) {
    filtered = filtered.filter(movie => {
      if (!movie.genre) return false
      const parts = movie.genre.split(/\s*,\s*/)
      const movieGenres = []
      parts.forEach(part => {
        const subParts = part.split(/\s*&\s*/)
        subParts.forEach(subPart => {
          const normalized = normalizeGenre(subPart)
          if (normalized) movieGenres.push(normalized)
        })
      })
      return selectedGenres.some(selected => movieGenres.includes(selected))
    })
  }

  if (selectedDirectors.length > 0) {
    filtered = filtered.filter(movie => {
      if (!movie.director) return false
      const movieDirectors = movie.director.split(/\s*,\s*/).map(d => d.trim())
      return selectedDirectors.some(selected => movieDirectors.includes(selected))
    })
  }

  if (selectedYears.length > 0) {
    filtered = filtered.filter(movie => {
      return selectedYears.includes(movie.year)
    })
  }

  return groupByShow(filtered)
}
