import type { APIGatewayProxyEvent } from 'aws-lambda';
import { parseJsonBody } from '../../src/utils/response.js';

function eventWithBody(body: string | null): APIGatewayProxyEvent {
  return { body, headers: {} } as unknown as APIGatewayProxyEvent;
}

describe('parseJsonBody', () => {
  it('parses a JSON object body', () => {
    const result = parseJsonBody(eventWithBody('{"query":"배터리","topK":5}'));
    expect(result).toEqual({ ok: true, body: { query: '배터리', topK: 5 } });
  });

  it('treats a missing body as an empty object', () => {
    expect(parseJsonBody(eventWithBody(null))).toEqual({ ok: true, body: {} });
  });

  it('returns 400 for malformed JSON instead of throwing (which used to surface as a 500 and an alert)', () => {
    const result = parseJsonBody(eventWithBody('THIS_IS_NOT_JSON'));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.statusCode).toBe(400);
      expect(JSON.parse(result.response.body).error).toBe('Invalid JSON body');
    }
  });

  it.each(['[1,2]', '"text"', '42', 'null'])('returns 400 when the body is valid JSON but not an object: %s', (body) => {
    const result = parseJsonBody(eventWithBody(body));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.statusCode).toBe(400);
    }
  });
});
