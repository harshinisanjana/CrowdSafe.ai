// ThermalPanel — Canvas-based thermal camera, full-venue unified IR view
import { useEffect, useRef, useState } from 'react';

const COLS = 50;
const ROWS = 40;

const SOURCES = [
    // Zone A — North Entry (top-left) — CRITICAL
    { cx: 0.17, cy: 0.15, intensity: 0.95, radius: 0.13, phase: 0.0 },
    { cx: 0.30, cy: 0.24, intensity: 0.80, radius: 0.10, phase: 1.1 },
    { cx: 0.10, cy: 0.35, intensity: 0.63, radius: 0.09, phase: 2.2 },
    // Zone B — Main Floor (top-right) — WARNING
    { cx: 0.65, cy: 0.17, intensity: 0.72, radius: 0.11, phase: 0.7 },
    { cx: 0.82, cy: 0.28, intensity: 0.57, radius: 0.09, phase: 1.8 },
    { cx: 0.70, cy: 0.38, intensity: 0.44, radius: 0.07, phase: 2.9 },
    // Zone C — Stage Area (bottom-left) — SAFE
    { cx: 0.15, cy: 0.65, intensity: 0.33, radius: 0.09, phase: 3.0 },
    { cx: 0.30, cy: 0.78, intensity: 0.25, radius: 0.07, phase: 0.5 },
    // Zone D — South Exit (bottom-right) — WARNING
    { cx: 0.68, cy: 0.65, intensity: 0.62, radius: 0.10, phase: 2.4 },
    { cx: 0.85, cy: 0.80, intensity: 0.74, radius: 0.11, phase: 1.3 },
];

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

function buildGrid(t) {
    const grid = new Float32Array(COLS * ROWS);
    for (let row = 0; row < ROWS; row++) {
        for (let col = 0; col < COLS; col++) {
            const fx = col / (COLS - 1);
            const fy = row / (ROWS - 1);
            let total = 0;
            for (const src of SOURCES) {
                const dx = fx - src.cx;
                const dy = fy - src.cy;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < src.radius * 2.5) {
                    const pulse = 1 + 0.065 * Math.sin(t * 0.85 + src.phase);
                    const val = Math.exp(-0.5 * (dist / src.radius) ** 2) * src.intensity * pulse;
                    total = Math.max(total, val);
                }
            }
            grid[row * COLS + col] = Math.min(1, total);
        }
    }
    return grid;
}

const ZONE_OVERLAYS = [
    { label: 'A', sublabel: 'North Entry', fx: 0.02, fy: 0.02, fw: 0.47, fh: 0.48, risk: 'CRITICAL', color: '#ff2d55' },
    { label: 'B', sublabel: 'Main Floor', fx: 0.51, fy: 0.02, fw: 0.47, fh: 0.48, risk: 'WARNING', color: '#ffd60a' },
    { label: 'C', sublabel: 'Stage Area', fx: 0.02, fy: 0.52, fw: 0.47, fh: 0.46, risk: 'SAFE', color: '#34c759' },
    { label: 'D', sublabel: 'South Exit', fx: 0.51, fy: 0.52, fw: 0.47, fh: 0.46, risk: 'WARNING', color: '#ffd60a' },
];

const INCIDENTS = [
    { fx: 0.17, fy: 0.15, label: 'Crush A1', color: '#ff2d55' },
    { fx: 0.65, fy: 0.17, label: 'Suspic. B', color: '#bf5af2' },
    { fx: 0.85, fy: 0.80, label: 'Bottleneck D', color: '#ffd60a' },
    { fx: 0.15, fy: 0.65, label: 'Medical C', color: '#34c759' },
];

function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
}

export default function ThermalPanel() {
    const canvasRef = useRef(null);
    const animRef = useRef(null);
    const startRef = useRef(Date.now());
    const [showZones, setShowZones] = useState(true);
    const [showIncidents, setShowIncidents] = useState(true);
    const [fps, setFps] = useState(0);
    const fpsRef = useRef({ count: 0, last: Date.now() });

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');

        // Use a plain <canvas> element instead of OffscreenCanvas for compatibility
        const buf = document.createElement('canvas');
        buf.width = COLS;
        buf.height = ROWS;
        const bctx = buf.getContext('2d');

        function draw() {
            const W = canvas.width;
            const H = canvas.height;
            if (!W || !H) { animRef.current = requestAnimationFrame(draw); return; }

            const t = (Date.now() - startRef.current) / 1000;
            const grid = buildGrid(t);

            // Build thermal pixel data
            const imgData = bctx.createImageData(COLS, ROWS);
            for (let i = 0; i < COLS * ROWS; i++) {
                const v = grid[i];
                const [r, g, b] = thermalRGBA(v);
                const alpha = v < 0.04 ? Math.round(v * 3000) : Math.min(255, Math.round(35 + v * 220));
                imgData.data[i * 4] = r;
                imgData.data[i * 4 + 1] = g;
                imgData.data[i * 4 + 2] = b;
                imgData.data[i * 4 + 3] = alpha;
            }
            bctx.putImageData(imgData, 0, 0);

            // Main canvas — dark BG then scale up the thermal image
            ctx.fillStyle = '#04080f';
            ctx.fillRect(0, 0, W, H);
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(buf, 0, 0, W, H);

            // Faint grid lines
            ctx.strokeStyle = 'rgba(10,132,255,0.06)';
            ctx.lineWidth = 0.5;
            for (let c = 1; c < 8; c++) {
                ctx.beginPath(); ctx.moveTo(c * W / 8, 0); ctx.lineTo(c * W / 8, H); ctx.stroke();
            }
            for (let r = 1; r < 6; r++) {
                ctx.beginPath(); ctx.moveTo(0, r * H / 6); ctx.lineTo(W, r * H / 6); ctx.stroke();
            }

            // Zone overlays
            if (showZones) {
                ZONE_OVERLAYS.forEach(z => {
                    const x = z.fx * W, y = z.fy * H, w = z.fw * W, h = z.fh * H;
                    ctx.strokeStyle = z.color + 'bb';
                    ctx.lineWidth = 1.5;
                    ctx.setLineDash([]);
                    ctx.strokeRect(x, y, w, h);

                    const chipW = 72, chipH = 28;
                    ctx.fillStyle = 'rgba(4,8,15,0.82)';
                    roundRect(ctx, x + 5, y + 5, chipW, chipH, 4); ctx.fill();
                    ctx.strokeStyle = z.color + '88';
                    ctx.lineWidth = 0.8;
                    roundRect(ctx, x + 5, y + 5, chipW, chipH, 4); ctx.stroke();

                    ctx.fillStyle = z.color;
                    ctx.font = 'bold 10px Inter, sans-serif';
                    ctx.textAlign = 'left';
                    ctx.fillText(`Zone ${z.label}`, x + 10, y + 17);
                    ctx.fillStyle = z.color + '99';
                    ctx.font = '7px Inter, sans-serif';
                    ctx.fillText(z.risk, x + 10, y + 27);
                });
            }

            // Incident markers
            if (showIncidents) {
                const pulse = (Math.sin(t * 3.2) + 1) / 2;
                INCIDENTS.forEach(inc => {
                    const ix = inc.fx * W, iy = inc.fy * H;
                    ctx.beginPath();
                    ctx.arc(ix, iy, 9 + pulse * 6, 0, Math.PI * 2);
                    const alpha16 = Math.round(50 + pulse * 130).toString(16).padStart(2, '0');
                    ctx.strokeStyle = inc.color + alpha16;
                    ctx.lineWidth = 1.2;
                    ctx.setLineDash([]);
                    ctx.stroke();

                    const grad = ctx.createRadialGradient(ix, iy, 0, ix, iy, 5);
                    grad.addColorStop(0, inc.color + 'ff');
                    grad.addColorStop(1, inc.color + '00');
                    ctx.beginPath();
                    ctx.arc(ix, iy, 5, 0, Math.PI * 2);
                    ctx.fillStyle = grad;
                    ctx.fill();

                    const lw = inc.label.length * 5.2 + 10;
                    ctx.fillStyle = 'rgba(4,8,15,0.88)';
                    roundRect(ctx, ix + 8, iy - 8, lw, 14, 3); ctx.fill();
                    ctx.strokeStyle = inc.color + '80';
                    ctx.lineWidth = 0.7;
                    roundRect(ctx, ix + 8, iy - 8, lw, 14, 3); ctx.stroke();
                    ctx.fillStyle = inc.color;
                    ctx.font = 'bold 7.5px JetBrains Mono, monospace';
                    ctx.textAlign = 'left';
                    ctx.fillText(inc.label, ix + 12, iy + 1.5);
                });
            }

            // FPS
            fpsRef.current.count++;
            if (Date.now() - fpsRef.current.last >= 1000) {
                setFps(fpsRef.current.count);
                fpsRef.current = { count: 0, last: Date.now() };
            }

            animRef.current = requestAnimationFrame(draw);
        }

        animRef.current = requestAnimationFrame(draw);
        return () => cancelAnimationFrame(animRef.current);
    }, [showZones, showIncidents]);

    // Resize canvas to match container
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        function sync() {
            canvas.width = canvas.offsetWidth;
            canvas.height = canvas.offsetHeight;
        }
        const ro = new ResizeObserver(sync);
        ro.observe(canvas);
        sync();
        return () => ro.disconnect();
    }, []);

    return (
        <div className="glass-card" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            {/* Header */}
            <div style={{ padding: '10px 14px 8px', borderBottom: '1px solid var(--border-primary)', flexShrink: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '12px', fontWeight: '700', letterSpacing: '1px', textTransform: 'uppercase' }}>
                            Thermal Camera
                        </span>
                        <span style={{
                            padding: '2px 7px', borderRadius: '3px',
                            background: 'rgba(255,45,85,0.15)', border: '1px solid rgba(255,45,85,0.4)',
                            fontSize: '9px', fontWeight: '700', color: 'var(--neon-red)', letterSpacing: '1px',
                        }} className="blink">● LIVE</span>
                        <span style={{ fontFamily: 'JetBrains Mono', fontSize: '9px', color: 'var(--text-muted)' }}>
                            {fps} fps
                        </span>
                    </div>
                    <div style={{ display: 'flex', gap: '5px' }}>
                        {[
                            { label: 'ZONES', active: showZones, fn: () => setShowZones(v => !v) },
                            { label: 'MARKERS', active: showIncidents, fn: () => setShowIncidents(v => !v) },
                        ].map(btn => (
                            <button key={btn.label} onClick={btn.fn} style={{
                                padding: '2px 7px', borderRadius: '3px', cursor: 'pointer',
                                fontSize: '9px', fontWeight: '700', letterSpacing: '0.5px',
                                border: `1px solid ${btn.active ? 'var(--neon-cyan)' : 'var(--border-primary)'}`,
                                background: btn.active ? 'rgba(90,200,250,0.12)' : 'transparent',
                                color: btn.active ? 'var(--neon-cyan)' : 'var(--text-muted)',
                                transition: 'all 0.2s',
                            }}>{btn.label}</button>
                        ))}
                    </div>
                </div>
                {/* Spectrum */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '9px', color: 'var(--text-muted)', flexShrink: 0 }}>COLD</span>
                    <div style={{
                        flex: 1, height: '4px', borderRadius: '2px',
                        background: 'linear-gradient(90deg, #000010, #0000cc, #00aaff, #00e0b0, #14d258, #dcc80a, #ff7800, #ff1e1e)',
                    }} />
                    <span style={{ fontSize: '9px', color: 'var(--text-muted)', flexShrink: 0 }}>CRITICAL</span>
                </div>
            </div>

            {/* Canvas area */}
            <div style={{ flex: 1, position: 'relative', overflow: 'hidden', padding: '6px' }}>
                <canvas
                    ref={canvasRef}
                    style={{ width: '100%', height: '100%', borderRadius: '6px', display: 'block' }}
                />
                {/* CRT scanlines */}
                <div style={{
                    position: 'absolute', inset: '6px', borderRadius: '6px', pointerEvents: 'none',
                    background: 'repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(0,0,0,0.05) 3px, rgba(0,0,0,0.05) 4px)',
                }} />
                {/* Corner crosshairs */}
                {[
                    { top: '10px', left: '10px', bT: true, bB: false, bL: true, bR: false },
                    { top: '10px', right: '10px', bT: true, bB: false, bL: false, bR: true },
                    { bottom: '10px', left: '10px', bT: false, bB: true, bL: true, bR: false },
                    { bottom: '10px', right: '10px', bT: false, bB: true, bL: false, bR: true },
                ].map((p, i) => (
                    <div key={i} style={{
                        position: 'absolute', ...p, width: '12px', height: '12px', pointerEvents: 'none',
                        borderTop: p.bT ? '1.5px solid rgba(90,200,250,0.5)' : 'none',
                        borderBottom: p.bB ? '1.5px solid rgba(90,200,250,0.5)' : 'none',
                        borderLeft: p.bL ? '1.5px solid rgba(90,200,250,0.5)' : 'none',
                        borderRight: p.bR ? '1.5px solid rgba(90,200,250,0.5)' : 'none',
                    }} />
                ))}
                {/* Camera badge */}
                <div style={{
                    position: 'absolute', bottom: '12px', right: '12px',
                    background: 'rgba(4,8,15,0.85)', border: '1px solid var(--border-primary)',
                    borderRadius: '4px', padding: '4px 8px',
                    fontSize: '8px', color: 'var(--text-muted)', fontFamily: 'JetBrains Mono',
                    lineHeight: 1.7, pointerEvents: 'none',
                }}>
                    <div>CAM-01 · THERMAL-IR</div>
                    <div style={{ color: 'var(--neon-red)' }} className="blink">● REC · 30Hz</div>
                </div>
            </div>
        </div>
    );
}
