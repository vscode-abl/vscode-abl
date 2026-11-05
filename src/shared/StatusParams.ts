/**
 * Types for the proparse/status notification from the language server.
 */

/**
 * Detailed status for a single project.
 */
export interface ProjectStatus {
  /** Project name */
  name: string;
  /** Project version */
  version: string;
  /** Current active profile */
  profile: string;
  /** Whether the project has been initialized */
  initialized: boolean;
  /** Whether this is a static project (no AVM workers) */
  staticProject: boolean;
  /** Whether the project is read-only */
  readOnly: boolean;
  /** Number of AVM threads configured */
  configuredThreads: number;
  /** Number of currently active AVM sessions */
  activeAvmSessions: number;
  /** Number of pending tasks in the queue */
  pendingTasks: number;
}

/**
 * Status parameters sent by the language server.
 */
export interface StatusParams {
  /** Legacy: list of project names with version and profile */
  projects: string[];
  /** Legacy: number of initialized projects */
  numInitializedProjects: number;
  /** Legacy: total pending tasks */
  pendingTasks: number;
  /** New: detailed status per project */
  projectDetails?: ProjectStatus[];
}

/**
 * Determines the overall status severity based on project details.
 */
export type StatusSeverity = 'ok' | 'warning';

/**
 * Analyzes project status and returns the severity level.
 */
export function getProjectSeverity(project: ProjectStatus): StatusSeverity {
  if (!project.initialized) {
    return 'warning'; // Project still initializing
  }
  if (
    !project.staticProject &&
    project.activeAvmSessions < project.configuredThreads
  ) {
    return 'warning'; // Not all AVM sessions are running
  }
  return 'ok';
}

/**
 * Returns the overall severity for all projects.
 */
export function getOverallSeverity(projects: ProjectStatus[]): StatusSeverity {
  if (projects.length === 0) {
    return 'warning';
  }
  for (const project of projects) {
    if (getProjectSeverity(project) === 'warning') {
      return 'warning';
    }
  }
  return 'ok';
}

/**
 * Returns the status label for a project based on its severity.
 */
function getProjectStatusLabel(project: ProjectStatus): string {
  const severity = getProjectSeverity(project);
  if (severity === 'warning') {
    return ' [WARNING]';
  }
  return '';
}

/**
 * Generates a detailed tooltip for a project.
 */
export function formatProjectTooltip(project: ProjectStatus): string {
  const lines: string[] = [];
  const statusLabel = getProjectStatusLabel(project);
  lines.push(
    `📦 ${project.name} ${project.version} [${project.profile}]${statusLabel}`,
  );

  if (!project.initialized) {
    lines.push('  ⏳ Initializing...');
  } else {
    lines.push('  ✅ Initialized');
  }

  if (project.staticProject) {
    lines.push('  📄 Static mode (no AVM)');
  } else {
    const avmStatus =
      project.activeAvmSessions === project.configuredThreads
        ? '✅'
        : project.activeAvmSessions === 0
          ? '❌'
          : '⚠️';
    lines.push(
      `  ${avmStatus} AVM: ${project.activeAvmSessions}/${project.configuredThreads} sessions`,
    );
  }

  if (project.readOnly) {
    lines.push('  🔒 Read-only');
  }

  if (project.pendingTasks > 0) {
    lines.push(`  📋 ${project.pendingTasks} pending task(s)`);
  }

  return lines.join('\n');
}

/**
 * Returns the appropriate icon for the status bar based on severity.
 */
export function getStatusIcon(severity: StatusSeverity): string {
  if (severity === 'warning') {
    return '$(warning)';
  }
  return '';
}

/**
 * Counts projects by severity.
 */
export interface SeverityCounts {
  ok: number;
  warning: number;
  total: number;
}

/**
 * Returns counts of projects by severity level.
 */
export function countProjectsBySeverity(
  projects: ProjectStatus[],
): SeverityCounts {
  const counts: SeverityCounts = { ok: 0, warning: 0, total: 0 };
  for (const project of projects) {
    const severity = getProjectSeverity(project);
    counts[severity]++;
    counts.total++;
  }
  return counts;
}

/**
 * Builds a status bar text showing project counts with issues.
 */
export function buildStatusText(
  counts: SeverityCounts,
  pendingTasks: number,
): string {
  const parts: string[] = [];

  // Add icon if there are warnings
  if (counts.warning > 0) {
    parts.push('$(warning)');
  }

  // Build project status text
  if (counts.total === 0) {
    parts.push('No projects');
  } else if (counts.warning === 0) {
    // All OK
    parts.push(`${counts.total} project(s)`);
  } else {
    // Show x/y format when there are issues
    parts.push(`${counts.ok}/${counts.total} project(s)`);
  }

  // Add pending tasks
  parts.push('•');
  parts.push(`${pendingTasks} task(s)`);

  return parts.join(' ');
}
