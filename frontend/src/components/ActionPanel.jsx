import { useState } from 'react';

const ACTIONS = [
    {
        id: 'redirect',
        label: 'Redirect Crowd',
        detail: 'Divert flow from Zone A1 → Gate 3 via Route B',
        icon: '↗',
        color: 'var(--neon-blue)',
        bg: 'rgba(10,132,255,0.12)',
        border: 'rgba(10,132,255,0.4)',
        ai: 'AI confidence: 94% — Estimated relief in 4m 30s',
        confirmLabel: 'Confirm Redirect',
        zones: 'A1 → Gate 3',
    },
    {
        id: 'restrict',
        label: 'Restrict Entry',
        detail: 'Close Gate 1 North temporarily to reduce incoming flow',
        icon: '🚫',
        color: 'var(--neon-red)',
        bg: 'rgba(255,45,85,0.12)',
        border: 'rgba(255,45,85,0.4)',
        ai: 'AI confidence: 88% — Reduces inflow by ~40%',
        confirmLabel: 'Activate Restriction',
        zones: 'Gate 1-N',
    },
    {
        id: 'medical',
        label: 'Send Medical Team',
        detail: 'Deploy emergency medical response to the incident zone',
        icon: '🏥',
        color: 'var(--neon-green)',
        bg: 'rgba(52,199,89,0.12)',
        border: 'rgba(52,199,89,0.4)',
        ai: 'Nearest team: Station C — ETA ~2 mins',
        confirmLabel: 'Dispatch Medical',
        zones: 'Zone D4',
    },
    {
        id: 'security',
        label: 'Deploy Security',
        detail: 'Dispatch armed security units to high-risk zones',
        icon: '🛡',
        color: 'var(--neon-purple)',
        bg: 'rgba(191,90,242,0.12)',
        border: 'rgba(191,90,242,0.4)',
        ai: 'AI confidence: 91% — 8 units available',
        confirmLabel: 'Dispatch Security',
        zones: 'Zones A1, B2',
    },
    {
        id: 'announce',
        label: 'PA Announcement',
        detail: 'Broadcast calming crowd guidance via public address system',
        icon: '📢',
        color: 'var(--neon-cyan)',
        bg: 'rgba(90,200,250,0.12)',
        border: 'rgba(90,200,250,0.4)',
        ai: 'AI-generated message ready to broadcast',
        confirmLabel: 'Send Announcement',
        zones: 'Stadium-Wide',
    },
    {
        id: 'evacuation',
        label: 'Emergency Evacuation',
        detail: 'Initiate full venue emergency evacuation protocol',
        icon: '🚨',
        color: 'var(--neon-red)',
        bg: 'rgba(255,45,85,0.08)',
        border: 'rgba(255,45,85,0.6)',
        ai: 'CAUTION: This activates full emergency protocols',
        confirmLabel: '⚠ CONFIRM EVACUATION',
        zones: 'ALL ZONES',
        critical: true,
    },
];

const STATUS_MAP = {
    idle: null,
    active: '🔄 IN PROGRESS',
    done: '✅ EXECUTED',
};

export default function ActionPanel() {
    const [confirmPending, setConfirmPending] = useState(null);
    const [actionStatus, setActionStatus] = useState({});
    const [expanded, setExpanded] = useState(null);

    function handleAction(id) {
        if (confirmPending === id) {
            setActionStatus(prev => ({ ...prev, [id]: 'active' }));
            setConfirmPending(null);
            setExpanded(null);
            setTimeout(() => {
                setActionStatus(prev => ({ ...prev, [id]: 'done' }));
                setTimeout(() => setActionStatus(prev => { const n = { ...prev }; delete n[id]; return n; }), 5000);
            }, 2000);
        } else {
            setConfirmPending(id);
            setExpanded(id);
        }
    }

    function cancel(id) {
        setConfirmPending(null);
        if (expanded === id) setExpanded(null);
    }

    return (
        <div className="glass-card" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            {/* Header */}
            <div style={{ padding: '14px 16px 10px', borderBottom: '1px solid var(--border-primary)', flexShrink: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                    <span style={{ fontSize: '13px', fontWeight: '700', letterSpacing: '1px', textTransform: 'uppercase' }}>
                        Authority Actions
                    </span>
                    <div style={{
                        padding: '2px 7px', borderRadius: '4px',
                        background: 'rgba(191,90,242,0.15)', border: '1px solid rgba(191,90,242,0.4)',
                        fontSize: '9px', fontWeight: '700', color: 'var(--neon-purple)',
                    }}>COMMAND CENTER</div>
                </div>
                <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>AI-assisted emergency response management</div>
            </div>

            {/* Action list */}
            <div style={{ flex: 1, overflow: 'auto', padding: '10px' }}>
                {ACTIONS.map((action, idx) => {
                    const status = actionStatus[action.id];
                    const isPending = confirmPending === action.id;
                    const isExp = expanded === action.id;
                    return (
                        <div key={action.id} style={{ marginBottom: '8px' }} className="fade-in-up" style={{ animationDelay: `${idx * 80}ms` }}>
                            <div
                                style={{
                                    border: `1px solid ${isPending ? action.color : status ? 'rgba(52,199,89,0.4)' : 'var(--border-primary)'}`,
                                    borderRadius: '8px',
                                    background: isPending ? action.bg : status === 'done' ? 'rgba(52,199,89,0.06)' : 'rgba(255,255,255,0.02)',
                                    transition: 'all 0.3s ease',
                                    overflow: 'hidden',
                                    ...(action.critical && !status ? { borderColor: 'rgba(255,45,85,0.3)' } : {}),
                                }}
                            >
                                {/* Main row */}
                                <div
                                    style={{
                                        padding: '10px 12px',
                                        display: 'flex', alignItems: 'center', gap: '10px',
                                        cursor: 'pointer',
                                    }}
                                    onClick={() => !status && (isExp ? setExpanded(null) : setExpanded(action.id))}
                                >
                                    {/* Icon */}
                                    <div style={{
                                        width: '36px', height: '36px', borderRadius: '8px',
                                        background: action.bg,
                                        border: `1px solid ${action.border}`,
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        fontSize: '16px', flexShrink: 0,
                                        boxShadow: isPending ? `0 0 12px ${action.color}40` : 'none',
                                        transition: 'all 0.3s',
                                    }}>{action.icon}</div>

                                    {/* Label */}
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontSize: '12px', fontWeight: '700', color: status ? 'var(--neon-green)' : action.color, marginBottom: '2px' }}>
                                            {action.label}
                                        </div>
                                        <div style={{ fontSize: '10px', color: 'var(--text-muted)', lineHeight: 1.3 }}>
                                            {action.zones}
                                        </div>
                                    </div>

                                    {/* Status badge or indicator */}
                                    {status ? (
                                        <div style={{
                                            padding: '3px 8px', borderRadius: '4px',
                                            background: status === 'done' ? 'rgba(52,199,89,0.15)' : 'rgba(10,132,255,0.15)',
                                            border: `1px solid ${status === 'done' ? 'rgba(52,199,89,0.4)' : 'rgba(10,132,255,0.4)'}`,
                                            fontSize: '9px', fontWeight: '700',
                                            color: status === 'done' ? 'var(--neon-green)' : 'var(--neon-blue)',
                                        }}>{STATUS_MAP[status]}</div>
                                    ) : (
                                        <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>{isExp ? '▲' : '▶'}</span>
                                    )}
                                </div>

                                {/* Expanded panel */}
                                {isExp && !status && (
                                    <div style={{ padding: '0 12px 12px', borderTop: '1px solid var(--border-primary)' }} className="fade-in-up">
                                        <div style={{ fontSize: '11px', color: 'var(--text-secondary)', margin: '10px 0 8px', lineHeight: 1.5 }}>
                                            {action.detail}
                                        </div>
                                        <div style={{
                                            padding: '7px 10px', borderRadius: '6px',
                                            background: 'rgba(10,132,255,0.08)', border: '1px solid rgba(10,132,255,0.2)',
                                            marginBottom: '10px',
                                        }}>
                                            <div style={{ fontSize: '9px', color: 'var(--neon-blue)', marginBottom: '2px', fontWeight: '700', letterSpacing: '1px' }}>🧠 AI ANALYSIS</div>
                                            <div style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>{action.ai}</div>
                                        </div>
                                        <div style={{ display: 'flex', gap: '6px' }}>
                                            <button
                                                className="action-btn"
                                                onClick={() => handleAction(action.id)}
                                                style={{
                                                    flex: 1, padding: '8px',
                                                    background: isPending ? action.color : action.bg,
                                                    border: `1px solid ${action.color}`,
                                                    borderRadius: '6px',
                                                    color: isPending ? '#000' : action.color,
                                                    fontSize: isPending ? '10px' : '11px',
                                                    fontWeight: '700', letterSpacing: '1px',
                                                    boxShadow: isPending ? `0 0 15px ${action.color}60` : 'none',
                                                    transition: 'all 0.3s',
                                                }}
                                            >
                                                {isPending ? action.confirmLabel : 'EXECUTE →'}
                                            </button>
                                            {isPending && (
                                                <button
                                                    onClick={() => cancel(action.id)}
                                                    style={{
                                                        padding: '8px 14px',
                                                        background: 'transparent',
                                                        border: '1px solid var(--border-primary)',
                                                        borderRadius: '6px',
                                                        color: 'var(--text-muted)',
                                                        fontSize: '10px', cursor: 'pointer',
                                                    }}
                                                >Cancel</button>
                                            )}
                                        </div>
                                        {isPending && (
                                            <div style={{ textAlign: 'center', marginTop: '6px', fontSize: '9px', color: 'var(--neon-red)', letterSpacing: '1px', fontWeight: '600' }}>
                                                ⚠ Click confirm above to execute this action
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
