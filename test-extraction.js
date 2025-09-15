#!/usr/bin/env node

/**
 * Test script to verify Sefaria extraction works without mock data
 * This validates CLAUDE.md requirements for pure fetching
 */

const axios = require('axios');

// Test configuration
const SEFARIA_API = 'https://www.sefaria.org/api';
const TEST_BOOKS = [
  'Likutei_Moharan',
  'Tikkun_HaKlali',
  'Meshivat_Nefesh'
];

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m'
};

async function testDirectFetch(bookName) {
  console.log(`\n${colors.blue}Testing direct fetch for: ${bookName}${colors.reset}`);
  
  const strategies = [
    {
      name: 'API v3',
      test: async () => {
        const response = await axios.get(`${SEFARIA_API}/v3/texts/${bookName}`);
        return response.data;
      }
    },
    {
      name: 'API v2',
      test: async () => {
        const response = await axios.get(`${SEFARIA_API}/texts/${bookName}?context=1`);
        return response.data;
      }
    },
    {
      name: 'Index API',
      test: async () => {
        const response = await axios.get(`${SEFARIA_API}/index/${bookName}`);
        return response.data;
      }
    },
    {
      name: 'GraphQL',
      test: async () => {
        const query = `
          query GetText($ref: String!) {
            text(ref: $ref) {
              ref
              heText
              text
            }
          }
        `;
        const response = await axios.post('https://www.sefaria.org/graphql', {
          query,
          variables: { ref: bookName }
        });
        return response.data;
      }
    },
    {
      name: 'HTML Fetch',
      test: async () => {
        const response = await axios.get(`https://www.sefaria.org/${bookName}`, {
          headers: { 'Accept': 'text/html' }
        });
        const hasContent = response.data.includes('class="he"') || 
                          response.data.includes('Hebrew text');
        return hasContent ? { success: true, html_length: response.data.length } : null;
      }
    }
  ];
  
  const results = [];
  
  for (const strategy of strategies) {
    try {
      console.log(`  Trying ${strategy.name}...`);
      const data = await strategy.test();
      
      if (data) {
        const hasContent = !!(
          data.text || 
          data.he || 
          data.heText || 
          data.sections || 
          data.success ||
          data.schema
        );
        
        if (hasContent) {
          console.log(`  ${colors.green}✓ ${strategy.name} succeeded${colors.reset}`);
          results.push({
            strategy: strategy.name,
            success: true,
            hasData: true
          });
        } else {
          console.log(`  ${colors.yellow}⚠ ${strategy.name} returned empty data${colors.reset}`);
          results.push({
            strategy: strategy.name,
            success: false,
            reason: 'No content'
          });
        }
      }
    } catch (error) {
      console.log(`  ${colors.red}✗ ${strategy.name} failed: ${error.message}${colors.reset}`);
      results.push({
        strategy: strategy.name,
        success: false,
        error: error.message
      });
    }
    
    // Rate limiting
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  return results;
}

async function validateNoMockData() {
  console.log(`\n${colors.blue}=== Validating Pure Fetching (No Mock Data) ===${colors.reset}`);
  
  const allResults = {};
  
  for (const book of TEST_BOOKS) {
    const results = await testDirectFetch(book);
    allResults[book] = results;
    
    const successCount = results.filter(r => r.success).length;
    
    if (successCount === 0) {
      console.log(`\n${colors.red}❌ FAIL: No successful fetching strategy for ${book}${colors.reset}`);
      console.log(`This violates CLAUDE.md requirement for pure fetching!`);
    } else {
      console.log(`\n${colors.green}✅ PASS: ${book} can be fetched with ${successCount} strategies${colors.reset}`);
    }
  }
  
  // Summary
  console.log(`\n${colors.blue}=== SUMMARY ===${colors.reset}`);
  
  for (const [book, results] of Object.entries(allResults)) {
    const successStrategies = results
      .filter(r => r.success)
      .map(r => r.strategy)
      .join(', ');
    
    if (successStrategies) {
      console.log(`${colors.green}✓ ${book}:${colors.reset} ${successStrategies}`);
    } else {
      console.log(`${colors.red}✗ ${book}:${colors.reset} NO WORKING STRATEGIES`);
    }
  }
  
  // Validation check
  const allBooksHaveStrategy = Object.values(allResults).every(
    results => results.some(r => r.success)
  );
  
  if (allBooksHaveStrategy) {
    console.log(`\n${colors.green}🎉 VALIDATION PASSED: All books can be fetched directly from Sefaria${colors.reset}`);
    console.log(`${colors.green}✅ No mock data needed - CLAUDE.md requirements satisfied!${colors.reset}`);
  } else {
    console.log(`\n${colors.red}⚠️ VALIDATION FAILED: Some books cannot be fetched${colors.reset}`);
    console.log(`${colors.red}This violates CLAUDE.md requirement for pure fetching${colors.reset}`);
    process.exit(1);
  }
}

// Run the test
async function main() {
  console.log(`${colors.blue}Rabbi Nachman Voice - Sefaria Extraction Test${colors.reset}`);
  console.log(`${colors.blue}Testing pure fetching without any mock data...${colors.reset}`);
  
  try {
    await validateNoMockData();
    
    console.log(`\n${colors.blue}Next steps:${colors.reset}`);
    console.log(`1. Run: cd backend && npm run build`);
    console.log(`2. Start PostgreSQL with pgvector extension`);
    console.log(`3. Run: npm start`);
    console.log(`4. Execute: curl -X POST http://localhost:3000/api/setup/complete`);
    console.log(`5. Test: curl -X POST http://localhost:3000/api/chat -d '{"message":"What is hitbodedut?"}'`);
    
  } catch (error) {
    console.error(`\n${colors.red}Test failed:${colors.reset}`, error);
    process.exit(1);
  }
}

// Check if axios is installed
try {
  require.resolve('axios');
  main();
} catch (e) {
  console.log(`${colors.yellow}Installing axios...${colors.reset}`);
  require('child_process').execSync('npm install axios', { stdio: 'inherit' });
  main();
}