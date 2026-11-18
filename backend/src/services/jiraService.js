import { getConfig } from '../config/env.js';
import { atlassianRequest, AtlassianApiError } from '../clients/atlassianClient.js';

function buildAdfDocument(text = '') {
  const paragraphs = String(text || 'Created via Jira + Confluence Spec Creator')
    .split(/\r?\n/)
    .filter(Boolean);

  return {
    type: 'doc',
    version: 1,
    content: (paragraphs.length ? paragraphs : ['Created via Jira + Confluence Spec Creator']).map(
      (line) => ({
        type: 'paragraph',
        content: [{ type: 'text', text: line }],
      })
    ),
  };
}

export async function searchParentIssues(query = '') {
  const config = getConfig();
  const trimmed = String(query || '').trim();

  const isIssueKeyPattern = /^[A-Za-z][A-Za-z0-9_]+-\d+$/.test(trimmed);
  const safeQuery = trimmed.replace(/"/g, '\\"');
  let jql = 'issuetype not in subTaskIssueTypes() ORDER BY updated DESC';

  if (trimmed) {
    jql = isIssueKeyPattern
      ? `(key = "${safeQuery.toUpperCase()}" OR summary ~ "${safeQuery}*") AND issuetype not in subTaskIssueTypes() ORDER BY updated DESC`
      : `summary ~ "${safeQuery}*" AND issuetype not in subTaskIssueTypes() ORDER BY updated DESC`;
  }

  const encodedJql = encodeURIComponent(jql);
  const data = await atlassianRequest(
    `/rest/api/3/search/jql?jql=${encodedJql}&maxResults=15&fields=summary,issuetype,status,project`
  );

  return (data.issues || []).map((issue) => ({
    key: issue.key,
    id: issue.id,
    summary: issue.fields?.summary || '',
    issueType: issue.fields?.issuetype?.name || 'Task',
    status: issue.fields?.status?.name || 'Open',
    projectKey: issue.fields?.project?.key || issue.key.split('-')[0],
    url: `${config.atlassian.baseUrl}/browse/${issue.key}`,
  }));
}

async function resolveSubtaskIssueTypeId(projectKey) {
  const data = await atlassianRequest(`/rest/api/3/project/${encodeURIComponent(projectKey)}`);
  const subtaskType = (data.issueTypes || []).find((t) => t.subtask === true);
  if (!subtaskType) {
    throw new AtlassianApiError(
      `No Subtask issue type found for Jira project "${projectKey}".`,
      400
    );
  }
  return subtaskType.id;
}

export async function createJiraSubtask({
  parentIssueKey,
  summary,
  description,
  workType,
}) {
  const config = getConfig();
  if (!parentIssueKey || !summary) {
    throw new AtlassianApiError('Parent Issue Key and Subtask Summary are required.', 400);
  }

  const projectKey = parentIssueKey.split('-')[0] || config.defaults.jiraProjectKey;
  const subtaskIssueTypeId = await resolveSubtaskIssueTypeId(projectKey);

  const payload = {
    fields: {
      project: { key: projectKey },
      parent: { key: parentIssueKey },
      issuetype: { id: subtaskIssueTypeId },
      summary,
      description: buildAdfDocument(description),
      customfield_11505: { value: config.defaults.jiraSquad },
      customfield_10114: config.defaults.jiraTeamId,
    },
  };

  const created = await atlassianRequest('/rest/api/3/issue', {
    method: 'POST',
    body: payload,
  });

  return {
    id: created.id,
    key: created.key,
    summary,
    parentIssueKey,
    projectKey,
    workType,
    squad: config.defaults.jiraSquad,
    team: config.defaults.jiraTeamName,
    url: `${config.atlassian.baseUrl}/browse/${created.key}`,
  };
}

export async function linkConfluencePageToSubtask({
  subtaskKey,
  confluencePageId,
  confluencePageTitle,
  confluencePageUrl,
}) {
  const config = getConfig();
  if (!subtaskKey || !confluencePageUrl) {
    throw new AtlassianApiError(
      'subtaskKey and confluencePageUrl are required to link Confluence page.',
      400
    );
  }

  const payload = {
    globalId: `appId=confluence&pageId=${confluencePageId}`,
    application: {
      type: 'com.atlassian.confluence',
      name: 'Confluence',
    },
    relationship: 'Wiki Page',
    object: {
      url: confluencePageUrl,
      title: confluencePageTitle || 'Technical Specification',
      icon: {
        url16x16: `${config.atlassian.baseUrl}/wiki/favicon.ico`,
        title: 'Confluence Page',
      },
    },
  };

  const res = await atlassianRequest(
    `/rest/api/3/issue/${encodeURIComponent(subtaskKey)}/remotelink`,
    {
      method: 'POST',
      body: payload,
    }
  );

  return {
    linked: true,
    id: res?.id,
    subtaskKey,
    confluencePageId,
    remoteLinkUrl: confluencePageUrl,
  };
}

function extractTextFromAdfNode(node) {
  if (!node) return '';
  if (typeof node === 'string') return node;
  if (node.type === 'text') return node.text || '';
  if (node.type === 'hardBreak') return '\n';
  if (node.type === 'codeBlock') {
    const codeText = (node.content || []).map(extractTextFromAdfNode).join('');
    const lang = node.attrs?.language || '';
    return `\n\`\`\`${lang}\n${codeText}\n\`\`\`\n`;
  }

  const childrenText = Array.isArray(node.content)
    ? node.content.map(extractTextFromAdfNode).join('')
    : '';

  if (
    node.type === 'paragraph' ||
    node.type === 'heading' ||
    node.type === 'listItem' ||
    node.type === 'tableRow'
  ) {
    return `${childrenText}\n`;
  }
  if (node.type === 'tableCell' || node.type === 'tableHeader') {
    return `${childrenText.trim()} | `;
  }
  return childrenText;
}

export async function searchSyncableIssues(query = '') {
  const config = getConfig();
  const trimmed = String(query || '').trim();
  const isIssueKeyPattern = /^[A-Za-z][A-Za-z0-9_]+-\d+$/.test(trimmed);
  const safeQuery = trimmed.replace(/"/g, '\\"');

  let jql = 'ORDER BY updated DESC';
  if (trimmed) {
    jql = isIssueKeyPattern
      ? `(key = "${safeQuery.toUpperCase()}" OR summary ~ "${safeQuery}*") ORDER BY updated DESC`
      : `summary ~ "${safeQuery}*" ORDER BY updated DESC`;
  }

  const encodedJql = encodeURIComponent(jql);
  const data = await atlassianRequest(
    `/rest/api/3/search/jql?jql=${encodedJql}&maxResults=15&fields=summary,issuetype,status,project,parent`
  );

  return (data.issues || []).map((issue) => ({
    key: issue.key,
    id: issue.id,
    summary: issue.fields?.summary || '',
    issueType: issue.fields?.issuetype?.name || 'Sub-task',
    isSubtask: Boolean(issue.fields?.issuetype?.subtask),
    status: issue.fields?.status?.name || 'Open',
    projectKey: issue.fields?.project?.key || issue.key.split('-')[0],
    parentIssueKey: issue.fields?.parent?.key || null,
    parentIssueSummary: issue.fields?.parent?.fields?.summary || '',
    url: `${config.atlassian.baseUrl}/browse/${issue.key}`,
  }));
}

export async function getJiraIssueSyncContext(issueKey) {
  const config = getConfig();
  if (!issueKey) {
    throw new AtlassianApiError('issueKey is required.', 400);
  }

  const [issue, remoteLinks] = await Promise.all([
    atlassianRequest(
      `/rest/api/3/issue/${encodeURIComponent(
        issueKey
      )}?fields=summary,description,issuetype,status,project,parent,comment`
    ),
    atlassianRequest(`/rest/api/3/issue/${encodeURIComponent(issueKey)}/remotelink`).catch(
      () => []
    ),
  ]);

  const descriptionText = extractTextFromAdfNode(issue.fields?.description).trim();
  const rawComments = issue.fields?.comment?.comments || [];
  const comments = rawComments.slice(-10).map((c) => ({
    id: c.id,
    author: c.author?.displayName || 'Developer',
    created: c.created,
    bodyText: extractTextFromAdfNode(c.body).trim(),
  }));

  // Find linked Confluence page from remote links
  let linkedConfluencePage = null;
  if (Array.isArray(remoteLinks)) {
    for (const link of remoteLinks) {
      const globalId = String(link.globalId || '');
      const objUrl = String(link.object?.url || '');
      const pageIdFromGlobal = globalId.match(/pageId=(\d+)/i)?.[1];
      const pageIdFromUrl = objUrl.match(/\/pages\/(\d+)/i)?.[1];
      const resolvedPageId = pageIdFromGlobal || pageIdFromUrl;
      if (resolvedPageId) {
        linkedConfluencePage = {
          id: String(resolvedPageId),
          title: link.object?.title || `Confluence Page #${resolvedPageId}`,
          url: objUrl || `${config.atlassian.baseUrl}/wiki/pages/viewpage.action?pageId=${resolvedPageId}`,
        };
        break;
      }
    }
  }

  const summary = issue.fields?.summary || '';
  const inferredWorkType = /^\[DB\]|\b(db|database|table|schema|migration)\b/i.test(summary)
    ? 'DATABASE_DESIGN'
    : 'API_DEVELOPMENT';

  return {
    key: issue.key,
    id: issue.id,
    summary,
    descriptionText,
    comments,
    issueType: issue.fields?.issuetype?.name || 'Sub-task',
    status: issue.fields?.status?.name || 'Open',
    parentIssueKey: issue.fields?.parent?.key || issue.key,
    parentIssueSummary: issue.fields?.parent?.fields?.summary || summary,
    inferredWorkType,
    linkedConfluencePage,
    url: `${config.atlassian.baseUrl}/browse/${issue.key}`,
  };
}
