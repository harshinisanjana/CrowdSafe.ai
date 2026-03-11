import './index.css';
import Header from './components/Header';
import MetricCards from './components/MetricCards';
import VenueMap from './components/VenueMap';
import ThermalPanel from './components/ThermalPanel';
import AlertsPanel from './components/AlertsPanel';
import ActivityFeed from './components/ActivityFeed';
import ActionPanel from './components/ActionPanel';

export default function App() {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)', display: 'flex', flexDirection: 'column' }}>
      {/* Scanline overlay */}
      <div className="scanline-overlay" />

      {/* HEADER */}
      <Header systemStatus="ELEVATED" lastUpdated="17:04:12" />

      {/* METRIC CARDS */}
      <MetricCards />

      {/*
        MAIN GRID
        ─────────────────────────────────────────────
        LEFT (flex 1):  VenueMap (top, ~58%) + ThermalPanel (bottom, ~42%) stacked
        RIGHT (320px):  AlertsPanel (scrollable) + ActivityFeed (dropdown) + ActionPanel
      */}
      <div style={{
        flex: 1,
        display: 'grid',
        gridTemplateColumns: '1fr 330px',
        gap: '14px',
        padding: '14px 24px 24px',
        minHeight: 0,
      }}>

        {/* ── LEFT COLUMN: Map + Thermal stacked ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', minHeight: 0 }}>
          {/* Venue map — hero, taller */}
          <div style={{ flex: '0 0 58%', minHeight: '360px' }}>
            <VenueMap />
          </div>
          {/* Thermal camera — same width, below */}
          <div style={{ flex: 1, minHeight: '220px' }}>
            <ThermalPanel />
          </div>
        </div>

        {/* ── RIGHT COLUMN: Alerts + Feed dropdown + Actions ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', minHeight: 0, overflow: 'auto' }}>
          {/* Live alerts — scrollable, takes most of the right column */}
          <div style={{ flex: 1, minHeight: '200px' }}>
            <AlertsPanel />
          </div>

          {/* Activity feed — collapsible dropdown */}
          <ActivityFeed defaultOpen={false} />

          {/* Authority actions — sits below feed */}
          <ActionPanel />
        </div>
      </div>

      {/* FOOTER */}
      <footer style={{
        borderTop: '1px solid var(--border-primary)',
        background: 'var(--bg-secondary)',
        padding: '7px 24px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', gap: '20px' }}>
          {[
            { l: 'Venue', v: 'Test Venue' },
            { l: 'Event', v: 'CrowdSafe AI Demo' },
            { l: 'Capacity', v: 'Configured in System' },
          ].map(({ l, v }) => (
            <div key={l} style={{ display: 'flex', gap: '5px' }}>
              <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{l}:</span>
              <span style={{ fontSize: '10px', color: 'var(--text-secondary)', fontWeight: '500' }}>{v}</span>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--neon-green)' }} className="blink" />
          <span style={{ fontSize: '10px', color: 'var(--neon-green)', letterSpacing: '1px' }}>
            CrowdSafe AI v3.2 · ALL SYSTEMS OPERATIONAL
          </span>
        </div>
      </footer>
    </div>
  );
}