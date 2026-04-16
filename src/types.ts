export type TaskStatus = string;
export type TaskPriority = 'High' | 'Medium' | 'Low' | 'None';
export type TaskType = string;
export type TaskRecordType = 'task' | 'project';

export interface Task {
	// File metadata
	id: string;        // 6hex portion of filename
	slug: string;      // slug portion of filename
	path: string;      // full vault path

	// Core fields
	type: TaskRecordType;
	name: string;
	category: string | null;
	status: TaskStatus;
	priority: TaskPriority;
	task_type: TaskType | null;

	// Relationships (stored as vault paths, without extension)
	parent_task: string | null;
	depends_on: string[];
	blocks: string[];
	blocked_reason: string;

	// Assignment
	assigned_to: string;
	source: string;

	// Dates (YYYY-MM-DD strings)
	start_date: string | null;
	due_date: string | null;
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

	// Derived flags — computed at load time from status + settings, not stored in frontmatter
	is_complete: boolean;
	is_inbox: boolean;
}

export type TaskCreateInput = Omit<Task, 'id' | 'slug' | 'path' | 'blocks' | 'is_complete' | 'is_inbox' | 'status_changed'>;
