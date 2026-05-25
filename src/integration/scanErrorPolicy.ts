export type ScanFlowContext = 'background_non_blocking' | 'user_triggered_single' | 'user_triggered_bulk';

export interface ScanErrorMeta {
	operation: string;
	filePath?: string;
	userMessage?: string;
}

export interface ScanErrorPolicyDeps {
	log: (message: string, error?: unknown) => void;
	notice?: (message: string) => void;
}

function formatErrorContext(meta: ScanErrorMeta): string {
	const fileSuffix = meta.filePath ? ` (${meta.filePath})` : '';
	return `TTasks ${meta.operation} failed${fileSuffix}`;
}

export function handleScanError(
	context: ScanFlowContext,
	error: unknown,
	meta: ScanErrorMeta,
	deps: ScanErrorPolicyDeps,
): void {
	const message = formatErrorContext(meta);
	deps.log(message, error);

	if (context === 'user_triggered_single') {
		deps.notice?.(meta.userMessage ?? 'TTasks: operation completed with warnings. See console.');
	}
}