export type CommandAction = {
  id: string;
  title: string;
  href?: string;
  keywords?: string[];
  onExecute?: () => void;
};

export const actionsRegistry: CommandAction[] = [];

export function registerAction(action: CommandAction) {
  actionsRegistry.push(action);
}
