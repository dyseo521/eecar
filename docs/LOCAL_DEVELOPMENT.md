# EECAR 로컬 개발 환경 가이드

이 문서는 EECAR 프로젝트를 로컬에서 개발하고 테스트하는 방법을 설명합니다.

## 목차
- [사전 요구사항](#사전-요구사항)
- [빠른 시작](#빠른-시작)
- [상세 설정](#상세-설정)
- [API 테스트](#api-테스트)
- [트러블슈팅](#트러블슈팅)

---

## 사전 요구사항

### 필수 설치

- **Node.js** 20+ ([다운로드](https://nodejs.org/))
- **Docker Desktop** ([다운로드](https://www.docker.com/products/docker-desktop))
- **Git**

### 설치 확인

```bash
node --version    # v20.0.0 이상
npm --version     # 10.0.0 이상
docker --version  # 20.0.0 이상
```

---

## 빠른 시작

### 1. 프로젝트 클론 및 의존성 설치

```bash
cd /home/dyseo521/eecar

# 모든 의존성 설치 (frontend, backend, local-server, shared)
npm run install:all
```

### 2. Docker 서비스 시작

```bash
# DynamoDB Local, LocalStack(S3), DynamoDB Admin 시작
npm run docker:up

# 서비스가 준비될 때까지 대기 (약 10초)
npm run local:setup
```

### 3. 로컬 개발 서버 시작

#### 옵션 A: 모든 서비스 한번에 시작 (추천)

```bash
# Docker + Backend API + Frontend를 동시에 시작
npm run dev:all
```

#### 옵션 B: 개별 시작

```bash
# 터미널 1: Backend API 서버
npm run dev:local

# 터미널 2: Frontend
npm run dev:frontend
```

### 4. 브라우저에서 확인

- **Frontend**: http://localhost:3000
- **API Server**: http://localhost:3001
- **DynamoDB Admin**: http://localhost:8001
- **LocalStack**: http://localhost:4566

---

## 상세 설정

### Docker 서비스

#### 실행 중인 서비스 확인

```bash
docker compose ps
```

예상 출력:
```
NAME                  SERVICE      STATUS    PORTS
eecar-dynamodb        dynamodb     running   0.0.0.0:8000->8000/tcp
eecar-localstack      localstack   running   0.0.0.0:4566->4566/tcp
eecar-dynamodb-admin  dynamodb-admin running 0.0.0.0:8001->8001/tcp
```

#### 로그 확인

```bash
# 모든 서비스 로그
npm run docker:logs

# 특정 서비스 로그
docker compose logs -f dynamodb
docker compose logs -f localstack
```

#### 서비스 중지

```bash
# 모든 서비스 중지
npm run docker:down

# 데이터까지 삭제하고 중지
docker compose down -v
```

### 환경 변수

프론트엔드와 백엔드는 각각 다른 환경 변수를 사용합니다.

#### Frontend (.env.local)

```env
VITE_API_URL=http://localhost:3001
VITE_ENABLE_MOCK_DATA=true
VITE_DEBUG_MODE=true
```

#### Backend (환경 변수)

로컬 서버는 하드코딩된 설정을 사용하므로 별도 설정이 필요 없습니다.

---

## API 테스트

### 1. Health Check

```bash
curl http://localhost:3001/health
```

### 2. 테스트 데이터 생성

```bash
# 배터리 부품 5개 생성
curl -X POST http://localhost:3001/api/synthetic \
  -H "Content-Type: application/json" \
  -d '{"category": "battery", "count": 5}'

# 모터 부품 3개 생성
curl -X POST http://localhost:3001/api/synthetic \
  -H "Content-Type: application/json" \
  -d '{"category": "motor", "count": 3}'
```

### 3. 부품 검색

```bash
curl -X POST http://localhost:3001/api/search \
  -H "Content-Type: application/json" \
  -d '{"query": "배터리", "topK": 5}'
```

### 4. 부품 등록

```bash
curl -X POST http://localhost:3001/api/parts \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Tesla Model S 배터리 팩",
    "category": "battery",
    "manufacturer": "Tesla",
    "model": "Model S",
    "price": 3500000,
    "quantity": 2,
    "description": "2015년식 배터리 팩"
  }'
```

### 5. 부품 조회

```bash
# 카테고리별 조회
curl "http://localhost:3001/api/parts?category=battery&limit=10"

# 특정 부품 조회
curl "http://localhost:3001/api/parts/{partId}"
```

---

## 프론트엔드 개발

### 페이지 구조

- `/` - 랜딩 페이지 (구매자/판매자 선택)
- `/buyer` - 구매자 검색 페이지
- `/seller` - 판매자 대시보드
- `/parts/:id` - 부품 상세 페이지

### 핫 리로드

Vite가 자동으로 변경사항을 감지하고 브라우저를 리로드합니다.

```bash
cd frontend
npm run dev
```

---

## 백엔드 개발

### 로컬 API 서버 구조

```
backend/local-server/
├── index.js         # 메인 Express 서버
└── package.json
```

### 새 엔드포인트 추가

`backend/local-server/index.js`를 편집하여 새 API 엔드포인트를 추가할 수 있습니다.

```javascript
app.post('/api/new-endpoint', async (req, res) => {
  try {
    // 로직 구현
    res.json({ message: 'Success' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

### Node.js Watch Mode

Node.js 20+는 `--watch` 플래그를 지원하여 파일 변경 시 자동 재시작됩니다.

```bash
cd backend/local-server
npm run dev  # node --watch index.js
```

---

## DynamoDB Admin 사용

DynamoDB Local의 데이터를 웹 UI에서 확인할 수 있습니다.

1. 브라우저에서 http://localhost:8001 접속
2. 테이블 목록 확인
3. 데이터 조회/수정/삭제

---

## 트러블슈팅

### Docker 서비스가 시작되지 않음

```bash
# Docker Desktop이 실행 중인지 확인
docker info

# WSL에서 Docker가 연결되지 않은 경우
# Docker Desktop > Settings > Resources > WSL Integration 확인
```

### 포트가 이미 사용 중

```bash
# 포트 사용 확인
lsof -i :3000  # Frontend
lsof -i :3001  # Backend API
lsof -i :8000  # DynamoDB Local
lsof -i :4566  # LocalStack

# 프로세스 종료
kill -9 <PID>
```

### npm install 실패

```bash
# 캐시 삭제 후 재설치
npm cache clean --force
rm -rf node_modules package-lock.json
npm install
```

### Docker 볼륨 초기화

```bash
# 모든 데이터 삭제 후 재시작
docker compose down -v
docker compose up -d
```

### CORS 오류

로컬 API 서버는 모든 origin을 허용하도록 설정되어 있습니다. CORS 오류가 발생하면:

1. 브라우저 콘솔에서 실제 요청 URL 확인
2. `.env.local`의 `VITE_API_URL` 확인
3. 브라우저 캐시 삭제

---

## 개발 워크플로우

### 일반적인 개발 흐름

1. **Docker 서비스 시작**
   ```bash
   npm run docker:up
   ```

2. **테스트 데이터 생성**
   ```bash
   curl -X POST http://localhost:3001/api/synthetic \
     -H "Content-Type: application/json" \
     -d '{"category": "battery", "count": 10}'
   ```

3. **개발 서버 시작**
   ```bash
   npm run dev:all
   ```

4. **브라우저에서 테스트**
   - http://localhost:3000

5. **변경사항 커밋**
   ```bash
   git add .
   git commit -m "feat: add new feature"
   ```

6. **작업 종료**
   ```bash
   npm run docker:down
   ```

---

## 유용한 명령어 모음

```bash
# 전체 환경 시작
npm run dev:all

# 개별 서비스 시작
npm run docker:up       # Docker 서비스만
npm run dev:local       # Backend API만
npm run dev:frontend    # Frontend만

# 로그 확인
npm run docker:logs

# 환경 정리
npm run docker:down

# 의존성 재설치
npm run install:all

# 빌드
npm run build:frontend
npm run build:backend
```

---

## 다음 단계

- [API 문서](./API.md) 참고
- [DynamoDB 스키마](./DYNAMODB_SCHEMA.md) 참고
- [배포 가이드](../README.md#aws-배포) 참고

---

## 문의

로컬 개발 환경 관련 문제가 있으면 이슈를 등록해주세요.
