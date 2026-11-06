/**
 * 판정 모델 여러 번의 결과를 항목별 다수결로 묶는다 (판정 모델 실행 간 잡음을 줄이기 위함, E-33).
 *
 *   npx tsx eval/ts/agent-judge-majority.ts --out <파일> <판정1>.json <판정2>.json <판정3>.json
 *
 * 같은 설정으로 세 번 돌리면 통과 판정은 90~95%, 잘못된 단정은 80~88%만 서로 일치했다(개발용 40건).
 * 원인·조치·잘못된 단정을 각각 다수결로 정한 뒤 통과 여부를 다시 계산한다. 동률이면 더 엄격한 쪽을 고른다.
 */
import { readFileSync, writeFileSync } from 'fs';

const args = process.argv.slice(2);
const outIdx = args.indexOf('--out');
const out = args[outIdx + 1];
const files = args.filter((a, i) => a.endsWith('.json') && i !== outIdx + 1);

const STRICT: Record<string, string[]> = { cause: ['no', 'partial', 'yes'], fix: ['no', 'partial', 'yes'], wrong: ['present', 'none'] };

function vote(dim: string, values: string[]): string {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  const top = Math.max(...counts.values());
  // 동률이면 엄격한 값(목록 앞쪽)을 고른다
  return STRICT[dim].find(v => counts.get(v) === top) ?? values[0];
}

const runs = files.map(f => JSON.parse(readFileSync(f, 'utf-8')));
const key = (j: any) => j.item ?? `${j.variant}|${j.scenario}|${j.run}`;
const byKey = new Map<string, any[]>();
for (const run of runs) for (const j of run.judgments) byKey.set(key(j), [...(byKey.get(key(j)) ?? []), j]);

const judgments = [...byKey.values()].map(js => {
  const base = js[0];
  const m = { cause: vote('cause', js.map(j => j.cause)), fix: vote('fix', js.map(j => j.fix)), wrong: vote('wrong', js.map(j => j.wrong)) };
  return { item: base.item, variant: base.variant, scenario: base.scenario, run: base.run, ...m,
    pass: m.cause === 'yes' && m.fix === 'yes' && m.wrong === 'none', phrasePass: base.phrasePass, votes: js.length };
});
writeFileSync(out, JSON.stringify({ meta: { judgeVersion: `${runs[0].meta.judgeVersion}-majority${files.length}`, model: runs[0].meta.model, sources: files }, judgments }, null, 2) + '\n', 'utf-8');
console.log(`${judgments.length}건, ${files.length}회 다수결 → ${out}`);
