// MetricCards — textual risk status, no percentage gauges
import { useState, useEffect } from 'react';

function useCountUp(target, duration = 1400) {
    const [count, setCount] = useState(0);
    useEffect(() => {
        let start = 0;
        const step = target / (duration / 16);
        const timer = setInterval(() => {
            start += step;
            if (start >= target) { setCount(target); clearInterval(timer); }
            else setCount(Math.floor(start));
        }, 16);
        return () => clearInterval(timer);
    }, [target]);
    return count;
}

const RISK_STATUS = {
    LOW: { label: 'LOW', color: 'var(--neon-green)', bg: 'rgba(52,199,89,0.15)', border: 'rgba(52,199,89,0.4)', icon: '🟢' },
    MEDIUM: { label: 'MEDIUM', color: 'var(--neon-yellow)', bg: 'rgba(255,214,10,0.15)', border: 'rgba(255,214,10,0.4)', icon: '🟡' },
    HIGH: { label: 'HIGH', color: 'var(--neon-red)', bg: 'rgba(255,45,85,0.15)', border: 'rgba(255,45,85,0.4)', icon: '🔴' },
    CRITICAL: { label: 'CRITICAL', color: 'var(--neon-red)', bg: 'rgba(255,45,85,0.2)', border: 'rgba(255,45,85,0.6)', icon: '🚨' },
};

const CARDS = [
    {
        id: 'crowd',
        label: 'TOTAL CROWD',
        icon: '👥',
        value: 18472,
        valueSuffix: ' pax',
        detail: 'Peak capacity: 25,000',
        status: 'MEDIUM',
        subtext: '73% of venue capacity',
        trend: '▲ +340 in last 5 min',
        trendColor: 'var(--neon-yellow)',
        accentColor: 'var(--neon-blue)',
    },
    {
        id: 'alerts',
        label: 'ACTIVE ALERTS',
        icon: '🚨',
        value: 7,
        valueSuffix: ' alerts',
        detail: '2 Critical  •  3 Warning  •  2 Info',
        status: 'CRITICAL',
        subtext: 'Immediate action required',
        trend: '▲ +3 since last hour',
        trendColor: 'var(--neon-red)',
        accentColor: 'var(--neon-red)',
    },
    {
        id: 'zones',
        label: 'HIGH RISK ZONES',
        icon: '⚠',
        value: 4,
        valueSuffix: ' zones',
        detail: 'Zones: A3 · B1 · C2 · D4',
        status: 'HIGH',
        subtext: 'Thermal signature elevated',
        trend: '▲ +1 zone flagged',
        trendColor: 'var(--neon-yellow)',
        accentColor: 'var(--neon-yellow)',
    },
    {
        id: 'risk',
        label: 'OVERALL RISK',
        icon: '🧠',
        value: null,   // not a number — text status
        valueSuffix: '',
        detail: 'AI Model Confidence: 94.7%',
        status: 'HIGH',
        subtext: 'Elevated — Monitor closely',
        trend: '▼ Improving — actions active',
        trendColor: 'var(--neon-green)',
        accentColor: 'var(--neon-yellow)',
        isTextStatus: true,
    },
];

export default function MetricCards() {
    return (
        <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: '14px',
            padding: '16px 24px 0',
        }}>
            {CARDS.map((card, idx) => <MetricCard key={card.id} {...card} idx={idx} />)}
        </div>
    );
}

function MetricCard({ label, icon, value, valueSuffix, detail, status, subtext, trend, trendColor, accentColor, isTextStatus, idx }) {
    const animated = useCountUp(value ?? 0, 1200 + idx * 150);
    const [hovered, setHovered] = useState(false);
    const rs = RISK_STATUS[status];

    return (
        <div
            className="glass-card"
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            style={{
                padding: '18px 20px',
                border: `1px solid ${hovered ? rs.border : 'var(--border-primary)'}`,
                transition: 'all 0.3s ease',
                transform: hovered ? 'translateY(-2px)' : 'none',
                boxShadow: hovered ? `0 6px 24px ${rs.color}18` : 'none',
                animation: `fadeInUp 0.5s ease ${idx * 80}ms both`,
            }}
        >
            {/* Top: label + status badge */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '18px' }}>{icon}</span>
                    <span style={{ fontSize: '10px', color: 'var(--text-muted)', letterSpacing: '2px', textTransform: 'uppercase' }}>{label}</span>
                </div>
                {/* Status badge */}
                <div style={{
                    padding: '3px 9px', borderRadius: '4px',
                    background: rs.bg, border: `1px solid ${rs.border}`,
                    display: 'flex', alignItems: 'center', gap: '4px',
                }} className={status === 'CRITICAL' ? 'blink' : ''}>
                    <span style={{ fontSize: '9px' }}>{rs.icon}</span>
                    <span style={{ fontSize: '10px', fontWeight: '800', color: rs.color, letterSpacing: '1px' }}>{rs.label}</span>
                </div>
            </div>

            {/* Value / Text status */}
            {isTextStatus ? (
                <div style={{ marginBottom: '12px' }}>
                    <div style={{
                        fontSize: '32px', fontWeight: '900',
                        color: rs.color,
                        textShadow: `0 0 20px ${rs.color}60`,
                        lineHeight: 1, marginBottom: '4px',
                        letterSpacing: '-0.5px',
                    }}>{rs.label}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{subtext}</div>
                </div>
            ) : (
                <div style={{ marginBottom: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '2px', marginBottom: '4px' }}>
                        <span style={{
                            fontSize: '36px', fontWeight: '800',
                            color: accentColor,
                            textShadow: `0 0 16px ${accentColor}50`,
                            fontFamily: 'JetBrains Mono, monospace',
                            lineHeight: 1,
                        }}>{(value !== null ? animated : 0).toLocaleString()}</span>
                        <span style={{ fontSize: '13px', color: 'var(--text-muted)', fontFamily: 'JetBrains Mono' }}>{valueSuffix}</span>
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{subtext}</div>
                </div>
            )}

            {/* Divider */}
            <div style={{ height: '1px', background: 'var(--border-primary)', marginBottom: '10px' }} />

            {/* Detail + trend */}
            <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '5px' }}>{detail}</div>
            <div style={{ fontSize: '10px', color: trendColor, fontWeight: '600' }}>{trend}</div>

            {/* Bottom accent bar */}
            <div style={{
                position: 'absolute', bottom: 0, left: 0, right: 0, height: '2px', borderRadius: '0 0 12px 12px',
                background: `linear-gradient(90deg, transparent, ${rs.color}60, transparent)`,
            }} />
        </div>
    );
}
