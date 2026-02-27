import { useState, useEffect } from 'react';

const INITIAL_LOG = [
    { id: 1, time: '17:04:12', type: 'critical', icon: '🔴', text: 'Crowd crush risk — Zone A1 · Density 92%' },
    { id: 2, time: '17:03:55', type: 'action', icon: '↗', text: 'Crowd redirect initiated — A1 → Gate 3' },
    { id: 3, time: '17:03:22', type: 'warning', icon: '🟡', text: 'Unusual movement — East Wing counter-flow' },
    { id: 4, time: '17:02:48', type: 'medical', icon: '🏥', text: 'Medical team dispatched to Zone D4' },
    { id: 5, time: '17:02:15', type: 'security', icon: '🛡', text: 'Security deployed — Zones A1, B2' },
    { id: 6, time: '17:01:52', type: 'info', icon: '🔵', text: 'Gate 5 restricted — flow reduced 40%' },
    { id: 7, time: '17:01:30', type: 'ai', icon: '🧠', text: 'AI model update — accuracy 94.7%' },
    { id: 8, time: '17:00:48', type: 'safe', icon: '🟢', text: 'Zone C1 normalised — threat resolved' },
    { id: 9, time: '17:00:12', type: 'info', icon: '📊', text: 'Crowd count: 18,472 — 73% capacity' },
    { id: 10, time: '16:59:45', type: 'action', icon: '📢', text: 'PA announcement broadcast — stadium-wide' },
];

const NEW_EVENTS = [
    { type: 'critical', icon: '🔴', text: 'Zone A2 density spike detected' },
    { type: 'ai', icon: '🧠', text: 'AI risk score: 68 → 71' },
    { type: 'safe', icon: '🟢', text: 'Zone D1 cleared — low density' },
    { type: 'info', icon: '🔵', text: 'Backup medical team on standby · Gate 4' },
    { type: 'warning', icon: '🟡', text: 'Wind speed 23 km/h — crowd movement impacted' },
];

const TYPE_COLORS = {
    critical: 'var(--neon-red)',
    warning: 'var(--neon-yellow)',
    safe: 'var(--neon-green)',
    info: 'var(--neon-blue)',
    action: 'var(--neon-purple)',
    medical: 'var(--neon-green)',
    security: 'var(--neon-cyan)',
    ai: '#bf5af2',
};

export default function ActivityFeed({ defaultOpen = false }) {
    const [open, setOpen] = useState(defaultOpen);
    const [log, setLog] = useState(INITIAL_LOG);
    const [eventIdx, setEventIdx] = useState(0);

    // Simulate incoming events
    useEffect(() => {
        const interval = setInterval(() => {
            const now = new Date();
            const timeStr = now.toLocaleTimeString('en-US', { hour12: false });
            const ev = NEW_EVENTS[eventIdx % NEW_EVENTS.length];
            setLog(prev => [{ id: Date.now(), time: timeStr, ...ev }, ...prev.slice(0, 24)]);
            setEventIdx(i => i + 1);
        }, 8000);
        return () => clearInterval(interval);
    }, [eventIdx]);

    const latestType = log[0]?.type ?? 'info';
    const latestColor = TYPE_COLORS[latestType] ?? 'var(--text-muted)';

    return (
        <div className="glass-card" style={{ overflow: 'hidden' }}>
            {/* Dropdown toggle header */}
            <button
                onClick={() => setOpen(v => !v)}
                style={{
                    width: '100%', padding: '12px 14px',
                    background: 'none', border: 'none', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    borderBottom: open ? '1px solid var(--border-primary)' : 'none',
                    transition: 'background 0.2s',
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'}
                onMouseLeave={e => e.currentTarget.style.background = 'none'}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '12px', fontWeight: '700', letterSpacing: '1px', textTransform: 'uppercase', color: 'var(--text-primary)' }}>
                        Activity Feed
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '9px', color: 'var(--neon-green)' }}>
                        <div style={{ width: '5px', height: '5px', borderRadius: '50%', background: 'var(--neon-green)' }} className="blink" />
                        LIVE
                    </div>
                    {/* Latest event preview when collapsed */}
                    {!open && (
                        <span style={{
                            fontSize: '10px', color: latestColor,
                            maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                            {log[0]?.icon} {log[0]?.text}
                        </span>
                    )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{
                        padding: '2px 6px', borderRadius: '3px',
                        background: 'rgba(10,132,255,0.1)', border: '1px solid rgba(10,132,255,0.3)',
                        fontSize: '9px', color: 'var(--neon-blue)', fontWeight: '700',
                    }}>{log.length}</span>
                    <span style={{ color: 'var(--text-muted)', fontSize: '12px', transition: 'transform 0.3s', transform: open ? 'rotate(180deg)' : 'none' }}>▼</span>
                </div>
            </button>

            {/* Feed content (expandable) */}
            <div style={{
                maxHeight: open ? '340px' : '0px',
                overflow: 'hidden',
                transition: 'max-height 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
            }}>
                <div style={{ overflow: 'auto', maxHeight: '340px', padding: '8px 12px' }}>
                    {log.map((entry, idx) => {
                        const color = TYPE_COLORS[entry.type] || 'var(--text-muted)';
                        return (
                            <div key={entry.id} style={{
                                display: 'flex', gap: '8px', alignItems: 'flex-start',
                                padding: '6px 0',
                                borderBottom: idx < log.length - 1 ? '1px solid rgba(255,255,255,0.03)' : 'none',
                                animation: idx === 0 ? 'fadeInUp 0.3s ease' : 'none',
                            }}>
                                {/* Dot */}
                                <div style={{ marginTop: '3px', flexShrink: 0 }}>
                                    <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: color, boxShadow: `0 0 4px ${color}` }} />
                                </div>
                                {/* Content */}
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '4px', marginBottom: '1px' }}>
                                        <span style={{ fontSize: '10px', fontWeight: '600', color: color }}>
                                            {entry.icon} {entry.type.toUpperCase()}
                                        </span>
                                        <span style={{ fontSize: '9px', color: 'var(--text-muted)', fontFamily: 'JetBrains Mono', flexShrink: 0 }}>
                                            {entry.time}
                                        </span>
                                    </div>
                                    <div style={{ fontSize: '10px', color: 'var(--text-secondary)', lineHeight: 1.4, wordBreak: 'break-word' }}>
                                        {entry.text}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
