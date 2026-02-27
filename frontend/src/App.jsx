import { useState, useEffect } from 'react'
import { io } from 'socket.io-client'

// Connect to backend (mock URL for development)
const socket = io('http://localhost:5000')

function App() {
    const [alerts, setAlerts] = useState([])
    const [heatmap, setHeatmap] = useState({})

    useEffect(() => {
        socket.on('connect', () => {
            console.log('Connected to Backend!')
        })

        socket.on('new_alert', (data) => {
            setAlerts(prev => [data, ...prev].slice(0, 5))
        })

        socket.on('heatmap_data', (data) => {
            setHeatmap(data)
        })

        return () => {
            socket.off('connect')
            socket.off('new_alert')
            socket.off('heatmap_data')
        }
    }, [])

    return (
        <div className="min-h-screen p-8 bg-black">
            <header className="mb-8 border-b border-gray-800 pb-6">
                <h1 className="text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-emerald-400">
                    CrowdWatch AI Dashboard
                </h1>
                <p className="text-gray-400 mt-2 text-lg">Real-time venue monitoring & anomaly detection</p>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Heatmap Panel */}
                <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 shadow-[0_0_40px_rgba(0,0,0,0.5)]">
                    <h2 className="text-2xl font-semibold mb-6 text-cyan-400 flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full bg-cyan-400 animate-pulse"></span>
                        Live Density (Mock Data)
                    </h2>
                    <div className="p-6 bg-gray-800/50 rounded-xl border border-gray-700/50 flex items-center justify-between">
                        <div className="flex flex-col">
                            <span className="text-gray-400 text-sm tracking-wider uppercase mb-1">Monitored Zone</span>
                            <span className="text-xl text-white font-medium">{heatmap.zone || 'Scanning...'}</span>
                        </div>
                        <div className="flex flex-col items-end">
                            <span className="text-gray-400 text-sm tracking-wider uppercase mb-1">Density Level</span>
                            <span className={`text-4xl font-bold ${heatmap.density > 80 ? 'text-red-500' : 'text-emerald-400'}`}>
                                {heatmap.density || 0}%
                            </span>
                        </div>
                    </div>
                </div>

                {/* Alerts Panel */}
                <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 shadow-[0_0_40px_rgba(0,0,0,0.5)] flex flex-col">
                    <h2 className="text-2xl font-semibold mb-6 text-red-400 flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full bg-red-500"></span>
                        Active Alerts
                    </h2>
                    <div className="space-y-4 overflow-y-auto flex-1 pr-2">
                        {alerts.length === 0 ? (
                            <div className="h-full flex items-center justify-center text-gray-500 italic">
                                No active anomalies detected
                            </div>
                        ) : (
                            alerts.map((alert, idx) => (
                                <div key={idx} className="p-5 border-l-4 border-red-500 bg-red-500/10 rounded-r-xl shadow-sm transition-all hover:bg-red-500/20">
                                    <div className="flex justify-between items-start mb-2">
                                        <strong className="text-red-400 text-lg tracking-wide">{alert.type.replace('_', ' ')}</strong>
                                        <span className="text-xs px-2 py-1 bg-red-500/20 text-red-300 rounded-full border border-red-500/30">
                                            {alert.severity}
                                        </span>
                                    </div>
                                    <div className="flex justify-between items-end mt-3">
                                        <span className="text-gray-300 text-sm">Location: <span className="text-white font-medium">{alert.zone}</span></span>
                                        <span className="text-gray-400 text-sm">Density peak: {alert.density}%</span>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}

export default App
