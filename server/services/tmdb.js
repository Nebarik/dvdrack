const fetch = require('node-fetch');
const { cacheImage } = require('../utils/imageCache');
const { isTVShow, generateTitleVariants } = require('../utils/titleParser');

async function lookupTMDb(title, rawTitle = null, tmdbApiKey, imagesDir) {
  if (!tmdbApiKey) return { title, media_type: 'movie' };

  try {
    const probablyTV = rawTitle ? isTVShow(rawTitle) : false;
    console.log(`[TMDb] Probable media type: ${probablyTV ? 'TV' : 'Movie'}`);

    const titleVariants = generateTitleVariants(title);

    let movieResults = [];
    let tvResults = [];

    // Try each title variant until we get results
    for (const variant of titleVariants) {
      console.log(`[TMDb] Searching for: "${variant}"`);

      const [movieSearchRes, tvSearchRes] = await Promise.all([
        fetch(`https://api.themoviedb.org/3/search/movie?api_key=${tmdbApiKey}&query=${encodeURIComponent(variant)}`),
        fetch(`https://api.themoviedb.org/3/search/tv?api_key=${tmdbApiKey}&query=${encodeURIComponent(variant)}`)
      ]);

      const [movieData, tvData] = await Promise.all([
        movieSearchRes.json(),
        tvSearchRes.json()
      ]);

      movieResults = movieData.results || [];
      tvResults = tvData.results || [];

      console.log(`[TMDb] Results for "${variant}": ${movieResults.length} movie(s), ${tvResults.length} TV show(s)`);

      if (movieResults.length > 0 || tvResults.length > 0) {
        break;
      }
    }

    let bestResult = null;
    let mediaType = 'movie';

    if (movieResults.length === 0 && tvResults.length === 0) {
      console.log(`[TMDb] No results found for any variant`);
      return { title, media_type: 'movie' };
    }

    const topMovie = movieResults[0];
    const topTV = tvResults[0];

    if (!topMovie && topTV) {
      bestResult = topTV;
      mediaType = 'tv';
    } else if (topMovie && !topTV) {
      bestResult = topMovie;
      mediaType = 'movie';
    } else {
      if (probablyTV) {
        bestResult = topTV;
        mediaType = 'tv';
      } else {
        bestResult = topMovie;
        mediaType = 'movie';
      }
    }

    console.log(`[TMDb] Selected ${mediaType}: "${mediaType === 'movie' ? topMovie?.title : topTV?.name}" (ID: ${bestResult.id})`);


    if (mediaType === 'movie') {
      const detailRes = await fetch(
        `https://api.themoviedb.org/3/movie/${bestResult.id}?api_key=${tmdbApiKey}&append_to_response=credits`
      );
      const detail = await detailRes.json();

      const director = detail.credits?.crew?.find(c => c.job === 'Director')?.name || null;
      const genre = detail.genres?.map(g => g.name).join(', ') || null;
      const tmdb_poster_url = detail.poster_path
        ? `https://image.tmdb.org/t/p/w500${detail.poster_path}`
        : null;

      const poster_url = tmdb_poster_url ? await cacheImage(tmdb_poster_url, imagesDir) : null;

      return {
        title: detail.title || title,
        year: detail.release_date ? parseInt(detail.release_date.split('-')[0]) : null,
        director,
        genre,
        poster_url,
        runtime: detail.runtime || null,
        tmdb_id: detail.id || null,
        overview: detail.overview || null,
        media_type: 'movie',
      };
    } else {
      const detailRes = await fetch(
        `https://api.themoviedb.org/3/tv/${bestResult.id}?api_key=${tmdbApiKey}&append_to_response=credits`
      );
      const detail = await detailRes.json();

      const creator = detail.created_by?.map(c => c.name).join(', ') || null;
      const genre = detail.genres?.map(g => g.name).join(', ') || null;
      const tmdb_poster_url = detail.poster_path
        ? `https://image.tmdb.org/t/p/w500${detail.poster_path}`
        : null;

      const poster_url = tmdb_poster_url ? await cacheImage(tmdb_poster_url, imagesDir) : null;

      return {
        title: detail.name || title,
        year: detail.first_air_date ? parseInt(detail.first_air_date.split('-')[0]) : null,
        director: creator,
        genre,
        poster_url,
        runtime: detail.episode_run_time?.[0] || null,
        tmdb_id: detail.id || null,
        overview: detail.overview || null,
        media_type: 'tv',
        seasons: detail.number_of_seasons || null,
        episodes: detail.number_of_episodes || null,
      };
    }
  } catch (e) {
    console.warn('TMDb error:', e.message);
    return { title, media_type: 'movie' };
  }
}

module.exports = { lookupTMDb };
