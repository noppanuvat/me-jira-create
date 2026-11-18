import { getConfig } from '../config/env.js';
import {
  atlassianRequest,
  AtlassianApiError,
  buildAuthHeader,
} from '../clients/atlassianClient.js';

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

const DEFAULT_DESCRIPTION = 'Created via Jira + Confluence Spec Creator';

/**
 * Accepts either a rich-text ADF document from the editor or the legacy plain
 * string, and always returns a Jira-valid ADF doc node.
 */
export function normalizeDescription({ description, descriptionAdf } = {}) {
  if (descriptionAdf && typeof descriptionAdf === 'object' && descriptionAdf.type === 'doc') {
    const content = Array.isArray(descriptionAdf.content) ? descriptionAdf.content : [];
    return { type: 'doc', version: 1, content: content.length ? content : [{ type: 'paragraph', content: [] }] };
  }
  return buildAdfDocument(description);
}

export async function searchJiraUsers(query = '') {
  const trimmed = String(query || '').trim();
  const data = await atlassianRequest(
    `/rest/api/3/user/search?query=${encodeURIComponent(trimmed)}&maxResults=10`
  );
  return (Array.isArray(data) ? data : []).map((user) => ({
    accountId: user.accountId,
    displayName: user.displayName || user.emailAddress || 'Unknown user',
    emailAddress: user.emailAddress || '',
    avatarUrl: user.avatarUrls?.['24x24'] || '',
    active: user.active !== false,
  }));
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

function parseDataUrl(dataUrl = '') {
  const match = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(String(dataUrl));
  if (!match) return null;
  const mimeType = match[1] || 'image/png';
  const isBase64 = Boolean(match[2]);
  const buffer = isBase64
    ? Buffer.from(match[3], 'base64')
    : Buffer.from(decodeURIComponent(match[3]), 'utf8');
  return { mimeType, buffer };
}

function atlassianAuthHeaders(extra = {}) {
  const { email, apiToken } = getConfig().atlassian;
  if (!email || !apiToken) {
    throw new AtlassianApiError(
      'Missing Atlassian credentials on server. Check ATLASSIAN_EMAIL and ATLASSIAN_API_TOKEN in .env.',
      500
    );
  }
  return { Authorization: buildAuthHeader(email, apiToken), ...extra };
}

async function uploadIssueAttachment(issueKey, { filename, dataUrl }) {
  const parsed = parseDataUrl(dataUrl);
  if (!parsed) {
    throw new AtlassianApiError(`Invalid image payload for "${filename}".`, 400);
  }
  const { baseUrl } = getConfig().atlassian;
  const form = new FormData();
  form.append('file', new Blob([parsed.buffer], { type: parsed.mimeType }), filename || 'image.png');

  const response = await fetch(
    `${baseUrl}/rest/api/3/issue/${encodeURIComponent(issueKey)}/attachments`,
    {
      method: 'POST',
      headers: atlassianAuthHeaders({ 'X-Atlassian-Token': 'no-check' }),
      body: form,
    }
  );

  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  if (!response.ok) {
    throw new AtlassianApiError(
      data?.errorMessages?.join(', ') || `Attachment upload failed (${response.status})`,
      response.status,
      data
    );
  }
  const attachment = Array.isArray(data) ? data[0] : data;
  return { id: attachment?.id, filename: attachment?.filename || filename };
}

/**
 * Jira media nodes need the Media Services UUID, which is only exposed through
 * the attachment content redirect (…/file/<uuid>/binary).
 */
async function resolveAttachmentMediaId(attachmentId) {
  const { baseUrl } = getConfig().atlassian;
  const response = await fetch(
    `${baseUrl}/rest/api/3/attachment/content/${encodeURIComponent(attachmentId)}`,
    { method: 'GET', headers: atlassianAuthHeaders(), redirect: 'manual' }
  );
  const location = response.headers.get('location') || '';
  const match = location.match(/\/file\/([0-9a-fA-F-]{20,})\//);
  return match?.[1] || null;
}

function imageMarker(pendingId, filename) {
  return `[[image:${pendingId}:${filename}]]`;
}

/** Replace pending mediaSingle nodes with text markers before the issue exists. */
function adfWithMarkers(adf, images = []) {
  const byId = new Map(images.map((img) => [img.pendingId, img]));
  const walk = (node) => {
    if (!node) return node;
    if (node.type === 'mediaSingle') {
      const media = (node.content || []).find((c) => c.type === 'media');
      const id = media?.attrs?.id;
      const img = byId.get(id);
      if (img) {
        return {
          type: 'paragraph',
          content: [{ type: 'text', text: imageMarker(img.pendingId, img.filename) }],
        };
      }
      return node;
    }
    if (Array.isArray(node.content)) node.content = node.content.map(walk);
    return node;
  };
  return walk(JSON.parse(JSON.stringify(adf)));
}

/** Swap markers back to real mediaSingle nodes once media ids are known. */
function adfWithMediaMarkers(adf, images = []) {
  const byMarker = new Map(
    images.filter((img) => img.mediaId).map((img) => [imageMarker(img.pendingId, img.filename), img])
  );
  const walk = (node) => {
    if (!node) return node;
    if (node.type === 'paragraph') {
      const text = (node.content || [])
        .filter((c) => c.type === 'text')
        .map((c) => c.text)
        .join('');
      const img = byMarker.get(text);
      if (img) {
        return {
          type: 'mediaSingle',
          attrs: { layout: 'center' },
          content: [
            {
              type: 'media',
              attrs: { type: 'file', id: img.mediaId, collection: '', alt: img.filename },
            },
          ],
        };
      }
      return node;
    }
    if (Array.isArray(node.content)) node.content = node.content.map(walk);
    return node;
  };
  return walk(JSON.parse(JSON.stringify(adf)));
}

async function updateIssueDescription(issueIdOrKey, adf) {
  await atlassianRequest(`/rest/api/3/issue/${encodeURIComponent(issueIdOrKey)}`, {
    method: 'PUT',
    body: { fields: { description: adf } },
  });
}

export async function createJiraSubtask({
  parentIssueKey,
  summary,
  description,
  descriptionAdf,
  images,
  workType,
}) {
  const config = getConfig();
  if (!parentIssueKey || !summary) {
    throw new AtlassianApiError('Parent Issue Key and Subtask Summary are required.', 400);
  }

  const projectKey = parentIssueKey.split('-')[0] || config.defaults.jiraProjectKey;
  const subtaskIssueTypeId = await resolveSubtaskIssueTypeId(projectKey);

  const adf = normalizeDescription({
    description: description || DEFAULT_DESCRIPTION,
    descriptionAdf,
  });
  const imageList = Array.isArray(images)
    ? images.filter((img) => img?.pendingId && img?.dataUrl)
    : [];
  const initialAdf = imageList.length ? adfWithMarkers(adf, imageList) : adf;

  const payload = {
    fields: {
      project: { key: projectKey },
      parent: { key: parentIssueKey },
      issuetype: { id: subtaskIssueTypeId },
      summary,
      description: initialAdf,
      customfield_11505: { value: config.defaults.jiraSquad },
      customfield_10114: config.defaults.jiraTeamId,
    },
  };

  const created = await atlassianRequest('/rest/api/3/issue', {
    method: 'POST',
    body: payload,
  });

  // Upload inline images, resolve their Media Services ids, then rewrite the
  // description so the images render inline exactly like the Jira editor.
  const attachments = [];
  const warnings = [];
  if (imageList.length) {
    for (const img of imageList) {
      try {
        const uploaded = await uploadIssueAttachment(created.key, img);
        const mediaId = await resolveAttachmentMediaId(uploaded.id);
        if (!mediaId) {
          warnings.push(`Uploaded ${img.filename} as an attachment but could not embed it inline.`);
          continue;
        }
        attachments.push({ filename: img.filename, attachmentId: uploaded.id, mediaId });
      } catch (err) {
        warnings.push(`Image "${img.filename}" failed: ${err.message}`);
      }
    }
    if (attachments.length) {
      try {
        await updateIssueDescription(created.id, adfWithMediaMarkers(adf, attachments));
      } catch (err) {
        warnings.push(`Could not embed images in the description: ${err.message}`);
      }
    } else if (warnings.length) {
      // Leftover markers are still readable, but strip them for a cleaner body.
      try {
        await updateIssueDescription(created.id, adf);
      } catch {
        /* non-fatal */
      }
    }
  }

  return {
    id: created.id,
    key: created.key,
    summary,
    parentIssueKey,
    projectKey,
    workType,
    squad: config.defaults.jiraSquad,
    team: config.defaults.jiraTeamName,
    attachments,
    warnings,
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
