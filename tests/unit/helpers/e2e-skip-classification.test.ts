import { describe, expect, it } from 'vitest';
import { classifyToolErrorSkip } from '../../e2e/helpers.js';

describe('E2E helper skip classification', () => {
  it('classifies DDIC table UNLOCK service-unreachable flake as skippable', () => {
    const result = {
      isError: true,
      content: [
        {
          type: 'text',
          text: 'ADT API error: status 400 at /sap/bc/adt/ddic/tables/ZTABINFPWSSEOCBK?_action=UNLOCK&lockHandle=ABC123: Service cannot be reached',
        },
      ],
    };

    const reason = classifyToolErrorSkip(result);
    expect(reason).toContain('DDIC table unlock endpoint intermittently unreachable');
  });

  it('does not classify unrelated unlock errors as skippable', () => {
    const result = {
      isError: true,
      content: [
        {
          type: 'text',
          text: 'ADT API error: status 400 at /sap/bc/adt/packages/ZPKG?_action=UNLOCK&lockHandle=ABC123: Authorization failed',
        },
      ],
    };

    expect(classifyToolErrorSkip(result)).toBeNull();
  });
});
