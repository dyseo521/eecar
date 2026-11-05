# 데이터셋 v4: 두 번째 블라인드 홀드아웃

v3를 한 번 확인에 쓴 뒤, 차종 조건과 카테고리 다중 추출을 확인하려고 만들었다(결정 기록 E-27, E-28). **구성 선택에는 쓰지 않는다.**

## 작성 방식

- v3와 같은 절차다([v3 README](../v3/README.md)). 별도 에이전트가 질의 160개(`source_queries.jsonl`)를 썼다.
- 다음은 보지 않았다: 기존 질의(v1~v3), 검색 코드, 조건 추출 규칙, 평가 리포트, 결정 기록.
- 세그먼트 배분은 v3와 같다: A 35, B 14, C 21, D 35, E 32, F 11, G 12.
- 형태 비율: 문장 35%, 구 36%, 키워드 29%.
- 수치·거래 조건이 있는 질의는 38%, 차종을 지정한 질의는 57%다.
- "코나나 니로", "같은 플랫폼" 같은 복수 차종 요청이 7개 들어 있다.
- 카탈로그로 표현할 수 없는 요청이 섞인 질의는 10%다.
- v3와 문구가 같은 질의는 4개다. 모두 짧은 키워드("BMW i3", "기아EV", "인버터", "이트론 본넷")라, 따로 써도 겹칠 만한 흔한 질의다.

## 생성

```bash
uv run python -m eecar_eval.build_v4
npx tsx eval/ts/build-embeddings.ts --dataset eval/datasets/v4 --reuse-docs-from eval/datasets/v2   # 저장소 루트에서
npx tsx eval/ts/export-gate-embeddings.ts --dataset eval/datasets/v4
```
