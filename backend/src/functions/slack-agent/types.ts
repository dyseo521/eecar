/**
 * 자동이 2.0 타입 정의
 */

// Slack 이벤트 타입
export interface SlackEvent {
  type: string;
  token?: string;
  challenge?: string;
  team_id?: string;
  api_app_id?: string;
  event_id?: string;  // 중복 방지용
  event?: SlackEventPayload;
  // Slash Command 필드
  command?: string;
  text?: string;
  response_url?: string;
  trigger_id?: string;
  user_id?: string;
  user_name?: string;
  channel_id?: string;
  channel_name?: string;
  // Interactive Components
  payload?: string;
}

export interface SlackEventPayload {
  type: string;
  user: string;
  text: string;
  ts: string;
  channel: string;
  event_ts: string;
  thread_ts?: string;
  bot_id?: string;  // 봇 메시지 구분용
}

// Tool 정의
export interface Tool {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, ToolProperty>;
    required?: string[];
  };
}

export interface ToolProperty {
  type: string;
  description: string;
  enum?: string[];
}

// ReAct 스텝
export interface AgentStep {
  thought: string;
  action?: string;
  actionInput?: Record<string, unknown>;
  observation?: string;
}

// Tool 실행 결과
export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

// 에러 분석 결과
export interface ErrorAnalysis {
  errorType: string;
  functionName: string;
  cause: string;
  solutions: string[];
  relatedCode?: string[];
  pastSolutions?: MemoryResult[];
}

// 기억 저장/검색
export interface Memory {
  key: string;
  errorType: string;
  functionName: string;
  resolution: string;
  codeChanges?: string[];
  resolvedBy?: string;
  successCount: number;
  createdAt: number;
  lastUsed?: number;
}

export interface MemoryResult {
  memory: Memory;
  score: number;
}

// Lambda 상태
export interface LambdaStatus {
  functionName: string;
  /** false면 이 이름의 함수가 스택에 없다 (0으로 채운 지표를 정상으로 오해하지 않게 한다, A-35) */
  found?: boolean;
  note?: string;
  invocations: number;
  errors: number;
  errorRate: number;
  avgDuration: number;
  lastError?: {
    message: string;
    timestamp: string;
  };
}

// 로그 조회 결과
export interface LogEntry {
  timestamp: string;
  message: string;
  requestId?: string;
  level: 'ERROR' | 'WARN' | 'INFO';
}

// Slack 메시지 블록 (유연한 타입)
export interface SlackBlock {
  type: string;
  text?: {
    type: string;
    text: string;
    emoji?: boolean;
  };
  elements?: SlackContextElement[];
  fields?: Array<{ type: string; text: string }>;
  accessory?: SlackBlockElement;
}

// Context 블록용 요소
export interface SlackContextElement {
  type: string;
  text?: string;
  image_url?: string;
  alt_text?: string;
}

export interface SlackBlockElement {
  type: string;
  text?: { type: string; text: string; emoji?: boolean };
  action_id?: string;
  url?: string;
  value?: string;
  style?: 'primary' | 'danger';
}

// 응답 타입
export interface SlackResponse {
  statusCode: number;
  body: string;
  headers?: Record<string, string>;
}
