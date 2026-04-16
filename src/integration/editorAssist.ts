import type { Task } from '../types';

function byNameAsc(a: Task, b: Task): number {
	return a.name.localeCompare(b.name);
}

export function filterTaskSuggestions(query: string, tasks: Task[]): Task[] {
	const trimmed = query.trim().toLowerCase();
	if (!trimmed) {
		return [...tasks].sort(byNameAsc);
	}

	const startsWith: Task[] = [];
	const contains: Task[] = [];

	for (const task of tasks) {
		const name = task.name.toLowerCase();
		if (name.startsWith(trimmed)) {
			startsWith.push(task);
			continue;
		}
		if (name.includes(trimmed)) {
			contains.push(task);
		}
	}

	startsWith.sort(byNameAsc);
	contains.sort(byNameAsc);
	return [...startsWith, ...contains];
}
