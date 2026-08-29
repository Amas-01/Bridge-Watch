import React from "react";
import { useAuth } from "../../context/AuthContext";
import { LockClosedIcon } from "@heroicons/react/24/solid";

interface ActionDef {
  id: string;
  label: string;
  description?: string;
  requiredRole?: "Viewer" | "Operator" | "SuperAdmin";
  destructive?: boolean;
  confirmationPhrase?: string;
}

interface Props {
  action: ActionDef;
  onExecute: (action: ActionDef) => Promise<void> | void;
}

export const ActionShortcutButton: React.FC<Props> = ({ action, onExecute }) => {
  const { hasRole } = useAuth();
  const allowed = action.requiredRole ? hasRole(action.requiredRole) : true;
  const [loading, setLoading] = React.useState(false);

  const handleClick = async () => {
    if (!allowed) return;
    setLoading(true);
    try {
      await onExecute(action);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`p-3 rounded border ${allowed ? 'bg-white dark:bg-slate-800' : 'bg-slate-50 dark:bg-slate-700 opacity-70'} shadow-sm`}>
      <button
        onClick={handleClick}
        disabled={!allowed || loading}
        className="w-full text-left flex items-center gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="font-medium text-slate-800 dark:text-white">{action.label}</span>
            {action.destructive && <span className="ml-2 text-xs text-red-600">DESTRUCTIVE</span>}
          </div>
          {action.description && <div className="text-xs text-slate-500">{action.description}</div>}
        </div>
        <div>
          {!allowed ? <LockClosedIcon className="w-5 h-5 text-slate-400" /> : loading ? <span className="text-xs">Running...</span> : <span className="text-xs text-slate-400">Run</span>}
        </div>
      </button>
    </div>
  );
};
