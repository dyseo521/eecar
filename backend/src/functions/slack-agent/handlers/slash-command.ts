/**
 * Slash Command 핸들러
 * /자동이 [명령어] [옵션]
 */

import { SlackEvent, SlackBlock } from '../types.js';
import { getLambdaStatus, getRecentLogs } from '../tools/cloudwatch.js';
import { analyzeError } from '../tools/analyze-error.js';
import { recallMemory } from '../tools/memory.js';

// Lambda 함수 목록 (EECAR 프로젝트)
const LAMBDA_FUNCTIONS = [
  'VectorSearchFunction',
  'PartRegistrationFunction',
  'ComplianceCheckFunction',
  'GetPartsFunction',
  'WatchPartFunction',
  'ProposalFunction',
  'SyntheticDataFunction',
  'BatteryHealthAssessmentFunction',
  'MaterialPropertySearchFunction',
  'ContactInquiryFunction',
  'SlackNotificationFunction',
];

/**
 * Slash Command 처리
 */
export async function handleSlashCommand(event: SlackEvent): Promise<unknown> {
  const text = (event.text || '').trim();
  const [command, ...args] = text.split(/\s+/);

  console.log('Slash command:', { command, args, userId: event.user_id });

  switch (command.toLowerCase()) {
    case '상태':
    case 'status':
      return await handleStatusCommand(args);

    case '로그':
    case 'logs':
      return await handleLogsCommand(args);

    case '분석':
    case 'analyze':
      return await handleAnalyzeCommand(args);

    case '기억':
    case 'memory':
      return await handleMemoryCommand(args);

    case '도움말':
    case 'help':
    case '':
      return handleHelpCommand();

    default:
      return {
        response_type: 'ephemeral',
        text: `알 수 없는 명령어입니다: \`${command}\`\n\`/자동이 도움말\`로 사용 가능한 명령어를 확인하세요.`,
      };
  }
}

/**
 * /자동이 상태 - Lambda 함수 상태 조회
 */
async function handleStatusCommand(args: string[]): Promise<unknown> {
  const functionFilter = args[0];

  try {
    const functions = functionFilter
      ? LAMBDA_FUNCTIONS.filter((f) =>
          f.toLowerCase().includes(functionFilter.toLowerCase())
        )
      : LAMBDA_FUNCTIONS;

    if (functions.length === 0) {
      return {
        response_type: 'ephemeral',
        text: `\`${functionFilter}\`와 일치하는 함수를 찾을 수 없습니다.`,
      };
    }

    const statuses = await Promise.all(
      functions.slice(0, 5).map((fn) => getLambdaStatus(fn))
    );

    const blocks: SlackBlock[] = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: '📊 EECAR Lambda 함수 상태 (최근 1시간)',
          emoji: true,
        },
      },
      { type: 'divider' },
    ];

    // 상태 테이블
    const statusLines = statuses.map((s) => {
      const errorEmoji = s.errorRate > 5 ? '🔴' : s.errorRate > 0 ? '🟡' : '🟢';
      return `${errorEmoji} *${s.functionName}*\n   호출: ${s.invocations} | 에러: ${s.errors} (${s.errorRate.toFixed(1)}%) | 평균: ${s.avgDuration.toFixed(0)}ms`;
    });

    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: statusLines.join('\n\n'),
      },
    });

    // 에러가 있는 함수 강조
    const errorFunctions = statuses.filter((s) => s.errors > 0);
    if (errorFunctions.length > 0) {
      blocks.push({ type: 'divider' });
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text:
            `⚠️ *에러 발생 함수*\n` +
            errorFunctions
              .map(
                (s) =>
                  `• ${s.functionName}: ${s.errors}건${s.lastError ? ` (마지막: ${s.lastError.message.slice(0, 50)}...)` : ''}`
              )
              .join('\n'),
        },
      });
    }

    return {
      response_type: 'in_channel',
      blocks,
    };
  } catch (error) {
    console.error('Error getting status:', error);
    return {
      response_type: 'ephemeral',
      text: '상태 조회 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.',
    };
  }
}

/**
 * /자동이 로그 [함수명] - 최근 에러 로그 조회
 */
async function handleLogsCommand(args: string[]): Promise<unknown> {
  const functionName = args[0];

  if (!functionName) {
    return {
      response_type: 'ephemeral',
      text: '함수명을 입력해주세요.\n사용법: `/자동이 로그 VectorSearch`',
    };
  }

  // 함수명 매칭
  const matchedFunction = LAMBDA_FUNCTIONS.find((f) =>
    f.toLowerCase().includes(functionName.toLowerCase())
  );

  if (!matchedFunction) {
    return {
      response_type: 'ephemeral',
      text: `\`${functionName}\`와 일치하는 함수를 찾을 수 없습니다.\n사용 가능한 함수: ${LAMBDA_FUNCTIONS.slice(0, 5).join(', ')}...`,
    };
  }

  try {
    const logs = await getRecentLogs(matchedFunction, 30, 'ERROR');

    const blocks: SlackBlock[] = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: `📜 ${matchedFunction} 최근 로그`,
          emoji: true,
        },
      },
      { type: 'divider' },
    ];

    if (logs.length === 0) {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '✅ 최근 30분간 에러 로그가 없습니다.',
        },
      });
    } else {
      const logText = logs
        .slice(0, 5)
        .map(
          (log) =>
            `*${new Date(log.timestamp).toLocaleTimeString('ko-KR')}*\n\`\`\`${log.message.slice(0, 200)}${log.message.length > 200 ? '...' : ''}\`\`\``
        )
        .join('\n');

      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: logText,
        },
      });

      if (logs.length > 5) {
        blocks.push({
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: `외 ${logs.length - 5}건의 로그가 더 있습니다.`,
            },
          ],
        });
      }
    }

    return {
      response_type: 'in_channel',
      blocks,
    };
  } catch (error) {
    console.error('Error getting logs:', error);
    return {
      response_type: 'ephemeral',
      text: '로그 조회 중 오류가 발생했습니다.',
    };
  }
}

/**
 * /자동이 분석 [에러메시지] - AI 에러 분석
 */
async function handleAnalyzeCommand(args: string[]): Promise<unknown> {
  const errorMessage = args.join(' ');

  if (!errorMessage) {
    return {
      response_type: 'ephemeral',
      text: '분석할 에러 메시지를 입력해주세요.\n사용법: `/자동이 분석 BedrockThrottlingException`',
    };
  }

  try {
    // AI 분석 수행
    const analysis = await analyzeError({
      errorMessage,
      functionName: 'Unknown',
    });

    const blocks: SlackBlock[] = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: '🤖 자동이 AI 분석',
          emoji: true,
        },
      },
      { type: 'divider' },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*에러 타입:* ${analysis.errorType}\n*원인:* ${analysis.cause}`,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text:
            '*💡 해결책:*\n' +
            analysis.solutions.map((s, i) => `${i + 1}. ${s}`).join('\n'),
        },
      },
    ];

    // 과거 해결 사례가 있으면 추가
    if (analysis.pastSolutions && analysis.pastSolutions.length > 0) {
      blocks.push({ type: 'divider' });
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text:
            '*📚 과거 해결 사례:*\n' +
            analysis.pastSolutions
              .slice(0, 2)
              .map(
                (p) =>
                  `• ${p.memory.resolution} (성공 ${p.memory.successCount}회)`
              )
              .join('\n'),
        },
      });
    }

    return {
      response_type: 'in_channel',
      blocks,
    };
  } catch (error) {
    console.error('Error analyzing:', error);
    return {
      response_type: 'ephemeral',
      text: '분석 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.',
    };
  }
}

/**
 * /자동이 기억 [검색어] - 과거 해결 사례 검색
 */
async function handleMemoryCommand(args: string[]): Promise<unknown> {
  const query = args.join(' ');

  if (!query) {
    return {
      response_type: 'ephemeral',
      text: '검색할 에러 타입이나 키워드를 입력해주세요.\n사용법: `/자동이 기억 Throttling`',
    };
  }

  try {
    const memories = await recallMemory({ query, topK: 5 });

    const blocks: SlackBlock[] = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: '📚 자동이 기억 검색',
          emoji: true,
        },
      },
      { type: 'divider' },
    ];

    if (memories.length === 0) {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `\`${query}\`와 관련된 기억이 없습니다.\n에러 해결 후 \`해결됨\` 피드백을 주시면 자동이가 학습합니다! 🧠`,
        },
      });
    } else {
      const memoryText = memories
        .map(
          (m, i) =>
            `*${i + 1}. ${m.memory.errorType}* (${m.memory.functionName})\n` +
            `   해결: ${m.memory.resolution}\n` +
            `   성공: ${m.memory.successCount}회 | 유사도: ${(m.score * 100).toFixed(0)}%`
        )
        .join('\n\n');

      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: memoryText,
        },
      });
    }

    return {
      response_type: 'in_channel',
      blocks,
    };
  } catch (error) {
    console.error('Error recalling memory:', error);
    return {
      response_type: 'ephemeral',
      text: '기억 검색 중 오류가 발생했습니다.',
    };
  }
}

/**
 * /자동이 도움말 - 사용법 안내
 */
function handleHelpCommand(): unknown {
  return {
    response_type: 'ephemeral',
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: '🤖 자동이 2.0 사용법',
          emoji: true,
        },
      },
      { type: 'divider' },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text:
            '*명령어 목록*\n\n' +
            '• `/자동이 상태 [함수명]` - Lambda 함수 상태 조회\n' +
            '• `/자동이 로그 <함수명>` - 최근 에러 로그 조회\n' +
            '• `/자동이 분석 <에러메시지>` - AI 에러 원인 분석\n' +
            '• `/자동이 기억 <검색어>` - 과거 해결 사례 검색\n' +
            '• `/자동이 도움말` - 이 메시지 표시\n\n' +
            '*또는 @자동이 멘션으로 자연어 대화도 가능합니다!*',
        },
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: '자동이는 에러 해결 경험을 학습합니다. 해결 성공 시 피드백을 주세요! 🧠',
          },
        ],
      },
    ],
  };
}
