import { useState, useEffect } from 'react';

const ALERTS_DATA = [
    {
        id: 1,
        severity: 'critical',
        title: 'Crowd Crush Risk — Zone A1',
        detail: 'Density exceeds 92%. Immediate dispersal required.',
        zone: 'A1',
        time: '2s ago',
        icon: '🔴',
        ai: 'AI recommends: redirect to Zone C1 via Gate 3',
        acknowledged: false,
    },
    {
        id: 2,
        severity: 'critical',
        title: 'Bottleneck — Gate 2 North',
        detail: 'Entry rate 340 ppm. Exit blocked by maintenance barrier.',
        zone: 'Gate-2N',
        time: '45s ago',
        icon: '🔴',
        ai: 'AI recommends: open supplementary lane, deploy 4 marshals',
        acknowledged: false,
    },
    {
        id: 3,
        severity: 'warning',
        title: 'High Density — Zone B2',
        detail: 'Crowd density at 78%. Approaching critical threshold.',
        zone: 'B2',
        time: '1m 12s ago',
        icon: '🟡',
        ai: 'AI recommends: monitor closely, pre-position medical team',
        acknowledged: false,
    },
    {
        id: 4,
        severity: 'warning',
        title: 'Unusual Movement — East Wing',
        detail: 'Counter-flow detected. Possible panic or stampede precursor.',
        zone: 'E-Wing',
        time: '2m 30s ago',
        icon: '🟡',
        ai: 'AI recommends: activate PA announcement, guide crowd',
        acknowledged: false,
    },
    {
        id: 5,
        severity: 'info',
        title: 'Medical Incident — Section D',
        detail: 'Person reported unconscious. Medical team en route.',
        zone: 'D4',
        time: '3m 15s ago',
        icon: '🔵',
        ai: 'Medical team ETA: 1m 45s',
        acknowledged: true,
    },
    {
        id: 6,
        severity: 'safe',
        title: 'Zone C1 Cleared',
        detail: 'Density normalized. No further action required.',
        zone: 'C1',
        time: '5m ago',
        icon: '🟢',
        ai: 'Status resolved automatically',
        acknowledged: true,
    },
];

const SEVERITY_STYLES = {
    critical: {
        border: 'rgba(255,45,85,0.5)',
        bg: 'rgba(255,45,85,0.07)',
        header: 'rgba(255,45,85,0.15)',
        color: 'var(--neon-red)',
        dot: 'critical',
        glow: 'glow-red',
        badge: 'CRITICAL',
    },
    warning: {
        border: 'rgba(255,214,10,0.4)',
        bg: 'rgba(255,214,10,0.05)',
        header: 'rgba(255,214,10,0.12)',
        color: 'var(--neon-yellow)',
        dot: 'warning',
        badge: 'WARNING',
    },
    info: {
        border: 'rgba(10,132,255,0.4)',
        bg: 'rgba(10,132,255,0.05)',
        header: 'rgba(10,132,255,0.10)',
        color: 'var(--neon-blue)',
        dot: '',
        badge: 'INFO',
    },
    safe: {
        border: 'rgba(52,199,89,0.3)',
        bg: 'rgba(52,199,89,0.04)',
        header: 'rgba(52,199,89,0.08)',
        color: 'var(--neon-green)',
        dot: 'safe',
        badge: 'RESOLVED',
    },
};

export default function AlertsPanel() {
    const [alerts, setAlerts] = useState(ALERTS_DATA);
    const [filter, setFilter] = useState('all');
    const [expanded, setExpanded] = useState(null);
    const [newAlert, setNewAlert] = useState(null);

    const filtered = filter === 'all' ? alerts : alerts.filter(a => a.severity === filter);

    function acknowledge(id) {
        setAlerts(prev => prev.map(a => a.id === id ? { ...a, acknowledged: true } : a));
    }

    const counts = {
        critical: alerts.filter(a => a.severity === 'critical').length,
        warning: alerts.filter(a => a.severity === 'warning').length,
        safe: alerts.filter(a => a.severity === 'safe').length,
    };

    return (
        <div className="glass-card" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            {/* Header */}
            <div style={{ padding: '14px 16px 10px', borderBottom: '1px solid var(--border-primary)', flexShrink: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div className="status-dot critical" />
                        <span style={{ fontSize: '12px', fontWeight: '700', letterSpacing: '1px', textTransform: 'uppercase' }}>
                            Live Alerts
                        </span>
                        <div style={{
                            background: 'rgba(255,45,85,0.2)', border: '1px solid rgba(255,45,85,0.5)',
                            borderRadius: '10px', padding: '1px 8px',
                            fontSize: '10px', fontWeight: '700', color: 'var(--neon-red)',
                        }} className="blink">
                            {counts.critical + counts.warning} ACTIVE
                        </div>
                    </div>
                    <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'JetBrains Mono' }}>
                        REFRESH: AUTO
                    </div>
                </div>

                {/* Filter tabs */}
                <div style={{ display: 'flex', gap: '6px' }}>
                    {[
                        { key: 'all', label: `All (${alerts.length})`, color: 'var(--neon-cyan)' },
                        { key: 'critical', label: `Critical (${counts.critical})`, color: 'var(--neon-red)' },
                        { key: 'warning', label: `Warning (${counts.warning})`, color: 'var(--neon-yellow)' },
                        { key: 'safe', label: `Safe (${counts.safe})`, color: 'var(--neon-green)' },
                    ].map(tab => (
                        <button
                            key={tab.key}
                            onClick={() => setFilter(tab.key)}
                            style={{
                                padding: '3px 8px', borderRadius: '4px', cursor: 'pointer',
                                border: `1px solid ${filter === tab.key ? tab.color : 'var(--border-primary)'}`,
                                background: filter === tab.key ? `${tab.color}18` : 'transparent',
                                color: filter === tab.key ? tab.color : 'var(--text-muted)',
                                fontSize: '10px', fontWeight: '600', letterSpacing: '0.5px',
                                transition: 'all 0.2s',
                            }}
                        >{tab.label}</button>
                    ))}
                </div>
            </div>

            {/* Alert list */}
            <div style={{ flex: 1, overflow: 'auto', padding: '8px' }}>
                {filtered.map((alert, i) => {
                    const s = SEVERITY_STYLES[alert.severity];
                    const isExp = expanded === alert.id;
                    return (
                        <div
                            key={alert.id}
                            className={alert.severity === 'critical' && !alert.acknowledged ? s.glow : ''}
                            style={{
                                marginBottom: '6px',
                                border: `1px solid ${s.border}`,
                                borderRadius: '8px',
                                background: s.bg,
                                overflow: 'hidden',
                                transition: 'all 0.3s ease',
                                opacity: alert.acknowledged ? 0.7 : 1,
                                animationDelay: `${i * 80}ms`,
                            }}
                        >
                            {/* Alert header */}
                            <div
                                onClick={() => setExpanded(isExp ? null : alert.id)}
                                style={{
                                    padding: '10px 12px',
                                    background: isExp ? s.header : 'transparent',
                                    cursor: 'pointer',
                                    display: 'flex', alignItems: 'flex-start', gap: '10px',
                                }}
                            >
                                <div style={{ fontSize: '16px', flexShrink: 0, marginTop: '1px' }}>{alert.icon}</div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '6px', marginBottom: '3px' }}>
                                        <span style={{ fontSize: '11px', fontWeight: '700', color: s.color, lineHeight: 1.3 }}>
                                            {alert.title}
                                        </span>
                                        <span style={{ fontSize: '9px', color: 'var(--text-muted)', flexShrink: 0 }}>{alert.time}</span>
                                    </div>
                                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                        <span style={{
                                            fontSize: '9px', padding: '1px 5px', borderRadius: '3px',
                                            background: `${s.color}18`, border: `1px solid ${s.color}40`,
                                            color: s.color, fontWeight: '700', letterSpacing: '0.5px',
                                        }}>{s.badge}</span>
                                        <span style={{ fontSize: '9px', color: 'var(--text-muted)' }}>
                                            Zone: <span style={{ color: 'var(--text-secondary)' }}>{alert.zone}</span>
                                        </span>
                                        {alert.acknowledged && (
                                            <span style={{ fontSize: '9px', color: 'var(--neon-green)' }}>✓ ACK</span>
                                        )}
                                    </div>
                                </div>
                                <span style={{ color: 'var(--text-muted)', fontSize: '10px', flexShrink: 0 }}>{isExp ? '▲' : '▼'}</span>
                            </div>

                            {/* Expanded details */}
                            {isExp && (
                                <div style={{ padding: '0 12px 12px' }} className="fade-in-up">
                                    <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '8px', lineHeight: 1.5 }}>
                                        {alert.detail}
                                    </div>
                                    <div style={{
                                        padding: '8px', borderRadius: '6px',
                                        background: 'rgba(10,132,255,0.08)', border: '1px solid rgba(10,132,255,0.2)',
                                        marginBottom: '8px',
                                    }}>
                                        <div style={{ fontSize: '9px', color: 'var(--neon-blue)', marginBottom: '3px', fontWeight: '700', letterSpacing: '1px' }}>🧠 AI RECOMMENDATION</div>
                                        <div style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>{alert.ai}</div>
                                    </div>
                                    {!alert.acknowledged && (
                                        <button
                                            onClick={() => acknowledge(alert.id)}
                                            style={{
                                                width: '100%', padding: '6px',
                                                background: `${s.color}18`,
                                                border: `1px solid ${s.color}40`,
                                                borderRadius: '5px',
                                                color: s.color, fontSize: '10px', fontWeight: '700',
                                                cursor: 'pointer', transition: 'all 0.2s',
                                                letterSpacing: '1px',
                                            }}
                                        >✓ ACKNOWLEDGE ALERT</button>
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
