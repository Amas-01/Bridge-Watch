import React from 'react';

interface Factors {
  reserveBacking: number;
  operatorReputation: number;
  transactionHistory: number;
  anomalyFrequency: number;
  resolutionTime: number;
}

export const RiskFactorBreakdown: React.FC<{ factors: Factors }> = ({ factors }) => {
  const renderBar = (label: string, value: number) => (
    <div className="mb-4">
      <div className="flex justify-between mb-1">
        <span className="text-sm font-medium text-gray-700">{label}</span>
        <span className="text-sm font-medium text-gray-700">{value}/100</span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-2.5">
        <div className="bg-blue-600 h-2.5 rounded-full" style={{ width: `${value}%` }}></div>
      </div>
    </div>
  );

  return (
    <div className="p-6 bg-white rounded-lg shadow-md">
      <h3 className="text-lg font-semibold mb-4">Risk Factors</h3>
      {renderBar("Reserve Backing (35%)", factors.reserveBacking)}
      {renderBar("Operator Reputation (20%)", factors.operatorReputation)}
      {renderBar("Transaction History (15%)", factors.transactionHistory)}
      {renderBar("Anomaly Frequency (20%)", factors.anomalyFrequency)}
      {renderBar("Resolution Time (10%)", factors.resolutionTime)}
    </div>
  );
};
