#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 가격 범위 (카테고리별)
const priceRanges = {
  'battery': { min: 3000000, max: 15000000 },
  'motor': { min: 2000000, max: 8000000 },
  'inverter': { min: 1500000, max: 5000000 },
  'body-chassis-frame': { min: 200000, max: 2000000 },
  'body-panel': { min: 100000, max: 1500000 },
  'body-door': { min: 150000, max: 1000000 },
  'body-window': { min: 50000, max: 800000 },
  'polymer': { min: 50000, max: 300000 }
};

function validatePartsJSON() {
  console.log('='.repeat(60));
  console.log('EECAR 부품 JSON 검증 스크립트');
  console.log('='.repeat(60));
  console.log('');

  // JSON 파일 읽기
  const jsonPath = path.join(__dirname, '../../data/parts-to-import.json');

  if (!fs.existsSync(jsonPath)) {
    console.error('❌ JSON 파일을 찾을 수 없습니다:', jsonPath);
    process.exit(1);
  }

  let data;
  try {
    const jsonContent = fs.readFileSync(jsonPath, 'utf-8');
    data = JSON.parse(jsonContent);
  } catch (error) {
    console.error('❌ JSON 파싱 실패:', error.message);
    process.exit(1);
  }

  const { parts } = data;
  console.log(`총 부품 수: ${parts.length}개\n`);

  const errors = [];
  const warnings = [];
  const partIds = new Set();

  // 카테고리별 통계
  const stats = {
    byCategory: {},
    byCondition: {},
    totalQuantity: 0,
    totalValue: 0
  };

  // 각 부품 검증
  parts.forEach((part, index) => {
    const partNum = index + 1;
    const prefix = `[부품 ${partNum}/${parts.length}] ${part.partId || 'NO_ID'}`;

    // 1. 필수 필드 검증
    const requiredFields = ['partId', 'name', 'category', 'manufacturer', 'price'];
    requiredFields.forEach(field => {
      if (!part[field]) {
        errors.push(`${prefix}: 필수 필드 누락 - ${field}`);
      }
    });

    // 2. partId 중복 검증
    if (part.partId) {
      if (partIds.has(part.partId)) {
        errors.push(`${prefix}: partId 중복 - ${part.partId}`);
      }
      partIds.add(part.partId);
    }

    // 3. 타입 검증
    if (part.year && typeof part.year !== 'number') {
      errors.push(`${prefix}: year는 숫자여야 함 - ${part.year}`);
    }

    if (part.price && typeof part.price !== 'number') {
      errors.push(`${prefix}: price는 숫자여야 함 - ${part.price}`);
    } else if (part.price && part.price <= 0) {
      errors.push(`${prefix}: price는 양수여야 함 - ${part.price}`);
    }

    if (part.quantity && typeof part.quantity !== 'number') {
      errors.push(`${prefix}: quantity는 숫자여야 함 - ${part.quantity}`);
    }

    // 4. 가격 범위 검증
    if (part.price && part.category) {
      const range = priceRanges[part.category];
      if (range) {
        if (part.price < range.min) {
          warnings.push(`${prefix}: 가격이 범위보다 낮음 (${part.price.toLocaleString()}원 < ${range.min.toLocaleString()}원)`);
        } else if (part.price > range.max) {
          warnings.push(`${prefix}: 가격이 범위보다 높음 (${part.price.toLocaleString()}원 > ${range.max.toLocaleString()}원)`);
        }
      }
    }

    // 5. 이미지 파일 존재 확인
    if (part.images && Array.isArray(part.images)) {
      part.images.forEach(imagePath => {
        // /image/xxx.jpg 형태의 경로를 frontend/public/image/xxx.jpg로 변환
        const fullPath = path.join(__dirname, '../../frontend/public', imagePath);
        if (!fs.existsSync(fullPath)) {
          warnings.push(`${prefix}: 이미지 파일 없음 - ${imagePath}`);
        }
      });
    } else if (!part.images || part.images.length === 0) {
      warnings.push(`${prefix}: 이미지 없음`);
    }

    // 6. 카테고리 유효성
    const validCategories = Object.keys(priceRanges);
    if (part.category && !validCategories.includes(part.category)) {
      errors.push(`${prefix}: 유효하지 않은 카테고리 - ${part.category}`);
    }

    // 7. 통계 수집
    if (part.category) {
      stats.byCategory[part.category] = (stats.byCategory[part.category] || 0) + 1;
    }
    if (part.condition) {
      stats.byCondition[part.condition] = (stats.byCondition[part.condition] || 0) + 1;
    }
    stats.totalQuantity += part.quantity || 0;
    stats.totalValue += (part.price || 0) * (part.quantity || 1);
  });

  // 결과 출력
  console.log('='.repeat(60));
  console.log('검증 결과');
  console.log('='.repeat(60));
  console.log('');

  if (errors.length === 0) {
    console.log('✅ 모든 필수 검증 통과!');
  } else {
    console.log(`❌ 오류 ${errors.length}개 발견:`);
    errors.forEach(err => console.log(`   ${err}`));
  }
  console.log('');

  if (warnings.length === 0) {
    console.log('✅ 경고 없음');
  } else {
    console.log(`⚠️  경고 ${warnings.length}개:`);
    warnings.slice(0, 10).forEach(warn => console.log(`   ${warn}`));
    if (warnings.length > 10) {
      console.log(`   ... 외 ${warnings.length - 10}개`);
    }
  }
  console.log('');

  // 통계 출력
  console.log('='.repeat(60));
  console.log('통계');
  console.log('='.repeat(60));
  console.log('');
  console.log('카테고리별 부품 수:');
  Object.entries(stats.byCategory)
    .sort((a, b) => b[1] - a[1])
    .forEach(([category, count]) => {
      console.log(`  ${category.padEnd(25)}: ${count}개`);
    });
  console.log('');

  console.log('상태별 부품 수:');
  Object.entries(stats.byCondition).forEach(([condition, count]) => {
    console.log(`  ${condition.padEnd(15)}: ${count}개`);
  });
  console.log('');

  console.log(`총 재고 수량: ${stats.totalQuantity.toLocaleString()}개`);
  console.log(`총 재고 가치: ${stats.totalValue.toLocaleString()}원`);
  console.log('');

  // 종료 코드
  if (errors.length > 0) {
    console.log('❌ 검증 실패 - 오류를 수정해주세요');
    process.exit(1);
  } else if (warnings.length > 0) {
    console.log('⚠️  경고가 있습니다 - 검토 권장');
    process.exit(0);
  } else {
    console.log('✅ 완벽합니다! DynamoDB 임포트 준비 완료');
    process.exit(0);
  }
}

// 실행
validatePartsJSON();
