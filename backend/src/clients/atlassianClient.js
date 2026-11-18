import { getConfig } from '../config/env.js';

export class AtlassianApiError extends Error {
  constructor(message, statusCode = 500, details = null) {
    super(message);
    this.name = 'AtlassianApiError';
    this.statusCode = statusCode;
    this.details = details;
  }
}

export function buildAuthHeader(email, apiToken) {
  const encoded = Buffer.from(`${email}:${apiToken}`).toString('base64');
  return `Basic ${encoded}`;
}

export async function atlassianRequest(endpointPath, options = {}) {
  const config = getConfig();
  const { baseUrl, email, apiToken } = config.atlassian;

  if (!email || !apiToken) {
    throw new AtlassianApiError(
      'Missing Atlassian credentials on server. Check ATLASSIAN_EMAIL and ATLASSIAN_API_TOKEN in .env.',
      500
    );
  }

  const url = endpointPath.startsWith('http')
    ? endpointPath
    : `${baseUrl}${endpointPath.startsWith('/') ? '' : '/'}${endpointPath}`;

  const headers = {
    Authorization: buildAuthHeader(email, apiToken),
    Accept: 'application/json',
    ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    ...(options.headers || {}),
  };

  const response = await fetch(url, {
    method: options.method || 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }
  }

  if (!response.ok) {
    const errMsg =
      data?.errorMessages?.join(', ') ||
      data?.message ||
      (data?.errors && JSON.stringify(data.errors)) ||
      `Atlassian API request failed with status ${response.status}`;
    throw new AtlassianApiError(errMsg, response.status, data);
  }

  return data;
}
