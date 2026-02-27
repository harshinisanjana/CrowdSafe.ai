import { useState, useEffect } from 'react';

// 7 x 12 heatmap grid
const INITIAL_HEAT = [
    [0.92, 0.87, 0.71, 0.55, 0.40, 0.25, 0.15],
    [0.88, 0.95, 0.80, 0.60, 0.35, 0.20, 0.10],
    [0.75, 0.82, 0.78, 0.65, 0.40, 0.28, 0.18],
    [0.60, 0.70, 0.72, 0.80, 0.55, 0.35, 0.20],
    [0.45, 0.55, 0.65, 0.75, 0.68, 0.42, 0.25],
    [0.35, 0.42, 0.55, 0.62, 0.58, 0.38, 0.20],
    [0.28, 0.35, 0.44, 0.52, 0.48, 0.35, 0.18],
    [0.22, 0.28, 0.35, 0.40, 0.38, 0.28, 0.15],
    [0.18, 0.22, 0.28, 0.32, 0.30, 0.22, 0.12],
    [0.14, 0.18, 0.22, 0.25, 0.22, 0.18, 0.10],
    [0.10, 0.12, 0.15, 0.18, 0.16, 0.12, 0.08],
    [0.08, 0.10, 0.12, 0.14, 0.12, 0.10, 0.06],
];

const ZONE_LABELS_X = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
const ZONE_LABELS_Y = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];

function heatColor(v) {
    if (v >= 0.8) return { bg: 'rgba(255,45,85,0.9)', border: 'rgba(255,45,85,0.4)' };
    if (v >= 0.65) return { bg: 'rgba(255,100,30,0.85)', border: 'rgba(255,100,30,0.4)' };
    if (v >= 0.5) return { bg: 'rgba(255,214,10,0.80)', border: 'rgba(255,214,10,0.4)' };
    if (v >= 0.35) return { bg: 'rgba(255,214,10,0.45)', border: 'rgba(255,214,10,0.2)' };
    if (v >= 0.2) return { bg: 'rgba(52,199,89,0.50)', border: 'rgba(52,199,89,0.25)' };
    return { bg: 'rgba(52,199,89,0.20)', border: 'rgba(52,199,89,0.1)' };
}

export default function HeatmapPanel() {
    const [heat, setHeat] = useState(INITIAL_HEAT);
    const [hoveredCell, setHoveredCell] = useState(null);
    const [tick, setTick] = useState(0);

    // Animate heatmap with small fluctuations
    useEffect(() => {
        const interval = setInterval(() => {
            setHeat(prev => prev.map(row =>
                row.map(v => Math.min(1, Math.max(0.05, v + (Math.random() - 0.5) * 0.04)))
            ));
            setTick(t => t + 1);
        }, 2000);
        return () => clearInterval(interval);
    }, []);

    const avgDensity = heat.flat().reduce((a, b) => a + b, 0) / (heat.length * heat[0].length);

    return (
        <div className="glass-card" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            {/* Header */}
            <div style={{ padding: '14px 16px 10px', borderBottom: '1px solid var(--border-primary)', flexShrink: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <div style={{ fontSize: '12px', fontWeight: '700', letterSpacing: '1px', textTransform: 'uppercase' }}>
                            Crowd Density Heatmap
                        </div>
                        <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>
                            Live grid analysis • Updates every 2s
                        </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <div style={{ fontFamily: 'JetBrains Mono', fontSize: '20px', fontWeight: '800', color: avgDensity > 0.6 ? 'var(--neon-red)' : avgDensity > 0.4 ? 'var(--neon-yellow)' : 'var(--neon-green)' }}>
                            {Math.round(avgDensity * 100)}%
                        </div>
                        <div style={{ fontSize: '9px', color: 'var(--text-muted)' }}>AVG</div>
                    </div>
                </div>
            </div>

            {/* Legend bar */}
            <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--border-primary)', display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                <span style={{ fontSize: '9px', color: 'var(--text-muted)' }}>LOW</span>
                <div style={{
                    flex: 1, height: '6px', borderRadius: '3px',
                    background: 'linear-gradient(90deg, rgba(52,199,89,0.5), rgba(255,214,10,0.7), rgba(255,100,30,0.8), rgba(255,45,85,0.9))'
                }} />
                <span style={{ fontSize: '9px', color: 'var(--text-muted)' }}>CRITICAL</span>
            </div>

            {/* Grid */}
            <div style={{ flex: 1, padding: '8px 12px 12px', overflow: 'auto', position: 'relative' }}>
                <div style={{ display: 'flex', gap: '2px' }}>
                    {/* Y labels */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', paddingTop: '18px' }}>
                        {ZONE_LABELS_Y.map(l => (
                            <div key={l} style={{ height: '20px', display: 'flex', alignItems: 'center', fontSize: '8px', color: 'var(--text-muted)', width: '14px', justifyContent: 'center', fontFamily: 'JetBrains Mono' }}>{l}</div>
                        ))}
                    </div>
                    <div style={{ flex: 1 }}>
                        {/* X labels */}
                        <div style={{ display: 'flex', gap: '2px', marginBottom: '2px', paddingLeft: '0px' }}>
                            {ZONE_LABELS_X.map(l => (
                                <div key={l} style={{ flex: 1, textAlign: 'center', fontSize: '8px', color: 'var(--text-muted)', fontFamily: 'JetBrains Mono' }}>{l}</div>
                            ))}
                        </div>
                        {/* Cells */}
                        {heat.map((row, ri) => (
                            <div key={ri} style={{ display: 'flex', gap: '2px', marginBottom: '2px' }}>
                                {row.map((val, ci) => {
                                    const { bg, border } = heatColor(val);
                                    const isHov = hoveredCell?.r === ri && hoveredCell?.c === ci;
                                    return (
                                        <div
                                            key={ci}
                                            className="heatmap-cell"
                                            onMouseEnter={() => setHoveredCell({ r: ri, c: ci, val })}
                                            onMouseLeave={() => setHoveredCell(null)}
                                            style={{
                                                flex: 1, height: '20px',
                                                background: bg,
                                                border: `1px solid ${border}`,
                                                borderRadius: '3px',
                                                cursor: 'crosshair',
                                                transform: isHov ? 'scale(1.15)' : 'scale(1)',
                                                zIndex: isHov ? 5 : 1,
                                                position: 'relative',
                                                transition: 'all 0.3s ease',
                                                boxShadow: isHov ? `0 0 10px ${bg}` : 'none',
                                            }}
                                        />
                                    );
                                })}
                            </div>
                        ))}
                    </div>
                </div>

                {/* Hover tooltip */}
                {hoveredCell && (
                    <div style={{
                        position: 'absolute', top: '10px', right: '10px',
                        background: 'rgba(9,16,28,0.95)',
                        border: '1px solid var(--border-primary)',
                        borderRadius: '6px', padding: '8px 12px',
                        fontSize: '10px', zIndex: 10,
                        boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
                    }} className="fade-in-up">
                        <div style={{ color: 'var(--text-muted)', marginBottom: '4px' }}>
                            Cell {ZONE_LABELS_X[hoveredCell.c]}{ZONE_LABELS_Y[hoveredCell.r]}
                        </div>
                        <div style={{ color: 'var(--text-primary)', fontWeight: '700', fontFamily: 'JetBrains Mono' }}>
                            {Math.round(hoveredCell.val * 100)}% density
                        </div>
                        <div style={{ color: heatColor(hoveredCell.val).bg.replace('0.', '1').replace('rgba', 'rgb'), fontSize: '9px', marginTop: '2px' }}>
                            {hoveredCell.val >= 0.8 ? '🔴 CRITICAL' : hoveredCell.val >= 0.5 ? '🟡 WARNING' : '🟢 SAFE'}
                        </div>
                    </div>
                )}
            </div>

            {/* Stats row */}
            <div style={{
                padding: '8px 16px',
                borderTop: '1px solid var(--border-primary)',
                display: 'flex', gap: '12px',
                flexShrink: 0,
            }}>
                {[
                    { label: 'Critical', val: heat.flat().filter(v => v >= 0.8).length, color: 'var(--neon-red)' },
                    { label: 'Warning', val: heat.flat().filter(v => v >= 0.5 && v < 0.8).length, color: 'var(--neon-yellow)' },
                    { label: 'Safe', val: heat.flat().filter(v => v < 0.5).length, color: 'var(--neon-green)' },
                ].map(s => (
                    <div key={s.label} style={{ flex: 1, textAlign: 'center' }}>
                        <div style={{ fontFamily: 'JetBrains Mono', fontSize: '16px', fontWeight: '700', color: s.color }}>{s.val}</div>
                        <div style={{ fontSize: '9px', color: 'var(--text-muted)' }}>{s.label}</div>
                    </div>
                ))}
            </div>
        </div>
    );
}
