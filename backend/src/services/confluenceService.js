import { getConfig } from '../config/env.js';
import { atlassianRequest, AtlassianApiError } from '../clients/atlassianClient.js';
import {
  buildConfluencePageTitle,
  buildConfluenceStorageHtml,
} from '../templates/confluenceTemplates.js';

export function parseConfluenceTargetInput(rawInput = '') {
  const trimmed = String(rawInput || '').trim();
  if (!trimmed) return null;

  // Match Confluence URLs such as:
  // https://baynext.atlassian.net/wiki/spaces/1KSGA/folder/5164335849/Technical+Design
  // https://baynext.atlassian.net/wiki/spaces/1KSGA/pages/123456789/Some+Page
  const urlMatch = trimmed.match(
    /(?:\/wiki\/spaces\/([^/]+))?\/(folder|pages)\/(\d+)(?:\/([^/?#]+))?/i
  );
  if (urlMatch) {
    const [, matchedSpaceKey, kind, id, rawSlug] = urlMatch;
    const decodedTitle = rawSlug
      ? decodeURIComponent(rawSlug.replace(/\+/g, ' '))
      : `${kind.toLowerCase() === 'folder' ? 'Folder' : 'Page'} #${id}`;
    return {
      id,
      type: kind.toLowerCase() === 'folder' ? 'folder' : 'page',
      title: decodedTitle,
      spaceKey: matchedSpaceKey || null,
    };
  }

  if (/^\d+$/.test(trimmed)) {
    return {
      id: trimmed,
      type: 'folder',
      title: `Folder / Page ID #${trimmed}`,
      spaceKey: null,
    };
  }

  return null;
}

export async function listConfluenceSpaces() {
  const data = await atlassianRequest('/wiki/rest/api/space?limit=50&type=global');
  return (data.results || []).map((space) => ({
    key: space.key,
    name: space.name,
    id: String(space.id || space.key),
  }));
}

export async function searchConfluenceParentPages({ spaceKey, query = '' }) {
  const config = getConfig();
  const targetSpace = spaceKey || config.defaults.confluenceSpaceKey;
  const trimmed = String(query || '').trim();
  const parsedDirect = parseConfluenceTargetInput(trimmed);

  const safeSpace = targetSpace.replace(/"/g, '\\"');
  const safeQuery = trimmed.replace(/"/g, '\\"');

  let cql;
  if (parsedDirect) {
    cql = `id = ${parsedDirect.id} AND type in (page, folder)`;
  } else if (trimmed) {
    cql = `type in (page, folder) AND space="${safeSpace}" AND title ~ "${safeQuery}*" order by lastmodified desc`;
  } else {
    cql = `type in (page, folder) AND space="${safeSpace}" order by lastmodified desc`;
  }

  let results = [];
  try {
    const data = await atlassianRequest(
      `/wiki/rest/api/content/search?cql=${encodeURIComponent(cql)}&limit=25`
    );
    results = (data.results || []).map((page) => ({
      id: String(page.id),
      title: page.title,
      type: page.type || 'page',
      spaceKey: targetSpace,
    }));
  } catch {
    // Fallback to type=page if the Confluence tenant CQL does not index folder in content/search
    const fallbackCql = trimmed
      ? `type=page AND space="${safeSpace}" AND title ~ "${safeQuery}*" order by lastmodified desc`
      : `type=page AND space="${safeSpace}" order by lastmodified desc`;
    const data = await atlassianRequest(
      `/wiki/rest/api/content/search?cql=${encodeURIComponent(fallbackCql)}&limit=25`
    );
    results = (data.results || []).map((page) => ({
      id: String(page.id),
      title: page.title,
      type: page.type || 'page',
      spaceKey: targetSpace,
    }));
  }

  // If user pasted a direct Folder URL or Folder ID (e.g. 5164335849), try v2 folders endpoint or include it directly
  if (parsedDirect && !results.some((item) => item.id === parsedDirect.id)) {
    try {
      const folderData = await atlassianRequest(`/wiki/api/v2/folders/${encodeURIComponent(parsedDirect.id)}`);
      results.unshift({
        id: String(folderData.id || parsedDirect.id),
        title: folderData.title || parsedDirect.title,
        type: 'folder',
        spaceKey: parsedDirect.spaceKey || targetSpace,
      });
    } catch {
      results.unshift({
        id: parsedDirect.id,
        title: parsedDirect.title,
        type: parsedDirect.type,
        spaceKey: parsedDirect.spaceKey || targetSpace,
      });
    }
  }

  return results;
}

export async function createConfluenceDocPage({
  spaceKey,
  parentPageId,
  workType,
  parentIssueKey,
  parentIssueSummary,
  subtaskKey,
  subtaskSummary,
  subtaskDescription,
  customPageTitle,
  templateFields,
}) {
  const config = getConfig();
  const resolvedSpaceKey = spaceKey || config.defaults.confluenceSpaceKey;

  if (!resolvedSpaceKey) {
    throw new AtlassianApiError('Confluence Space Key is required.', 400);
  }

  const pageTitle = buildConfluencePageTitle({
    subtaskKey,
    workType,
    subtaskSummary,
    customPageTitle,
  });

  const jiraSubtaskUrl = `${config.atlassian.baseUrl}/browse/${subtaskKey}`;
  const jiraParentUrl = `${config.atlassian.baseUrl}/browse/${parentIssueKey}`;

  const storageHtml = buildConfluenceStorageHtml({
    workType,
    parentIssueKey,
    parentIssueSummary,
    subtaskKey,
    subtaskSummary,
    subtaskDescription,
    jiraSubtaskUrl,
    jiraParentUrl,
    templateFields,
  });

  const payload = {
    type: 'page',
    title: pageTitle,
    space: { key: resolvedSpaceKey },
    ...(parentPageId ? { ancestors: [{ id: String(parentPageId) }] } : {}),
    body: {
      storage: {
        value: storageHtml,
        representation: 'storage',
      },
    },
  };

  const created = await atlassianRequest('/wiki/rest/api/content', {
    method: 'POST',
    body: payload,
  });

  const webuiLink = created?._links?.webui
    ? `${config.atlassian.baseUrl}/wiki${created._links.webui}`
    : `${config.atlassian.baseUrl}/wiki/spaces/${resolvedSpaceKey}/pages/${created.id}`;

  return {
    id: String(created.id),
    title: created.title || pageTitle,
    spaceKey: resolvedSpaceKey,
    parentPageId: parentPageId || null,
    url: webuiLink,
  };
}

export async function getConfluencePageContent(pageIdOrUrl) {
  const config = getConfig();
  const parsed = parseConfluenceTargetInput(pageIdOrUrl);
  const pageId = parsed?.id || String(pageIdOrUrl || '').trim();

  if (!pageId) {
    throw new AtlassianApiError('Confluence Page ID is required.', 400);
  }

  const page = await atlassianRequest(
    `/wiki/rest/api/content/${encodeURIComponent(pageId)}?expand=body.storage,version,space`
  );

  const spaceKey = page.space?.key || config.defaults.confluenceSpaceKey;
  const webuiLink = page?._links?.webui
    ? `${config.atlassian.baseUrl}/wiki${page._links.webui}`
    : `${config.atlassian.baseUrl}/wiki/spaces/${spaceKey}/pages/${page.id}`;

  return {
    id: String(page.id),
    title: page.title || `Confluence Page #${page.id}`,
    spaceKey,
    versionNumber: Number(page.version?.number || 1),
    storageHtml: page.body?.storage?.value || '',
    url: webuiLink,
  };
}

export async function updateConfluenceDocPage({
  pageId,
  workType,
  parentIssueKey,
  parentIssueSummary,
  subtaskKey,
  subtaskSummary,
  subtaskDescription,
  customPageTitle,
  templateFields,
}) {
  const config = getConfig();
  const current = await getConfluencePageContent(pageId);

  const pageTitle =
    customPageTitle && customPageTitle.trim()
      ? customPageTitle.trim()
      : current.title ||
        buildConfluencePageTitle({
          subtaskKey,
          workType,
          subtaskSummary,
        });

  const jiraSubtaskUrl = `${config.atlassian.baseUrl}/browse/${subtaskKey}`;
  const jiraParentUrl = `${config.atlassian.baseUrl}/browse/${parentIssueKey || subtaskKey}`;

  const storageHtml = buildConfluenceStorageHtml({
    workType,
    parentIssueKey: parentIssueKey || subtaskKey,
    parentIssueSummary: parentIssueSummary || subtaskSummary,
    subtaskKey,
    subtaskSummary,
    subtaskDescription,
    jiraSubtaskUrl,
    jiraParentUrl,
    templateFields,
  });

  const nextVersion = current.versionNumber + 1;
  const payload = {
    id: String(current.id),
    type: 'page',
    title: pageTitle,
    space: { key: current.spaceKey },
    version: {
      number: nextVersion,
      message: `Synced from Jira ${subtaskKey} via Gemini AI`,
    },
    body: {
      storage: {
        value: storageHtml,
        representation: 'storage',
      },
    },
  };

  const updated = await atlassianRequest(
    `/wiki/rest/api/content/${encodeURIComponent(current.id)}`,
    {
      method: 'PUT',
      body: payload,
    }
  );

  const webuiLink = updated?._links?.webui
    ? `${config.atlassian.baseUrl}/wiki${updated._links.webui}`
    : current.url;

  return {
    id: String(updated.id || current.id),
    title: updated.title || pageTitle,
    spaceKey: current.spaceKey,
    versionNumber: Number(updated.version?.number || nextVersion),
    url: webuiLink,
  };
}
