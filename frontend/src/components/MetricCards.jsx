import { useState, useEffect } from 'react';
import axios from 'axios';

function useCountUp(target, duration = 1400) {
    const [count, setCount] = useState(0);
    useEffect(() => {
        if (target === null || target === undefined) return;
        let start = count;
        if (start === target) return;

        const step = (target - start) / (duration / 16);
        const timer = setInterval(() => {
            start += step;
            if ((step > 0 && start >= target) || (step < 0 && start <= target)) {
                setCount(target);
                clearInterval(timer);
            } else {
                setCount(Math.floor(start));
            }
        }, 16);
        return () => clearInterval(timer);
    }, [target]);
    return count;
}

const RISK_STATUS = {
    SAFE: { label: 'SAFE', color: 'var(--neon-green)', bg: 'rgba(52,199,89,0.15)', border: 'rgba(52,199,89,0.4)', icon: '🟢' },
    CAUTION: { label: 'CAUTION', color: 'var(--neon-yellow)', bg: 'rgba(255,214,10,0.15)', border: 'rgba(255,214,10,0.4)', icon: '🟡' },
    WARNING: { label: 'WARNING', color: 'var(--neon-red)', bg: 'rgba(255,45,85,0.15)', border: 'rgba(255,45,85,0.4)', icon: '🔴' },
    CRITICAL: { label: 'CRITICAL', color: 'var(--neon-red)', bg: 'rgba(255,45,85,0.2)', border: 'rgba(255,45,85,0.6)', icon: '🚨' },

    // Fallbacks for the mock dataset
    LOW: { label: 'LOW', color: 'var(--neon-green)', bg: 'rgba(52,199,89,0.15)', border: 'rgba(52,199,89,0.4)', icon: '🟢' },
    MEDIUM: { label: 'MEDIUM', color: 'var(--neon-yellow)', bg: 'rgba(255,214,10,0.15)', border: 'rgba(255,214,10,0.4)', icon: '🟡' },
    HIGH: { label: 'HIGH', color: 'var(--neon-red)', bg: 'rgba(255,45,85,0.15)', border: 'rgba(255,45,85,0.4)', icon: '🔴' },
};

const INITIAL_CARDS = [
    {
        id: 'crowd',
        label: 'TOTAL CROWD',
        icon: '👥',
        value: 0,
        valueSuffix: ' pax',
        detail: 'Live AI count',
        status: 'SAFE',
        subtext: 'Current detected people',
        trend: 'Waiting for stream...',
        trendColor: 'var(--neon-yellow)',
        accentColor: 'var(--neon-blue)',
    },
    {
        id: 'alerts',
        label: 'ACTIVE ANOMALIES',
        icon: '🚨',
        value: 0,
        valueSuffix: ' alerts',
        detail: 'Detected in latest frame',
        status: 'SAFE',
        subtext: 'Behavioral flags',
        trend: 'Monitoring flow',
        trendColor: 'var(--neon-green)',
        accentColor: 'var(--neon-red)',
    },
    {
        id: 'flow',
        label: 'CROWD FLOW',
        icon: '🌊',
        value: 0,
        valueSuffix: '',
        detail: 'Movement pattern',
        status: 'SAFE',
        subtext: 'Overall direction pattern',
        trend: '',
        trendColor: 'var(--neon-yellow)',
        accentColor: 'var(--neon-yellow)',
        isTextValue: true,
        textValue: 'STABLE'
    },
    {
        id: 'risk',
        label: 'OVERALL RISK',
        icon: '🧠',
        value: null,
        valueSuffix: '',
        detail: 'System AI Score',
        status: 'SAFE',
        subtext: 'Holistic risk assessment',
        trend: 'Score: 0 / 100',
        trendColor: 'var(--neon-green)',
        accentColor: 'var(--neon-green)',
        isTextStatus: true,
    },
];

export default function MetricCards() {
    const [cards, setCards] = useState(INITIAL_CARDS);

    useEffect(() => {
        const interval = setInterval(async () => {
            try {
                const res = await axios.get('http://localhost:8000/snapshot');
                const data = res.data;
                if (!data || data.error) return;

                const riskLevel = data.risk?.level || 'SAFE';
                const riskScore = data.risk?.score || 0;
                const people = data.total_people || 0;
                const flow = data.flow_direction || 'STABLE';
                const anoms = data.anomalies ? data.anomalies.length : 0;

                setCards([
                    {
                        ...INITIAL_CARDS[0],
                        value: people,
                        status: riskLevel, // inherit overall risk color for effect
                        trend: 'Updating live',
                    },
                    {
                        ...INITIAL_CARDS[1],
                        value: anoms,
                        status: anoms > 0 ? 'CRITICAL' : 'SAFE',
                        trend: anoms > 0 ? 'Action required' : 'All clear',
                        trendColor: anoms > 0 ? 'var(--neon-red)' : 'var(--neon-green)',
                    },
                    {
                        ...INITIAL_CARDS[2],
                        value: 0,
                        textValue: flow,
                        status: flow === 'CHAOTIC' ? 'CRITICAL' : 'SAFE',
                    },
                    {
                        ...INITIAL_CARDS[3],
                        status: riskLevel,
                        trend: `Score: ${riskScore} / 100`,
                        trendColor: riskScore > 50 ? 'var(--neon-red)' : 'var(--neon-green)'
                    }
                ]);
            } catch (err) {
                // Silently fail if AI backend is down or booting
            }
        }, 1000);

        return () => clearInterval(interval);
    }, []);

    return (
        <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: '14px',
            padding: '16px 24px 0',
        }}>
            {cards.map((card, idx) => <MetricCard key={card.id} {...card} idx={idx} />)}
        </div>
    );
}

function MetricCard({ label, icon, value, textValue, isTextValue, valueSuffix, detail, status, subtext, trend, trendColor, accentColor, isTextStatus, idx }) {
    const animated = useCountUp(value ?? 0, 800);
    const [hovered, setHovered] = useState(false);
    const rs = RISK_STATUS[status] || RISK_STATUS['SAFE'];

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
                }} className={status === 'CRITICAL' || status === 'WARNING' ? 'blink' : ''}>
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
            ) : isTextValue ? (
                <div style={{ marginBottom: '12px' }}>
                    <div style={{
                        fontSize: '30px', fontWeight: '800',
                        color: accentColor,
                        textShadow: `0 0 16px ${accentColor}50`,
                        fontFamily: 'JetBrains Mono, monospace',
                        lineHeight: 1, marginBottom: '4px',
                    }}>{textValue}</div>
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
