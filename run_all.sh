#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

BACKEND_PORT="${BACKEND_PORT:-5000}"
BACKEND_HOST="${BACKEND_HOST:-127.0.0.1}"
AI_API_PORT="${AI_API_PORT:-8000}"
FRONTEND_PORT="${FRONTEND_PORT:-5173}"
# Default to live camera (0). Override with a file like 'crowd_test_video.mp4' if needed.
AI_SOURCE="${AI_SOURCE:-0}"
AI_SHOW="${AI_SHOW:-1}"  # 1 = show OpenCV window with detections, 0 = headless

LOG_DIR="${ROOT_DIR}/logs"
mkdir -p "${LOG_DIR}"

echo "Starting CrowdSafe services…"
echo "  Backend : http://${BACKEND_HOST}:${BACKEND_PORT}"
echo "  AI API  : http://127.0.0.1:${AI_API_PORT}/snapshot (source: ${AI_SOURCE}, show=${AI_SHOW})"
echo "  Frontend: http://127.0.0.1:${FRONTEND_PORT}"
echo

PIDS=()

cleanup() {
  echo
  echo "Shutting down…"
  for pid in "${PIDS[@]:-}"; do
    if kill -0 "${pid}" >/dev/null 2>&1; then
      kill "${pid}" >/dev/null 2>&1 || true
    fi
  done
}
trap cleanup EXIT INT TERM

# --- Backend (Node) ---
(
  cd "${ROOT_DIR}/backend"
  HOST="${BACKEND_HOST}" PORT="${BACKEND_PORT}" node server.js
) >"${LOG_DIR}/backend.log" 2>&1 &
backend_pid="$!"
PIDS+=("${backend_pid}")
echo "✅ Backend started (pid ${backend_pid}). Logs: logs/backend.log"

# --- AI Pipeline (Python) ---
AI_PY="${ROOT_DIR}/ai-pipeline/venv/bin/python"
if [[ ! -x "${AI_PY}" ]]; then
  AI_PY="python3"
fi
(
  cd "${ROOT_DIR}/ai-pipeline"
  if [[ "${AI_SHOW}" == "1" ]]; then
    "${AI_PY}" main.py --api-port "${AI_API_PORT}" --mode fastapi --source "${AI_SOURCE}" --show
  else
    "${AI_PY}" main.py --api-port "${AI_API_PORT}" --mode fastapi --source "${AI_SOURCE}"
  fi
) >"${LOG_DIR}/ai-pipeline.log" 2>&1 &
ai_pid="$!"
PIDS+=("${ai_pid}")
echo "✅ AI pipeline started (pid ${ai_pid}). Logs: logs/ai-pipeline.log"

# --- Frontend (Vite) ---
(
  cd "${ROOT_DIR}/frontend"
  VITE_BACKEND_URL="http://${BACKEND_HOST}:${BACKEND_PORT}" \
  VITE_AI_URL="http://127.0.0.1:${AI_API_PORT}" \
  npm run dev -- --host 127.0.0.1 --port "${FRONTEND_PORT}"
) >"${LOG_DIR}/frontend.log" 2>&1 &
fe_pid="$!"
PIDS+=("${fe_pid}")
echo "✅ Frontend started (pid ${fe_pid}). Logs: logs/frontend.log"

echo
echo "All processes started. Press Ctrl+C to stop."
wait

