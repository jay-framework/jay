export interface SubmitToolResultsInput {
  results: Array<{
      callId: string;
      result: string;
      isError: boolean;
    }>;
  history: Array<{
      role: string;
      parts: Array<Record<string, unknown>>;
    }>;
  toolDefinitions: Array<{
      name: string;
      description: string;
      inputSchema: Record<string, unknown>;
      category: string;
    }>;
  pageState: Record<string, unknown>;
}

export interface SubmitToolResultsOutput {
  type: string;
  message?: string;
  calls?: Array<{
      id: string;
      name: string;
      args: Record<string, unknown>;
      category: string;
    }>;
  history: Array<Record<string, unknown>>;
}