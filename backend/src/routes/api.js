import { Router } from 'express';
import { getConfig } from '../config/env.js';
import {
  TEMPLATE_METADATA,
  buildConfluencePageTitle,
} from '../templates/confluenceTemplates.js';
import {
  searchParentIssues,
  searchSyncableIssues,
  getJiraIssueSyncContext,
  createJiraSubtask,
  linkConfluencePageToSubtask,
} from '../services/jiraService.js';
import {
  listConfluenceSpaces,
  searchConfluenceParentPages,
  createConfluenceDocPage,
  getConfluencePageContent,
  updateConfluenceDocPage,
} from '../services/confluenceService.js';
import { analyzeJiraForConfluenceSync, suggestSubtaskNames } from '../services/geminiService.js';

const router = Router();

router.get('/config/defaults', (req, res) => {
  const config = getConfig();
  res.json({
    atlassianBaseUrl: config.atlassian.baseUrl,
    geminiConfigured: Boolean(config.gemini?.apiKey),
    geminiModel: config.gemini?.model || 'gemini-2.5-flash',
    defaults: config.defaults,
    templates: Object.values(TEMPLATE_METADATA),
  });
});

/**
 * Suggests improved English subtask names (grammar + clarity) using Gemini.
 * Triggered on demand (debounced in the UI) — never auto-applied to the input.
 */
router.post('/ai/suggest-subtask-names', async (req, res, next) => {
  try {
    const { parentKey, parentSummary, parentDescription, draftName, workType } =
      req.body || {};
    const draft = String(draftName || '').trim();

    if (!draft) {
      return res.status(400).json({
        error: { message: 'draftName is required.' },
      });
    }
    if (draft.length > 300) {
      return res.status(400).json({
        error: { message: 'draftName must be 300 characters or fewer.' },
      });
    }

    const result = await suggestSubtaskNames({
      parentKey: String(parentKey || '').trim(),
      parentSummary: String(parentSummary || '').trim(),
      parentDescription: String(parentDescription || '').slice(0, 2000),
      draftName: draft,
      workType: String(workType || '').trim(),
    });

    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.get('/jira/issues/search', async (req, res, next) => {
  try {
    const issues = await searchParentIssues(req.query.q || '');
    res.json({ issues });
  } catch (err) {
    next(err);
  }
});

router.get('/jira/issues/sync-search', async (req, res, next) => {
  try {
    const issues = await searchSyncableIssues(req.query.q || '');
    res.json({ issues });
  } catch (err) {
    next(err);
  }
});

router.get('/jira/issues/:issueKey/sync-context', async (req, res, next) => {
  try {
    const context = await getJiraIssueSyncContext(req.params.issueKey);
    res.json({ issue: context });
  } catch (err) {
    next(err);
  }
});

router.get('/confluence/spaces', async (req, res, next) => {
  try {
    const spaces = await listConfluenceSpaces();
    res.json({ spaces });
  } catch (err) {
    next(err);
  }
});

router.get('/confluence/pages/search', async (req, res, next) => {
  try {
    const pages = await searchConfluenceParentPages({
      spaceKey: req.query.spaceKey,
      query: req.query.q || '',
    });
    res.json({ pages });
  } catch (err) {
    next(err);
  }
});

router.post('/workflow/preview', (req, res) => {
  const { workType, subtaskKey, subtaskSummary, customPageTitle } = req.body || {};
  const meta = TEMPLATE_METADATA[workType] || TEMPLATE_METADATA.API_DEVELOPMENT;
  const pageTitle = buildConfluencePageTitle({
    subtaskKey,
    workType: meta.id,
    subtaskSummary,
    customPageTitle,
  });

  res.json({
    pageTitle,
    template: meta,
  });
});

/**
 * Step-by-step workflow:
 * 1. Create Jira Subtask under Parent Issue
 * 2. Create Confluence Page from selected Template
 * 3. Link Confluence Page back to the Jira Subtask
 *
 * If Step 1 succeeds and Step 2 or Step 3 fails, returns HTTP 207 with the created
 * subtask info so the user can retry Confluence without duplicating the Jira Subtask.
 */
router.post('/workflow/create-all', async (req, res, next) => {
  try {
    const {
      parentIssueKey,
      parentIssueSummary,
      workType = 'API_DEVELOPMENT',
      subtaskSummary,
      subtaskDescription,
      createConfluence = true,
      spaceKey,
      parentPageId,
      customPageTitle,
      templateFields,
    } = req.body || {};

    // Step 1: Create Jira Subtask
    const subtask = await createJiraSubtask({
      parentIssueKey,
      summary: subtaskSummary,
      description: subtaskDescription,
      workType,
    });

    // If user chose to create only the Jira Subtask, skip Confluence steps
    if (createConfluence === false) {
      return res.status(201).json({
        status: 'COMPLETED',
        confluenceSkipped: true,
        steps: {
          jiraSubtask: 'SUCCESS',
          confluencePage: 'SKIPPED',
          remoteLink: 'SKIPPED',
        },
        subtask,
        confluencePage: null,
        remoteLink: null,
      });
    }

    // Step 2 & 3: Create Confluence Page + Link back to Subtask
    let confluencePage = null;
    try {
      confluencePage = await createConfluenceDocPage({
        spaceKey,
        parentPageId,
        workType,
        parentIssueKey,
        parentIssueSummary,
        subtaskKey: subtask.key,
        subtaskSummary: subtask.summary,
        subtaskDescription,
        customPageTitle,
        templateFields,
      });

      const remoteLink = await linkConfluencePageToSubtask({
        subtaskKey: subtask.key,
        confluencePageId: confluencePage.id,
        confluencePageTitle: confluencePage.title,
        confluencePageUrl: confluencePage.url,
      });

      return res.status(201).json({
        status: 'COMPLETED',
        steps: {
          jiraSubtask: 'SUCCESS',
          confluencePage: 'SUCCESS',
          remoteLink: 'SUCCESS',
        },
        subtask,
        confluencePage,
        remoteLink,
      });
    } catch (confluenceError) {
      return res.status(207).json({
        status: 'PARTIAL_FAILURE',
        steps: {
          jiraSubtask: 'SUCCESS',
          confluencePage: confluencePage ? 'SUCCESS' : 'FAILED',
          remoteLink: 'FAILED',
        },
        subtask,
        confluencePage,
        error: {
          message:
            confluenceError.message ||
            'Failed to create or link Confluence Page. Jira Subtask was created.',
          canRetryConfluence: true,
        },
      });
    }
  } catch (err) {
    next(err);
  }
});

/**
 * Batch endpoint to create multiple Jira Subtasks under a single Parent Issue in one click.
 * Returns per-item status so already-created subtasks are locked and any failed item can be retried.
 */
router.post('/workflow/create-batch-subtasks', async (req, res, next) => {
  try {
    const { parentIssueKey, subtasks = [] } = req.body || {};

    if (!parentIssueKey) {
      return res.status(400).json({
        error: { message: 'parentIssueKey is required.' },
      });
    }

    const validSubtasks = (Array.isArray(subtasks) ? subtasks : []).filter(
      (item) => item && String(item.summary || '').trim()
    );

    if (validSubtasks.length === 0) {
      return res.status(400).json({
        error: { message: 'At least one subtask summary is required.' },
      });
    }

    const results = [];
    let successCount = 0;
    let failureCount = 0;

    for (const item of validSubtasks) {
      try {
        const created = await createJiraSubtask({
          parentIssueKey,
          summary: String(item.summary).trim(),
          description: String(item.description || '').trim(),
          workType: item.workType || 'API_DEVELOPMENT',
        });
        successCount += 1;
        results.push({
          id: item.id || null,
          summary: String(item.summary).trim(),
          status: 'SUCCESS',
          subtask: created,
          error: null,
        });
      } catch (itemError) {
        failureCount += 1;
        results.push({
          id: item.id || null,
          summary: String(item.summary).trim(),
          status: 'FAILED',
          subtask: null,
          error: itemError.message || 'Failed to create subtask',
        });
      }
    }

    const statusCode = failureCount > 0 ? 207 : 201;
    return res.status(statusCode).json({
      status: failureCount === 0 ? 'COMPLETED' : 'PARTIAL_FAILURE',
      parentIssueKey,
      totalRequested: validSubtasks.length,
      successCount,
      failureCount,
      results,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Retry endpoint when Jira Subtask already exists:
 * Creates the Confluence page (if not yet created) and links it to the existing subtaskKey.
 */
router.post('/workflow/retry-confluence', async (req, res, next) => {
  try {
    const {
      subtask,
      parentIssueKey,
      parentIssueSummary,
      workType = 'API_DEVELOPMENT',
      subtaskSummary,
      subtaskDescription,
      spaceKey,
      parentPageId,
      customPageTitle,
      templateFields,
      existingConfluencePage = null,
    } = req.body || {};

    const subtaskKey = subtask?.key || req.body?.subtaskKey;
    if (!subtaskKey) {
      return res.status(400).json({
        error: {
          message: 'Existing subtaskKey is required to retry Confluence creation.',
        },
      });
    }

    const config = getConfig();
    const resolvedSubtask = subtask || {
      key: subtaskKey,
      summary: subtaskSummary,
      url: `${config.atlassian.baseUrl}/browse/${subtaskKey}`,
    };

    let confluencePage = existingConfluencePage;

    try {
      if (!confluencePage) {
        confluencePage = await createConfluenceDocPage({
          spaceKey,
          parentPageId,
          workType,
          parentIssueKey,
          parentIssueSummary,
          subtaskKey,
          subtaskSummary: resolvedSubtask.summary || subtaskSummary,
          subtaskDescription,
          customPageTitle,
          templateFields,
        });
      }

      const remoteLink = await linkConfluencePageToSubtask({
        subtaskKey,
        confluencePageId: confluencePage.id,
        confluencePageTitle: confluencePage.title,
        confluencePageUrl: confluencePage.url,
      });

      return res.status(200).json({
        status: 'COMPLETED',
        retried: true,
        steps: {
          jiraSubtask: 'SUCCESS',
          confluencePage: 'SUCCESS',
          remoteLink: 'SUCCESS',
        },
        subtask: resolvedSubtask,
        confluencePage,
        remoteLink,
      });
    } catch (retryError) {
      return res.status(207).json({
        status: 'PARTIAL_FAILURE',
        retried: true,
        steps: {
          jiraSubtask: 'SUCCESS',
          confluencePage: confluencePage ? 'SUCCESS' : 'FAILED',
          remoteLink: 'FAILED',
        },
        subtask: resolvedSubtask,
        confluencePage,
        error: {
          message:
            retryError.message ||
            'Confluence retry failed. You can adjust parameters and retry again without duplicating the Subtask.',
          canRetryConfluence: true,
        },
      });
    }
  } catch (err) {
    next(err);
  }
});

/**
 * Step 1 of Jira -> Confluence Sync:
 * Fetches the latest Jira card context + linked Confluence page and uses Gemini AI
 * to analyze and extract structured specification fields matching the selected template.
 */
router.post('/workflow/sync-analyze', async (req, res, next) => {
  try {
    const { issueKey, confluencePageId, workType } = req.body || {};
    if (!issueKey) {
      return res.status(400).json({
        error: { message: 'Jira issueKey is required for AI sync analysis.' },
      });
    }

    const issueContext = await getJiraIssueSyncContext(issueKey);
    const resolvedPageId =
      confluencePageId || issueContext.linkedConfluencePage?.id || null;

    let currentConfluencePage = null;
    if (resolvedPageId) {
      try {
        currentConfluencePage = await getConfluencePageContent(resolvedPageId);
      } catch {
        currentConfluencePage = null;
      }
    }

    const targetWorkType =
      workType || issueContext.inferredWorkType || 'API_DEVELOPMENT';

    const analysis = await analyzeJiraForConfluenceSync({
      issueContext,
      currentConfluencePage,
      workType: targetWorkType,
    });

    res.json({
      issueContext,
      confluencePage: currentConfluencePage || issueContext.linkedConfluencePage || null,
      analysis,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Step 2 of Jira -> Confluence Sync:
 * Applies the reviewed/edited structured specification to the linked Confluence page.
 */
router.post('/workflow/sync-apply', async (req, res, next) => {
  try {
    const {
      issueKey,
      parentIssueKey,
      parentIssueSummary,
      subtaskSummary,
      subtaskDescription,
      workType = 'API_DEVELOPMENT',
      confluencePageId,
      customPageTitle,
      templateFields,
    } = req.body || {};

    if (!issueKey || !confluencePageId) {
      return res.status(400).json({
        error: {
          message: 'Both issueKey and confluencePageId are required to update Confluence.',
        },
      });
    }

    const updatedPage = await updateConfluenceDocPage({
      pageId: confluencePageId,
      workType,
      parentIssueKey: parentIssueKey || issueKey,
      parentIssueSummary: parentIssueSummary || subtaskSummary,
      subtaskKey: issueKey,
      subtaskSummary: subtaskSummary || issueKey,
      subtaskDescription,
      customPageTitle,
      templateFields,
    });

    // Ensure remote link exists on the Jira issue
    await linkConfluencePageToSubtask({
      subtaskKey: issueKey,
      confluencePageId: updatedPage.id,
      confluencePageTitle: updatedPage.title,
      confluencePageUrl: updatedPage.url,
    }).catch(() => null);

    res.json({
      status: 'SYNCED',
      issueKey,
      confluencePage: updatedPage,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
