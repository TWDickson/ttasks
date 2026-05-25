import type { Task } from '../types';

export interface ExternalTaskLocation {
	filePath: string;
	line: number;
}

export interface ExternalTask extends Task {
	external: true;
	source_type: 'captured-checkbox';
	location: ExternalTaskLocation;
	fromPreviousDay?: boolean;
}
