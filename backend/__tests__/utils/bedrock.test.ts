import { mockClient } from 'aws-sdk-client-mock';
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import {
  cosineSimilarity,
  findTopKSimilar,
  preparePartText,
  generateEmbedding,
  callClaude
} from '../../src/utils/bedrock.js';

// Mock Bedrock client
const bedrockMock = mockClient(BedrockRuntimeClient);

describe('Bedrock Utils', () => {
  beforeEach(() => {
    bedrockMock.reset();
  });

  describe('cosineSimilarity', () => {
    it('should return 1 for identical vectors', () => {
      const vec = [1, 0, 0, 1];
      const similarity = cosineSimilarity(vec, vec);
      expect(similarity).toBeCloseTo(1, 5);
    });

    it('should return 0 for orthogonal vectors', () => {
      const vecA = [1, 0];
      const vecB = [0, 1];
      const similarity = cosineSimilarity(vecA, vecB);
      expect(similarity).toBeCloseTo(0, 5);
    });

    it('should return -1 for opposite vectors', () => {
      const vecA = [1, 0];
      const vecB = [-1, 0];
      const similarity = cosineSimilarity(vecA, vecB);
      expect(similarity).toBeCloseTo(-1, 5);
    });

    it('should handle normalized vectors', () => {
      const vecA = [0.6, 0.8];
      const vecB = [0.8, 0.6];
      const similarity = cosineSimilarity(vecA, vecB);
      // Dot product: 0.6*0.8 + 0.8*0.6 = 0.96
      expect(similarity).toBeCloseTo(0.96, 2);
    });

    it('should throw error for different length vectors', () => {
      const vecA = [1, 2, 3];
      const vecB = [1, 2];
      expect(() => cosineSimilarity(vecA, vecB)).toThrow('Vectors must have the same length');
    });

    it('should handle large vectors (1024 dimensions)', () => {
      const vecA = new Array(1024).fill(0).map(() => Math.random());
      const vecB = new Array(1024).fill(0).map(() => Math.random());
      const similarity = cosineSimilarity(vecA, vecB);

      expect(similarity).toBeGreaterThanOrEqual(-1);
      expect(similarity).toBeLessThanOrEqual(1);
    });
  });

  describe('findTopKSimilar', () => {
    const queryVector = [1, 0, 0];
    const candidates = [
      { id: 'a', vector: [1, 0, 0] },     // similarity = 1
      { id: 'b', vector: [0.9, 0.1, 0] }, // high similarity
      { id: 'c', vector: [0, 1, 0] },     // similarity = 0
      { id: 'd', vector: [0.5, 0.5, 0] }, // medium similarity
    ];

    it('should return top K results sorted by score', () => {
      const results = findTopKSimilar(queryVector, candidates, 2);

      expect(results).toHaveLength(2);
      expect(results[0].id).toBe('a');
      expect(results[0].score).toBeCloseTo(1, 5);
      expect(results[1].id).toBe('b');
    });

    it('should return all results if K > candidates length', () => {
      const results = findTopKSimilar(queryVector, candidates, 10);
      expect(results).toHaveLength(4);
    });

    it('should handle empty candidates', () => {
      const results = findTopKSimilar(queryVector, [], 5);
      expect(results).toEqual([]);
    });

    it('should use default K=10', () => {
      const manyCandidates = new Array(20).fill(null).map((_, i) => ({
        id: `item-${i}`,
        vector: [Math.random(), Math.random(), Math.random()]
      }));

      const results = findTopKSimilar(queryVector, manyCandidates);
      expect(results).toHaveLength(10);
    });
  });

  describe('preparePartText', () => {
    it('should create structured text from battery part', () => {
      const part = {
        name: '현대 아이오닉5 배터리 팩',
        category: 'battery',
        manufacturer: 'SK온',
        model: 'NCM811-72kWh',
        description: '2023년식 배터리',
        batteryHealth: {
          soh: 92,
          cathodeType: 'NCM Ni 80%',
          cycles: 350,
        },
      };

      const text = preparePartText(part);

      expect(text).toContain('[부품정보]');
      expect(text).toContain('현대 아이오닉5 배터리 팩');
      expect(text).toContain('battery - 배터리');
      expect(text).toContain('[배터리 상태]');
      expect(text).toContain('SOH: 92%');
      expect(text).toContain('NCM Ni 80%');
      expect(text).toContain('350회');
      expect(text).toContain('재사용 가능'); // SOH >= 70
    });

    it('should recommend recycling for low SOH battery', () => {
      const part = {
        name: '저성능 배터리',
        category: 'battery',
        manufacturer: 'Test',
        model: 'Test',
        batteryHealth: {
          soh: 60, // Below 70
        },
      };

      const text = preparePartText(part);
      expect(text).toContain('ESS 전환 또는 재활용 권장');
    });

    it('should include specifications', () => {
      const part = {
        name: '모터',
        category: 'motor',
        manufacturer: 'Tesla',
        model: 'Model3',
        specifications: {
          electricalProps: {
            voltage: 400,
            capacity: 180,
            power: 150,
          },
          dimensions: {
            length: 500,
            width: 300,
            height: 200,
            weight: 50,
          },
        },
      };

      const text = preparePartText(part);

      expect(text).toContain('400V');
      expect(text).toContain('180Ah');
      expect(text).toContain('150kW');
      expect(text).toContain('500x300x200mm');
      expect(text).toContain('50kg');
    });

    it('should include material composition', () => {
      const part = {
        name: '바디 패널',
        category: 'body-panel',
        manufacturer: 'Test',
        model: 'Test',
        specifications: {
          materialComposition: {
            primary: '알루미늄',
            alloyNumber: '6061',
            tensileStrength: 310,
            recyclability: 95,
          },
        },
      };

      const text = preparePartText(part);

      expect(text).toContain('알루미늄');
      expect(text).toContain('합금 6061');
      expect(text).toContain('인장강도 310MPa');
      expect(text).toContain('재활용률 95%');
    });

    it('should generate category-specific keywords', () => {
      const batteryPart = {
        name: '배터리',
        category: 'battery',
        manufacturer: 'LG',
        condition: 'excellent',
      };

      const text = preparePartText(batteryPart);

      expect(text).toContain('[키워드]');
      expect(text).toContain('리튬이온');
      expect(text).toContain('BMS');
      expect(text).toContain('LG에너지솔루션');
      expect(text).toContain('최상급');
    });

    it('should handle motor category keywords', () => {
      const motorPart = {
        name: '모터',
        category: 'motor',
        manufacturer: '현대',
        condition: 'good',
      };

      const text = preparePartText(motorPart);

      expect(text).toContain('PMSM');
      expect(text).toContain('토크');
      expect(text).toContain('현대차그룹');
    });

    it('should handle minimal part data', () => {
      const part = {
        name: 'Simple Part',
        category: 'other',
        manufacturer: 'Unknown',
        model: 'N/A',
      };

      const text = preparePartText(part);

      expect(text).toContain('Simple Part');
      expect(text).toContain('상세 설명 없음');
    });
  });

  describe('generateEmbedding', () => {
    it('should call Bedrock with correct parameters', async () => {
      const mockEmbedding = new Array(1024).fill(0.1);

      bedrockMock.on(InvokeModelCommand).resolves({
        body: new TextEncoder().encode(JSON.stringify({
          embedding: mockEmbedding,
        })) as any,
      });

      const result = await generateEmbedding('테스트 텍스트');

      expect(result).toEqual(mockEmbedding);
      expect(bedrockMock.calls()).toHaveLength(1);

      const call = bedrockMock.call(0);
      expect((call.args[0].input as any).modelId).toBe('amazon.titan-embed-text-v2:0');
    });
  });

  describe('callClaude', () => {
    it('should call Claude model and parse response', async () => {
      bedrockMock.on(InvokeModelCommand).resolves({
        body: new TextEncoder().encode(JSON.stringify({
          content: [{ type: 'text', text: 'Claude response text' }],
        })) as any,
      });

      const result = await callClaude([{ role: 'user', content: 'Hello' }]);

      expect(result).toBe('Claude response text');
    });

    it('should include system prompt when provided', async () => {
      bedrockMock.on(InvokeModelCommand).resolves({
        body: new TextEncoder().encode(JSON.stringify({
          content: [{ type: 'text', text: 'Response with system prompt' }],
        })) as any,
      });

      const result = await callClaude(
        [{ role: 'user', content: 'Hello' }],
        'You are a helpful assistant'
      );

      expect(result).toBe('Response with system prompt');

      const call = bedrockMock.call(0);
      const body = JSON.parse((call.args[0].input as any).body as string);
      expect(body.system).toBe('You are a helpful assistant');
    });

    it('should use custom max tokens', async () => {
      bedrockMock.on(InvokeModelCommand).resolves({
        body: new TextEncoder().encode(JSON.stringify({
          content: [{ type: 'text', text: 'Short response' }],
        })) as any,
      });

      await callClaude(
        [{ role: 'user', content: 'Hello' }],
        undefined,
        500
      );

      const call = bedrockMock.call(0);
      const body = JSON.parse((call.args[0].input as any).body as string);
      expect(body.max_tokens).toBe(500);
    });
  });
});
