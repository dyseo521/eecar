# S3 정적 웹사이트 배포 가이드

## 빌드된 파일 위치
프론트엔드가 성공적으로 빌드되었습니다!

빌드 파일 위치: `/home/dyseo521/eecar/frontend/dist/`

### 빌드 결과
```
dist/
├── index.html (0.62 KB)
└── assets/
    ├── index-5b56ADqP.css (0.35 KB)
    ├── index-DakUgpYB.js (55.36 KB)
    ├── query-KIDN7b-l.js (38.73 KB)
    └── vendor-Adg6LZOi.js (159.53 KB)
```

총 용량: ~254 KB (gzip 압축 시 약 74 KB)

---

## S3 콘솔 배포 단계

### 1. S3 버킷 생성
1. AWS Console → S3 이동
2. "버킷 만들기" 클릭
3. 버킷 이름 입력 (예: `eecar-frontend`)
4. 리전 선택 (예: `ap-northeast-2` - 서울)
5. **"퍼블릭 액세스 차단 설정"에서 모든 차단 해제** ✓
6. "버킷 만들기" 완료

### 2. 정적 웹사이트 호스팅 활성화
1. 생성한 버킷 클릭
2. "속성" 탭 이동
3. 맨 아래 "정적 웹 사이트 호스팅" 섹션에서 "편집" 클릭
4. "활성화" 선택
5. **인덱스 문서**: `index.html`
6. **오류 문서**: `index.html` (React Router를 위해 필요)
7. "변경 사항 저장"

### 3. 버킷 정책 설정 (퍼블릭 액세스 허용)
1. "권한" 탭 이동
2. "버킷 정책" 섹션에서 "편집" 클릭
3. 아래 정책 붙여넣기 (**버킷 이름을 본인 것으로 변경**)

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Sid": "PublicReadGetObject",
            "Effect": "Allow",
            "Principal": "*",
            "Action": "s3:GetObject",
            "Resource": "arn:aws:s3:::eecar-frontend/*"
        }
    ]
}
```

4. "변경 사항 저장"

### 4. 파일 업로드
1. "객체" 탭 이동
2. "업로드" 클릭
3. 다음 파일/폴더를 드래그 앤 드롭:
   - `/home/dyseo521/eecar/frontend/dist/` 폴더의 **모든 내용**
   - `index.html`
   - `assets/` 폴더 전체

   **⚠️ 중요**: dist 폴더 자체가 아닌, dist 폴더 **안의** 파일들을 업로드해야 합니다!

4. "업로드" 완료

### 5. 웹사이트 URL 확인
1. "속성" 탭 이동
2. 맨 아래 "정적 웹 사이트 호스팅" 섹션
3. "버킷 웹 사이트 엔드포인트" URL 복사
   - 형식: `http://eecar-frontend.s3-website.ap-northeast-2.amazonaws.com`

---

## CloudFront 배포 (선택사항 - HTTPS + CDN)

S3만으로는 HTTP만 지원됩니다. HTTPS와 빠른 전송을 위해 CloudFront 사용을 권장합니다.

### CloudFront 설정
1. AWS Console → CloudFront 이동
2. "배포 생성" 클릭
3. **원본 도메인**: S3 버킷 웹사이트 엔드포인트 입력 (S3 드롭다운이 아닌 직접 입력!)
4. **뷰어 프로토콜 정책**: "Redirect HTTP to HTTPS"
5. **기본 루트 객체**: `index.html`
6. "배포 생성" 완료
7. 배포 완료까지 5-10분 대기
8. CloudFront 도메인 URL 사용 (예: `d111111abcdef8.cloudfront.net`)

### CloudFront 에러 페이지 설정 (React Router용)
1. 생성한 배포 클릭
2. "오류 페이지" 탭 이동
3. "사용자 지정 오류 응답 생성" 클릭
4. 다음 설정:
   - **HTTP 오류 코드**: 403
   - **응답 페이지 경로**: `/index.html`
   - **HTTP 응답 코드**: 200
5. 동일하게 404 에러도 추가

---

## API 엔드포인트 설정

현재는 API가 `/api`로 하드코딩되어 있어 로컬에서만 작동합니다.

### 실제 API 사용 시
1. API Gateway나 백엔드 서버를 배포
2. `/home/dyseo521/eecar/frontend/.env.production` 파일 수정:

```env
VITE_API_URL=https://your-api-gateway-url.amazonaws.com/prod
```

3. 다시 빌드:
```bash
cd /home/dyseo521/eecar/frontend
npm run build
```

4. 새로 빌드된 파일을 S3에 다시 업로드

---

## 빠른 재배포
코드 변경 후 재배포:

```bash
# 프론트엔드 디렉토리로 이동
cd /home/dyseo521/eecar/frontend

# 빌드
npm run build

# S3 콘솔에서 기존 파일 삭제 후 새 파일 업로드
# 또는 AWS CLI 사용:
# aws s3 sync dist/ s3://eecar-frontend --delete

# CloudFront 사용 시 캐시 무효화:
# aws cloudfront create-invalidation --distribution-id YOUR_DIST_ID --paths "/*"
```

---

## 주의사항

1. **CORS 설정**: 백엔드 API가 다른 도메인에 있다면 CORS 설정 필요
2. **환경 변수**: 빌드 시점에 환경 변수가 결정되므로, 변경 시 재빌드 필수
3. **캐싱**: CloudFront 사용 시 파일 업데이트 후 캐시 무효화 필요
4. **보안**: S3 버킷을 완전히 public으로 열지 말고, CloudFront OAI 사용 권장

---

## 문제 해결

### 페이지가 로드되지 않음
- 버킷 정책이 올바르게 설정되었는지 확인
- 정적 웹사이트 호스팅이 활성화되었는지 확인

### React Router 경로가 404 반환
- 오류 문서가 `index.html`로 설정되었는지 확인
- CloudFront 사용 시 403/404 에러 페이지 설정 확인

### API 호출이 작동하지 않음
- CORS 설정 확인
- `.env.production`의 API URL 확인
- 브라우저 개발자 도구의 Network 탭에서 요청 확인

---

배포 완료 후 웹사이트 URL을 확인하고 테스트해보세요!
