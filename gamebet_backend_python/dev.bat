@echo off
cd /d %~dp0
if not exist venv (
    echo [setup] creating virtualenv...
    python -m venv venv
    venv\Scripts\pip install -r requirements.txt
)
venv\Scripts\python -m uvicorn main:app --host 0.0.0.0 --port 3456 --reload
