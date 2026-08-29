import React, { useState, useEffect } from 'react';
import { AuditDetailModal } from './AuditDetailModal';
import { AuditEvent } from '../../types';

interface AuditTableProps {
  filters: Record<string, string | string[]>;
}

export const AuditTable: React.FC<AuditTableProps> = ({ filters }) => {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<AuditEvent | null>(null);

  useEffect(() => {
    // In a real app, fetch from /api/audit with filters
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (Array.isArray(value)) {
        value.forEach(v => params.append(key, v));
      } else if (value) {
        params.set(key, value);
      }
    });
    const query = params.toString();
    fetch(`/api/audit?${query}`)
      .then(res => res.json())
      .then(data => {
        let filtered = data.events || [];
        // Client-side severity filtering if needed
        if (filters.severity && Array.isArray(filters.severity) && filters.severity.length > 0) {
          filtered = filtered.filter((event: AuditEvent) =>
            filters.severity.includes(event.severity || 'info')
          );
        }
        setEvents(filtered);
      })
      .catch(console.error);
  }, [filters]);

  const getSeverityColor = (severity?: string) => {
    switch (severity) {
      case 'critical':
        return 'text-red-600 bg-red-50';
      case 'warning':
        return 'text-yellow-600 bg-yellow-50';
      default:
        return 'text-blue-600 bg-blue-50';
    }
  };

  return (
    <div>
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Time</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actor</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Action</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Resource</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Severity</th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {events.map((event) => (
            <tr key={event.id} onClick={() => setSelectedEvent(event)} className="cursor-pointer hover:bg-gray-50">
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{new Date(event.createdAt).toLocaleString()}</td>
              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{event.actorId}</td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{event.action}</td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{event.resourceType}:{event.resourceId}</td>
              <td className={`px-6 py-4 whitespace-nowrap text-sm font-medium rounded ${getSeverityColor(event.severity)}`}>
                {(event.severity || 'info').toUpperCase()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {selectedEvent && (
        <AuditDetailModal event={selectedEvent} onClose={() => setSelectedEvent(null)} />
      )}
    </div>
  );
};
