const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api';

async function request(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok && res.status !== 207) {
    const message = data?.error?.message || `Request failed with status ${res.status}`;
    const err = new Error(message);
    err.status = res.status;
    err.payload = data;
    throw err;
  }

  return { status: res.status, data };
}

export async function fetchDefaults() {
  const { data } = await request('/config/defaults');
  return data;
}

export async function searchJiraParentIssues(query = '') {
  const { data } = await request(`/jira/issues/search?q=${encodeURIComponent(query)}`);
  return data.issues || [];
}

export async function fetchConfluenceSpaces() {
  const { data } = await request('/confluence/spaces');
  return data.spaces || [];
}

export async function searchConfluencePages(spaceKey, query = '') {
  const params = new URLSearchParams({
    spaceKey: spaceKey || '',
    q: query || '',
  });
  const { data } = await request(`/confluence/pages/search?${params.toString()}`);
  return data.pages || [];
}

export async function executeCreateAllWorkflow(payload) {
  return request('/workflow/create-all', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function executeCreateBatchSubtasksWorkflow(payload) {
  return request('/workflow/create-batch-subtasks', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function executeRetryConfluenceWorkflow(payload) {
  return request('/workflow/retry-confluence', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function searchJiraSyncIssues(query = '') {
  const { data } = await request(`/jira/issues/sync-search?q=${encodeURIComponent(query)}`);
  return data.issues || [];
}

export async function fetchJiraSyncContext(issueKey) {
  const { data } = await request(`/jira/issues/${encodeURIComponent(issueKey)}/sync-context`);
  return data.issue;
}

export async function executeSyncAnalyzeWorkflow(payload) {
  return request('/workflow/sync-analyze', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function executeSyncApplyWorkflow(payload) {
  return request('/workflow/sync-apply', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function suggestSubtaskNames(payload) {
  const { data } = await request('/ai/suggest-subtask-names', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return data;
}

