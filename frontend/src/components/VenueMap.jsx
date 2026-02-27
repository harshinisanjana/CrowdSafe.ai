import { useState, useEffect, useRef } from 'react';
import axios from 'axios';

// Named zones — Zone A (North Entry), Zone B (Main Floor), Zone C (Stage), Zone D (South)
const ZONES = [
    {
        id: 'A', label: 'Zone A', sublabel: 'North Entry',
        x: 5, y: 5, w: 42, h: 40,
        risk: 'critical', crowd: 6420,
        gates: [{ id: 'G1', x: 3, y: 25, status: 'restricted', label: 'Gate 1' }, { id: 'G2', x: 26, y: 2, status: 'open', label: 'Gate 2' }],
    },
    {
        id: 'B', label: 'Zone B', sublabel: 'Main Floor',
        x: 50, y: 5, w: 45, h: 40,
        risk: 'warning', crowd: 5210,
        gates: [{ id: 'G3', x: 97, y: 20, status: 'open', label: 'Gate 3' }],
    },
    {
        id: 'C', label: 'Zone C', sublabel: 'Stage Area',
        x: 5, y: 50, w: 42, h: 45,
        risk: 'safe', crowd: 3870,
        gates: [{ id: 'G4', x: 3, y: 72, status: 'open', label: 'Gate 4' }],
    },
    {
        id: 'D', label: 'Zone D', sublabel: 'South Exit',
        x: 50, y: 50, w: 45, h: 45,
        risk: 'warning', crowd: 2970,
        gates: [{ id: 'G5', x: 97, y: 75, status: 'open', label: 'Gate 5' }, { id: 'G6', x: 72, y: 97, status: 'open', label: 'Gate 6' }],
    },
];

// Animated flow lines (crowd movement vectors)
const FLOW_LINES = [
    { id: 'f1', d: 'M 18,15 C 25,20 35,30 50,35', color: '#0a84ff', label: 'A→B redirect active' },
    { id: 'f2', d: 'M 65,18 C 60,35 55,50 50,60', color: '#34c759', label: 'B→D nominal flow' },
    { id: 'f3', d: 'M 20,85 C 30,88 45,90 50,88', color: '#0a84ff', label: 'C→D redirect' },
];

const INCIDENTS = [
    { id: 1, cx: 18, cy: 15, type: 'crush', icon: '!', label: 'Crush Risk A1', zone: 'A' },
    { id: 2, cx: 85, cy: 78, type: 'bottleneck', icon: '▲', label: 'Bottleneck Gate 5', zone: 'D' },
    { id: 3, cx: 62, cy: 18, type: 'suspicious', icon: '?', label: 'Suspicious Activity', zone: 'B' },
    { id: 4, cx: 15, cy: 62, type: 'medical', icon: '+', label: 'Medical — Zone C', zone: 'C' },
];

const INCIDENT_COLORS = {
    crush: '#ff2d55',
    bottleneck: '#ffd60a',
    suspicious: '#bf5af2',
    medical: '#34c759',
};

// Thermal color gradient scale for heatmap
const COLOR_STOPS = [
    { t: 0.00, r: 0, g: 0, b: 0 },
    { t: 0.10, r: 0, g: 0, b: 130 },
    { t: 0.22, r: 0, g: 60, b: 220 },
    { t: 0.36, r: 0, g: 200, b: 220 },
    { t: 0.50, r: 10, g: 210, b: 80 },
    { t: 0.64, r: 220, g: 200, b: 10 },
    { t: 0.78, r: 255, g: 110, b: 0 },
    { t: 0.90, r: 255, g: 25, b: 25 },
    { t: 1.00, r: 255, g: 240, b: 240 },
];
function thermalRGBA(v) {
    const c = Math.max(0, Math.min(1, v));
    let lo = COLOR_STOPS[0], hi = COLOR_STOPS[COLOR_STOPS.length - 1];
    for (let i = 0; i < COLOR_STOPS.length - 1; i++) {
        if (c >= COLOR_STOPS[i].t && c <= COLOR_STOPS[i + 1].t) {
            lo = COLOR_STOPS[i]; hi = COLOR_STOPS[i + 1]; break;
        }
    }
    const t = hi.t === lo.t ? 0 : (c - lo.t) / (hi.t - lo.t);
    return [
        Math.round(lo.r + t * (hi.r - lo.r)),
        Math.round(lo.g + t * (hi.g - lo.g)),
        Math.round(lo.b + t * (hi.b - lo.b)),
    ];
}

const ZONE_BORDER = {
    critical: 'rgba(255,45,85,0.7)',
    warning: 'rgba(255,214,10,0.6)',
    safe: 'rgba(52,199,89,0.5)',
};
const ZONE_BG = {
    critical: 'rgba(255,45,85,0.06)',
    warning: 'rgba(255,214,10,0.04)',
    safe: 'rgba(52,199,89,0.04)',
};
const ZONE_COLOR = {
    critical: 'var(--neon-red)',
    warning: 'var(--neon-yellow)',
    safe: 'var(--neon-green)',
};

const COLS = 10;
const ROWS = 10;

export default function VenueMap() {
    const [selected, setSelected] = useState(null);
    const [showFlow, setShowFlow] = useState(true);
    const [showThermal, setShowThermal] = useState(true);
    const [pulseTick, setPulseTick] = useState(0);

    const canvasRef = useRef(null);
    const matrixRef = useRef(new Float32Array(COLS * ROWS));
    const animRef = useRef(null);
    const [liveData, setLiveData] = useState(null);

    // Pulse animation logic
    useEffect(() => {
        const t = setInterval(() => setPulseTick(p => p + 1), 1200);
        return () => clearInterval(t);
    }, []);

    // 1. Fetch Heatmap Data
    useEffect(() => {
        const interval = setInterval(async () => {
            try {
                const res = await axios.get('http://localhost:8000/snapshot');
                if (res.data) {
                    setLiveData(res.data);
                    if (res.data.heatmap_matrix) {
                        const matrix2D = res.data.heatmap_matrix;
                        const flat = new Float32Array(COLS * ROWS);
                        let maxVal = 0;
                        for (let r = 0; r < ROWS; r++) {
                            for (let c = 0; c < COLS; c++) {
                                const val = matrix2D[r][c] || 0;
                                flat[r * COLS + c] = val;
                                if (val > maxVal) maxVal = val;
                            }
                        }
                        if (maxVal > 0) {
                            for (let i = 0; i < flat.length; i++) {
                                flat[i] /= maxVal;
                            }
                        }
                        matrixRef.current = flat;
                    }
                }
            } catch (err) { }
        }, 1000);
        return () => clearInterval(interval);
    }, []);

    // 2. Render Heatmap onto background Canvas
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');

        const buf = document.createElement('canvas');
        buf.width = COLS;
        buf.height = ROWS;
        const bctx = buf.getContext('2d');

        function draw() {
            const W = canvas.width;
            const H = canvas.height;
            if (!W || !H) { animRef.current = requestAnimationFrame(draw); return; }

            ctx.clearRect(0, 0, W, H);

            if (showThermal) {
                const grid = matrixRef.current;
                const imgData = bctx.createImageData(COLS, ROWS);
                for (let i = 0; i < COLS * ROWS; i++) {
                    const v = grid[i];
                    const [r, g, b] = thermalRGBA(v);
                    const alpha = v <= 0.01 ? 0 : 200; // Fully transparent if empty so map shows through
                    imgData.data[i * 4] = r;
                    imgData.data[i * 4 + 1] = g;
                    imgData.data[i * 4 + 2] = b;
                    imgData.data[i * 4 + 3] = alpha;
                }
                bctx.putImageData(imgData, 0, 0);

                ctx.imageSmoothingEnabled = true;
                ctx.imageSmoothingQuality = 'high';
                ctx.drawImage(buf, 0, 0, W, H);
            }

            animRef.current = requestAnimationFrame(draw);
        }

        animRef.current = requestAnimationFrame(draw);
        return () => cancelAnimationFrame(animRef.current);
    }, [showThermal]);

    // Canvas resize observer
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        function sync() {
            canvas.width = canvas.offsetWidth;
            canvas.height = canvas.offsetHeight;
        }
        const ro = new ResizeObserver(sync);
        ro.observe(canvas.parentElement);
        sync();
        return () => ro.disconnect();
    }, []);

    // ── Dynamic live data mapping ──

    // 1. Zones
    const dynamicZones = ZONES.map(zone => {
        let crowd = zone.crowd;
        let risk = zone.risk;

        if (liveData) {
            // Distribute the total AI tracked count across zones proportionally as a demo mapping
            const total = liveData.total_people || 0;
            const globalRisk = liveData.risk_score || 0;

            if (zone.id === 'A') { crowd = Math.round(total * 0.4); risk = globalRisk > 0.8 ? 'critical' : 'warning'; }
            if (zone.id === 'B') { crowd = Math.round(total * 0.3); risk = globalRisk > 0.6 ? 'warning' : 'safe'; }
            if (zone.id === 'C') { crowd = Math.round(total * 0.2); risk = 'safe'; }
            if (zone.id === 'D') { crowd = Math.round(total * 0.1); risk = globalRisk > 0.9 ? 'warning' : 'safe'; }
        }
        return { ...zone, crowd, risk };
    });

    // 2. Incidents (Empty if no anomalies, otherwise parse them)
    // If liveData is entirely missing, keep the defaults for demo purposes until connection.
    let dynamicIncidents = INCIDENTS;
    if (liveData) {
        dynamicIncidents = [];
        if (liveData.anomalies && liveData.anomalies.length > 0) {
            liveData.anomalies.forEach((anom, idx) => {
                // Map the anomaly types from the AI to map pins
                let type = 'suspicious';
                let icon = '?';
                if (anom.type === 'running') { type = 'crush'; icon = '!!'; }
                if (anom.type === 'falling') { type = 'medical'; icon = '+'; }

                // Demo positions for anomalies since AI doesn't emit XY coords yet
                const demoPos = [
                    { cx: 18, cy: 15, zone: 'A' },
                    { cx: 62, cy: 18, zone: 'B' },
                    { cx: 85, cy: 78, zone: 'D' }
                ];
                const pos = demoPos[idx % demoPos.length];

                dynamicIncidents.push({
                    id: idx + 1,
                    cx: pos.cx, cy: pos.cy,
                    type, icon,
                    label: `AI Alert: ${anom.type.toUpperCase()}`,
                    zone: pos.zone
                });
            });
        }
    }

    // 3. Flow Lines (Hide if very low crowds, otherwise show demo flows)
    let dynamicFlows = FLOW_LINES;
    if (liveData) {
        dynamicFlows = [];
        const total = liveData.total_people || 0;
        if (total > 15) {
            dynamicFlows.push({ id: 'f1', d: 'M 18,15 C 25,20 35,30 50,35', color: '#0a84ff', label: 'A→B redirect active' });
        }
        if (total > 30) {
            dynamicFlows.push({ id: 'f2', d: 'M 65,18 C 60,35 55,50 50,60', color: '#34c759', label: 'B→D nominal flow' });
        }
    }

    const selectedZone = dynamicZones.find(z => z.id === selected);

    return (
        <div className="glass-card" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            {/* ── Panel header ── */}
            <div style={{ padding: '14px 18px 10px', borderBottom: '1px solid var(--border-primary)', flexShrink: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '9px', marginBottom: '3px' }}>
                            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--neon-blue)' }} className="blink" />
                            <span style={{ fontSize: '13px', fontWeight: '800', letterSpacing: '1px', textTransform: 'uppercase', color: 'var(--text-primary)' }}>
                                Live Venue Map
                            </span>
                            <span style={{ fontSize: '10px', color: 'var(--text-muted)', letterSpacing: '2px' }}>
                                LIVE AI CROWD TRACKING
                            </span>
                        </div>
                        <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                            Thermal crowd density • Real-time incident tracking • AI flow analysis
                        </div>
                    </div>

                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        {/* Legend */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginRight: '4px' }}>
                            {[
                                { l: 'Low', c: 'rgba(20,140,255,0.7)' },
                                { l: 'Med', c: 'rgba(60,210,80,0.7)' },
                                { l: 'High', c: 'rgba(255,210,10,0.8)' },
                                { l: 'Crit', c: 'rgba(255,30,50,0.9)' },
                            ].map(({ l, c }) => (
                                <div key={l} style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                                    <div style={{ width: '8px', height: '8px', borderRadius: '2px', background: c }} />
                                    <span style={{ fontSize: '9px', color: 'var(--text-muted)' }}>{l}</span>
                                </div>
                            ))}
                        </div>
                        {[
                            { label: 'THERMAL', active: showThermal, toggle: () => setShowThermal(v => !v) },
                            { label: 'FLOW', active: showFlow, toggle: () => setShowFlow(v => !v) },
                        ].map(btn => (
                            <button key={btn.label} onClick={btn.toggle} style={{
                                padding: '4px 10px', borderRadius: '4px', cursor: 'pointer',
                                border: `1px solid ${btn.active ? 'var(--neon-cyan)' : 'var(--border-primary)'}`,
                                background: btn.active ? 'rgba(90,200,250,0.12)' : 'transparent',
                                color: btn.active ? 'var(--neon-cyan)' : 'var(--text-muted)',
                                fontSize: '10px', fontWeight: '700', letterSpacing: '1px', transition: 'all 0.2s',
                            }}>{btn.label}</button>
                        ))}
                    </div>
                </div>
            </div>

            {/* ── Map area ── */}
            <div style={{ flex: 1, position: 'relative', overflow: 'hidden', padding: '12px' }}>
                <div className="venue-map" style={{ position: 'absolute', inset: '12px', borderRadius: '8px', overflow: 'hidden', background: '#02050b' }}>

                    {/* Live AI Heatmap Canvas Background */}
                    <canvas
                        ref={canvasRef}
                        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', zIndex: 1, pointerEvents: 'none', mixBlendMode: 'screen' }}
                    />

                    {/* SVG overlay for everything else */}
                    <svg
                        viewBox="0 0 100 100"
                        preserveAspectRatio="none"
                        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', zIndex: 3, pointerEvents: 'none' }}
                    >
                        <defs>
                            {/* Glow filter */}
                            <filter id="glow">
                                <feGaussianBlur stdDeviation="1.5" result="blur" />
                                <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                            </filter>
                            <style>{`
                @keyframes svg-dash { to { stroke-dashoffset: -20; } }
                .flow-line { animation: svg-dash 1.5s linear infinite; }
                @keyframes pulse-inc { 0%,100%{r:3;opacity:1} 50%{r:5;opacity:0.6} }
                .inc-pulse { animation: pulse-inc 1.8s ease-in-out infinite; }
              `}</style>
                        </defs>

                        {/* Faint grid */}
                        {[25, 50, 75].map(v => (
                            <g key={v}>
                                <line x1={v} y1="0" x2={v} y2="100" stroke="rgba(10,132,255,0.06)" strokeWidth="0.3" vectorEffect="non-scaling-stroke" />
                                <line x1="0" y1={v} x2="100" y2={v} stroke="rgba(10,132,255,0.06)" strokeWidth="0.3" vectorEffect="non-scaling-stroke" />
                            </g>
                        ))}

                        {/* Flow / movement lines */}
                        {showFlow && dynamicFlows.map(fl => (
                            <path
                                key={fl.id}
                                d={fl.d}
                                fill="none"
                                stroke={fl.color}
                                strokeWidth="0.8"
                                strokeDasharray="3 2"
                                className="flow-line"
                                opacity="0.85"
                                vectorEffect="non-scaling-stroke"
                                filter="url(#glow)"
                            />
                        ))}

                        {/* Incident markers */}
                        {dynamicIncidents.map(inc => {
                            const color = INCIDENT_COLORS[inc.type] || '#fff';
                            return (
                                <g key={inc.id}>
                                    {/* Pulsing outer ring */}
                                    <circle cx={inc.cx} cy={inc.cy} r="5"
                                        fill="none" stroke={color} strokeWidth="0.5"
                                        opacity={pulseTick % 2 === 0 ? 0.5 : 0.1}
                                        vectorEffect="non-scaling-stroke"
                                        style={{ transition: 'opacity 0.6s ease' }}
                                    />
                                    {/* Core dot */}
                                    <circle cx={inc.cx} cy={inc.cy} r="2.5"
                                        fill={color} opacity="0.95"
                                        filter="url(#glow)"
                                        vectorEffect="non-scaling-stroke"
                                        className="inc-pulse"
                                    />
                                    {/* Icon text */}
                                    <text cx={inc.cx} cy={inc.cy} textAnchor="middle" dominantBaseline="middle"
                                        x={inc.cx} y={inc.cy + 0.6}
                                        fill="white" style={{ fontSize: '2px', fontWeight: '900' }}
                                        vectorEffect="non-scaling-stroke"
                                    >{inc.icon}</text>
                                </g>
                            );
                        })}

                        {/* Separator line between zones */}
                        <line x1="50" y1="0" x2="50" y2="100" stroke="rgba(255,255,255,0.06)" strokeWidth="0.4" vectorEffect="non-scaling-stroke" />
                        <line x1="0" y1="50" x2="100" y2="50" stroke="rgba(255,255,255,0.06)" strokeWidth="0.4" vectorEffect="non-scaling-stroke" />
                    </svg>

                    {/* Zone labels + clickable overlays */}
                    {dynamicZones.map(zone => (
                        <div
                            key={zone.id}
                            onClick={() => setSelected(selected === zone.id ? null : zone.id)}
                            style={{
                                position: 'absolute',
                                left: `${zone.x}%`, top: `${zone.y}%`,
                                width: `${zone.w}%`, height: `${zone.h}%`,
                                border: `1px solid ${selected === zone.id ? ZONE_BORDER[zone.risk] : 'rgba(255,255,255,0.06)'}`,
                                background: selected === zone.id ? ZONE_BG[zone.risk] : 'transparent',
                                borderRadius: '6px',
                                zIndex: 5,
                                cursor: 'pointer',
                                transition: 'all 0.3s ease',
                                boxShadow: selected === zone.id ? `inset 0 0 20px ${ZONE_COLOR[zone.risk]}18` : 'none',
                            }}
                        >
                            {/* Zone label top-left */}
                            <div style={{
                                position: 'absolute', top: '6px', left: '8px',
                                display: 'flex', alignItems: 'center', gap: '5px',
                            }}>
                                <div style={{
                                    padding: '2px 6px', borderRadius: '3px',
                                    background: `${ZONE_COLOR[zone.risk]}20`,
                                    border: `1px solid ${ZONE_BORDER[zone.risk]}`,
                                    fontSize: '9px', fontWeight: '800',
                                    color: ZONE_COLOR[zone.risk], letterSpacing: '1px',
                                }}>{zone.label}</div>
                                <span style={{ fontSize: '9px', color: 'var(--text-muted)' }}>{zone.sublabel}</span>
                            </div>

                            {/* Status dot + crowd count bottom-right */}
                            <div style={{ position: 'absolute', bottom: '6px', right: '8px', textAlign: 'right' }}>
                                <div style={{
                                    display: 'inline-flex', alignItems: 'center', gap: '4px',
                                    padding: '2px 6px', borderRadius: '3px',
                                    background: 'rgba(9,16,28,0.8)',
                                    border: '1px solid var(--border-primary)',
                                }}>
                                    <div style={{
                                        width: '5px', height: '5px', borderRadius: '50%',
                                        background: ZONE_COLOR[zone.risk],
                                        boxShadow: `0 0 4px ${ZONE_COLOR[zone.risk]}`,
                                    }} className={zone.risk === 'critical' ? 'blink' : ''} />
                                    <span style={{ fontSize: '10px', fontFamily: 'JetBrains Mono', color: 'var(--text-primary)', fontWeight: '700' }}>
                                        {zone.crowd.toLocaleString()}
                                    </span>
                                </div>
                            </div>
                        </div>
                    ))}

                    {/* Gate badges */}
                    {dynamicZones.flatMap(z => z.gates).map(gate => (
                        <div key={gate.id} style={{
                            position: 'absolute',
                            left: `${gate.x}%`, top: `${gate.y}%`,
                            transform: 'translate(-50%, -50%)',
                            zIndex: 8,
                            padding: '2px 5px', borderRadius: '3px',
                            background: gate.status === 'restricted' ? 'rgba(255,45,85,0.85)' : 'rgba(52,199,89,0.85)',
                            border: `1px solid ${gate.status === 'restricted' ? '#ff2d55' : '#34c759'}`,
                            fontSize: '8px', fontWeight: '700', color: '#fff',
                            whiteSpace: 'nowrap', letterSpacing: '0.3px',
                        }}>
                            {gate.label} {gate.status === 'restricted' ? '🔒' : '✓'}
                        </div>
                    ))}

                    {/* Incident label tooltips */}
                    {dynamicIncidents.map(inc => (
                        <div key={`lbl-${inc.id}`} style={{
                            position: 'absolute',
                            left: `${inc.cx + 2.5}%`, top: `${inc.cy - 2}%`,
                            zIndex: 9,
                            padding: '2px 5px', borderRadius: '3px',
                            background: 'rgba(9,16,28,0.88)',
                            border: `1px solid ${INCIDENT_COLORS[inc.type]}60`,
                            fontSize: '8px', fontWeight: '600',
                            color: INCIDENT_COLORS[inc.type], whiteSpace: 'nowrap',
                            pointerEvents: 'none',
                        }}>
                            {inc.label}
                        </div>
                    ))}

                    {/* Controls */}
                    <div style={{ position: 'absolute', bottom: '10px', left: '10px', display: 'flex', flexDirection: 'column', gap: '4px', zIndex: 10 }}>
                        {['+', '−'].map(s => (
                            <button key={s} style={{
                                width: '24px', height: '24px', borderRadius: '4px',
                                background: 'rgba(9,16,28,0.9)', border: '1px solid var(--border-primary)',
                                color: 'var(--text-secondary)', fontSize: '14px', cursor: 'pointer',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}>{s}</button>
                        ))}
                    </div>
                    <div style={{ position: 'absolute', bottom: '10px', right: '10px', zIndex: 10 }}>
                        <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'rgba(9,16,28,0.8)', border: '1px solid var(--border-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px' }}>🧭</div>
                    </div>
                </div>

                {/* Zone detail tooltip */}
                {selectedZone && (
                    <div style={{
                        position: 'absolute', top: '20px', right: '20px',
                        background: 'rgba(9,16,28,0.97)',
                        border: `1px solid ${ZONE_BORDER[selectedZone.risk]}`,
                        borderRadius: '10px', padding: '14px 16px', minWidth: '200px',
                        zIndex: 20, boxShadow: `0 8px 30px ${ZONE_COLOR[selectedZone.risk]}20`,
                    }} className="fade-in-up">
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                            <div>
                                <span style={{ fontWeight: '800', fontSize: '14px', color: ZONE_COLOR[selectedZone.risk] }}>
                                    {selectedZone.label}
                                </span>
                                <span style={{ fontSize: '10px', color: 'var(--text-muted)', marginLeft: '6px' }}>
                                    {selectedZone.sublabel}
                                </span>
                            </div>
                            <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '14px' }}>✕</button>
                        </div>
                        {[
                            { l: 'Crowd Count', v: selectedZone.crowd.toLocaleString() + ' pax' },
                            { l: 'Risk Status', v: selectedZone.risk.toUpperCase() },
                            { l: 'Thermal Hotspots', v: `${selectedZone.hotspots.length} detected` },
                            { l: 'Peak Intensity', v: `${Math.round(Math.max(...selectedZone.hotspots.map(h => h.intensity)) * 100)}%` },
                        ].map(({ l, v }) => (
                            <div key={l} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', borderBottom: '1px solid var(--border-primary)', paddingBottom: '5px' }}>
                                <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{l}</span>
                                <span style={{ fontSize: '10px', fontWeight: '700', color: ZONE_COLOR[selectedZone.risk], fontFamily: 'JetBrains Mono' }}>{v}</span>
                            </div>
                        ))}
                        <div style={{
                            padding: '7px 9px', borderRadius: '6px',
                            background: 'rgba(10,132,255,0.08)', border: '1px solid rgba(10,132,255,0.2)',
                            marginTop: '6px',
                        }}>
                            <div style={{ fontSize: '9px', color: 'var(--neon-blue)', fontWeight: '700', marginBottom: '2px' }}>🧠 AI RECOMMENDATION</div>
                            <div style={{ fontSize: '10px', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                                {selectedZone.risk === 'critical'
                                    ? 'Redirect flow via Gate 2. Deploy 4 marshals immediately.'
                                    : selectedZone.risk === 'warning'
                                        ? 'Monitor closely. Pre-position medical team.'
                                        : 'Nominal conditions. No action required.'}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
