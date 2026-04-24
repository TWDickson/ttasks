export type TaskStatus = string;
export type TaskPriority = 'High' | 'Medium' | 'Low' | 'None';
export type TaskRecordType = 'task' | 'project';

export interface Task {
	// File metadata
	id: string;        // 6hex portion of filename
	slug: string;      // slug portion of filename
	path: string;      // full vault path

	// Core fields
	type: TaskRecordType;
	name: string;
	// Area = line of work (Database, General, Work, Home). null = unclassified / inbox.
	area: string | null;
	status: TaskStatus;
	priority: TaskPriority;
	// Multi-value cross-cutting labels (feature, bug, research, etc.). User-configurable.
	labels: string[];

	// Relationships (stored as vault paths, without extension)
	parent_task: string | null;
	depends_on: string[];
	blocks: string[];
	blocked_reason: string;

	// Assignment
	assigned_to: string;
	source: string;

	// Dates (YYYY-MM-DD strings) and optional time (HH:MM)
	start_date: string | null;
	due_date: string | null;
	due_time: string | null;
	estimated_days: number | null;
	created: string | null;
	completed: string | null;
	// Set whenever status changes; used by stale-in-progress reminder (more reliable than start_date proxy)
	status_changed: string | null;

	// Recurrence (stored in frontmatter; null = no recurrence)
	recurrence: string | null;
	// 'fixed' = advance from due_date (default); 'from_completion' = advance from completion date
	recurrence_type: string | null;

	// Free-form body content (everything after frontmatter)
	notes: string;

	// Derived flags — computed at load time, not stored in frontmatter
	is_complete: boolean;
	is_inbox: boolean;  // true when area is null (task hasn't been classified into a line of work)
}

export type TaskCreateInput = Omit<Task, 'id' | 'slug' | 'path' | 'blocks' | 'is_complete' | 'is_inbox' | 'status_changed'>;
