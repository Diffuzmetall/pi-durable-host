/** Data shape of the existing BB native-history-contract; Core still owns runtime validation. */
export interface HistorySource {
  entryId: string;
  messageIndex: number;
  blockIndex: number;
}

export type HistoricalItem = {
  source: HistorySource;
  item:
    | { type: 'agentMessage'; text: string }
    | { type: 'userMessage'; content: { type: 'text'; text: string }[] }
    | {
        type: 'toolCall';
        tool: string;
        arguments: Record<string, unknown>;
        status: 'completed' | 'failed' | 'interrupted' | 'pending';
        result?: { output: { type: 'text'; text: string }[] };
      };
};

export interface HistoricalSnapshot {
  status: 'completed' | 'failed' | 'interrupted' | 'working';
  agent?: { model: string; thinkingLevel: string };
  inputs?: { entryId: string; requestId: string }[];
  items: HistoricalItem[];
}
