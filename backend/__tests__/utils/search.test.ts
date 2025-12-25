import {
  tokenize,
  bm25Score,
  calculateBM25Scores,
  normalizeBM25Scores,
  hybridScore,
  hybridSearch,
  preparePartForBM25
} from '../../src/utils/search.js';

describe('Search Utils', () => {
  describe('tokenize', () => {
    it('should tokenize Korean text', () => {
      const text = '현대 아이오닉5 배터리 팩';
      const tokens = tokenize(text);

      expect(tokens).toContain('현대');
      expect(tokens).toContain('아이오닉5');
      expect(tokens).toContain('배터리');
      expect(tokens).toContain('팩');
    });

    it('should remove standalone Korean stop words', () => {
      // Note: Current tokenizer removes standalone stop words only
      // Particles attached to words (e.g., '의' in '배터리의') are not removed
      // For proper Korean NLP, consider using mecab-ko or similar
      const text = '배터리 의 상태 는 좋습니다';
      const tokens = tokenize(text);

      // Standalone '의', '는' should be removed
      expect(tokens).not.toContain('의');
      expect(tokens).not.toContain('는');
      expect(tokens).toContain('배터리');
      expect(tokens).toContain('상태');
    });

    it('should handle empty string', () => {
      const tokens = tokenize('');
      expect(tokens).toEqual([]);
    });

    it('should convert to lowercase', () => {
      const text = 'BATTERY Pack';
      const tokens = tokenize(text);

      expect(tokens).toContain('battery');
      expect(tokens).toContain('pack');
      expect(tokens).not.toContain('BATTERY');
    });

    it('should remove punctuation', () => {
      const text = '배터리, 모터; 인버터!';
      const tokens = tokenize(text);

      expect(tokens).toContain('배터리');
      expect(tokens).toContain('모터');
      expect(tokens).toContain('인버터');
      expect(tokens.join(' ')).not.toContain(',');
    });
  });

  describe('bm25Score', () => {
    const documents = [
      '현대 아이오닉5 배터리 팩 72kWh',
      '테슬라 모델3 배터리 팩 82kWh',
      '기아 EV6 모터 드라이브 유닛',
    ];

    const allDocTokens = documents.map(d => tokenize(d));

    it('should return higher score for more relevant documents', () => {
      const queryTokens = tokenize('현대 배터리');

      const score1 = bm25Score(queryTokens, allDocTokens[0], allDocTokens);
      const score2 = bm25Score(queryTokens, allDocTokens[2], allDocTokens);

      // Document with '현대' and '배터리' should score higher
      expect(score1).toBeGreaterThan(score2);
    });

    it('should return 0 for completely irrelevant document', () => {
      const queryTokens = tokenize('없는키워드');
      const score = bm25Score(queryTokens, allDocTokens[0], allDocTokens);

      expect(score).toBe(0);
    });

    it('should handle empty query', () => {
      const queryTokens: string[] = [];
      const score = bm25Score(queryTokens, allDocTokens[0], allDocTokens);

      expect(score).toBe(0);
    });
  });

  describe('calculateBM25Scores', () => {
    const documents = [
      { id: 'doc1', text: '현대 아이오닉5 배터리 팩' },
      { id: 'doc2', text: '테슬라 모델3 구동 모터' },
      { id: 'doc3', text: 'LG 배터리 셀 팩' },
    ];

    it('should calculate scores for all documents', () => {
      const scores = calculateBM25Scores('배터리', documents);

      expect(scores).toHaveLength(3);
      expect(scores[0].id).toBe('doc1');
      expect(scores[1].id).toBe('doc2');
      expect(scores[2].id).toBe('doc3');
    });

    it('should give higher scores to documents with query terms', () => {
      const scores = calculateBM25Scores('배터리', documents);

      const doc1Score = scores.find(s => s.id === 'doc1')!.bm25Score;
      const doc2Score = scores.find(s => s.id === 'doc2')!.bm25Score;

      // doc1 and doc3 have '배터리', doc2 doesn't
      expect(doc1Score).toBeGreaterThan(doc2Score);
    });
  });

  describe('normalizeBM25Scores', () => {
    it('should normalize scores to 0-1 range', () => {
      const scores = [
        { id: 'a', bm25Score: 10 },
        { id: 'b', bm25Score: 5 },
        { id: 'c', bm25Score: 0 },
      ];

      const normalized = normalizeBM25Scores(scores);

      expect(normalized[0].bm25Score).toBe(1); // max -> 1
      expect(normalized[1].bm25Score).toBe(0.5); // middle
      expect(normalized[2].bm25Score).toBe(0); // min -> 0
    });

    it('should handle empty array', () => {
      const normalized = normalizeBM25Scores([]);
      expect(normalized).toEqual([]);
    });

    it('should handle all same scores', () => {
      const scores = [
        { id: 'a', bm25Score: 5 },
        { id: 'b', bm25Score: 5 },
      ];

      const normalized = normalizeBM25Scores(scores);

      // All same scores should become 1
      expect(normalized[0].bm25Score).toBe(1);
      expect(normalized[1].bm25Score).toBe(1);
    });
  });

  describe('hybridScore', () => {
    it('should combine scores with default alpha 0.7', () => {
      const vectorScore = 0.8;
      const bm25 = 0.6;

      const combined = hybridScore(vectorScore, bm25);

      // 0.7 * 0.8 + 0.3 * 0.6 = 0.56 + 0.18 = 0.74
      expect(combined).toBeCloseTo(0.74, 2);
    });

    it('should use custom alpha weight', () => {
      const vectorScore = 0.8;
      const bm25 = 0.4;
      const alpha = 0.5;

      const combined = hybridScore(vectorScore, bm25, alpha);

      // 0.5 * 0.8 + 0.5 * 0.4 = 0.6
      expect(combined).toBeCloseTo(0.6, 2);
    });

    it('should return vector score when alpha is 1', () => {
      const combined = hybridScore(0.9, 0.1, 1);
      expect(combined).toBe(0.9);
    });

    it('should return BM25 score when alpha is 0', () => {
      const combined = hybridScore(0.9, 0.1, 0);
      expect(combined).toBe(0.1);
    });
  });

  describe('hybridSearch', () => {
    const vectorResults = [
      { id: 'part1', score: 0.95 },
      { id: 'part2', score: 0.85 },
      { id: 'part3', score: 0.75 },
    ];

    const documents = [
      { id: 'part1', text: '현대 아이오닉5 배터리 팩' },
      { id: 'part2', text: '테슬라 모델3 배터리 팩' },
      { id: 'part3', text: '기아 EV6 모터' },
    ];

    it('should combine vector and BM25 scores', () => {
      const results = hybridSearch(vectorResults, documents, '배터리');

      expect(results).toHaveLength(3);

      // Each result should have all score components
      results.forEach(result => {
        expect(result).toHaveProperty('id');
        expect(result).toHaveProperty('score');
        expect(result).toHaveProperty('vectorScore');
        expect(result).toHaveProperty('bm25Score');
      });
    });

    it('should sort results by combined score descending', () => {
      const results = hybridSearch(vectorResults, documents, '배터리');

      for (let i = 0; i < results.length - 1; i++) {
        expect(results[i].score).toBeGreaterThanOrEqual(results[i + 1].score);
      }
    });

    it('should preserve original vector scores', () => {
      const results = hybridSearch(vectorResults, documents, '배터리');

      const part1 = results.find(r => r.id === 'part1');
      expect(part1?.vectorScore).toBe(0.95);
    });

    it('should boost documents with matching keywords', () => {
      // part3 has low vector score but query is '모터'
      const results = hybridSearch(vectorResults, documents, '모터');

      const part3 = results.find(r => r.id === 'part3');
      // BM25 should boost the combined score
      expect(part3!.bm25Score).toBeGreaterThan(0);
    });
  });

  describe('preparePartForBM25', () => {
    it('should combine basic part fields', () => {
      const part = {
        name: '현대 배터리 팩',
        category: 'battery',
        manufacturer: 'SK온',
        model: 'NCM811',
        description: '72kWh 배터리',
      };

      const text = preparePartForBM25(part);

      expect(text).toContain('현대 배터리 팩');
      expect(text).toContain('battery');
      expect(text).toContain('SK온');
      expect(text).toContain('NCM811');
      expect(text).toContain('72kWh 배터리');
    });

    it('should include specifications if available', () => {
      const part = {
        name: '배터리',
        category: 'battery',
        specifications: {
          materialComposition: { primary: 'NCM' },
          electricalProps: { voltage: 400, capacity: 180 },
        },
      };

      const text = preparePartForBM25(part);

      expect(text).toContain('NCM');
      expect(text).toContain('400V');
      expect(text).toContain('180Ah');
    });

    it('should include battery health info', () => {
      const part = {
        name: '배터리',
        category: 'battery',
        batteryHealth: {
          soh: 92,
          cathodeType: 'NCM Ni 80%',
        },
      };

      const text = preparePartForBM25(part);

      expect(text).toContain('SOH 92%');
      expect(text).toContain('NCM Ni 80%');
    });

    it('should handle missing fields gracefully', () => {
      const part = {
        name: '배터리',
      };

      const text = preparePartForBM25(part);

      expect(text).toBe('배터리');
    });

    it('should handle empty part object', () => {
      const text = preparePartForBM25({});
      expect(text).toBe('');
    });
  });
});
