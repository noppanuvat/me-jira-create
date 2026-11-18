import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config();

export function getConfig() {
  const baseUrlRaw = process.env.ATLASSIAN_BASE_URL || 'https://example-team.atlassian.net';
  const baseUrl = baseUrlRaw.replace(/\/+$/, '');
  const email = process.env.ATLASSIAN_EMAIL || '';
  const apiToken = process.env.ATLASSIAN_API_TOKEN || '';
  const geminiApiKey = process.env.GEMINI_API_KEY || '';
  const geminiModel = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const openrouterApiKey = process.env.OPENROUTER_API_KEY || '';
  const openrouterUrl =
    process.env.OPENROUTER_API_URL || 'https://openrouter.ai/api/v1/chat/completions';
  const aiModels = (
    process.env.AI_MODELS ||
    [
      geminiModel,
      'google/gemini-4-hydrogen',
      'openai/gpt-6.1-terra',
      'deepseek/deepseek-v4.1-flash-1017',
      'z-ai/glm-5.3-flash',
      'minimax/minimax-m3.1-flash:free',
    ].join(',')
  )
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const uniqueAiModels = [...new Set([geminiModel, ...aiModels])];

  return {
    port: Number(process.env.PORT || 3001),
    frontendOrigin: process.env.FRONTEND_ORIGIN || 'http://localhost:5173',
    atlassian: {
      baseUrl,
      email,
      apiToken,
    },
    gemini: {
      apiKey: geminiApiKey,
      model: geminiModel,
    },
    openrouter: {
      apiKey: openrouterApiKey,
      url: openrouterUrl,
    },
    aiModels: uniqueAiModels,
    defaultAiModel: geminiModel,
    defaults: {
      jiraProjectKey: process.env.DEFAULT_JIRA_PROJECT_KEY || 'PAY',
      jiraSquad: process.env.DEFAULT_JIRA_SQUAD || 'SQ16',
      jiraTeamName: process.env.DEFAULT_JIRA_TEAM_NAME || 'UCHOOSE',
      jiraTeamId: process.env.DEFAULT_JIRA_TEAM_ID || 'fcb6e51f-5ba0-4486-88fe-2de7448907a1',
      confluenceSpaceKey: process.env.DEFAULT_CONFLUENCE_SPACE_KEY || '1KSGA',
      confluenceParentPageId: process.env.DEFAULT_CONFLUENCE_PARENT_PAGE_ID || '5164335849',
    },
  };
}
