import asyncio
import json
import math
import os
from datetime import datetime, timedelta
from typing import Optional

import ccxt
from jose import JWTError, jwt
from fastapi import FastAPI, Request, Form, Depends, HTTPException, status, Query, WebSocket, WebSocketDisconnect
from fastapi.responses import HTMLResponse, RedirectResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from passlib.context import CryptContext

from database import get_db, User
from config.settings import BYBIT_API_KEY, BYBIT_SECRET

# Настройки JWT
SECRET_KEY = os.getenv("JWT_SECRET_KEY", "super-secret-key-change-me")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", 1440))
LEDGER_FILE = "signals_log.json"

app = FastAPI(title="AI Crypto Bot SaaS Platform")

# Настройка подпапок
os.makedirs("templates", exist_ok=True)
os.makedirs("static", exist_ok=True)

app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# --- JWT Helpers ---

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=15)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

async def get_current_user(request: Request, db: Session = Depends(get_db)):
    # Ищем токен в Cookie для удобства работы с HTML-шаблонами
    token = request.cookies.get("access_token")
    if not token:
        return None
    
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            return None
    except JWTError:
        return None
        
    user = db.query(User).filter(User.username == username).first()
    return user

# --- Маршруты Авторизации ---

@app.get("/", response_class=HTMLResponse)
async def home(request: Request, user: User = Depends(get_current_user)):
    if user:
        return RedirectResponse(url="/dashboard", status_code=status.HTTP_302_FOUND)
    return RedirectResponse(url="/login", status_code=status.HTTP_302_FOUND)

@app.get("/login", response_class=HTMLResponse)
async def login_page(request: Request):
    return templates.TemplateResponse(request=request, name="login.html", context={"error": None})

@app.post("/login")
async def login_post(
    request: Request, 
    username: str = Form(...), 
    password: str = Form(...), 
    action: str = Form(...), 
    db: Session = Depends(get_db)
):
    if action == "login":
        user = db.query(User).filter(User.username == username).first()
        if not user or not pwd_context.verify(password, user.password_hash):
            return templates.TemplateResponse(request=request, name="login.html", context={"error": "Неверный логин или пароль"})
    
    elif action == "register":
        existing_user = db.query(User).filter(User.username == username).first()
        if existing_user:
            return templates.TemplateResponse(request=request, name="login.html", context={"error": "Пользователь уже существует"})
        
        hashed_password = pwd_context.hash(password)
        user = User(username=username, password_hash=hashed_password)
        db.add(user)
        db.commit()
        db.refresh(user)

    # Создаем токен
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.username}, expires_delta=access_token_expires
    )
    
    response = RedirectResponse(url="/dashboard", status_code=status.HTTP_302_FOUND)
    # Ставим HttpOnly cookie для безопасности
    response.set_cookie(key="access_token", value=access_token, httponly=True, max_age=ACCESS_TOKEN_EXPIRE_MINUTES*60)
    return response

@app.get("/logout")
async def logout():
    response = RedirectResponse(url="/login")
    response.delete_cookie("access_token")
    return response


# --- Защищенные маршруты Дашборда ---

@app.get("/dashboard", response_class=HTMLResponse)
async def dashboard_settings(request: Request, user: User = Depends(get_current_user)):
    if not user:
        return RedirectResponse(url="/login", status_code=status.HTTP_302_FOUND)
    return templates.TemplateResponse(request=request, name="dashboard.html", context={"user": user})

@app.post("/dashboard")
async def update_settings(
    request: Request,
    bybit_api_key: str = Form(""),
    bybit_secret: str = Form(""),
    tg_chat_id: str = Form(""),
    leverage: int = Form(3),
    trade_size_percent: float = Form(5.0),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if not user:
        return RedirectResponse(url="/login", status_code=status.HTTP_302_FOUND)
        
    user.bybit_api_key = bybit_api_key
    user.bybit_secret = bybit_secret
    user.tg_chat_id = tg_chat_id
    user.leverage = leverage
    user.trade_size_percent = float(trade_size_percent)
    
    db.commit()
    return templates.TemplateResponse(request=request, name="dashboard.html", context={"user": user, "success": "Настройки успешно сохранены!"})

# --- Перенесенные API маршруты из web_server.py (теперь защищены) ---

@app.get("/activity", response_class=HTMLResponse)
async def trading_activity_page(request: Request, user: User = Depends(get_current_user)):
    if not user:
        return RedirectResponse(url="/login", status_code=status.HTTP_302_FOUND)
    # Возвращаем динамический шаблон
    return templates.TemplateResponse(request=request, name="activity.html", context={"user": user})

@app.get("/api/data")
async def get_dashboard_data(user: User = Depends(get_current_user)):
    if not user:
        raise HTTPException(status_code=401)
    
    # Загружаем сигналы
    signals = []
    if os.path.exists(LEDGER_FILE):
        try:
            with open(LEDGER_FILE, "r") as f:
                signals = json.load(f)
        except Exception: pass
            
    # Используем ключи конкретного пользователя, если они есть, иначе из .env
    api_key = user.bybit_api_key or BYBIT_API_KEY
    api_secret = user.bybit_secret or BYBIT_SECRET
    
    balance_info = {"total": 0, "free": 0}
    if api_key and api_secret:
        try:
            exchange = ccxt.bybit({"apiKey": api_key, "secret": api_secret})
            balance = exchange.fetch_balance()
            if "USDT" in balance:
                balance_info["total"] = balance["USDT"].get("total", 0)
                balance_info["free"] = balance["USDT"].get("free", 0)
        except: pass

    trades = [s for s in signals if s.get('action') in ('LONG', 'SHORT')]
    return {
        "status": "online",
        "user": user.username,
        "balance": balance_info,
        "latest_signals": signals[-20:][::-1],
        "stats": {
            "total_signals": len(signals),
            "total_trades": len(trades),
        }
    }

def _load_signals() -> list:
    if not os.path.exists(LEDGER_FILE): return []
    try:
        with open(LEDGER_FILE, "r") as f:
            return json.load(f)
    except: return []

@app.get("/api/signals")
async def get_signals(
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=200),
    user: User = Depends(get_current_user)
):
    if not user: raise HTTPException(status_code=401)
    all_signals = _load_signals()
    filtered = [s for s in all_signals if s.get("action") in ("LONG", "SHORT")]
    filtered.sort(key=lambda s: s.get("timestamp", ""), reverse=True)
    
    total = len(filtered)
    start = (page - 1) * limit
    return {
        "signals": filtered[start:start+limit],
        "total": total,
        "page": page,
        "pages": max(1, math.ceil(total / limit))
    }

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket, db: Session = Depends(get_db)):
    # WebSocket авторизация чуть сложнее (через query или cookie)
    await websocket.accept()
    # Для MVP просто пускаем, в идеале проверить JWT из cookie
    try:
        while True:
            await asyncio.sleep(10)
            signals = _load_signals()
            await websocket.send_json({"type": "ping", "signals_count": len(signals)})
    except WebSocketDisconnect: pass

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
