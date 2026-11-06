#!/usr/bin/env bash
# 시나리오 v3 홀드아웃 비교: v1.9.1 대 후보 (사전 등록은 docs/DECISION_LOG.md E-35).
# 사전 등록 커밋 뒤에 한 번만 실행한다. 저장소 루트에서 실행한다.
#
# 토큰 예산 (dev 측정 기준, 일일 한도는 A-42)
#   Haiku  약 710만: v1.9.1 120회 × 1만 + 후보 120회 × 4.9만
#   Sonnet 약 660만: 240건 × 9,200 × 판정 3회
# 중단되면 그대로 다시 실행한다. 끝난 실행은 건너뛰고, 판정은 이어서 한다.
set -euo pipefail

export AWS_REGION=ap-northeast-2
SCENARIOS=eval/agent/scenarios_v3_holdout.json
RUN="node --import tsx --import ./eval/ts/opt-alias.mjs"
SONNET=global.anthropic.claude-sonnet-4-6
# 판정 모델 v2.2 3회 다수결의 시험용 검증값 (E-33)
TPR=0.81
TNR=0.92

latest() { ls -t eval/reports/*-"$1".json 2>/dev/null | head -1; }

# 1) 에이전트 실행
for variant in shipped candidate; do
  tag="v3holdout-$variant"
  if [ -z "$(latest "agent-eval-$tag")" ]; then
    $RUN eval/ts/agent-eval.ts --scenarios "$SCENARIOS" --runs 3 --variant "$variant" --tag "$tag" &
  fi
done
wait
A=$(latest agent-eval-v3holdout-shipped)
B=$(latest agent-eval-v3holdout-candidate)
[ -n "$A" ] && [ -n "$B" ] || { echo "에이전트 실행 결과가 없다" >&2; exit 1; }

# 2) 판정 모델 3회. 한도로 멈추면 이미 판정한 건은 저장되어 있다
for i in 1 2 3; do
  tag="v3holdout-r$i"
  file=$(latest "agent-judge-$tag")
  $RUN eval/ts/agent-judge.ts --report "$A" --report "$B" --model "$SONNET" --tag "$tag" ${file:+--resume "$file"} | tail -1
done

# 3) 다수결과 비교
OUT=eval/reports/$(date -u +%F)-agent-judge-v3holdout-majority.json
npx tsx eval/ts/agent-judge-majority.ts --out "$OUT" "$(latest agent-judge-v3holdout-r1)" "$(latest agent-judge-v3holdout-r2)" "$(latest agent-judge-v3holdout-r3)"
for variant in shipped candidate; do
  npx tsx eval/ts/agent-judge-to-report.ts "$OUT" --variant "$variant" --tpr "$TPR" --tnr "$TNR" --scenarios "$SCENARIOS" --out "${OUT%.json}-$variant.json"
done
npx tsx eval/ts/agent-compare.ts "${OUT%.json}-shipped.json" "${OUT%.json}-candidate.json"

# 4) 보조 지표
$RUN eval/ts/agent-structured-score.ts "$B"
