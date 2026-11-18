import { getConfig } from '../config/env.js';
import { AtlassianApiError } from '../clients/atlassianClient.js';
import {
  WORK_TYPES,
  ensureRequiredApiHeaders,
  ensureRequiredDbColumns,
} from '../templates/confluenceTemplates.js';
import { markdownToAdf } from '../utils/markdownToAdf.js';

function isOpenRouterModel(model) {
  return String(model || '').includes('/');
}

/**
 * Sends a single prompt to the selected AI model and returns plain text.
 * Routes to OpenRouter when the model id contains "/" (e.g. google/gemini-4-hydrogen),
 * otherwise to the Gemini generateContent API.
 */
async function callAi({ prompt, model, temperature = 0.2, jsonMode = false, maxTokens = 0 }) {
  const config = getConfig();
  const resolvedModel =
    String(model || '').trim() || config.gemini?.model || 'gemini-2.5-flash';

  if (isOpenRouterModel(resolvedModel)) {
    if (resolvedModel.endsWith(':batch')) {
      throw new AtlassianApiError(
        `Model "${resolvedModel}" is batch-only (OpenRouter /api/v1/batches) and cannot be used for real-time requests. Use "${resolvedModel.replace(/:batch$/, '')}" instead.`,
        400
      );
    }

    const apiKey = config.openrouter?.apiKey;
    if (!apiKey) {
      throw new AtlassianApiError(
        'OPENROUTER_API_KEY is not configured in .env. Please add OPENROUTER_API_KEY to use OpenRouter models.',
        400
      );
    }

    const body = {
      model: resolvedModel,
      temperature,
      messages: [{ role: 'user', content: prompt }],
    };
    if (jsonMode) body.response_format = { type: 'json_object' };
    if (maxTokens) body.max_tokens = maxTokens;

    const response = await fetch(config.openrouter.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://jira-create.meturr.online',
        'X-Title': 'Jira Doc Creator',
      },
      body: JSON.stringify(body),
    });

    const rawBody = await response.text();
    let data = null;
    try {
      data = rawBody ? JSON.parse(rawBody) : null;
    } catch {
      data = null;
    }

    if (!response.ok) {
      const errMsg =
        data?.error?.message || `OpenRouter request failed with status ${response.status}`;
      throw new AtlassianApiError(errMsg, response.status, data);
    }

    const content = data?.choices?.[0]?.message?.content;
    const text = Array.isArray(content)
      ? content.map((p) => p?.text || '').join('')
      : String(content || '');

    return { model: resolvedModel, text };
  }

  const apiKey = config.gemini?.apiKey;
  if (!apiKey) {
    throw new AtlassianApiError(
      'GEMINI_API_KEY is not configured in .env. Please add GEMINI_API_KEY to use Gemini AI.',
      400
    );
  }

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    resolvedModel
  )}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const generationConfig = { temperature };
  if (jsonMode) generationConfig.responseMimeType = 'application/json';
  if (maxTokens) generationConfig.maxOutputTokens = maxTokens;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig,
    }),
  });

  const rawBody = await response.text();
  let data = null;
  try {
    data = rawBody ? JSON.parse(rawBody) : null;
  } catch {
    data = null;
  }

  if (!response.ok) {
    const errMsg =
      data?.error?.message || `Gemini API request failed with status ${response.status}`;
    throw new AtlassianApiError(errMsg, response.status, data);
  }

  const candidateText =
    data?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';

  return { model: resolvedModel, text: candidateText };
}

function buildPrompt({ issueContext, currentConfluencePage, workType }) {
  const isDb = workType === WORK_TYPES.DATABASE_DESIGN;

  const commentsText =
    Array.isArray(issueContext.comments) && issueContext.comments.length > 0
      ? issueContext.comments
          .map((c, idx) => `Comment #${idx + 1} (${c.author || 'User'}): ${c.bodyText}`)
          .join('\n\n')
      : 'No comments.';

  const currentStorageHtml = currentConfluencePage?.storageHtml
    ? currentConfluencePage.storageHtml.slice(0, 12000)
    : 'No existing Confluence content.';

  if (isDb) {
    return `You are a Senior Software Architect. Analyze the Jira issue details (Summary, Description, and Comments) along with the existing Confluence page HTML, and extract structured Database Design specification fields that strictly match our Confluence Database Design template.

Pay special attention to:
- Every table specification in "columns" MUST always include these 4 mandatory audit columns at the end:
  * "created_at" (dataType: "DATETIME2", nullable: "NO", defaultValue: "SYSDATETIME()", description: "Record creation timestamp")
  * "updated_at" (dataType: "DATETIME2", nullable: "NO", defaultValue: "SYSDATETIME()", description: "Record last updated timestamp")
  * "created_by" (dataType: "VARCHAR(50)", nullable: "NO", defaultValue: "-", description: "User or system that created the record")
  * "updated_by" (dataType: "VARCHAR(50)", nullable: "NO", defaultValue: "-", description: "User or system that last updated the record")

Jira Issue Key: ${issueContext.key}
Jira Summary: ${issueContext.summary}
Jira Parent Issue: ${issueContext.parentIssueKey || 'N/A'} - ${issueContext.parentIssueSummary || ''}
Jira Description:
${issueContext.descriptionText || 'No description'}

Jira Comments:
${commentsText}

Existing Confluence Storage HTML:
${currentStorageHtml}

Return a valid JSON object matching this exact structure:
{
  "workType": "DATABASE_DESIGN",
  "changeSummary": [
    "Short bullet describing what was extracted or updated from Jira"
  ],
  "subtaskDescription": "Clean, concise overview & data purpose synthesized from Jira",
  "templateFields": {
    "schemaName": "e.g. dbo or payment",
    "tableName": "e.g. qr_payment_transactions",
    "erdSummary": "Entity relationship and schema summary",
    "columns": [
      {
        "name": "column_name",
        "dataType": "NVARCHAR(64) / BIGINT / UNIQUEIDENTIFIER / DATETIME2",
        "nullable": "NO or YES",
        "defaultValue": "IDENTITY(1,1) / SYSDATETIME() / -",
        "description": "Column purpose"
      }
    ],
    "indexes": [
      {
        "name": "idx_name",
        "type": "PRIMARY KEY / UNIQUE / INDEX (B-Tree)",
        "columns": "(col1, col2)",
        "notes": "Query access pattern"
      }
    ]
  }
}`;
  }

  return `You are a Senior Software Architect. Analyze the Jira issue details (Summary, Description, and Comments) along with the existing Confluence page HTML, and extract structured API Development specification fields that strictly match our Confluence API Development template.

Pay special attention to:
1. All Request parameters — including Headers, Path parameters, Query parameters, AND every field inside the Request Body JSON — must be unified into "headersAndParams" (Section 3.1 Headers & Parameters) with its location ("Header", "Path", "Query", or "Body"), data type, whether it is "Mandatory" or "Optional", an example value ("example"), and description.
   - Always include standard request headers in "headersAndParams":
     * "Authorization" (location: "Header", type: "String", mandatory: "Mandatory", example: "Bearer <jwe_token>", description: "JWE Token (สามารถแกะ memberId ออกมาได้)")
     * "Accept-Language" (location: "Header", type: "String", mandatory: "Mandatory", example: "th / en", description: "Language preference (th/en)")
     * "Content-Type" (location: "Header", type: "String", mandatory: "Mandatory", example: "application/json", description: "JSON request content type")
2. All Response fields — every field inside the Response Body JSON — must be extracted into "responseFields" (Section 4.1 Response Fields) with its data type, whether it is "Mandatory" or "Optional", an example value ("example"), and description.
   - STRICT RULE FOR EMPTY RESPONSE ({}): If the sample response in Jira is {} (an empty JSON object) or has no fields, "responseFields" MUST be an empty array [] and "responsePayloadJson" MUST be "{}". Do NOT copy or keep placeholder fields (such as "code" or "data") from the existing Confluence HTML.
3. STRICT RULE: Do NOT invent or auto-insert "requestId" (or any other extra field) into "headersAndParams" or "requestPayloadJson" unless it is explicitly present in the Jira Description or Jira Comments. If "requestId" was only a placeholder in the existing Confluence HTML and is NOT in Jira, remove it.
4. For Section 4.3 Status & Error Codes ("statusCodes"):
   - When the Jira Description or Comments mention specific Exception class names (for example: "throw ApplicationNotFoundFieldException (412)", "throw ApplicationInvalidFieldException (412)", "throw CustomerInformationNotFoundException (500)", "throw PrescreenType1Exception (412)"), you MUST use the exact Exception class name in the "errorCode" field (e.g. "ApplicationNotFoundFieldException") instead of a generic error code, pair it with its HTTP status code in "httpStatus" (e.g. "412", "500", "410/417"), and describe the condition in "scenario". Create a separate entry in "statusCodes" for each exception/error case mentioned in Jira.

Jira Issue Key: ${issueContext.key}
Jira Summary: ${issueContext.summary}
Jira Parent Issue: ${issueContext.parentIssueKey || 'N/A'} - ${issueContext.parentIssueSummary || ''}
Jira Description:
${issueContext.descriptionText || 'No description'}

Jira Comments:
${commentsText}

Existing Confluence Storage HTML:
${currentStorageHtml}

Return a valid JSON object matching this exact structure:
{
  "workType": "API_DEVELOPMENT",
  "changeSummary": [
    "Short bullet describing what was extracted or updated from Jira (e.g. Updated 3.1 Headers & Parameters and 4.1 Response Fields)"
  ],
  "subtaskDescription": "Clean, concise objective & context synthesized from Jira",
  "templateFields": {
    "httpMethod": "GET | POST | PUT | PATCH | DELETE",
    "endpointPath": "/api/v1/...",
    "serviceName": "Target service name",
    "headersAndParams": [
      {
        "name": "Parameter or JSON field name (e.g. Authorization, Accept-Language, or request fields)",
        "location": "Header | Path | Query | Body",
        "type": "String | Number | Boolean | Object | Array",
        "mandatory": "Mandatory | Optional",
        "example": "Sample value (e.g. application/json, 150.00, M-001)",
        "description": "What this request field/parameter represents"
      }
    ],
    "requestPayloadJson": "Formatted JSON string of the sample request body",
    "responseFields": [
      {
        "name": "Response JSON field name",
        "type": "String | Number | Boolean | Object | Array",
        "mandatory": "Mandatory | Optional",
        "example": "Sample value (e.g. QR-9981, SUCCESS)",
        "description": "What this response field represents"
      }
    ],
    "responsePayloadJson": "Formatted JSON string of the sample response body",
    "statusCodes": [
      {
        "httpStatus": "200 / 412 / 500 / ...",
        "errorCode": "Exception class name if specified in Jira (e.g. ApplicationNotFoundFieldException), otherwise error code / SUCCESS",
        "scenario": "When this status or exception is returned"
      }
    ]
  }
}`;
}

function normalizePrettyJsonString(value, fallback = '') {
  if (!value) return fallback;
  if (typeof value === 'object') {
    return JSON.stringify(value, null, 2);
  }
  const str = String(value).trim();
  if (!str) return fallback;
  try {
    return JSON.stringify(JSON.parse(str), null, 2);
  } catch {
    return str;
  }
}

function isEmptyJsonObjectString(value) {
  const str = String(value || '').trim();
  if (!str) return false;
  if (str === '{}') return true;
  try {
    const parsed = JSON.parse(str);
    return (
      Boolean(parsed) &&
      typeof parsed === 'object' &&
      !Array.isArray(parsed) &&
      Object.keys(parsed).length === 0
    );
  } catch {
    return false;
  }
}

export async function analyzeJiraForConfluenceSync({
  issueContext,
  currentConfluencePage = null,
  workType = WORK_TYPES.API_DEVELOPMENT,
  model: requestedModel = '',
}) {
  const prompt = buildPrompt({ issueContext, currentConfluencePage, workType });
  const { model, text } = await callAi({
    prompt,
    model: requestedModel,
    temperature: 0.2,
    jsonMode: true,
  });

  if (!String(text || '').trim()) {
    throw new AtlassianApiError('AI returned an empty analysis response.', 502);
  }

  let parsedResult;
  try {
    const cleaned = String(text)
      .replace(/^```json\s*/i, '')
      .replace(/```$/i, '')
      .trim();
    parsedResult = JSON.parse(cleaned);
  } catch (err) {
    throw new AtlassianApiError(
      `Failed to parse AI JSON output: ${err.message}`,
      502,
      text
    );
  }

  const resolvedWorkType =
    parsedResult.workType === WORK_TYPES.DATABASE_DESIGN ||
    workType === WORK_TYPES.DATABASE_DESIGN
      ? WORK_TYPES.DATABASE_DESIGN
      : WORK_TYPES.API_DEVELOPMENT;

  const tf = parsedResult.templateFields || {};
  const normalizedResponsePayload = normalizePrettyJsonString(tf.responsePayloadJson, '');
  const isResponseEmptyObj = isEmptyJsonObjectString(normalizedResponsePayload);

  return {
    workType: resolvedWorkType,
    model,
    changeSummary: Array.isArray(parsedResult.changeSummary)
      ? parsedResult.changeSummary
      : ['Extracted latest specification details from Jira card'],
    subtaskDescription:
      parsedResult.subtaskDescription || issueContext.descriptionText || issueContext.summary,
    templateFields: {
      httpMethod: tf.httpMethod || 'POST',
      endpointPath: tf.endpointPath || '/api/v1/resource',
      serviceName: tf.serviceName || 'Core Backend Service',
      headersAndParams:
        resolvedWorkType === WORK_TYPES.API_DEVELOPMENT
          ? ensureRequiredApiHeaders(tf.headersAndParams)
          : Array.isArray(tf.headersAndParams)
            ? tf.headersAndParams
            : [],
      requestPayloadJson: normalizePrettyJsonString(tf.requestPayloadJson, ''),
      responseFields: isResponseEmptyObj
        ? []
        : Array.isArray(tf.responseFields)
          ? tf.responseFields
          : [],
      responsePayloadJson: normalizedResponsePayload,
      statusCodes: Array.isArray(tf.statusCodes) ? tf.statusCodes : [],
      dbEngine: 'SQL Server',
      schemaName: tf.schemaName || 'dbo',
      tableName: tf.tableName || 'sample_entity_table',
      erdSummary: tf.erdSummary || '',
      columns:
        resolvedWorkType === WORK_TYPES.DATABASE_DESIGN
          ? ensureRequiredDbColumns(tf.columns)
          : Array.isArray(tf.columns)
            ? tf.columns
            : [],
      indexes: Array.isArray(tf.indexes) ? tf.indexes : [],
    },
  };
}

const SUBTASK_SUGGESTION_LIMIT = 5;

function cleanSuggestionText(value) {
  return String(value || '')
    .replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '')
    .replace(/^["'`]+|["'`]+$/g, '')
    .trim();
}

/**
 * Rewrites a subtask description into structured Markdown (Objective / Scope /
 * Acceptance Criteria / Technical Notes) and returns it as ADF for the editor.
 */
export async function improveDescription({
  text = '',
  parentKey = '',
  parentSummary = '',
  workType = '',
  model: requestedModel = '',
} = {}) {
  const source = String(text || '').trim();

  if (!source) {
    throw new AtlassianApiError('Description text is required to improve it.', 400);
  }

  const prompt = `You are a senior business analyst writing Jira subtask descriptions for a software engineering team.

Parent Jira Issue: ${parentKey || 'N/A'}${parentSummary ? ` — ${parentSummary}` : ''}
Work Type: ${workType || 'N/A'}

Current description:
"""
${source.slice(0, 12000)}
"""

Rewrite it so it is clear, complete and well structured for a Jira subtask. Rules:
- Output MUST be in English only.
- Preserve every fact, number, name and requirement from the original — never invent scope, dates or acceptance criteria.
- Structure the output with these sections when the content supports them: "Objective", "Scope", "Acceptance Criteria", "Technical Notes".
- Use Markdown: "## " for section headings, "- " for bullets, "1. " for ordered steps, "**bold**" for emphasis, and inline code with backticks.
- Keep it concise: 120-400 words.
- Do not wrap the whole answer in a code fence and do not add commentary before or after the description.`;

  const { model, text: aiText } = await callAi({
    prompt,
    model: requestedModel,
    temperature: 0.35,
    maxTokens: 2048,
  });

  const markdown = String(aiText || '')
    .replace(/^\s*```(?:markdown|md)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();

  if (!markdown) {
    throw new AtlassianApiError('AI returned an empty description.', 502);
  }

  return { model, adf: markdownToAdf(markdown), markdown };
}

export async function suggestSubtaskNames({
  parentKey = '',
  parentSummary = '',
  parentDescription = '',
  draftName = '',
  workType = '',
  model: requestedModel = '',
}) {
  const draft = String(draftName || '').trim();

  if (!draft) {
    throw new AtlassianApiError('draftName is required to suggest subtask names.', 400);
  }

  const prompt = `You are a Jira subtask naming assistant for a software engineering team.
Improve the grammar, spelling, and clarity of the draft subtask name and propose alternative names.

Parent Jira Issue: ${parentKey || 'N/A'}${parentSummary ? ` — ${parentSummary}` : ''}
Work Type: ${workType || 'N/A'}
Draft Subtask Name: ${draft}

Rules:
- Output MUST be in English only.
- Return 3 to ${SUBTASK_SUGGESTION_LIMIT} suggestions.
- Keep each suggestion concise (about 90 characters or fewer).
- Preserve the original intent and any leading bracket tags such as "[DEV][BE]", "[API]", or "[DB]".
- Use professional, imperative Jira style: Create, Implement, Add, Update, Fix, Integrate, Handle.
- Do not add numbering, bullet characters, quotes, markdown, or explanations.
- Return ONLY valid JSON in this shape: {"suggestions": ["First suggestion", "Second suggestion"]}`;

  const { model, text: aiText } = await callAi({
    prompt,
    model: requestedModel,
    temperature: 0.4,
    jsonMode: true,
  });

  if (!String(aiText || '').trim()) {
    throw new AtlassianApiError('AI returned an empty suggestion response.', 502);
  }

  const cleaned = String(aiText)
    .replace(/^```json\s*/i, '')
    .replace(/```$/i, '')
    .trim();

  let parsed = null;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    parsed = null;
  }

  let suggestions = [];
  if (Array.isArray(parsed?.suggestions)) {
    suggestions = parsed.suggestions;
  } else if (Array.isArray(parsed)) {
    suggestions = parsed;
  } else if (!parsed) {
    suggestions = cleaned.split('\n');
  }

  const normalized = [];
  const seen = new Set();
  for (const item of suggestions) {
    const text = cleanSuggestionText(item);
    if (!text) continue;
    const dedupeKey = text.toLowerCase();
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    normalized.push(text);
    if (normalized.length >= SUBTASK_SUGGESTION_LIMIT) break;
  }

  if (normalized.length === 0) {
    throw new AtlassianApiError(
      'Gemini did not return any usable subtask name suggestions.',
      502
    );
  }

  return { model, draftName: draft, suggestions: normalized };
}
