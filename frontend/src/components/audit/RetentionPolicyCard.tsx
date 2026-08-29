import React from 'react';

export const RetentionPolicyCard: React.FC = () => {
  return (
    <div className="bg-white p-4 rounded-lg shadow">
      <h3 className="text-lg font-bold text-gray-900 mb-2">Retention Policies</h3>
      <ul className="text-sm text-gray-600 space-y-2">
        <li className="flex justify-between"><span>Security Events:</span> <span className="font-medium">7 Years</span></li>
        <li className="flex justify-between"><span>Operational:</span> <span className="font-medium">2 Years</span></li>
        <li className="flex justify-between"><span>Analytics:</span> <span className="font-medium">1 Year</span></li>
      </ul>
    </div>
  );
};
