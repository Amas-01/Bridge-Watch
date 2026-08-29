import React from 'react';
import { RiskHistoryPoint } from '../../types';

export const RiskTrendChart: React.FC<{ history: RiskHistoryPoint[] }> = ({ history }) => {
  // Simulating chart view using history
  const historyLength = history?.length ?? 0;
  return (
    <div className="p-6 bg-white rounded-lg shadow-md h-64 flex items-center justify-center">
      <span className="text-gray-500 italic">Risk Trend Chart Placeholder ({historyLength} data points)</span>
    </div>
  );
};
