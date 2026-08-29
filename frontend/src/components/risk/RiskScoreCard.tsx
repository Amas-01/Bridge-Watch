import React from 'react';

export const RiskScoreCard: React.FC<{ score: number, level: string }> = ({ score, level }) => {
  const getLevelColor = () => {
    switch(level) {
      case 'LOW': return 'bg-green-100 text-green-800';
      case 'MODERATE': return 'bg-yellow-100 text-yellow-800';
      case 'HIGH': return 'bg-orange-100 text-orange-800';
      case 'CRITICAL': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="p-6 bg-white rounded-lg shadow-md flex flex-col items-center justify-center">
      <h3 className="text-xl font-semibold mb-2">Bridge Risk Score</h3>
      <div className="text-5xl font-bold mb-4">{score}</div>
      <span className={`px-4 py-1 rounded-full text-sm font-bold ${getLevelColor()}`}>
        {level}
      </span>
    </div>
  );
};
