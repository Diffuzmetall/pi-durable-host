import test from 'node:test';
import assert from 'node:assert/strict';
import { BACKGROUND_CONTEXT } from '@earendil-works/chord/context';
import { createMcpCodemodeExtension } from '../src/native-profile/guards/mcp-codemode.js';

test('native MCP preserves structured arrays, null, false and zero; only undefined falls back', async () => {
  for (const structuredContent of [[1, 2], null, false, 0, undefined]) {
    const response = { content: [], ...(structuredContent === undefined ? {} : { structuredContent }) };
    const extension = await createMcpCodemodeExtension({ server: 'fixture', allowedTools: ['echo'],
      authorize: async () => {}, client: {
        listTools: async () => [{ name: 'echo', inputSchema: { type: 'object', properties: {} } }],
        callTool: async () => response,
      } });
    const tool = extension.tools.find(tool => tool.name === 'mcp__fixture__echo');
    const result = await tool.execute({}, { callId: 'synthetic-call' }, BACKGROUND_CONTEXT);
    assert.deepEqual(result.structuredOutput, structuredContent === undefined ? response : structuredContent);
    if (structuredContent !== undefined) assert.equal(result.output[0].text, JSON.stringify(structuredContent, null, 2));
  }
});
