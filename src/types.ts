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

	// Free-form body content (everything after frontmatter)
	notes: string;
}

export type TaskCreateInput = Omit<Task, 'id' | 'slug' | 'path' | 'blocks'>;
