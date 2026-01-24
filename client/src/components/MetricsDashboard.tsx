/**
 * Metrics Dashboard Component
 * 
 * Displays aggregate system metrics with charts and statistics.
 * Following industry standards (Oct 2025) with proper UX patterns.
 */

import { useEffect, useState } from 'react';
import { invoiceAPI, type MetricsResponse } from '../services/invoice.api';

const MetricsDashboard = () => {
  const [metrics, setMetrics] = useState<MetricsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadMetrics();
    // Refresh every 30 seconds
    const interval = setInterval(loadMetrics, 30000);
    return () => clearInterval(interval);
  }, []);

  const loadMetrics = async () => {
    try {
      setLoading(true);
      const data = await invoiceAPI.getMetrics();
      setMetrics(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load metrics');
    } finally {
      setLoading(false);
    }
  };

  if (loading && !metrics) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#00FFD8]"></div>
      </div>
    );
  }

  if (error && !metrics) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <p className="text-red-800">{error}</p>
      </div>
    );
  }

  if (!metrics) return null;

  const MetricCard = ({
    title,
    value,
    subtitle,
    icon,
  }: {
    title: string;
    value: string | number;
    subtitle?: string;
    icon: string;
  }) => (
    <div className="bg-white rounded-lg shadow-md p-6 border-l-4 border-[#00FFD8]">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-medium text-rexcan-dark-blue-secondary">{title}</h3>
        <span className="text-2xl">{icon}</span>
      </div>
      <p className="text-3xl font-bold text-rexcan-dark-blue-primary">{value}</p>
      {subtitle && (
        <p className="text-xs text-rexcan-dark-blue-secondary mt-1">{subtitle}</p>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-rexcan-dark-blue-primary">System Metrics</h2>
        <button
          onClick={loadMetrics}
          className="px-4 py-2 text-sm font-medium text-rexcan-dark-blue-primary bg-white border border-rexcan-dark-blue-secondary rounded-md hover:bg-rexcan-light-grey-secondary"
        >
          Refresh
        </button>
      </div>

      {/* Key Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Total Invoices"
          value={metrics.total_invoices}
          icon="📄"
        />
        <MetricCard
          title="Auto Accepted"
          value={metrics.auto_accepted_count}
          subtitle={`${((metrics.auto_accepted_count / metrics.total_invoices) * 100).toFixed(1)}% of total`}
          icon="✅"
        />
        <MetricCard
          title="Flagged for Review"
          value={metrics.flagged_count}
          subtitle={`${((metrics.flagged_count / metrics.total_invoices) * 100).toFixed(1)}% of total`}
          icon="⚠️"
        />
        <MetricCard
          title="LLM Calls"
          value={metrics.llm_call_count}
          subtitle={`${((metrics.llm_call_count / metrics.total_invoices) * 100).toFixed(1)}% usage`}
          icon="🤖"
        />
      </div>

      {/* Performance Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <MetricCard
          title="Avg Processing Time"
          value={`${metrics.avg_processing_time.toFixed(2)}s`}
          icon="⏱️"
        />
        {metrics.avg_ocr_time && (
          <MetricCard
            title="Avg OCR Time"
            value={`${metrics.avg_ocr_time.toFixed(2)}s`}
            icon="👁️"
          />
        )}
        {metrics.avg_heuristics_time && (
          <MetricCard
            title="Avg Heuristics Time"
            value={`${metrics.avg_heuristics_time.toFixed(2)}s`}
            icon="🔍"
          />
        )}
        {metrics.avg_llm_time && (
          <MetricCard
            title="Avg LLM Time"
            value={`${metrics.avg_llm_time.toFixed(2)}s`}
            icon="🤖"
          />
        )}
        {metrics.slo_90th_percentile && (
          <MetricCard
            title="90th Percentile (SLO)"
            value={`${metrics.slo_90th_percentile.toFixed(2)}s`}
            subtitle="90% of invoices processed under this time"
            icon="📊"
          />
        )}
        <MetricCard
          title="Avg Confidence"
          value={`${(metrics.avg_confidence * 100).toFixed(1)}%`}
          icon="📈"
        />
      </div>

      {/* Source Coverage */}
      {metrics.source_coverage && (
        <div className="bg-white rounded-lg shadow-md p-6">
          <h3 className="text-lg font-semibold text-rexcan-dark-blue-primary mb-4">
            Source Coverage
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {Object.entries(metrics.source_coverage).map(([source, percentage]) => (
              <div key={source} className="text-center">
                <p className="text-sm text-rexcan-dark-blue-secondary capitalize">{source}</p>
                <p className="text-2xl font-bold text-rexcan-dark-blue-primary">
                  {(percentage * 100).toFixed(1)}%
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Heuristic Coverage */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <h3 className="text-lg font-semibold text-rexcan-dark-blue-primary mb-4">
          Heuristic Coverage
        </h3>
        <div className="w-full bg-gray-200 rounded-full h-4">
          <div
            className="bg-gradient-to-r from-[#00FFD8] to-[#39FF14] h-4 rounded-full transition-all duration-500"
            style={{ width: `${metrics.heuristic_coverage * 100}%` }}
          />
        </div>
        <p className="text-sm text-rexcan-dark-blue-secondary mt-2">
          {((metrics.heuristic_coverage * 100).toFixed(1))}% of fields extracted without LLM
        </p>
      </div>
    </div>
  );
};

export default MetricsDashboard;

