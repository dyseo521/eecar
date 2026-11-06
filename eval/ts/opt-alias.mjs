// 평가 실행 전용: Lambda Layer 경로(/opt/nodejs/utils/*.js)를 backend/src/utils/*.ts로 바꿔 해석한다.
// Lambda 함수 코드(예: slack-agent)를 로컬에서 그대로 import하기 위한 것이다 (jest moduleNameMapper와 같은 역할).
//   node --import tsx --import ./eval/ts/opt-alias.mjs eval/ts/agent-eval.ts
import { register } from 'node:module';

register('./opt-alias-hooks.mjs', import.meta.url);
