import React from 'react';

interface AuditExportButtonProps {
  filters: Record<string, string>;
}

export const AuditExportButton: React.FC<AuditExportButtonProps> = ({ filters }) => {
  const handleExport = (format: string) => {
    const query = new URLSearchParams({ ...filters, format }).toString();
    window.open(`/api/audit/export?${query}`, '_blank');
  };

  return (
    <div className="flex space-x-2">
      <button onClick={() => handleExport('CSV')} className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700">Export CSV</button>
      <button onClick={() => handleExport('JSON')} className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700">Export JSON</button>
      <button onClick={() => handleExport('PDF')} className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700">Export PDF</button>
    </div>
  );
};
