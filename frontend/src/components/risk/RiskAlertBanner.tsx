import React from 'react';

export const RiskAlertBanner: React.FC<{ level: string }> = ({ level }) => {
  if (level !== 'CRITICAL') return null;

  return (
    <div className="bg-red-600 text-white p-4 rounded-lg shadow-md mb-6 flex justify-between items-center">
      <div className="flex items-center">
        <svg className="w-6 h-6 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
        <span className="font-bold">CRITICAL RISK ALERT:</span> 
        <span className="ml-2">This bridge's risk score has exceeded the critical threshold.</span>
      </div>
      <button className="bg-white text-red-600 font-bold px-3 py-1 rounded text-sm hover:bg-red-50">Review</button>
    </div>
  );
};
