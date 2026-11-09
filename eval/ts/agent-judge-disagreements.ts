/**
 * 판정 2회가 갈린 항목만 뽑아 3번째 판정의 --items로 쓴다 (비용 절감, E-35).
 *
 *   npx tsx eval/ts/agent-judge-disagreements.ts <판정1>.json <판정2>.json --out <항목>.json
 *
 * 원인·조치·단정이 모두 같으면 3번째 판정은 다수결을 바꿀 수 없다. 그래서 일치한 항목은 2표만으로
 * agent-judge-majority.ts에 넣어도 3회 다수결과 결과가 같다. 판정 3회를 전부 돌릴 때보다 약 25~30% 싸다.
 */
import { readFileSync, writeFileSync } from 'fs';

const args = process.argv.slice(2);
const outIdx = args.indexOf('--out');
const out = args[outIdx + 1];
const [a, b] = args.filter((x, i) => x.endsWith('.json') && i !== outIdx + 1);

const load = (f: string) => new Map((JSON.parse(readFileSync(f, 'utf-8')).judgments as any[]).map(j => [`${j.variant}|${j.scenario}|${j.run}`, j]));
const first = load(a);
const second = load(b);
if (first.size !== second.size) throw new Error(`두 판정의 건수가 다르다: ${first.size}, ${second.size}`);

const items = [...first.entries()].flatMap(([id, j]) => {
  const k = second.get(id);
  if (!k) throw new Error(`두 번째 판정에 없는 항목: ${id}`);
  return j.cause === k.cause && j.fix === k.fix && j.wrong === k.wrong ? [] : [{ id, variant: j.variant, scenario: j.scenario, run: j.run }];
});
writeFileSync(out, JSON.stringify(items, null, 1));
console.log(`${first.size}건 중 ${items.length}건이 갈렸다 → ${out}`);
