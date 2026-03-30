/**
 * MCP Elicitation helpers for ARC-1.
 *
 * Wraps the MCP SDK's server.elicitInput() with:
 * - Client capability detection (graceful fallback when unsupported)
 * - Typed convenience methods for common patterns
 * - Audit logging of all elicitation events
 *
 * Based on MCP spec 2025-06-18 / 2025-11-25 elicitation protocol.
 * Dassian ADT uses similar patterns for confirmations and parameter prompts.
 */

import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { logger } from './logger.js';

/**
 * Check if the connected MCP client supports form elicitation.
 * Returns false if server is undefined or client doesn't declare the capability.
 */
function supportsElicitation(server?: Server): boolean {
  if (!server) return false;
  try {
    const caps = server.getClientCapabilities();
    return !!caps?.elicitation?.form;
  } catch {
    return false;
  }
}

/**
 * Confirm a destructive or irreversible operation with the user.
 *
 * Returns true if:
 * - User confirms (action: 'accept')
 * - Elicitation is not supported (graceful fallback — proceed without asking)
 *
 * Returns false if:
 * - User declines or cancels
 */
export async function confirmDestructive(
  server: Server | undefined,
  toolName: string,
  message: string,
): Promise<boolean> {
  if (!supportsElicitation(server)) {
    return true; // Fallback: proceed without asking
  }

  logger.emitAudit({
    timestamp: new Date().toISOString(),
    level: 'info',
    event: 'elicitation_sent',
    tool: toolName,
    message,
    fields: ['confirm'],
  });

  try {
    const result = await server!.elicitInput({
      message,
      requestedSchema: {
        type: 'object',
        properties: {
          confirm: {
            type: 'boolean',
            title: 'Confirm',
            description: message,
          },
        },
        required: ['confirm'],
      },
    });

    const accepted = result.action === 'accept' && result.content?.confirm === true;

    logger.emitAudit({
      timestamp: new Date().toISOString(),
      level: 'info',
      event: 'elicitation_response',
      tool: toolName,
      action: result.action,
    });

    return accepted;
  } catch {
    // Elicitation failed (client doesn't support it, connection issue, etc.)
    // Graceful fallback: proceed
    return true;
  }
}

/**
 * Ask user to select from a list of options.
 *
 * Returns the selected value, or undefined if:
 * - User cancels/declines
 * - Elicitation is not supported
 */
export async function selectOption(
  server: Server | undefined,
  toolName: string,
  message: string,
  options: Array<{ value: string; title: string }>,
): Promise<string | undefined> {
  if (!supportsElicitation(server)) {
    return undefined;
  }

  logger.emitAudit({
    timestamp: new Date().toISOString(),
    level: 'info',
    event: 'elicitation_sent',
    tool: toolName,
    message,
    fields: ['selection'],
  });

  try {
    const result = await server!.elicitInput({
      message,
      requestedSchema: {
        type: 'object',
        properties: {
          selection: {
            type: 'string' as const,
            title: 'Selection',
            description: message,
            enum: options.map((o) => o.value),
            enumNames: options.map((o) => o.title),
          },
        },
        required: ['selection'],
      },
    });

    logger.emitAudit({
      timestamp: new Date().toISOString(),
      level: 'info',
      event: 'elicitation_response',
      tool: toolName,
      action: result.action,
    });

    if (result.action === 'accept' && typeof result.content?.selection === 'string') {
      return result.content.selection;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

/**
 * Prompt user for a string value.
 *
 * Returns the entered value, or undefined if:
 * - User cancels/declines
 * - Elicitation is not supported
 */
export async function promptString(
  server: Server | undefined,
  toolName: string,
  message: string,
  fieldName: string,
  description?: string,
): Promise<string | undefined> {
  if (!supportsElicitation(server)) {
    return undefined;
  }

  logger.emitAudit({
    timestamp: new Date().toISOString(),
    level: 'info',
    event: 'elicitation_sent',
    tool: toolName,
    message,
    fields: [fieldName],
  });

  try {
    const result = await server!.elicitInput({
      message,
      requestedSchema: {
        type: 'object',
        properties: {
          [fieldName]: {
            type: 'string',
            title: fieldName,
            description: description ?? message,
          },
        },
        required: [fieldName],
      },
    });

    logger.emitAudit({
      timestamp: new Date().toISOString(),
      level: 'info',
      event: 'elicitation_response',
      tool: toolName,
      action: result.action,
    });

    if (result.action === 'accept' && typeof result.content?.[fieldName] === 'string') {
      return result.content[fieldName] as string;
    }
    return undefined;
  } catch {
    return undefined;
  }
}
