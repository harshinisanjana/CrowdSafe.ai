import { useEffect, useRef, useState } from 'react';
import axios from 'axios';

// The AI pipeline uses a 10x10 grid by default
const COLS = 10;
const ROWS = 10;

// Thermal color gradient scale
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

export default function ThermalPanel() {
    const canvasRef = useRef(null);
    const animRef = useRef(null);
    const matrixRef = useRef(new Float32Array(COLS * ROWS));

    // Fetch heatmap matrix periodically
    useEffect(() => {
        const interval = setInterval(async () => {
            try {
                const res = await axios.get('http://localhost:8000/snapshot');
                if (res.data && res.data.heatmap_matrix) {
                    const matrix2D = res.data.heatmap_matrix; // 10x10 integer array

                    // Flatten and find max for normalization
                    const flat = new Float32Array(COLS * ROWS);
                    let maxVal = 0;
                    for (let r = 0; r < ROWS; r++) {
                        for (let c = 0; c < COLS; c++) {
                            const val = matrix2D[r][c] || 0;
                            flat[r * COLS + c] = val;
                            if (val > maxVal) maxVal = val;
                        }
                    }

                    // Normalize to 0.0 - 1.0
                    if (maxVal > 0) {
                        for (let i = 0; i < flat.length; i++) {
                            flat[i] /= maxVal;
                        }
                    }
                    matrixRef.current = flat;
                }
            } catch (err) {
                // Background fetch, ignore if offline
            }
        }, 1000); // 1 FPS update for the heatmap grid is sufficient
        return () => clearInterval(interval);
    }, []);

    // Render loop
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');

        // Small 10x10 buffer canvas to draw the raw data
        const buf = document.createElement('canvas');
        buf.width = COLS;
        buf.height = ROWS;
        const bctx = buf.getContext('2d');

        function draw() {
            const W = canvas.width;
            const H = canvas.height;
            if (!W || !H) { animRef.current = requestAnimationFrame(draw); return; }

            const grid = matrixRef.current;

            // Build 10x10 thermal pixel data
            const imgData = bctx.createImageData(COLS, ROWS);
            for (let i = 0; i < COLS * ROWS; i++) {
                const v = grid[i];
                const [r, g, b] = thermalRGBA(v);
                const alpha = v <= 0.01 ? 150 : 255; // Keep empty space slightly dark but visible
                imgData.data[i * 4] = r;
                imgData.data[i * 4 + 1] = g;
                imgData.data[i * 4 + 2] = b;
                imgData.data[i * 4 + 3] = alpha;
            }
            bctx.putImageData(imgData, 0, 0);

            // Draw to main canvas with smoothing to create the blurry thermal effect
            ctx.fillStyle = '#04080f';
            ctx.fillRect(0, 0, W, H);

            // This is the magic! HTML5 native blur scale
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(buf, 0, 0, W, H);

            // Faint grid lines on top for UI aesthetic
            ctx.strokeStyle = 'rgba(10,132,255,0.08)';
            ctx.lineWidth = 1;
            for (let c = 1; c < COLS; c++) {
                ctx.beginPath(); ctx.moveTo(c * W / COLS, 0); ctx.lineTo(c * W / COLS, H); ctx.stroke();
            }
            for (let r = 1; r < ROWS; r++) {
                ctx.beginPath(); ctx.moveTo(0, r * H / ROWS); ctx.lineTo(W, r * H / ROWS); ctx.stroke();
            }

            animRef.current = requestAnimationFrame(draw);
        }

        animRef.current = requestAnimationFrame(draw);
        return () => cancelAnimationFrame(animRef.current);
    }, []);

    // Resize canvas safely to container
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
                            Spatial Heatmap
                        </span>
                        <span style={{
                            padding: '2px 7px', borderRadius: '3px',
                            background: 'rgba(255,45,85,0.15)', border: '1px solid rgba(255,45,85,0.4)',
                            fontSize: '9px', fontWeight: '700', color: 'var(--neon-red)', letterSpacing: '1px',
                        }} className="blink">● LIVE AI</span>
                    </div>
                </div>
                {/* Spectrum */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '9px', color: 'var(--text-muted)', flexShrink: 0 }}>LOW</span>
                    <div style={{
                        flex: 1, height: '4px', borderRadius: '2px',
                        background: 'linear-gradient(90deg, #000010, #0000cc, #00aaff, #00e0b0, #14d258, #dcc80a, #ff7800, #ff1e1e)',
                    }} />
                    <span style={{ fontSize: '9px', color: 'var(--text-muted)', flexShrink: 0 }}>HIGH DENSITY</span>
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
                    <div>CAM-01 · AI-HEATMAP</div>
                    <div style={{ color: 'var(--neon-green)' }} className="blink">● REC · ACTIVE</div>
                </div>
            </div>
        </div>
    );
}
