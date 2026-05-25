export interface SettingsHost {
	setting?: {
		open?: () => void;
		openTabById?: (id: string) => void;
	};
	commands?: {
		executeCommandById?: (id: string) => void;
	};
}
