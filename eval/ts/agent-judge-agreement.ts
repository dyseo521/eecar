/**
 * 판정 출처 두 개의 일치도 (채점기 검증).
 *
 *   npx tsx eval/ts/agent-judge-agreement.ts <기준> <비교> [<비교> ...]
 *
 * 출처 형식 (파일 종류를 자동 인식):
 * - 판정 모델 결과: eval/reports/*-agent-judge-*.json ({judgments: [{item, cause, fix, wrong, pass, phrasePass}]})
 * - 사람 판정: 판정 페이지 db를 내보낸 JSON 목록 ([{item, cause, fix, wrong}])
 * - "phrase": 표현 목록 채점기 (판정 모델 결과 파일에 함께 기록된 phrasePass)
 * - 블라인드 조치 판정: eval/reports/*-fixjudge-result.json + 같은 이름의 -key.json (조치 항목만)
 *
 * 보고: 항목별(원인·조치·잘못된 단정) 일치율과 Cohen's κ, 통과 판정의 일치율·κ, 기준 대비 TPR(기준이 통과로 본 것을
 * 통과로 본 비율)·TNR(기준이 실패로 본 것을 실패로 본 비율). 표본이 작으므로 κ는 참고용이다.
 */
import { existsSync, readFileSync } from 'fs';

type Label = { cause?: string; fix?: string; wrong?: string; pass?: boolean };

function keyOf(v: { variant?: string; scenario?: string; run?: number; item?: string }): string {
  return v.item ?? `${v.variant}|${v.scenario}|${v.run}`;
}

function load(spec: string, phraseFrom?: string): Map<string, Label> {
  const m = new Map<string, Label>();
  const finish = (l: Label): Label => ({ ...l, pass: l.pass ?? (l.cause && l.fix && l.wrong ? l.cause === 'yes' && l.fix === 'yes' && l.wrong === 'none' : undefined) });
  if (spec === 'phrase') {
    const src = JSON.parse(readFileSync(phraseFrom!, 'utf-8'));
    for (const j of src.judgments) m.set(keyOf(j), { pass: j.phrasePass });
    return m;
  }
  const data = JSON.parse(readFileSync(spec, 'utf-8'));
  if (Array.isArray(data) && spec.endsWith('-result.json')) {
    // 블라인드 조치 판정: id(J01..) → key 파일로 실행을 찾고, 같은 실행의 표본 id로 바꾼다
    const keyFile = spec.replace(/-result\.json$/, '-key.json');
    const key = new Map((JSON.parse(readFileSync(keyFile, 'utf-8')) as any[]).map(k => [k.id, k]));
    const sample = existsSync('eval/agent/labeling/holdout2-key.json') ? JSON.parse(readFileSync('eval/agent/labeling/holdout2-key.json', 'utf-8')) as any[] : [];
    const variantName = (v: string) => (v === 'shipped' ? 'shipped' : v === 'config' ? 'config' : v);
    for (const r of data) {
      const k = key.get(r.id);
      if (!k) continue;
      const s = sample.find(x => x.variant === variantName(k.variant) && x.scenario === k.scenario && x.run === k.run);
      m.set(s ? s.id : keyOf(k), { fix: r.fix_correct === 'yes' ? 'yes' : r.fix_correct === 'partial' ? 'partial' : 'no' });
    }
    return m;
  }
  const rows = Array.isArray(data) ? data : data.judgments;
  for (const r of rows) m.set(keyOf(r), finish({ cause: r.cause, fix: r.fix, wrong: r.wrong, pass: r.pass }));
  return m;
}

function kappa(pairs: Array<[string, string]>): number {
  const n = pairs.length;
  if (n === 0) return NaN;
  const cats = [...new Set(pairs.flat())];
  const po = pairs.filter(([a, b]) => a === b).length / n;
  const pe = cats.reduce((s, c) => s + (pairs.filter(p => p[0] === c).length / n) * (pairs.filter(p => p[1] === c).length / n), 0);
  return pe === 1 ? 1 : (po - pe) / (1 - pe);
}

function compare(name: string, base: Map<string, Label>, other: Map<string, Label>): void {
  const ids = [...base.keys()].filter(k => other.has(k));
  const line: string[] = [`${name}: n=${ids.length}`];
  for (const dim of ['cause', 'fix', 'wrong'] as const) {
    const pairs = ids.map(k => [base.get(k)![dim], other.get(k)![dim]] as [string | undefined, string | undefined])
      .filter((p): p is [string, string] => p[0] !== undefined && p[1] !== undefined);
    if (pairs.length) line.push(`${dim} 일치 ${(pairs.filter(([a, b]) => a === b).length / pairs.length * 100).toFixed(0)}% κ ${kappa(pairs).toFixed(2)} (n=${pairs.length})`);
  }
  const pp = ids.map(k => [base.get(k)!.pass, other.get(k)!.pass]).filter((p): p is [boolean, boolean] => typeof p[0] === 'boolean' && typeof p[1] === 'boolean');
  if (pp.length) {
    const pos = pp.filter(p => p[0]);
    const neg = pp.filter(p => !p[0]);
    const tpr = pos.length ? pos.filter(p => p[1]).length / pos.length : NaN;
    const tnr = neg.length ? neg.filter(p => !p[1]).length / neg.length : NaN;
    line.push(`통과 일치 ${(pp.filter(([a, b]) => a === b).length / pp.length * 100).toFixed(0)}% κ ${kappa(pp.map(([a, b]) => [String(a), String(b)])).toFixed(2)} TPR ${(tpr * 100).toFixed(0)}% (${pos.length}) TNR ${(tnr * 100).toFixed(0)}% (${neg.length})`);
  }
  console.log(line.join(' | '));
}

const [baseSpec, ...others] = process.argv.slice(2);
if (!baseSpec || !others.length) throw new Error('usage: agent-judge-agreement.ts <기준> <비교> [...]');
const judgeFile = [baseSpec, ...others].find(s => s.includes('agent-judge-'));
const base = load(baseSpec, judgeFile);
console.log(`기준: ${baseSpec}`);
for (const o of others) compare(o, base, load(o, judgeFile));
