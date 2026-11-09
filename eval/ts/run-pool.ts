/**
 * 작업을 동시에 limit개까지 실행한다.
 * 첫 작업은 혼자 돌려 프롬프트 캐시를 데운다. 동시에 시작하면 모든 요청이 캐시 쓰기 요금을 낸다.
 */
export async function runPool(tasks: Array<() => Promise<void>>, limit: number): Promise<void> {
  if (tasks.length === 0) return;
  await tasks[0]();
  let next = 1;
  const workers = Math.max(1, Math.min(limit, tasks.length - 1));
  await Promise.all(Array.from({ length: workers }, async () => {
    while (next < tasks.length) await tasks[next++]();
  }));
}
