// Netlify Function to fetch from Sefaria API - NO MOCK DATA
const https = require('https');

async function fetchFromSefaria(bookName) {
  const strategies = [
    // Strategy 1: API v3
    () => fetchFromUrl(`https://www.sefaria.org/api/v3/texts/${encodeURIComponent(bookName)}`),
    // Strategy 2: API v2
    () => fetchFromUrl(`https://www.sefaria.org/api/texts/${encodeURIComponent(bookName)}?context=1`),
    // Strategy 3: Index API
    () => fetchFromUrl(`https://www.sefaria.org/api/index/${encodeURIComponent(bookName)}`),
  ];

  for (const strategy of strategies) {
    try {
      const data = await strategy();
      if (data && (data.text || data.he || data.heText || data.schema)) {
        return data;
      }
    } catch (e) {
      continue;
    }
  }
  
  throw new Error(`Unable to fetch ${bookName} from Sefaria`);
}

function fetchFromUrl(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

exports.handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    const { book } = event.queryStringParameters || {};
    
    if (!book) {
      // Return list of available books
      const books = [
        'Likutei_Moharan',
        'Likutei_Moharan_II', 
        'Likutei_Tefilot',
        'Sippurei_Maasiyot',
        'Chayei_Moharan',
        'Shivchei_HaRan',
        'Sichot_HaRan',
        'Sefer_HaMidot',
        'Tikkun_HaKlali',
        'Likutei_Etzot'
      ];
      
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          books,
          message: 'Use ?book=BookName to fetch a specific book'
        })
      };
    }

    // Fetch the book from Sefaria
    const bookData = await fetchFromSefaria(book);
    
    // Extract key information
    const result = {
      success: true,
      book,
      title: bookData.title || bookData.heTitle || book,
      hebrewTitle: bookData.heTitle || bookData.hebrewTitle,
      hasText: !!(bookData.text || bookData.he || bookData.heText),
      sections: bookData.schema?.lengths?.[0] || 'unknown',
      fetchedAt: new Date().toISOString(),
      method: 'pure_fetch_no_mock'
    };

    // Include sample text if available
    if (bookData.text && Array.isArray(bookData.text) && bookData.text[0]) {
      result.sampleText = typeof bookData.text[0] === 'string' 
        ? bookData.text[0].substring(0, 200) + '...'
        : JSON.stringify(bookData.text[0]).substring(0, 200) + '...';
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(result)
    };

  } catch (error) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: error.message,
        note: 'This is pure fetching - no mock data used'
      })
    };
  }
};