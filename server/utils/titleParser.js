function isTVShow(raw) {
  // First check if extractSeasonInfo finds anything - if it does, it's definitely a TV show
  if (extractSeasonInfo(raw)) {
    return true;
  }

  // Fallback to pattern matching for other TV indicators
  const tvIndicators = [
    /season\s+\d+/gi,
    /series\s+\d+/gi,
    /complete\s+series/gi,
    /box\s*set/gi,
    /seasons?\s+\d+[-–]\d+/gi,
    /the\s+complete/gi,
  ];
  return tvIndicators.some(pattern => pattern.test(raw));
}

function wordToNumber(word) {
  const numbers = {
    'one': '1', 'two': '2', 'three': '3', 'four': '4', 'five': '5',
    'six': '6', 'seven': '7', 'eight': '8', 'nine': '9', 'ten': '10'
  };
  return numbers[word.toLowerCase()] || word;
}

function extractSeasonInfo(raw) {
  // Handle season parts first (e.g., "Season Three - Part One")
  const seasonPartPattern = /season\s+(?:(\d+)|(\w+))\s*[-–:]\s*part\s+(?:(\d+)|(\w+))/gi;
  const partMatch = seasonPartPattern.exec(raw);
  if (partMatch) {
    const seasonNum = partMatch[1] || wordToNumber(partMatch[2]);
    const partNum = partMatch[3] || wordToNumber(partMatch[4]);
    return `Season ${seasonNum} Part ${partNum}`;
  }

  const seasonPatterns = [
    // Season with word numbers (e.g., "Season Three")
    { pattern: /season\s+(\w+)/gi, normalize: (m) => {
        const match = /season\s+(\w+)/i.exec(m);
        const num = wordToNumber(match[1]);
        return `Season ${num}`;
      }
    },
    { pattern: /series\s+(\d+)/gi, normalize: (m) => m.replace(/series\s+(\d+)/gi, 'Season $1') },
    { pattern: /seasons?\s+(\d+[-–]\d+)/gi, normalize: (m) => m.replace(/seasons?\s+(\d+[-–]\d+)/gi, 'Seasons $1') },
    { pattern: /complete\s+series/gi, normalize: () => 'Complete Series' },
    { pattern: /box\s*set/gi, normalize: () => 'Box Set' },
  ];

  for (const { pattern, normalize } of seasonPatterns) {
    const match = raw.match(pattern);
    if (match) {
      return normalize(match[0]);
    }
  }
  return null;
}

function extractEdition(raw) {
  const editions = [];
  const patterns = [
    { pattern: /steelbook/gi, normalize: () => 'Steelbook' },
    { pattern: /collector'?s?\s+edition/gi, normalize: () => "Collector's Edition" },
    { pattern: /limited\s+edition/gi, normalize: () => 'Limited Edition' },
    { pattern: /special\s+edition/gi, normalize: () => 'Special Edition' },
    { pattern: /ultimate\s+edition/gi, normalize: () => 'Ultimate Edition' },
    { pattern: /extended\s+edition/gi, normalize: () => 'Extended Edition' },
    { pattern: /uncut\s+version/gi, normalize: () => 'Uncut Version' },
    { pattern: /director'?s?\s+cut/gi, normalize: () => "Director's Cut" },
    { pattern: /4k\s+ultra\s+hd|4k\s+uhd|4k|uhd/gi, normalize: (m) => '4K UHD' },
    { pattern: /blu[-\s]?ray/gi, normalize: () => 'Blu-ray' },
    { pattern: /dvd/gi, normalize: () => 'DVD' },
  ];

  for (const { pattern, normalize } of patterns) {
    const match = raw.match(pattern);
    if (match) {
      const normalized = normalize(match[0]);
      if (!editions.includes(normalized)) editions.push(normalized);
    }
  }

  return editions.length > 0 ? editions.join(' + ') : null;
}

function cleanTitle(raw) {
  const cleaned = raw
    .replace(/\s*\(([^)]*(?:blu[-\s]?ray|dvd|digital|4k|uhd|hd|widescreen|fullscreen|steelbook|edition|version|cut|season|series|box\s*set)[^)]*)\)/gi, '')
    .replace(/\s*\[([^\]]*(?:blu[-\s]?ray|dvd|digital|4k|uhd|hd|widescreen|fullscreen|steelbook|edition|version|cut|season|series|box\s*set|disc)[^\]]*)\]/gi, '')
    // Remove country names in parentheses (common from Blu-ray.com)
    .replace(/\s*\((Australia|USA|United States|UK|United Kingdom|Canada|Germany|France|Italy|Spain|Japan|South Korea|Hong Kong|China|Taiwan|India|Brazil|Mexico|Argentina|Netherlands|Belgium|Sweden|Norway|Denmark|Finland|Poland|Russia|New Zealand|Singapore|Thailand|Malaysia|Philippines|Indonesia|South Africa|Turkey|Greece|Portugal|Austria|Switzerland|Ireland|Scotland|Wales|Czech Republic|Hungary|Romania|Israel|Egypt|UAE|Saudi Arabia)\s*\)/gi, '')
    .replace(/\s*\[regions?\s*[a-z0-9,\s]+\]/gi, '')
    .replace(/\s*\(regions?\s*[a-z0-9,\s]+\)/gi, '')
    // Strip disc count info
    .replace(/\s*\[\d+\s+discs?\]/gi, '')
    .replace(/\s*\(\d+\s+discs?\)/gi, '')
    // Remove eBay seller text broadly (support both straight ' and curly ' apostrophes)
    .replace(/\s+(dvd|blu-?ray)\s+value\s+guaranteed\s+from\s+ebay['’]?s?\s+biggest\s+seller.*$/gi, '')
    .replace(/\s+value\s+guaranteed\s+from\s+ebay['’]?s?\s+biggest\s+seller.*$/gi, '')
    .replace(/\s+from\s+ebay['’]?s?\s+biggest\s+seller.*$/gi, '')
    // Remove season/series info (with word numbers too)
    .replace(/\s*[-–:]\s*season\s+(?:\d+|\w+)\s*[-–:]\s*part\s+(?:\d+|\w+).*$/i, '')
    .replace(/\s*[-–:]\s*(season|series|complete|box\s*set).*$/i, '')
    .replace(/\s*[-–]\s*(blu[-\s]?ray|dvd|digital|4k|uhd|hd).*$/i, '')
    // Remove edition keywords that appear just before a year in parentheses
    .replace(/\s+(blu[-\s]?ray|dvd|digital|4k|uhd|hd|steelbook)\s+(\(\d{4}\))/gi, ' $2')
    .replace(/\s*season\s+(?:\d+|\w+)/gi, '')
    .replace(/\s*series\s+\d+/gi, '')
    .replace(/\s*complete\s+series/gi, '')
    .replace(/\s*box\s*set/gi, '')
    .replace(/\s*[-–|]\s*(new|sealed|free\s+shipping|value\s+guaranteed).*$/gi, '')
    .replace(/\s*o\s+ring\s+packaging/gi, '')
    // Remove trailing format keywords (repeat to catch multiple consecutive keywords like "4K Blu-ray")
    .replace(/\s+(dvd|blu-?ray|digital|4k|uhd|hd)\s*$/gi, '')
    .replace(/\s+(dvd|blu-?ray|digital|4k|uhd|hd)\s*$/gi, '')
    .replace(/\s+(dvd|blu-?ray|digital|4k|uhd|hd)\s*$/gi, '')
    .trim();

  console.log(`[TitleParser] Raw: "${raw}" -> Cleaned: "${cleaned}"`);
  return cleaned;
}

function generateTitleVariants(title) {
  const variants = [title];

  // Strip common eBay/marketplace suffixes after first attempt
  let working = title
    .replace(/\s*[-–|]\s*(new|sealed|free\s+shipping|value\s+guaranteed).*$/gi, '')
    .replace(/\s+(dvd|blu-?ray)\s+value\s+guaranteed\s+from\s+ebay'?s?\s+biggest\s+seller.*$/gi, ' $1')
    .replace(/\s+value\s+guaranteed\s+from\s+ebay'?s?\s+biggest\s+seller.*$/gi, '')
    .replace(/\s+from\s+ebay'?s?\s+biggest\s+seller.*$/gi, '')
    .replace(/\s*o\s+ring\s+packaging/gi, '')
    .trim();

  if (working !== title) variants.push(working);

  // Try removing content after year in parentheses
  const yearMatch = working.match(/^(.+?)\s+\((\d{4})\)/);
  if (yearMatch) {
    variants.push(yearMatch[1].trim());
  }

  // Try removing everything after a dash/pipe
  const dashMatch = working.match(/^([^-–|]+)/);
  if (dashMatch && dashMatch[1].trim() !== working) {
    variants.push(dashMatch[1].trim());
  }

  // Remove duplicates while preserving order
  const uniqueVariants = [...new Set(variants)];
  console.log(`[TitleParser] Generated ${uniqueVariants.length} variant(s):`, uniqueVariants);
  return uniqueVariants;
}

module.exports = {
  isTVShow,
  extractSeasonInfo,
  extractEdition,
  cleanTitle,
  generateTitleVariants,
};
