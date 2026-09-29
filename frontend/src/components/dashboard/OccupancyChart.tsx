import { Box } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { BarChart } from '@mui/x-charts/BarChart';

import type { PropertyOccupancy } from '../../types';
import { ChartFrame } from './ChartFrame';
import { DashboardSection } from './DashboardSection';

interface OccupancyChartProps {
  properties: PropertyOccupancy[];
  loading: boolean;
  emptyState: React.ReactNode;
}

/**
 * Bed occupancy per property (design system §6 "Charts"). Bars use the theme's
 * primary color, so the chart follows the app palette automatically instead of
 * introducing a second one.
 */
export function OccupancyChart({ properties, loading, emptyState }: OccupancyChartProps) {
  const theme = useTheme();
  // Properties with no beds cannot be plotted, so they are left out of the
  // series but still counted in the panel subtitle.
  const plottable = properties.filter((property) => property.totalBeds > 0);

  return (
    <DashboardSection
      title="Occupancy by property"
      subtitle={
        plottable.length === 0
          ? 'Bed usage across every property'
          : `Bed usage across ${plottable.length} ${plottable.length === 1 ? 'property' : 'properties'}`
      }
    >
      <ChartFrame
        height={260}
        isEmpty={!loading && plottable.length === 0}
        emptyState={emptyState}
      >
        <Box sx={{ width: '100%', height: '100%' }}>
          <BarChart
            xAxis={[
              {
                scaleType: 'band',
                data: plottable.map((property) => property.pgName),
                tickLabelStyle: { fontSize: 12, fill: theme.palette.text.secondary }
              }
            ]}
            yAxis={[
              {
                valueFormatter: (value: number) => `${value}%`,
                tickLabelStyle: { fontSize: 12, fill: theme.palette.text.secondary }
              }
            ]}
            series={[
              {
                data: plottable.map((property) => property.occupancyPercent),
                label: 'Occupied beds (%)',
                color: theme.palette.primary.main
              }
            ]}
            borderRadius={6}
            margin={{ top: 16, right: 8, bottom: 8, left: 0 }}
            grid={{ horizontal: true }}
            // A single-series bar chart needs no legend; the panel title and
            // the axis already say what the bars are.
            slotProps={{ legend: { hidden: true } }}
            aria-label="Occupancy percentage by property"
          />
        </Box>
      </ChartFrame>
    </DashboardSection>
  );
}
