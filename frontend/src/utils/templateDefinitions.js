export const WORK_TYPE_OPTIONS = [
  {
    value: 'API_DEVELOPMENT',
    title: 'API Development',
    subtitle: 'REST/GraphQL Endpoint Specification Template',
    icon: 'mdi-api',
    color: 'primary',
    prefix: '[API]',
    defaultTitlePrefix: 'API Spec',
  },
  {
    value: 'DATABASE_DESIGN',
    title: 'Database Design',
    subtitle: 'Database Schema & ERD Template',
    icon: 'mdi-database-cog-outline',
    color: 'teal-darken-1',
    prefix: '[DB]',
    defaultTitlePrefix: 'DB Design',
  },
];

export const DEFAULT_TEMPLATE_SECTIONS = {
  API_DEVELOPMENT: [
    {
      key: 'overview',
      title: '1. Objective & Context',
      items: ['Business Objective', 'Linked Jira Parent & Subtask', 'Target Service / Module'],
    },
    {
      key: 'endpoint',
      title: '2. Endpoint Specification',
      items: ['HTTP Method & URI Path'],
    },
    {
      key: 'request',
      title: '3. Request Contract',
      items: [
        '3.1 Headers & Parameters (Header/Path/Query/Body, Mandatory/Optional, Example Value)',
        '3.2 Sample Request Payload',
      ],
    },
    {
      key: 'response',
      title: '4. Response Contract & Error Codes',
      items: [
        '4.1 Response Fields (Mandatory/Optional, Example Value, Description)',
        '4.2 Sample Response Payload',
        '4.3 Status & Error Codes',
      ],
    },
    {
      key: 'sequenceDiagram',
      title: '5. Sequence Diagram',
      items: [],
    },
  ],
  DATABASE_DESIGN: [
    {
      key: 'overview',
      title: '1. Overview & Data Purpose',
      items: ['Business Requirement', 'Linked Jira Parent & Subtask', 'Database Engine & Schema Name'],
    },
    {
      key: 'erd',
      title: '2. Entity Relationship & Schema Summary',
      items: ['Target Tables & Relationships', 'Data Retention / Archival Policy'],
    },
    {
      key: 'columns',
      title: '3. Table & Column Definitions',
      items: ['Column Name, Data Type, Nullability, Default Value, Description'],
    },
    {
      key: 'indexes',
      title: '4. Primary Keys, Foreign Keys & Indexes',
      items: ['Index Name, Columns, Uniqueness, Query Access Pattern'],
    },
  ],
};

export function computeLivePageTitle({
  subtaskKey,
  workType,
  subtaskSummary,
  customPageTitle,
}) {
  if (customPageTitle && customPageTitle.trim()) {
    const trimmed = customPageTitle.trim();
    if (trimmed.includes('[NEW-SUBTASK]')) {
      return trimmed.replace('[NEW-SUBTASK]', '').trim();
    }
    return trimmed;
  }

  const workOption =
    WORK_TYPE_OPTIONS.find((item) => item.value === workType) || WORK_TYPE_OPTIONS[0];
  const cleanSummary = (subtaskSummary || 'Untitled Subtask')
    .replace(/^\[(API|DB)\]\s*/i, '')
    .trim();

  return `${workOption.defaultTitlePrefix}: ${cleanSummary || 'Untitled Subtask'}`;
}
