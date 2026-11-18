function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function isEmptyJsonObjectPayload(raw = '') {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return false;
  if (trimmed === '{}') return true;
  try {
    const parsed = JSON.parse(trimmed);
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

export const WORK_TYPES = {
  API_DEVELOPMENT: 'API_DEVELOPMENT',
  DATABASE_DESIGN: 'DATABASE_DESIGN',
};

export const REQUIRED_API_HEADERS = [
  {
    name: 'Authorization',
    location: 'Header',
    type: 'String',
    mandatory: 'Mandatory',
    example: '******',
    description: 'JWE Token (สามารถแกะ memberId ออกมาได้)',
  },
  {
    name: 'Accept-Language',
    location: 'Header',
    type: 'String',
    mandatory: 'Mandatory',
    example: 'th / en',
    description: 'Language preference (th/en)',
  },
  {
    name: 'Content-Type',
    location: 'Header',
    type: 'String',
    mandatory: 'Mandatory',
    example: 'application/json',
    description: 'JSON request content type',
  },
];

export function ensureRequiredApiHeaders(headersAndParams = []) {
  const baseParams = Array.isArray(headersAndParams)
    ? headersAndParams.map((item) => ({ ...item }))
    : [];

  const requiredHeaderNames = new Set(
    REQUIRED_API_HEADERS.map((h) => h.name.toLowerCase())
  );

  const mergedStandardHeaders = REQUIRED_API_HEADERS.map((reqHeader) => {
    const existing = baseParams.find(
      (item) =>
        String(item?.name || '').trim().toLowerCase() === reqHeader.name.toLowerCase() &&
        String(item?.location || 'Header').trim().toLowerCase() === 'header'
    );
    return {
      name: reqHeader.name,
      location: 'Header',
      type: existing?.type || reqHeader.type,
      mandatory: existing?.mandatory || reqHeader.mandatory,
      example: existing?.example || reqHeader.example,
      description: existing?.description || reqHeader.description,
    };
  });

  const otherParams = baseParams.filter(
    (item) =>
      !(
        requiredHeaderNames.has(String(item?.name || '').trim().toLowerCase()) &&
        String(item?.location || 'Header').trim().toLowerCase() === 'header'
      )
  );

  return [...mergedStandardHeaders, ...otherParams];
}

export const REQUIRED_DB_AUDIT_COLUMNS = [
  {
    name: 'created_at',
    dataType: 'DATETIME2',
    nullable: 'NO',
    defaultValue: 'SYSDATETIME()',
    description: 'Record creation timestamp',
  },
  {
    name: 'updated_at',
    dataType: 'DATETIME2',
    nullable: 'NO',
    defaultValue: 'SYSDATETIME()',
    description: 'Record last updated timestamp',
  },
  {
    name: 'created_by',
    dataType: 'VARCHAR(50)',
    nullable: 'NO',
    defaultValue: '-',
    description: 'User or system that created the record',
  },
  {
    name: 'updated_by',
    dataType: 'VARCHAR(50)',
    nullable: 'NO',
    defaultValue: '-',
    description: 'User or system that last updated the record',
  },
];

export function ensureRequiredDbColumns(columns = []) {
  const baseColumns =
    Array.isArray(columns) && columns.length > 0
      ? columns.map((col) => ({ ...col }))
      : [
          {
            name: 'id',
            dataType: 'BIGINT IDENTITY(1,1) / UNIQUEIDENTIFIER',
            nullable: 'NO',
            defaultValue: 'Generated',
            description: 'Primary key identifier',
          },
        ];

  const requiredNames = new Set(
    REQUIRED_DB_AUDIT_COLUMNS.map((c) => c.name.toLowerCase())
  );

  // Keep non-audit columns first in their original order, then append the 4 mandatory audit columns in consistent order
  const nonAuditColumns = baseColumns.filter(
    (col) => !requiredNames.has(String(col?.name || '').trim().toLowerCase())
  );

  const mergedAuditColumns = REQUIRED_DB_AUDIT_COLUMNS.map((reqCol) => {
    const existing = baseColumns.find(
      (col) => String(col?.name || '').trim().toLowerCase() === reqCol.name.toLowerCase()
    );
    return {
      name: reqCol.name,
      dataType: reqCol.dataType,
      nullable: existing?.nullable || reqCol.nullable,
      defaultValue: existing?.defaultValue || reqCol.defaultValue,
      description: existing?.description || reqCol.description,
    };
  });

  return [...nonAuditColumns, ...mergedAuditColumns];
}

export const TEMPLATE_METADATA = {
  [WORK_TYPES.API_DEVELOPMENT]: {
    id: WORK_TYPES.API_DEVELOPMENT,
    name: 'API Development',
    workTypeLabel: 'API Development',
    subtaskPrefix: '[API]',
    defaultTitlePrefix: 'API Spec',
    description:
      'Technical specification for designing or updating REST/GraphQL endpoints, payload schemas, error codes, and security controls.',
    sections: [
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
  },
  [WORK_TYPES.DATABASE_DESIGN]: {
    id: WORK_TYPES.DATABASE_DESIGN,
    name: 'Database Design',
    workTypeLabel: 'Database Design',
    subtaskPrefix: '[DB]',
    defaultTitlePrefix: 'DB Design',
    description:
      'Database schema specification covering tables, columns, indexes, and relationships.',
    sections: [
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
  },
};

export function buildConfluencePageTitle({ subtaskKey, workType, subtaskSummary, customPageTitle }) {
  if (customPageTitle && customPageTitle.trim()) {
    const trimmed = customPageTitle.trim();
    if (trimmed.includes('[NEW-SUBTASK]')) {
      return trimmed.replace('[NEW-SUBTASK]', '').trim();
    }
    return trimmed;
  }

  const meta = TEMPLATE_METADATA[workType] || TEMPLATE_METADATA[WORK_TYPES.API_DEVELOPMENT];
  const cleanSummary = (subtaskSummary || 'Untitled Task')
    .replace(/^\[(API|DB)\]\s*/i, '')
    .trim();
  return `${meta.defaultTitlePrefix}: ${cleanSummary}`;
}

export function buildConfluenceStorageHtml({
  workType,
  parentIssueKey,
  parentIssueSummary,
  subtaskKey,
  subtaskSummary,
  subtaskDescription,
  jiraSubtaskUrl,
  jiraParentUrl,
  templateFields = {},
}) {
  const safeParentKey = escapeHtml(parentIssueKey || 'N/A');
  const safeParentSummary = escapeHtml(parentIssueSummary || '');
  const safeSubtaskKey = escapeHtml(subtaskKey || 'PENDING');
  const safeSubtaskSummary = escapeHtml(subtaskSummary || '');
  const safeDescription = escapeHtml(subtaskDescription || 'No additional description provided.');
  const safeSubtaskUrl = escapeHtml(jiraSubtaskUrl || '#');
  const safeParentUrl = escapeHtml(jiraParentUrl || '#');

  const commonMetadataPanel = `
    <table>
      <tbody>
        <tr>
          <th>Parent Issue</th>
          <td><a href="${safeParentUrl}">${safeParentKey}</a> — ${safeParentSummary}</td>
          <th>Subtask</th>
          <td><a href="${safeSubtaskUrl}">${safeSubtaskKey}</a> — ${safeSubtaskSummary}</td>
        </tr>
        <tr>
          <th>Status</th>
          <td colspan="3"><ac:structured-macro ac:name="status"><ac:parameter ac:name="title">DRAFT</ac:parameter><ac:parameter ac:name="colour">Blue</ac:parameter></ac:structured-macro></td>
        </tr>
      </tbody>
    </table>
  `;

  if (workType === WORK_TYPES.DATABASE_DESIGN) {
    const dbEngine = 'SQL Server';
    const schemaName = escapeHtml(templateFields.schemaName || 'dbo');
    const tableName = escapeHtml(templateFields.tableName || 'sample_entity_table');
    const erdSummary = escapeHtml(
      templateFields.erdSummary ||
        `Describe how ${templateFields.tableName || 'sample_entity_table'} relates to existing domain entities and data lifecycle rules.`
    );

    const columns = ensureRequiredDbColumns(templateFields.columns);

    const columnRowsHtml = columns
      .map(
        (col) => `
          <tr>
            <td><code>${escapeHtml(col.name || '')}</code></td>
            <td><code>${escapeHtml(col.dataType || '')}</code></td>
            <td>${escapeHtml(col.nullable || 'NO')}</td>
            <td><code>${escapeHtml(col.defaultValue || '-')}</code></td>
            <td>${escapeHtml(col.description || '')}</td>
          </tr>`
      )
      .join('');

    const indexes =
      Array.isArray(templateFields.indexes) && templateFields.indexes.length > 0
        ? templateFields.indexes
        : [
            {
              name: `pk_${templateFields.tableName || 'sample_entity_table'}`,
              type: 'PRIMARY KEY',
              columns: '(id)',
              notes: 'Unique row lookup',
            },
            {
              name: `idx_${templateFields.tableName || 'sample_entity_table'}_created_at`,
              type: 'INDEX (B-Tree)',
              columns: '(created_at DESC)',
              notes: 'Pagination and date-range filtering',
            },
          ];

    const indexRowsHtml = indexes
      .map(
        (idx) => `
          <tr>
            <td><code>${escapeHtml(idx.name || '')}</code></td>
            <td>${escapeHtml(idx.type || 'INDEX')}</td>
            <td><code>${escapeHtml(idx.columns || '')}</code></td>
            <td>${escapeHtml(idx.notes || '')}</td>
          </tr>`
      )
      .join('');

    return `
      ${commonMetadataPanel}
      <h2>1. Overview &amp; Data Purpose</h2>
      <p>${safeDescription}</p>
      <table>
        <tbody>
          <tr>
            <th>Database Engine</th>
            <td>${dbEngine}</td>
            <th>Schema Name</th>
            <td><code>${schemaName}</code></td>
          </tr>
          <tr>
            <th>Primary Table(s)</th>
            <td colspan="3"><code>${tableName}</code></td>
          </tr>
        </tbody>
      </table>

      <h2>2. Entity Relationship &amp; Schema Summary</h2>
      <p>${erdSummary}</p>

      <h2>3. Table &amp; Column Definitions (<code>${tableName}</code>)</h2>
      <table>
        <thead>
          <tr>
            <th>Column Name</th>
            <th>Data Type</th>
            <th>Nullable</th>
            <th>Default</th>
            <th>Description</th>
          </tr>
        </thead>
        <tbody>${columnRowsHtml}
        </tbody>
      </table>

      <h2>4. Primary Keys, Foreign Keys &amp; Indexes</h2>
      <table>
        <thead>
          <tr>
            <th>Index / Constraint Name</th>
            <th>Type</th>
            <th>Columns</th>
            <th>Access Pattern / Notes</th>
          </tr>
        </thead>
        <tbody>${indexRowsHtml}
        </tbody>
      </table>
    `.trim();
  }

  // Default: API Development Template
  const httpMethod = escapeHtml(templateFields.httpMethod || 'POST');
  const endpointPath = escapeHtml(templateFields.endpointPath || '/api/v1/resource');
  const serviceName = escapeHtml(templateFields.serviceName || 'Core Backend Service');

  const headersAndParams = ensureRequiredApiHeaders(templateFields.headersAndParams);

  const headersRowsHtml = headersAndParams
    .map((param) => {
      const mandatoryVal =
        param.mandatory ||
        (String(param.required || '').toLowerCase() === 'no' ? 'Optional' : 'Mandatory');
      const exampleVal = param.example !== undefined && param.example !== '' ? String(param.example) : '-';
      return `
        <tr>
          <td><code>${escapeHtml(param.name || '')}</code></td>
          <td>${escapeHtml(param.location || 'Body')}</td>
          <td><code>${escapeHtml(param.type || 'String')}</code></td>
          <td><strong>${escapeHtml(mandatoryVal)}</strong></td>
          <td><code>${escapeHtml(exampleVal)}</code></td>
          <td>${escapeHtml(param.description || '')}</td>
        </tr>`;
    })
    .join('');

  const requestPayloadRaw =
    typeof templateFields.requestPayloadJson === 'string' &&
    templateFields.requestPayloadJson.trim()
      ? templateFields.requestPayloadJson.trim()
      : JSON.stringify({}, null, 2);

  const isResponsePayloadEmptyObject = isEmptyJsonObjectPayload(
    templateFields.responsePayloadJson
  );

  const responseFields = isResponsePayloadEmptyObject
    ? []
    : Array.isArray(templateFields.responseFields)
      ? templateFields.responseFields
      : [
          {
            name: 'code',
            type: 'String',
            mandatory: 'Mandatory',
            example: 'SUCCESS',
            description: 'Response status code',
          },
          {
            name: 'data',
            type: 'Object',
            mandatory: 'Optional',
            example: '{}',
            description: 'Response business payload',
          },
        ];

  const responseFieldsRowsHtml = responseFields
    .map((field) => {
      const mandatoryVal =
        field.mandatory ||
        (String(field.required || '').toLowerCase() === 'no' ? 'Optional' : 'Mandatory');
      const exampleVal = field.example !== undefined && field.example !== '' ? String(field.example) : '-';
      return `
        <tr>
          <td><code>${escapeHtml(field.name || field.field || '')}</code></td>
          <td><code>${escapeHtml(field.type || 'String')}</code></td>
          <td><strong>${escapeHtml(mandatoryVal)}</strong></td>
          <td><code>${escapeHtml(exampleVal)}</code></td>
          <td>${escapeHtml(field.description || '')}</td>
        </tr>`;
    })
    .join('');

  const responsePayloadRaw =
    typeof templateFields.responsePayloadJson === 'string' &&
    templateFields.responsePayloadJson.trim()
      ? templateFields.responsePayloadJson.trim()
      : JSON.stringify(
          {
            code: 'SUCCESS',
            data: {},
          },
          null,
          2
        );

  const statusCodes =
    Array.isArray(templateFields.statusCodes) && templateFields.statusCodes.length > 0
      ? templateFields.statusCodes
      : [
          {
            httpStatus: '200 / 201',
            errorCode: 'SUCCESS',
            scenario: 'Operation completed successfully',
          },
          {
            httpStatus: '400',
            errorCode: 'INVALID_REQUEST',
            scenario: 'Validation error or malformed payload',
          },
          {
            httpStatus: '401 / 403',
            errorCode: 'UNAUTHORIZED',
            scenario: 'Missing or insufficient permissions',
          },
          {
            httpStatus: '500',
            errorCode: 'INTERNAL_ERROR',
            scenario: 'Unexpected downstream or server error',
          },
        ];

  const statusRowsHtml = statusCodes
    .map(
      (row) => `
        <tr>
          <td><code>${escapeHtml(row.httpStatus || '')}</code></td>
          <td><code>${escapeHtml(row.errorCode || '')}</code></td>
          <td>${escapeHtml(row.scenario || '')}</td>
        </tr>`
    )
    .join('');

  return `
    ${commonMetadataPanel}
    <h2>1. Objective &amp; Context</h2>
    <p>${safeDescription}</p>
    <p><strong>Target Service:</strong> ${serviceName}</p>

    <h2>2. Endpoint Specification</h2>
    <table>
      <thead>
        <tr>
          <th>HTTP Method</th>
          <th>URI Path</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td><strong><code>${httpMethod}</code></strong></td>
          <td><code>${endpointPath}</code></td>
        </tr>
      </tbody>
    </table>

    <h2>3. Request Contract</h2>
    <h3>3.1 Headers &amp; Parameters</h3>
    <table>
      <thead>
        <tr>
          <th>Name</th>
          <th>Location</th>
          <th>Type</th>
          <th>Mandatory / Optional</th>
          <th>Example Value</th>
          <th>Description</th>
        </tr>
      </thead>
      <tbody>${headersRowsHtml}
      </tbody>
    </table>
    <h3>3.2 Sample Request Payload</h3>
    <ac:structured-macro ac:name="code">
      <ac:parameter ac:name="language">json</ac:parameter>
      <ac:plain-text-body><![CDATA[${requestPayloadRaw.replace(/\]\]>/g, ']]]]><![CDATA[>')}]]></ac:plain-text-body>
    </ac:structured-macro>

    <h2>4. Response Contract &amp; Error Codes</h2>
    <h3>4.1 Response Fields</h3>
    <table>
      <thead>
        <tr>
          <th>Name</th>
          <th>Type</th>
          <th>Mandatory / Optional</th>
          <th>Example Value</th>
          <th>Description</th>
        </tr>
      </thead>
      <tbody>${responseFieldsRowsHtml}
      </tbody>
    </table>
    <h3>4.2 Sample Response Payload</h3>
    <ac:structured-macro ac:name="code">
      <ac:parameter ac:name="language">json</ac:parameter>
      <ac:plain-text-body><![CDATA[${responsePayloadRaw.replace(/\]\]>/g, ']]]]><![CDATA[>')}]]></ac:plain-text-body>
    </ac:structured-macro>
    <h3>4.3 Status &amp; Error Codes</h3>
    <table>
      <thead>
        <tr>
          <th>HTTP Status</th>
          <th>Error Code / Class</th>
          <th>Scenario</th>
        </tr>
      </thead>
      <tbody>${statusRowsHtml}
      </tbody>
    </table>

    <h2>5. Sequence Diagram</h2>
    <p></p>
  `.trim();
}
