import React from 'react';

export const RiskVolatilityChart: React.FC<{ volatility: number }> = ({ volatility }) => {
  return (
    <div className="p-6 bg-white rounded-lg shadow-md h-64 flex flex-col items-center justify-center">
      <h3 className="text-lg font-semibold mb-4">Volatility Index</h3>
      <div className="text-4xl font-bold text-gray-700">{volatility}</div>
      <span className="text-sm text-gray-500 mt-2">Standard Deviation</span>
    </div>
  );
};
