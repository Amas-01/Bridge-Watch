import React, { useState } from 'react';
import { AuditFilters } from '../../../components/audit/AuditFilters';
import { AuditTable } from '../../../components/audit/AuditTable';
import { AuditExportButton } from '../../../components/audit/AuditExportButton';
import { RetentionPolicyCard } from '../../../components/audit/RetentionPolicyCard';

export const AuditTrailPage: React.FC = () => {
  const [filters, setFilters] = useState({});

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Compliance Audit Trail</h1>
        <AuditExportButton filters={filters} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <div className="md:col-span-2">
          <AuditFilters onChange={setFilters} />
        </div>
        <div>
          <RetentionPolicyCard />
        </div>
      </div>

      <div className="bg-white rounded-lg shadow">
        <AuditTable filters={filters} />
      </div>
    </div>
  );
};

export default AuditTrailPage;
