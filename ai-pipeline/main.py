from fastapi import FastAPI
import uvicorn
import time
import random
import requests
import threading

app = FastAPI()

NODE_BACKEND_URL = "http://localhost:5000/api/alerts"

def mock_ai_camera_feed():
    """Simulates AI analyzing video frames and sending critical alerts to the Node.js backend"""
    print("[AI Pipeline] Mock camera analysis started...")
    while True:
        time.sleep(5) # Analyze every 5 seconds
        
        # Simulate a 30% chance of anomaly detection (Crowd Surge / Running)
        if random.random() > 0.7:
            alert = {
                "type": "CROWD_SURGE",
                "severity": "CRITICAL",
                "zone": f"Gate {random.randint(1, 5)}",
                "density": random.randint(85, 100)
            }
            try:
                print(f"[AI] Detected anomaly, sending alert to Node server: {alert}")
                requests.post(NODE_BACKEND_URL, json=alert)
            except Exception as e:
                print(f"[AI] Failed to reach Node backend. Ensure it is running on port 5000.")

@app.on_event("startup")
def startup_event():
    # Start the mock AI camera feed processor in the background
    thread = threading.Thread(target=mock_ai_camera_feed, daemon=True)
    thread.start()

@app.get("/")
def read_root():
    return {"status": "AI Pipeline is Active"}

if __name__ == "__main__":
    # Start FastAPI server on port 8000
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
