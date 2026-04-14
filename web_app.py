from fastapi import FastAPI, Request, Form, Depends, HTTPException, status
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from passlib.context import CryptContext
from database import get_db, User
import os

app = FastAPI(title="AI Crypto Bot SaaS")

# Настройка подпапок
os.makedirs("templates", exist_ok=True)
os.makedirs("static", exist_ok=True)

app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Простая эмуляция сессий через Cookie
def get_current_user_from_cookie(request: Request, db: Session = Depends(get_db)):
    username = request.cookies.get("session_user")
    if username:
        return db.query(User).filter(User.username == username).first()
    return None

@app.get("/", response_class=HTMLResponse)
async def home(request: Request, db: Session = Depends(get_db)):
    user = get_current_user_from_cookie(request, db)
    if user:
        return RedirectResponse(url="/dashboard", status_code=status.HTTP_302_FOUND)
    return RedirectResponse(url="/login", status_code=status.HTTP_302_FOUND)

@app.get("/login", response_class=HTMLResponse)
async def login_page(request: Request):
    return templates.TemplateResponse(request=request, name="login.html", context={"error": None})

@app.post("/login", response_class=HTMLResponse)
async def login_post(request: Request, username: str = Form(...), password: str = Form(...), action: str = Form(...), db: Session = Depends(get_db)):
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
    
    # Авторизация успешна, ставим куки
    response = RedirectResponse(url="/dashboard", status_code=status.HTTP_302_FOUND)
    response.set_cookie(key="session_user", value=user.username, httponly=True)
    return response

@app.get("/logout")
async def logout():
    response = RedirectResponse(url="/login")
    response.delete_cookie("session_user")
    return response

@app.get("/dashboard", response_class=HTMLResponse)
async def dashboard_page(request: Request, db: Session = Depends(get_db)):
    user = get_current_user_from_cookie(request, db)
    if not user:
        return RedirectResponse(url="/login", status_code=status.HTTP_302_FOUND)
        
    return templates.TemplateResponse(request=request, name="dashboard.html", context={"user": user})

@app.post("/dashboard")
async def update_dashboard(
    request: Request,
    bybit_api_key: str = Form(""),
    bybit_secret: str = Form(""),
    tg_chat_id: str = Form(""),
    leverage: int = Form(3),
    trade_size_percent: float = Form(5.0),
    db: Session = Depends(get_db)
):
    user = get_current_user_from_cookie(request, db)
    if not user:
        return RedirectResponse(url="/login", status_code=status.HTTP_302_FOUND)
        
    user.bybit_api_key = bybit_api_key
    user.bybit_secret = bybit_secret
    user.tg_chat_id = tg_chat_id
    user.leverage = leverage
    user.trade_size_percent = float(trade_size_percent)
    
    db.commit()
    return templates.TemplateResponse(request=request, name="dashboard.html", context={"user": user, "success": "Настройки успешно сохранены!"})
