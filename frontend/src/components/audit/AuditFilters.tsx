import React, { useState } from 'react';

interface AuditFiltersProps {
  onChange: (filters: Record<string, string | string[]>) => void;
}

export const AuditFilters: React.FC<AuditFiltersProps> = ({ onChange }) => {
  const [selectedSeverities, setSelectedSeverities] = useState<string[]>([]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    onChange({ [e.target.name]: e.target.value });
  };

  const handleSeverityChange = (severity: string) => {
    const updated = selectedSeverities.includes(severity)
      ? selectedSeverities.filter(s => s !== severity)
      : [...selectedSeverities, severity];
    setSelectedSeverities(updated);
    onChange({ severity: updated });
  };

  return (
    <div className="bg-white p-4 rounded-lg shadow space-y-4">
      <div className="flex flex-wrap gap-4">
        <input type="date" name="from" onChange={handleChange} className="border p-2 rounded" title="From Date" />
        <input type="date" name="to" onChange={handleChange} className="border p-2 rounded" title="To Date" />
        <input type="text" name="actor" placeholder="Actor ID" onChange={handleChange} className="border p-2 rounded" />
        <input type="text" name="action" placeholder="Action" onChange={handleChange} className="border p-2 rounded" />
        <input type="text" name="resource" placeholder="Resource Type" onChange={handleChange} className="border p-2 rounded" />
      </div>
      <div className="flex items-center gap-4">
        <span className="text-sm font-medium text-gray-700">Severity:</span>
        {['info', 'warning', 'critical'].map((severity) => (
          <label key={severity} className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={selectedSeverities.includes(severity)}
              onChange={() => handleSeverityChange(severity)}
              className="rounded border-gray-300"
            />
            <span className="text-sm capitalize text-gray-700">{severity}</span>
          </label>
        ))}
      </div>
    </div>
  );
};
