
export enum AgentRole {
  PRODUCT_MANAGER = 'Product Manager',
  ARCHITECT = 'Software Architect',
  ENGINEER = 'Senior Engineer',
  QA = 'QA Engineer'
}

export interface ApiConfig {
  apiKey: string;
  selectedModel: string;
  isConfigured: boolean;
}

export interface AgentOutput {
  role: AgentRole;
  content: string;
  status: 'pending' | 'working' | 'completed' | 'error';
  code?: string;
}

export interface AttachedFile {
  name: string;
  data: string; // Base64 string
  mimeType: string;
}

export interface Project {
  id: string;
  name: string;
  idea: string;
  outputs: AgentOutput[];
  updatedAt: number;
  lastCompletedStep: number;
  attachedFile?: AttachedFile;
}
