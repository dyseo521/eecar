/**
 * CloudWatch Embedded Metric Format (EMF) 출력.
 *
 * 로그 한 줄로 지표를 발행한다. PutMetricData API 호출이 없어 응답 지연과 API 비용이 없다.
 * console.log는 Lambda 런타임이 "타임스탬프 요청ID INFO" 접두어를 붙여 EMF로 인식되지 않으므로
 * stdout에 JSON 한 줄을 직접 쓴다. 외부 패키지를 쓰지 않는 이유: 이 파일은 Lambda Layer에 들어가는데,
 * Layer 코드는 함수의 node_modules를 해석하지 못한다 (DECISION_LOG A-15).
 */

export type MetricUnit = 'Count' | 'Milliseconds';

export interface MetricValue {
  value: number;
  unit: MetricUnit;
}

/**
 * @param dimensionSets 차원 키 조합 목록. [] 를 넣으면 차원 없는 전체 합계도 만들어진다.
 */
export function buildEmfRecord(
  namespace: string,
  dimensions: Record<string, string>,
  metrics: Record<string, MetricValue>,
  dimensionSets: string[][] = [Object.keys(dimensions)],
  timestamp: number = Date.now()
): Record<string, unknown> {
  const values = Object.fromEntries(Object.entries(metrics).map(([name, m]) => [name, m.value]));
  return {
    _aws: {
      Timestamp: timestamp,
      CloudWatchMetrics: [
        {
          Namespace: namespace,
          Dimensions: dimensionSets,
          Metrics: Object.entries(metrics).map(([name, m]) => ({ Name: name, Unit: m.unit })),
        },
      ],
    },
    ...dimensions,
    ...values,
  };
}

export function emitMetrics(
  namespace: string,
  dimensions: Record<string, string>,
  metrics: Record<string, MetricValue>,
  dimensionSets?: string[][]
): void {
  process.stdout.write(JSON.stringify(buildEmfRecord(namespace, dimensions, metrics, dimensionSets)) + '\n');
}
