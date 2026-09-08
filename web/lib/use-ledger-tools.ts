'use client';
import { useEffect } from 'react';
import { api, newKey } from './ledger';

type Tool = {
  name: string;
  title: string;
  description: string;
  inputSchema: object;
  annotations: { readOnlyHint: boolean; untrustedContentHint: boolean };
  execute: (input: unknown) => Promise<unknown>;
};
declare global {
  interface Document {
    modelContext?: {
      registerTool(
        tool: Tool,
        options?: { signal: AbortSignal },
      ): void | Promise<void>;
    };
  }
}

export function useLedgerTools(onChanged: () => Promise<void>) {
  useEffect(() => {
    const context = document.modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    const tool: Tool = {
      name: 'create_equipment_reservation',
      title: 'Reserve equipment',
      description:
        'Create a future reservation for one equipment asset and refresh the visible reservation register.',
      inputSchema: {
        type: 'object',
        properties: {
          assetId: { type: 'string' },
          workerId: { type: 'string' },
          startAt: { type: 'string', format: 'date-time' },
          endAt: { type: 'string', format: 'date-time' },
        },
        required: ['assetId', 'workerId', 'startAt', 'endAt'],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      async execute(input) {
        const value = input as Record<string, unknown>;
        for (const key of ['assetId', 'workerId', 'startAt', 'endAt'])
          if (typeof value[key] !== 'string' || !value[key])
            throw new Error(`${key} is required`);
        const result = await api<{ _id: string; status: string }>(
          '/reservations',
          {
            method: 'POST',
            body: JSON.stringify({ ...value, idempotencyKey: newKey() }),
          },
        );
        await onChanged();
        return { id: result._id, status: result.status };
      },
    };
    try {
      void Promise.resolve(
        context.registerTool(tool, { signal: lifecycle.signal }),
      ).catch(() => undefined);
    } catch {
      return;
    }
    return () => lifecycle.abort();
  }, [onChanged]);
}
