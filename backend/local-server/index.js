import express from 'express';
import cors from 'cors';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, GetCommand, QueryCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';

const app = express();
const PORT = 3001;

// Middleware
app.use(cors());
app.use(express.json());

// DynamoDB Local client
const ddbClient = new DynamoDBClient({
  region: 'us-east-1',
  endpoint: 'http://localhost:8000',
  credentials: {
    accessKeyId: 'dummy',
    secretAccessKey: 'dummy',
  },
});

const ddbDocClient = DynamoDBDocumentClient.from(ddbClient);
const TABLE_NAME = 'eecar-parts-table-local';

// Mock data store (in-memory fallback)
const mockParts = [];
const mockSearchCache = new Map();

// ==================== HEALTH CHECK ====================
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'EECAR Local API', timestamp: new Date().toISOString() });
});

// ==================== SEARCH API ====================
app.post('/api/search', async (req, res) => {
  try {
    const { query, filters, topK = 10 } = req.body;

    if (!query) {
      return res.status(400).json({ error: 'Query is required' });
    }

    console.log(`[SEARCH] Query: "${query}"`);

    // Simple mock search (keyword matching)
    let results = mockParts.filter(part => {
      const searchText = `${part.name} ${part.description} ${part.category} ${part.manufacturer}`.toLowerCase();
      const queryLower = query.toLowerCase();
      return searchText.includes(queryLower);
    });

    // Apply filters
    if (filters) {
      if (filters.category) {
        results = results.filter(p => p.category === filters.category);
      }
      if (filters.maxPrice) {
        results = results.filter(p => p.price <= filters.maxPrice);
      }
      if (filters.minQuantity) {
        results = results.filter(p => p.quantity >= filters.minQuantity);
      }
    }

    // Limit results
    results = results.slice(0, topK);

    // Format response
    const searchResults = results.map((part, index) => ({
      partId: part.partId,
      score: 0.9 - (index * 0.05), // Mock similarity score
      part: {
        name: part.name,
        category: part.category,
        manufacturer: part.manufacturer,
        model: part.model,
        price: part.price,
        quantity: part.quantity,
        images: part.images || [],
      },
      reason: `"${query}"와 관련된 ${part.category} 부품입니다.`,
    }));

    res.json({
      results: searchResults,
      cached: false,
      count: searchResults.length,
    });
  } catch (error) {
    console.error('[SEARCH ERROR]', error);
    res.status(500).json({ error: 'Search failed', message: error.message });
  }
});

// ==================== PARTS API ====================
app.post('/api/parts', async (req, res) => {
  try {
    const partData = req.body;
    const partId = `part-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const newPart = {
      partId,
      ...partData,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Store in memory
    mockParts.push(newPart);

    console.log(`[PARTS] Created part: ${partId}`);

    res.status(201).json({
      message: 'Part registered successfully',
      partId,
      metadata: newPart,
    });
  } catch (error) {
    console.error('[PARTS ERROR]', error);
    res.status(500).json({ error: 'Failed to register part', message: error.message });
  }
});

app.get('/api/parts/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const part = mockParts.find(p => p.partId === id);

    if (!part) {
      return res.status(404).json({ error: 'Part not found' });
    }

    res.json(part);
  } catch (error) {
    console.error('[PARTS ERROR]', error);
    res.status(500).json({ error: 'Failed to get part', message: error.message });
  }
});

app.get('/api/parts', async (req, res) => {
  try {
    const { category, limit = 20 } = req.query;

    let parts = mockParts;

    if (category) {
      parts = parts.filter(p => p.category === category);
    }

    parts = parts.slice(0, parseInt(limit));

    res.json({
      parts,
      count: parts.length,
    });
  } catch (error) {
    console.error('[PARTS ERROR]', error);
    res.status(500).json({ error: 'Failed to list parts', message: error.message });
  }
});

// ==================== WATCH API ====================
app.post('/api/watch', async (req, res) => {
  try {
    const { buyerId, email, phone, criteria } = req.body;
    const watchId = `watch-${Date.now()}`;

    console.log(`[WATCH] Created watch: ${watchId} for buyer: ${buyerId}`);

    res.status(201).json({
      message: 'Watch created successfully',
      watchId,
    });
  } catch (error) {
    console.error('[WATCH ERROR]', error);
    res.status(500).json({ error: 'Failed to create watch', message: error.message });
  }
});

// ==================== PROPOSALS API ====================
app.post('/api/proposals', async (req, res) => {
  try {
    const proposalData = req.body;
    const proposalId = `proposal-${Date.now()}`;

    console.log(`[PROPOSALS] Created proposal: ${proposalId}`);

    res.status(201).json({
      message: 'Proposal created successfully',
      proposalId,
    });
  } catch (error) {
    console.error('[PROPOSALS ERROR]', error);
    res.status(500).json({ error: 'Failed to create proposal', message: error.message });
  }
});

app.get('/api/proposals', async (req, res) => {
  try {
    const { companyId, status } = req.query;

    console.log(`[PROPOSALS] Get proposals for company: ${companyId}`);

    res.json({
      proposals: [],
      count: 0,
    });
  } catch (error) {
    console.error('[PROPOSALS ERROR]', error);
    res.status(500).json({ error: 'Failed to get proposals', message: error.message });
  }
});

// ==================== SYNTHETIC DATA API ====================
app.post('/api/synthetic', async (req, res) => {
  try {
    const { category, count = 1 } = req.body;

    if (!category) {
      return res.status(400).json({ error: 'Category is required' });
    }

    console.log(`[SYNTHETIC] Generating ${count} parts for category: ${category}`);

    const generatedParts = [];

    for (let i = 0; i < count; i++) {
      const partId = `part-${Date.now()}-${i}`;
      const part = generateMockPart(category, partId);
      mockParts.push(part);
      generatedParts.push(part);
    }

    res.status(201).json({
      message: `Successfully generated ${count} synthetic parts`,
      parts: generatedParts,
    });
  } catch (error) {
    console.error('[SYNTHETIC ERROR]', error);
    res.status(500).json({ error: 'Failed to generate synthetic data', message: error.message });
  }
});

// ==================== HELPER FUNCTIONS ====================
function generateMockPart(category, partId) {
  const manufacturers = ['Tesla', 'Hyundai', 'Kia', 'Nissan', 'BMW', 'Chevrolet'];
  const models = ['Model S', 'Model 3', 'Ioniq 5', 'EV6', 'Leaf', 'i3', 'Bolt'];
  const conditions = ['new', 'used', 'refurbished'];

  const manufacturer = manufacturers[Math.floor(Math.random() * manufacturers.length)];
  const model = models[Math.floor(Math.random() * models.length)];

  return {
    partId,
    name: `${manufacturer} ${model} ${category}`,
    category,
    manufacturer,
    model,
    year: 2015 + Math.floor(Math.random() * 10),
    condition: conditions[Math.floor(Math.random() * conditions.length)],
    price: Math.floor(Math.random() * 5000000) + 500000,
    quantity: Math.floor(Math.random() * 10) + 1,
    sellerId: 'local-seller',
    description: `${category} 부품 - 로컬 테스트용 샘플 데이터`,
    images: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

// ==================== START SERVER ====================
app.listen(PORT, () => {
  console.log('='.repeat(50));
  console.log(`🚀 EECAR Local API Server running on http://localhost:${PORT}`);
  console.log('='.repeat(50));
  console.log('📋 Available endpoints:');
  console.log(`  - GET    /health`);
  console.log(`  - POST   /api/search`);
  console.log(`  - POST   /api/parts`);
  console.log(`  - GET    /api/parts/:id`);
  console.log(`  - GET    /api/parts?category=battery`);
  console.log(`  - POST   /api/watch`);
  console.log(`  - POST   /api/proposals`);
  console.log(`  - GET    /api/proposals`);
  console.log(`  - POST   /api/synthetic`);
  console.log('='.repeat(50));
  console.log('💡 Tip: Use POST /api/synthetic to generate test data');
  console.log('='.repeat(50));

  // Generate initial mock data
  console.log('📦 Generating initial mock data...');
  ['battery', 'motor', 'inverter'].forEach(category => {
    for (let i = 0; i < 3; i++) {
      const partId = `initial-${category}-${i}`;
      mockParts.push(generateMockPart(category, partId));
    }
  });
  console.log(`✅ Generated ${mockParts.length} initial parts`);
  console.log('='.repeat(50));
});

export default app;
