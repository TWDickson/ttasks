import type { Task } from '../types';

interface FileLike {
	path: string;
	extension: string;
}

export interface TaskStoreSyncQueueDeps<TFileLike extends FileLike = FileLike> {
	shouldTrackPath: (path: string, extension: string) => boolean;
	resolveFileByPath: (path: string) => TFileLike | null;
	parseFile: (file: TFileLike) => Promise<Task | null>;
	applyParsedTasks: (tasks: Task[]) => void;
	onTaskParsed: (task: Task) => Promise<void>;
	log: (message: string) => void;
	delayMs?: number;
}

export class TaskStoreSyncQueue<TFileLike extends FileLike = FileLike> {
	private readonly deps: TaskStoreSyncQueueDeps<TFileLike>;
	private changedPaths = new Set<string>();
	private flushTimer: ReturnType<typeof setTimeout> | null = null;
	private flushInFlight = false;

	constructor(deps: TaskStoreSyncQueueDeps<TFileLike>) {
		this.deps = deps;
	}

	queueFile(file: FileLike): void {
		if (!this.deps.shouldTrackPath(file.path, file.extension)) return;
		this.changedPaths.add(file.path);
		this.scheduleFlush();
	}

	dropPath(path: string): void {
		this.changedPaths.delete(path);
	}

	dispose(): void {
		if (!this.flushTimer) return;
		clearTimeout(this.flushTimer);
		this.flushTimer = null;
	}

	private scheduleFlush(): void {
		if (this.flushTimer) return;
		this.flushTimer = setTimeout(() => {
			this.flushTimer = null;
			void this.flush();
		}, this.deps.delayMs ?? 80);
	}

	private async flush(): Promise<void> {
		if (this.flushInFlight) return;
		if (this.changedPaths.size === 0) return;

		this.flushInFlight = true;
		const startedAt = Date.now();

		try {
			const queuedPaths = [...this.changedPaths];
			this.changedPaths = new Set();

			const files = queuedPaths
				.map((path) => this.deps.resolveFileByPath(path))
				.filter((file): file is TFileLike => file !== null && file.extension === 'md');

			if (files.length === 0) return;

			const parsed = (await Promise.all(files.map((file) => this.deps.parseFile(file))))
				.filter((task): task is Task => task !== null);

			if (parsed.length === 0) return;

			this.deps.applyParsedTasks(parsed);
			await Promise.all(parsed.map((task) => this.deps.onTaskParsed(task)));
			this.deps.log(`flushed ${parsed.length} changed task(s) in ${Date.now() - startedAt}ms`);
		} finally {
			this.flushInFlight = false;
		}

		if (this.changedPaths.size > 0) {
			this.scheduleFlush();
		}
	}
}
