import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';

const realFetch = global.fetch;

async function withServer(atlassianHandler, fn) {
  process.env.ATLASSIAN_BASE_URL = 'https://baynext.atlassian.net';
  process.env.ATLASSIAN_EMAIL = 'dev@example.com';
  process.env.ATLASSIAN_API_TOKEN = 'test-token';

  const app = createApp();
  const server = app.listen(0);
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  global.fetch = async (url, options) => {
    const urlStr = String(url);
    if (urlStr.startsWith(baseUrl)) {
      return realFetch(url, options);
    }
    return atlassianHandler(urlStr, options);
  };

  try {
    await fn(baseUrl);
  } finally {
    global.fetch = realFetch;
    await new Promise((resolve) => server.close(resolve));
  }
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

test(
  'GET /api/config/defaults returns templates and default settings without exposing secrets',
  { concurrency: false },
  async () => {
  await withServer(
    async () => jsonResponse({}),
    async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/config/defaults`);
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(Array.isArray(body.templates), true);
      assert.equal(body.templates.length, 2);
      assert.equal(body.apiToken, undefined);
      assert.equal(body.mockMode, undefined);
    }
  );
});

test('GET /api/jira/issues/search filters parent issues by key or summary', async () => {
  await withServer(
    async (url) => {
      if (url.includes('/rest/api/3/search/jql')) {
        return jsonResponse({
          issues: [
            {
              key: 'PAY-101',
              id: '10101',
              fields: {
                summary: 'Implement QR PromptPay Payment Gateway Integration',
                issuetype: { name: 'Story' },
                status: { name: 'In Progress' },
                project: { key: 'PAY' },
              },
            },
          ],
        });
      }
      return jsonResponse({}, 404);
    },
    async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/jira/issues/search?q=PAY-101`);
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.issues.length, 1);
      assert.equal(body.issues[0].key, 'PAY-101');
    }
  );
});

test('POST /api/workflow/create-all creates Jira Subtask, Confluence Page, and Remote Link in one flow', async () => {
  let capturedIssuePayload = null;
  await withServer(
    async (url, options) => {
      if (url.includes('/rest/api/3/project/PAY')) {
        return jsonResponse({
          issueTypes: [{ id: '10003', name: 'Sub-task', subtask: true }],
        });
      }
      if (url.endsWith('/rest/api/3/issue') && options?.method === 'POST') {
        capturedIssuePayload = JSON.parse(options.body);
        return jsonResponse({ id: '20501', key: 'PAY-501' }, 201);
      }
      if (url.endsWith('/wiki/rest/api/content') && options?.method === 'POST') {
        const parsed = JSON.parse(options.body);
        return jsonResponse({
          id: '9001',
          title: parsed.title,
          _links: { webui: '/spaces/1KSGA/pages/9001' },
        });
      }
      if (url.includes('/remotelink') && options?.method === 'POST') {
        return jsonResponse({ id: 777 }, 201);
      }
      return jsonResponse({}, 404);
    },
    async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/workflow/create-all`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parentIssueKey: 'PAY-101',
          parentIssueSummary: 'Implement QR PromptPay Payment Gateway Integration',
          workType: 'API_DEVELOPMENT',
          subtaskSummary: '[API] Create QR Generation Endpoint',
          subtaskDescription: 'Expose POST /api/v1/qr/generate endpoint',
          spaceKey: '1KSGA',
          parentPageId: '5164335849',
          templateFields: {
            httpMethod: 'POST',
            endpointPath: '/api/v1/qr/generate',
          },
        }),
      });

      assert.equal(res.status, 201);
      const body = await res.json();
      assert.equal(body.status, 'COMPLETED');
      assert.equal(body.subtask.key, 'PAY-501');
      assert.equal(body.subtask.squad, 'SQ16');
      assert.equal(body.subtask.team, 'UCHOOSE');
      assert.deepEqual(capturedIssuePayload.fields.customfield_11505, { value: 'SQ16' });
      assert.equal(
        capturedIssuePayload.fields.customfield_10114,
        'fcb6e51f-5ba0-4486-88fe-2de7448907a1'
      );
      assert.ok(body.confluencePage.title.includes('[PAY-501]'));
      assert.equal(body.remoteLink.linked, true);
    }
  );
});

test('Partial failure + retry-confluence flow does not duplicate Jira Subtask', async () => {
  let confluenceShouldFail = true;
  let issueCreateCount = 0;

  await withServer(
    async (url, options) => {
      if (url.includes('/rest/api/3/project/CORE')) {
        return jsonResponse({
          issueTypes: [{ id: '10003', name: 'Sub-task', subtask: true }],
        });
      }
      if (url.endsWith('/rest/api/3/issue') && options?.method === 'POST') {
        issueCreateCount += 1;
        return jsonResponse({ id: '20502', key: `CORE-${500 + issueCreateCount}` }, 201);
      }
      if (url.endsWith('/wiki/rest/api/content') && options?.method === 'POST') {
        if (confluenceShouldFail) {
          return jsonResponse({ message: 'Confluence service unavailable' }, 503);
        }
        const parsed = JSON.parse(options.body);
        return jsonResponse({
          id: '9002',
          title: parsed.title,
          _links: { webui: '/spaces/DBA/pages/9002' },
        });
      }
      if (url.includes('/remotelink') && options?.method === 'POST') {
        return jsonResponse({ id: 778 }, 201);
      }
      return jsonResponse({}, 404);
    },
    async (baseUrl) => {
      // 1. First call fails on Confluence step
      const firstRes = await fetch(`${baseUrl}/api/workflow/create-all`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parentIssueKey: 'CORE-210',
          parentIssueSummary: 'Customer Profile & KYC Document Verification Revamp',
          workType: 'DATABASE_DESIGN',
          subtaskSummary: '[DB] Design kyc_verification_audit table',
          subtaskDescription: 'Audit table for KYC status transitions',
          spaceKey: 'DBA',
          parentPageId: '3001',
        }),
      });

      assert.equal(firstRes.status, 207);
      const partialBody = await firstRes.json();
      assert.equal(partialBody.status, 'PARTIAL_FAILURE');
      assert.equal(partialBody.steps.jiraSubtask, 'SUCCESS');
      assert.equal(partialBody.steps.confluencePage, 'FAILED');
      assert.equal(partialBody.error.canRetryConfluence, true);

      const createdSubtaskKey = partialBody.subtask.key;
      assert.equal(createdSubtaskKey, 'CORE-501');
      assert.equal(issueCreateCount, 1);

      // 2. Retry Confluence only using the existing subtask
      confluenceShouldFail = false;
      const retryRes = await fetch(`${baseUrl}/api/workflow/retry-confluence`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subtask: partialBody.subtask,
          parentIssueKey: 'CORE-210',
          parentIssueSummary: 'Customer Profile & KYC Document Verification Revamp',
          workType: 'DATABASE_DESIGN',
          subtaskSummary: '[DB] Design kyc_verification_audit table',
          subtaskDescription: 'Audit table for KYC status transitions',
          spaceKey: 'DBA',
          parentPageId: '3001',
        }),
      });

      assert.equal(retryRes.status, 200);
      const retryBody = await retryRes.json();
      assert.equal(retryBody.status, 'COMPLETED');
      assert.equal(retryBody.retried, true);
      assert.equal(issueCreateCount, 1);
      assert.equal(retryBody.subtask.key, createdSubtaskKey);
      assert.ok(retryBody.confluencePage.title.includes(`[${createdSubtaskKey}]`));
      assert.equal(retryBody.remoteLink.subtaskKey, createdSubtaskKey);
    }
  );
});

test('GET /api/confluence/pages/search supports Confluence Folder URLs and Folder IDs', async () => {
  await withServer(
    async (url) => {
      if (url.includes('/wiki/rest/api/content/search')) {
        return jsonResponse({ results: [] });
      }
      if (url.includes('/wiki/api/v2/folders/5164335849')) {
        return jsonResponse({ id: '5164335849', title: 'Technical Design' });
      }
      return jsonResponse({}, 404);
    },
    async (baseUrl) => {
      const folderUrl =
        'https://baynext.atlassian.net/wiki/spaces/1KSGA/folder/5164335849/Technical+Design';
      const res = await fetch(
        `${baseUrl}/api/confluence/pages/search?spaceKey=1KSGA&q=${encodeURIComponent(folderUrl)}`
      );
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.ok(body.pages.length >= 1);
      const matched = body.pages.find((p) => p.id === '5164335849');
      assert.ok(matched);
      assert.equal(matched.type, 'folder');
      assert.equal(matched.title, 'Technical Design');
    }
  );
});

test('POST /api/workflow/create-all with createConfluence=false creates only Jira Subtask', async () => {
  await withServer(
    async (url, options) => {
      if (url.includes('/rest/api/3/project/PAY')) {
        return jsonResponse({
          issueTypes: [{ id: '10003', name: 'Sub-task', subtask: true }],
        });
      }
      if (url.endsWith('/rest/api/3/issue') && options?.method === 'POST') {
        return jsonResponse({ id: '20505', key: 'PAY-505' }, 201);
      }
      return jsonResponse({}, 404);
    },
    async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/workflow/create-all`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parentIssueKey: 'PAY-104',
          parentIssueSummary: 'Merchant Settlement & Daily Reconciliation Service',
          workType: 'API_DEVELOPMENT',
          subtaskSummary: '[API] Add settlement status query',
          subtaskDescription: 'Subtask only without Confluence page',
          createConfluence: false,
        }),
      });

      assert.equal(res.status, 201);
      const body = await res.json();
      assert.equal(body.status, 'COMPLETED');
      assert.equal(body.confluenceSkipped, true);
      assert.equal(body.steps.jiraSubtask, 'SUCCESS');
      assert.equal(body.steps.confluencePage, 'SKIPPED');
      assert.equal(body.steps.remoteLink, 'SKIPPED');
      assert.equal(body.subtask.key, 'PAY-505');
      assert.equal(body.confluencePage, null);
      assert.equal(body.remoteLink, null);
    }
  );
});

test('POST /api/workflow/sync-analyze and /api/workflow/sync-apply analyze Jira updates with Gemini and update Confluence page', async () => {
  process.env.GEMINI_API_KEY = 'test-gemini-key';
  let capturedConfluencePut = null;

  await withServer(
    async (url, options) => {
      if (url.includes('/rest/api/3/issue/PAY-501/remotelink')) {
        if (options?.method === 'POST') {
          return jsonResponse({ id: 888 }, 201);
        }
        return jsonResponse([
          {
            id: 10,
            globalId: 'appId=confluence&pageId=9001',
            object: {
              url: 'https://baynext.atlassian.net/wiki/spaces/1KSGA/pages/9001',
              title: '[PAY-501] API Spec: Create QR Generation Endpoint',
            },
          },
        ]);
      }
      if (url.includes('/rest/api/3/issue/PAY-501')) {
        return jsonResponse({
          key: 'PAY-501',
          id: '20501',
          fields: {
            summary: '[API] Create QR Generation Endpoint',
            description: {
              type: 'doc',
              version: 1,
              content: [
                {
                  type: 'paragraph',
                  content: [
                    {
                      type: 'text',
                      text: 'Added request amount, currency, and qrReferenceId response.',
                    },
                  ],
                },
              ],
            },
            issuetype: { name: 'Sub-task', subtask: true },
            status: { name: 'In Progress' },
            parent: {
              key: 'PAY-101',
              fields: { summary: 'Implement QR PromptPay Payment Gateway Integration' },
            },
            comment: { comments: [] },
          },
        });
      }
      if (url.includes('/wiki/rest/api/content/9001') && (!options?.method || options.method === 'GET')) {
        return jsonResponse({
          id: '9001',
          title: '[PAY-501] API Spec: Create QR Generation Endpoint',
          space: { key: '1KSGA' },
          version: { number: 2 },
          body: { storage: { value: '<h2>1. Objective</h2>' } },
          _links: { webui: '/spaces/1KSGA/pages/9001' },
        });
      }
      if (url.includes('generativelanguage.googleapis.com')) {
        return jsonResponse({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      workType: 'API_DEVELOPMENT',
                      changeSummary: [
                        'Extracted amount and currency fields in request payload',
                        'Added qrReferenceId and qrImageBase64 to response payload',
                      ],
                      subtaskDescription: 'Generate dynamic PromptPay QR payload with reference ID.',
                      templateFields: {
                        httpMethod: 'POST',
                        endpointPath: '/api/v1/payments/qr/generate',
                        serviceName: 'Payment Gateway Service',
                        headersAndParams: [
                          {
                            name: 'X-Correlation-Id',
                            location: 'Header',
                            type: 'String',
                            mandatory: 'Mandatory',
                            example: 'corr-12345',
                            description: 'Request trace identifier',
                          },
                          {
                            name: 'amount',
                            location: 'Body',
                            type: 'Number',
                            mandatory: 'Mandatory',
                            example: '150.00',
                            description: 'Transaction payment amount',
                          },
                          {
                            name: 'merchantId',
                            location: 'Body',
                            type: 'String',
                            mandatory: 'Optional',
                            example: 'M-001',
                            description: 'Merchant reference code',
                          },
                        ],
                        requestPayloadJson: JSON.stringify(
                          { amount: 150.0, currency: 'THB', merchantId: 'M-001' },
                          null,
                          2
                        ),
                        responseFields: [
                          {
                            name: 'qrReferenceId',
                            type: 'String',
                            mandatory: 'Mandatory',
                            example: 'QR-9981',
                            description: 'Generated QR transaction reference ID',
                          },
                          {
                            name: 'qrRawData',
                            type: 'String',
                            mandatory: 'Mandatory',
                            example: '000201010212...',
                            description: 'EMVCo QR payload string',
                          },
                        ],
                        responsePayloadJson: JSON.stringify(
                          { qrReferenceId: 'QR-9981', qrRawData: '000201010212...' },
                          null,
                          2
                        ),
                        statusCodes: [
                          {
                            httpStatus: '200',
                            errorCode: 'SUCCESS',
                            scenario: 'QR code generated successfully',
                          },
                        ],
                      },
                    }),
                  },
                ],
              },
            },
          ],
        });
      }
      if (url.includes('/wiki/rest/api/content/9001') && options?.method === 'PUT') {
        capturedConfluencePut = JSON.parse(options.body);
        return jsonResponse({
          id: '9001',
          title: capturedConfluencePut.title,
          version: { number: capturedConfluencePut.version.number },
          _links: { webui: '/spaces/1KSGA/pages/9001' },
        });
      }
      return jsonResponse({}, 404);
    },
    async (baseUrl) => {
      // 1. Analyze with Gemini
      const analyzeRes = await fetch(`${baseUrl}/api/workflow/sync-analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          issueKey: 'PAY-501',
        }),
      });

      assert.equal(analyzeRes.status, 200);
      const analyzeBody = await analyzeRes.json();
      assert.equal(analyzeBody.issueContext.key, 'PAY-501');
      assert.equal(analyzeBody.confluencePage.id, '9001');
      assert.equal(analyzeBody.analysis.workType, 'API_DEVELOPMENT');
      assert.equal(analyzeBody.analysis.changeSummary.length, 2);
      assert.ok(
        analyzeBody.analysis.templateFields.requestPayloadJson.includes('merchantId')
      );
      assert.ok(
        analyzeBody.analysis.templateFields.responsePayloadJson.includes('qrReferenceId')
      );

      // 2. Apply confirmed sync to Confluence
      const applyRes = await fetch(`${baseUrl}/api/workflow/sync-apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          issueKey: 'PAY-501',
          parentIssueKey: analyzeBody.issueContext.parentIssueKey,
          parentIssueSummary: analyzeBody.issueContext.parentIssueSummary,
          subtaskSummary: analyzeBody.issueContext.summary,
          subtaskDescription: analyzeBody.analysis.subtaskDescription,
          workType: analyzeBody.analysis.workType,
          confluencePageId: analyzeBody.confluencePage.id,
          templateFields: analyzeBody.analysis.templateFields,
        }),
      });

      assert.equal(applyRes.status, 200);
      const applyBody = await applyRes.json();
      assert.equal(applyBody.status, 'SYNCED');
      assert.equal(applyBody.confluencePage.versionNumber, 3);
      assert.ok(
        capturedConfluencePut.body.storage.value.includes('3.1 Headers &amp; Parameters')
      );
      assert.ok(
        capturedConfluencePut.body.storage.value.includes('Mandatory / Optional')
      );
      assert.ok(
        capturedConfluencePut.body.storage.value.includes('Example Value')
      );
      assert.ok(
        capturedConfluencePut.body.storage.value.includes('4.1 Response Fields')
      );
      assert.ok(
        capturedConfluencePut.body.storage.value.includes('4.2 Sample Response Payload')
      );
      assert.ok(capturedConfluencePut.body.storage.value.includes('qrReferenceId'));
      assert.ok(capturedConfluencePut.body.storage.value.includes('X-Correlation-Id'));
      assert.ok(capturedConfluencePut.body.storage.value.includes('corr-12345'));
    }
  );
});

test('POST /api/workflow/create-batch-subtasks creates multiple subtasks under parent issue in one request', async () => {
  let createdCount = 0;
  const capturedSummaries = [];

  await withServer(
    async (url, options) => {
      if (url.includes('/rest/api/3/project/ONEKSGA')) {
        return jsonResponse({
          issueTypes: [{ id: '10224', name: 'Sub-task', subtask: true }],
        });
      }
      if (url.endsWith('/rest/api/3/issue') && options?.method === 'POST') {
        createdCount += 1;
        const body = JSON.parse(options.body);
        capturedSummaries.push(body.fields.summary);
        return jsonResponse(
          { id: String(30000 + createdCount), key: `ONEKSGA-${600 + createdCount}` },
          201
        );
      }
      return jsonResponse({}, 404);
    },
    async (baseUrl) => {
      const presetSubtasks = [
        { id: 'row-1', summary: '[DEV][BE] Create New Adapter For Call 3rd Party Endpoint /miniapp/api/v1/xxx/xxx/xxx' },
        { id: 'row-2', summary: '[DEV][BE] Create New Datasource Query/Mutation For xxxx' },
        { id: 'row-3', summary: '[DEV][FE] Create New Hook For Call Endpoint /miniapp/api/v1/xxx/xxx/xxx' },
        { id: 'row-4', summary: '[FE][QA] Create New UI for XXX' },
        { id: 'row-5', summary: '[FE][QA] Create Logic Call Endpoint And Handle Error Endpoint /miniapp/api/v1/xxx/xxx/xxx' }
      ];

      const res = await fetch(`${baseUrl}/api/workflow/create-batch-subtasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parentIssueKey: 'ONEKSGA-100',
          subtasks: presetSubtasks,
        }),
      });

      assert.equal(res.status, 201);
      const body = await res.json();
      assert.equal(body.status, 'COMPLETED');
      assert.equal(body.totalRequested, 5);
      assert.equal(body.successCount, 5);
      assert.equal(body.failureCount, 0);
      assert.equal(body.results.length, 5);
      assert.equal(body.results[0].subtask.key, 'ONEKSGA-601');
      assert.equal(body.results[4].subtask.key, 'ONEKSGA-605');
      assert.deepEqual(
        capturedSummaries,
        presetSubtasks.map((s) => s.summary)
      );
    }
  );
});

test('POST /api/ai/suggest-subtask-names returns English grammar suggestions from Gemini', async () => {
  process.env.GEMINI_API_KEY = 'test-gemini-key';
  let capturedPrompt = '';

  await withServer(
    async (url, options) => {
      if (url.includes('generativelanguage.googleapis.com')) {
        const payload = JSON.parse(options.body);
        capturedPrompt = payload.contents[0].parts[0].text;
        return jsonResponse({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      suggestions: [
                        '[DEV][BE] Implement Third-Party API Call for Payment Service',
                        '[DEV][BE] Integrate Payment Service API Endpoint',
                        '[DEV][BE] Create Adapter for Payment Service API',
                      ],
                    }),
                  },
                ],
              },
            },
          ],
        });
      }
      return jsonResponse({}, 404);
    },
    async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/ai/suggest-subtask-names`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parentKey: 'ONEKSGA-100',
          parentSummary: 'Payment Service Integration',
          draftName: 'call api payment service',
          workType: 'API_DEVELOPMENT',
        }),
      });

      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.suggestions.length, 3);
      assert.ok(body.suggestions.every((s) => typeof s === 'string' && s.length > 0));
      assert.ok(capturedPrompt.includes('English'));
      assert.ok(capturedPrompt.includes('call api payment service'));
    }
  );
});

test('POST /api/ai/suggest-subtask-names rejects an empty draftName', async () => {
  await withServer(
    async () => jsonResponse({}, 404),
    async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/ai/suggest-subtask-names`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draftName: '   ' }),
      });

      assert.equal(res.status, 400);
      const body = await res.json();
      assert.ok(body.error?.message);
    }
  );
});

