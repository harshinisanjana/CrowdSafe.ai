import { useState, useEffect } from 'react';

const FEED = [
    '🔴 CRITICAL: Crowd collapse risk Zone A — dispersal initiated · AI confidence 96%',
    '🟡 WARNING: Counter-flow East Block · Pattern matches pre-crush signature',
    '🏥 Medical team deployed Zone D · ETA 1m 40s from Station C',
    '🔵 Gate 1 restricted — inflow reduced 40% · AI recommendation active',
    '🛡 Security units active · Zones A & C · 8 officers deployed',
    '🧠 AI engine v3.2 · Thermal model accuracy: 94.7% · All sensors nominal',
    '🟢 Stage density normalised — threat resolved · Zone B cleared',
    '📢 PA broadcast active · Multilingual crowd guidance running',
    '⚡ Zone A risk score: 87/100 · Immediate action recommended',
    '📊 Total crowd: 18,472 · 74.3% venue capacity · Peak threshold 90%',
];

export default function Header({ systemStatus = 'ELEVATED', alertCount = 7 }) {
    const [time, setTime] = useState(new Date());

    useEffect(() => {
        const t = setInterval(() => setTime(new Date()), 1000);
        return () => clearInterval(t);
    }, []);

    const hh = time.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const dd = time.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });

    const sysColor = systemStatus === 'NORMAL' ? 'var(--neon-green)'
        : systemStatus === 'ELEVATED' ? 'var(--neon-yellow)'
            : 'var(--neon-red)';

    return (
        <header style={{
            background: `linear-gradient(180deg, #040912 0%, #060c1a 100%)`,
            borderBottom: '1px solid var(--border-mid)',
            flexShrink: 0,
            position: 'relative',
            overflow: 'hidden',
        }}>
            {/* Ambient top glow line */}
            <div style={{
                position: 'absolute', top: 0, left: 0, right: 0, height: '1px',
                background: 'linear-gradient(90deg, transparent 0%, #2979ff60 20%, #00e5ff80 50%, #2979ff60 80%, transparent 100%)',
                pointerEvents: 'none',
            }} />

            {/* Main row */}
            <div style={{
                padding: '10px 20px',
                display: 'flex', alignItems: 'center', gap: 18,
                justifyContent: 'space-between',
            }}>

                {/* ── Brand ── */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
                    {/* Logo mark */}
                    <div style={{
                        width: 42, height: 42, borderRadius: 10,
                        background: 'linear-gradient(135deg, #0a50ff 0%, #7c3aed 100%)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        boxShadow: '0 0 24px rgba(41,121,255,.55), inset 0 0 10px rgba(255,255,255,.08)',
                        flexShrink: 0, position: 'relative',
                    }}>
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                            {/* Outer ring */}
                            <circle cx="12" cy="12" r="9.5" stroke="rgba(255,255,255,.3)" strokeWidth="1"
                                strokeDasharray="4 2"
                                style={{ animation: 'radar-spin 5s linear infinite', transformOrigin: '12px 12px' }} />
                            {/* Middle ring */}
                            <circle cx="12" cy="12" r="5.5" stroke="rgba(255,255,255,.55)" strokeWidth="1" />
                            {/* Center dot */}
                            <circle cx="12" cy="12" r="2.5" fill="white" />
                            <circle cx="12" cy="12" r="1" fill="#0a50ff" />
                            {/* Crosshair lines */}
                            <line x1="12" y1="1.5" x2="12" y2="6" stroke="rgba(255,255,255,.5)" strokeWidth="1" strokeLinecap="round" />
                            <line x1="12" y1="18" x2="12" y2="22.5" stroke="rgba(255,255,255,.5)" strokeWidth="1" strokeLinecap="round" />
                            <line x1="1.5" y1="12" x2="6" y2="12" stroke="rgba(255,255,255,.5)" strokeWidth="1" strokeLinecap="round" />
                            <line x1="18" y1="12" x2="22.5" y2="12" stroke="rgba(255,255,255,.5)" strokeWidth="1" strokeLinecap="round" />
                        </svg>
                    </div>

                    <div>
                        <div style={{
                            fontFamily: 'Rajdhani, Inter, sans-serif',
                            fontSize: 20, fontWeight: 700, lineHeight: 1.1,
                            letterSpacing: '1px',
                        }}>
                            <span style={{ color: 'var(--text-primary)' }}>CROWDSAFE</span>{' '}
                            <span style={{ color: 'var(--neon-cyan)', textShadow: '0 0 14px var(--neon-cyan)' }}>AI</span>
                        </div>
                        <div style={{
                            fontSize: 9, color: 'var(--text-muted)',
                            letterSpacing: '3px', textTransform: 'uppercase', marginTop: 1,
                        }}>
                            Crowd Risk Prediction System
                        </div>
                    </div>
                </div>

                {/* ── Center Status Chips ── */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    <StatusPill label="AI ENGINE" value="ACTIVE" color="var(--neon-green)" pulse />
                    <StatusPill label="THERMAL" value="LIVE" color="var(--neon-cyan)" pulse />
                    <StatusPill label="SENSORS" value="18/18" color="var(--neon-blue)" />

                    <div style={{ width: 1, height: 28, background: 'var(--border-glow)' }} />

                    {/* System status — color coded */}
                    <div style={{
                        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                    }}>
                        <span style={{ fontSize: 8, color: 'var(--text-muted)', letterSpacing: '1.5px', textTransform: 'uppercase' }}>SYSTEM</span>
                        <div style={{
                            display: 'flex', alignItems: 'center', gap: 5,
                            padding: '3px 11px', borderRadius: 20,
                            background: `${sysColor}18`,
                            border: `1px solid ${sysColor}55`,
                        }}>
                            <div style={{ width: 5, height: 5, borderRadius: '50%', background: sysColor }}
                                className={systemStatus !== 'NORMAL' ? 'blink' : ''} />
                            <span style={{
                                fontSize: 10, fontWeight: 700,
                                color: sysColor, letterSpacing: '1px',
                                textShadow: `0 0 8px ${sysColor}80`,
                            }}>{systemStatus}</span>
                        </div>
                    </div>

                    {/* Alert counter */}
                    {alertCount > 0 && (
                        <div style={{
                            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                        }}>
                            <span style={{ fontSize: 8, color: 'var(--text-muted)', letterSpacing: '1.5px' }}>ALERTS</span>
                            <div style={{
                                padding: '3px 11px', borderRadius: 20,
                                background: 'rgba(255,23,68,.18)', border: '1px solid rgba(255,23,68,.55)',
                                fontSize: 10, fontWeight: 800, color: 'var(--neon-red)',
                                textShadow: '0 0 10px rgba(255,23,68,.7)',
                            }} className="blink">{alertCount} ACTIVE</div>
                        </div>
                    )}

                    <div style={{ width: 1, height: 28, background: 'var(--border-glow)' }} />

                    {/* Venue info (test venue for demo) */}
                    <div style={{ fontSize: 9, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                        <div style={{ color: 'var(--text-muted)', fontSize: 8, letterSpacing: '2px', marginBottom: 1 }}>VENUE</div>
                        <div style={{ fontWeight: 600 }}>Test Venue</div>
                        <div style={{ color: 'var(--text-muted)' }}>Internal Monitoring Scenario</div>
                    </div>
                </div>

                {/* ── Right: Clock ── */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0 }}>
                    {/* Live indicator */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <div style={{
                            width: 6, height: 6, borderRadius: '50%',
                            background: 'var(--neon-red)',
                            boxShadow: '0 0 8px var(--neon-red)',
                        }} className="blink" />
                        <span style={{ fontSize: 9, color: 'var(--neon-red)', fontWeight: 700, letterSpacing: '2px' }}>LIVE</span>
                    </div>

                    <div style={{ textAlign: 'right' }}>
                        <div style={{
                            fontFamily: 'JetBrains Mono, monospace',
                            fontSize: 24, fontWeight: 700,
                            color: 'var(--neon-cyan)',
                            letterSpacing: '3px', lineHeight: 1,
                            textShadow: '0 0 18px rgba(0,229,255,.45)',
                        }}>{hh}</div>
                        <div style={{ fontSize: 9, color: 'var(--text-muted)', letterSpacing: '1px', marginTop: 1 }}>{dd}</div>
                    </div>

                    {/* Settings icon */}
                    <div style={{
                        width: 32, height: 32, borderRadius: 7,
                        border: '1px solid var(--border-glow)',
                        background: 'var(--bg-card)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        cursor: 'pointer', color: 'var(--text-muted)', fontSize: 14,
                        transition: 'all .2s',
                    }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--neon-cyan)'; e.currentTarget.style.color = 'var(--neon-cyan)'; }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-glow)'; e.currentTarget.style.color = 'var(--text-muted)'; }}
                    >⚙</div>
                </div>
            </div>

            {/* ── Incident Ticker ── */}
            <div style={{
                borderTop: '1px solid var(--border-dim)',
                background: 'rgba(0,15,40,.6)',
                padding: '4px 0',
                display: 'flex', alignItems: 'center',
                overflow: 'hidden', flexShrink: 0,
            }}>
                <div style={{
                    flexShrink: 0, padding: '0 14px',
                    fontSize: 8, letterSpacing: '2px', textTransform: 'uppercase',
                    color: 'var(--neon-red)', fontWeight: 800,
                    borderRight: '1px solid var(--border-dim)',
                    display: 'flex', alignItems: 'center', gap: 5,
                }}>
                    <div style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--neon-red)' }} className="blink" />
                    INCIDENT FEED
                </div>
                <div className="ticker-wrap" style={{ flex: 1, overflow: 'hidden' }}>
                    <div className="ticker-inner" style={{
                        fontSize: 10, color: 'var(--text-secondary)', paddingLeft: 20,
                        display: 'flex', alignItems: 'center',
                    }}>
                        {[...FEED, ...FEED].map((item, i) => (
                            <span key={i} style={{ marginRight: 70, opacity: .85, whiteSpace: 'nowrap' }}>{item}</span>
                        ))}
                    </div>
                </div>
            </div>
        </header>
    );
}

function StatusPill({ label, value, color, pulse }) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
            <span style={{ fontSize: 8, color: 'var(--text-muted)', letterSpacing: '1.5px', textTransform: 'uppercase' }}>{label}</span>
            <div style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '3px 10px', borderRadius: 20,
                background: `${color}14`, border: `1px solid ${color}45`,
            }}>
                {pulse && <div style={{ width: 5, height: 5, borderRadius: '50%', background: color }} className="blink" />}
                <span style={{ fontSize: 10, fontWeight: 700, color, letterSpacing: '.5px' }}>{value}</span>
            </div>
        </div>
    );
}
