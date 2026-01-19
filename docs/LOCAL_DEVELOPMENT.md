# 로컬 개발 환경 설정

## Docker 서비스

`docker-compose.yml`로 AWS 서비스를 로컬에서 에뮬레이션합니다.

### 서비스 구성

| 서비스 | 포트 | 설명 |
|--------|------|------|
| DynamoDB Local | 8000 | 로컬 DynamoDB (테이블: `eecar-parts-table-local`) |
| LocalStack | 4566 | S3, SNS 에뮬레이션 |
| DynamoDB Admin | 8001 | DynamoDB 웹 UI |

### 명령어

```bash
# 모든 서비스 시작
npm run docker:up

# 서비스 중지
npm run docker:down

# 로그 확인
npm run docker:logs
```

## 로컬 백엔드 서버

`backend/local-server/index.js`는 Lambda API Gateway를 모방하는 Express 서버입니다.

### 특징

- **포트**: 3001
- **데이터**: 35개 사전 로드된 부품 (인메모리 + DynamoDB Local)
- **인증**: 간단한 인메모리 인증

### 지원 엔드포인트

```
POST /api/auth/signup     # 회원가입
POST /api/auth/login      # 로그인
GET  /api/parts           # 부품 목록
GET  /api/parts/:id       # 부품 상세
POST /api/search          # AI 검색 (Mock)
POST /api/battery-assessment  # 배터리 SOH 평가
POST /api/material-search     # 재질 물성 검색
POST /api/proposals       # 계약 제안
POST /api/contact         # 일반 문의
```

### 실행

```bash
npm run dev:local
```

## 프론트엔드 개발 서버

### 실행

```bash
npm run dev:frontend
```

### 포트

- 기본: 3000
- 점유 시: 3001, 3002, 3003 순서로 자동 선택

### API 프록시

`vite.config.ts`에서 `/api` 요청을 로컬 백엔드(3001)로 프록시합니다.

### 폴백 데이터

API 서버 미연결 시 `frontend/src/data/mockParts.ts`의 정적 데이터를 사용합니다.

## 통합 실행 (권장)

```bash
# Docker + 백엔드 + 프론트엔드 동시 실행
npm run dev:all
```

자동으로 실행되는 것:
1. Docker Compose (DynamoDB Local, LocalStack)
2. 로컬 백엔드 서버 (포트 3001)
3. Vite 프론트엔드 (포트 3000)

## Mock 데이터 관리

### 데이터 위치

| 위치 | 용도 |
|------|------|
| `backend/local-server/index.js` | Express 서버용 (35개 부품) |
| `frontend/src/data/mockParts.ts` | 정적 호스팅용 (동일 35개) |

### 데이터 구성

- **배터리**: 10개 (다양한 SOH, 양극재 타입)
- **모터**: 6개
- **인버터**: 6개
- **차체 부품**: 13개 (샤시, 패널, 도어, 윈도우)

### 데이터 수정 시

두 파일을 동시에 수정하여 일관성 유지:

```bash
# 1. 백엔드 데이터 수정
vim backend/local-server/index.js

# 2. 프론트엔드 데이터 동기화
vim frontend/src/data/mockParts.ts
```

## SAM Local 테스트 (선택사항)

실제 Lambda 환경을 로컬에서 테스트:

```bash
cd infrastructure
sam build
sam local start-api --port 3001
```

**주의**: Bedrock 호출은 실제 AWS 자격 증명 필요

## 포트 충돌 해결

```bash
# 특정 포트 사용 프로세스 종료
lsof -ti:3000 | xargs kill -9
lsof -ti:3001 | xargs kill -9
lsof -ti:8000 | xargs kill -9

# Docker 서비스 재시작
npm run docker:down && npm run docker:up
```

## 환경 변수

### 프론트엔드 (.env)

```env
VITE_API_URL=http://localhost:3001
```

### 로컬 서버 (하드코딩됨)

- DynamoDB: `http://localhost:8000`
- LocalStack S3: `http://localhost:4566`

## 디버깅 팁

### DynamoDB Admin UI

브라우저에서 `http://localhost:8001` 접속하여 테이블 데이터 확인

### 백엔드 로그

```bash
# 로컬 서버 실행 시 콘솔에 로그 출력
npm run dev:local
```

### Docker 로그

```bash
npm run docker:logs

# 특정 서비스 로그
docker logs eecar-dynamodb-local
docker logs eecar-localstack
```
