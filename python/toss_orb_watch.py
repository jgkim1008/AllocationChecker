#!/usr/bin/env python3
"""
토스증권 오픈 API 기반 ORB(Opening Range Breakout) 실시간 감시 워커 (페이퍼 트레이딩)

⚠️ 이 스크립트는 시세 조회 + 텔레그램 알림만 한다. 주문 API는 절대 호출하지 않는다.
   신호가 뜨면 텔레그램으로만 알려주고, 실제 매매는 사람이 직접 판단해서 넣는다.

매일:
  1. 09:00 KST 장 시작 대기
  2. 09:00~09:30 REST 캔들로 박스(고가/저가) 계산
  3. 09:30부터 웹소켓 실시간 체결(trade:kr) 구독 → 박스 상단 돌파 시 페이퍼 진입
  4. 손절(박스하단 or -stop_pct) / 15:20 강제청산까지 감시, 각 시점마다 텔레그램 알림
  5. 장 마감 후 다음 거래일 09:00까지 대기 (주말 스킵, 공휴일은 미고려 — 알아서 확인 필요)

웹 대시보드(app/(dashboard)/auto-trade/toss-orb)에서 현재 상태(박스/포지션)를 보고 정지시킬 수 있다 —
Supabase `toss_orb_worker_state` 테이블에 상태를 주기적으로 upsert하고, `should_run` 플래그를 폴링해서
false가 되면(정지 버튼) 스스로 종료한다. 웹에서 원격으로 "시작"은 못 시킨다 — 재시작은 맥에서 직접 재실행해야 함.
CLI로 같은 걸 하려면 `python3 toss_orb_control.py --stop` (텔레그램 채팅으로 정지 요청 시에도 이걸 씀 —
워커가 직접 텔레그램을 폴링하진 않음, 기존 Claude Telegram 채널의 getUpdates 폴링과 충돌 방지).

의존성: websockets (pip install websockets), stdlib 나머지.
환경변수 (.env.local): TOSS_CLIENT_ID, TOSS_CLIENT_SECRET, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID,
                        NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (상태 대시보드용, 없으면 알림만 동작)

사용법:
  python3 toss_orb_watch.py --symbol 122630
"""

import os
import sys
import json
import time
import atexit
import tempfile
import argparse
import asyncio
import urllib.parse
import urllib.request
import urllib.error
from datetime import datetime, timedelta, timezone
from dataclasses import dataclass
from typing import Optional

import websockets

BASE = "https://openapi.tossinvest.com"
WS_URL = "wss://openapi-ws.tossinvest.com/ws/v1"
KST = timezone(timedelta(hours=9))


# ─────────────────────────────────────────────────────────────────────────────
# env / 텔레그램 / 토스 REST 유틸 (python/toss_backtest.py 와 동일 패턴)
# ─────────────────────────────────────────────────────────────────────────────

def load_env() -> None:
    root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    path = os.path.join(root, ".env.local")
    if not os.path.exists(path):
        return
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, val = line.partition("=")
            key, val = key.strip(), val.strip().strip('"').strip("'")
            os.environ.setdefault(key, val)


def log(msg: str) -> None:
    ts = datetime.now(KST).strftime("%Y-%m-%d %H:%M:%S")
    print(f"[{ts}] {msg}", flush=True)


def notify(text: str) -> None:
    """텔레그램 알림 전송 (실패해도 워커는 계속 진행)."""
    token = os.environ.get("TELEGRAM_BOT_TOKEN")
    chat_id = os.environ.get("TELEGRAM_CHAT_ID")
    log(f"[알림] {text}")
    if not token or not chat_id:
        return
    body = urllib.parse.urlencode({"chat_id": chat_id, "text": text}).encode()
    req = urllib.request.Request(
        f"https://api.telegram.org/bot{token}/sendMessage", method="POST", data=body
    )
    try:
        urllib.request.urlopen(req, timeout=10).read()
    except Exception as e:  # 알림 실패로 워커가 죽으면 안 됨
        log(f"텔레그램 전송 실패: {e}")


def _lock_path(symbol: str) -> str:
    return os.path.join(tempfile.gettempdir(), f"toss_orb_watch_{symbol}.lock")


def _release_lock(path: str) -> None:
    try:
        os.remove(path)
    except FileNotFoundError:
        pass


def acquire_lock(symbol: str) -> None:
    """같은 종목으로 워커를 두 번 띄우는 걸 방지. 죽은 프로세스가 남긴 stale lock은 무시하고 진행."""
    path = _lock_path(symbol)
    if os.path.exists(path):
        try:
            with open(path) as f:
                old_pid = int(f.read().strip())
            os.kill(old_pid, 0)  # 살아있으면 예외 안 남 (신호를 실제로 보내지 않고 존재만 확인)
            sys.exit(
                f"❌ 이미 실행 중인 워커가 있습니다 (PID {old_pid}, symbol={symbol}).\n"
                f"   중복 실행 방지를 위해 종료합니다. 기존 프로세스를 먼저 정지하세요 "
                f"(웹 대시보드 정지 버튼 또는 `kill {old_pid}`)."
            )
        except (ProcessLookupError, ValueError):
            pass  # 죽은 프로세스의 stale lock이거나 손상된 파일 — 무시하고 새로 씀
    with open(path, "w") as f:
        f.write(str(os.getpid()))
    atexit.register(_release_lock, path)


class StopRequested(Exception):
    """웹 대시보드의 정지 버튼(should_run=false)으로 인한 종료."""


def push_state(symbol: str, **fields) -> None:
    """Supabase toss_orb_worker_state 테이블에 upsert (실패해도 워커는 계속 진행, 알림용 상태일 뿐)."""
    url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        return
    payload = {"symbol": symbol, "updated_at": datetime.now(timezone.utc).isoformat(), **fields}
    req = urllib.request.Request(
        f"{url}/rest/v1/toss_orb_worker_state",
        method="POST",
        headers={
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
            "Prefer": "resolution=merge-duplicates",
        },
        data=json.dumps(payload).encode(),
    )
    try:
        urllib.request.urlopen(req, timeout=10).read()
    except Exception as e:
        log(f"상태 업데이트 실패(Supabase): {e}")


def fetch_should_run(symbol: str) -> bool:
    """웹 대시보드 정지 플래그 확인. 조회 실패/행 없음이면 기본 True(계속 실행)."""
    url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        return True
    params = urllib.parse.urlencode({"symbol": f"eq.{symbol}", "select": "should_run"})
    req = urllib.request.Request(
        f"{url}/rest/v1/toss_orb_worker_state?{params}",
        headers={"apikey": key, "Authorization": f"Bearer {key}"},
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            rows = json.loads(resp.read().decode())
        if rows:
            return bool(rows[0].get("should_run", True))
    except Exception as e:
        log(f"should_run 조회 실패: {e}")
    return True


def check_stop(symbol: str) -> None:
    if not fetch_should_run(symbol):
        raise StopRequested()


def get_token() -> str:
    cid = os.environ.get("TOSS_CLIENT_ID")
    csec = os.environ.get("TOSS_CLIENT_SECRET")
    if not cid or not csec:
        sys.exit("❌ TOSS_CLIENT_ID / TOSS_CLIENT_SECRET 가 없습니다.")
    body = urllib.parse.urlencode({
        "grant_type": "client_credentials",
        "client_id": cid,
        "client_secret": csec,
    }).encode()
    req = urllib.request.Request(
        f"{BASE}/oauth2/token", method="POST",
        headers={"Content-Type": "application/x-www-form-urlencoded"}, data=body,
    )
    with urllib.request.urlopen(req, timeout=20) as resp:
        out = json.loads(resp.read().decode())
    tok = out.get("access_token")
    if not tok:
        sys.exit(f"❌ 토큰 발급 실패: {out}")
    return tok


def fetch_candles(token: str, symbol: str, interval: str, count: int, before: Optional[str] = None) -> dict:
    params = {"symbol": symbol, "interval": interval, "count": count, "adjusted": "true"}
    if before:
        params["before"] = before
    url = f"{BASE}/api/v1/candles?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"})
    with urllib.request.urlopen(req, timeout=20) as resp:
        data = json.loads(resp.read().decode())
    return data.get("result", data)


# ─────────────────────────────────────────────────────────────────────────────
# 거래일 스케줄링 (주말 스킵, 공휴일 미고려)
# ─────────────────────────────────────────────────────────────────────────────

def next_session_start(now: datetime) -> datetime:
    """다음 09:00 KST (주말이면 월요일로 스킵). 공휴일은 감안 안 함 — 휴장일에도 대기하다가 데이터 없으면 스킵됨."""
    d = now
    while True:
        candidate = d.replace(hour=9, minute=0, second=0, microsecond=0)
        if candidate > now and d.weekday() < 5:
            return candidate
        d = (d + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
        if d.weekday() >= 5:
            continue


async def sleep_until(target: datetime, symbol: str) -> None:
    while True:
        check_stop(symbol)
        remaining = (target - datetime.now(KST)).total_seconds()
        if remaining <= 0:
            return
        await asyncio.sleep(min(remaining, 120))


# ─────────────────────────────────────────────────────────────────────────────
# 박스 형성 (09:00~09:30 REST 캔들)
# ─────────────────────────────────────────────────────────────────────────────

def compute_box(token: str, symbol: str, or_minutes: int) -> tuple[float, float]:
    """오늘 09:00~(09:00+or_minutes) 1분봉으로 박스 고가/저가 계산."""
    today = datetime.now(KST).strftime("%Y-%m-%d")
    before = f"{today}T09:{or_minutes:02d}:00+09:00"
    out = fetch_candles(token, symbol, "1m", count=or_minutes + 5, before=before)
    candles = [c for c in out.get("candles", []) if f"{today}T09:" in c["timestamp"]]
    if not candles:
        raise RuntimeError("박스 형성 구간(09:00~09:%02d) 캔들을 못 가져왔습니다 (휴장일일 수 있음)" % or_minutes)
    box_high = max(float(c["highPrice"]) for c in candles)
    box_low = min(float(c["lowPrice"]) for c in candles)
    return box_high, box_low


# ─────────────────────────────────────────────────────────────────────────────
# 페이퍼 포지션 상태머신
# ─────────────────────────────────────────────────────────────────────────────

@dataclass
class PaperPosition:
    entry: float
    entry_time: str
    stop: float


async def run_session(symbol: str, or_minutes: int, stop_pct: float, force_exit: str) -> None:
    token = get_token()
    box_high, box_low = compute_box(token, symbol, or_minutes)
    notify(f"📦 [{symbol}] 박스 형성 완료: 고가 {box_high:.0f} / 저가 {box_low:.0f} → 상단 돌파 시 페이퍼 진입 감시 시작")
    push_state(symbol, status="watching", box_high=box_high, box_low=box_low,
               position_entry=None, position_entry_time=None, position_stop=None,
               last_event="박스 형성 완료, 감시 시작")

    fh, fm = map(int, force_exit.split(":"))
    position: Optional[PaperPosition] = None
    done_for_today = False
    last_state_push = 0.0
    last_stop_check = 0.0

    async def send_ping(ws):
        while True:
            await asyncio.sleep(60)
            try:
                await ws.send("PING")
            except Exception:
                return

    while not done_for_today:
        try:
            async with websockets.connect(
                WS_URL, additional_headers={"Authorization": f"Bearer {token}"}, open_timeout=15
            ) as ws:
                await ws.send(json.dumps([{"type": "trade:kr", "codes": [symbol]}]))
                ping_task = asyncio.create_task(send_ping(ws))
                log(f"웹소켓 연결 + 구독 완료 ({symbol})")

                try:
                    while True:
                        now = datetime.now(KST)
                        if time.time() - last_stop_check > 10:
                            check_stop(symbol)  # 웹 대시보드 정지 버튼 확인 (should_run=false 면 StopRequested), 10초 스로틀
                            last_stop_check = time.time()

                        # 강제청산 시각 도달 → 오늘 감시 종료 (틱 유무와 무관하게 주기적으로 체크)
                        if (now.hour, now.minute) >= (fh, fm):
                            if position:
                                notify(
                                    f"🔔 [{symbol}] 장마감 강제청산 (페이퍼) — "
                                    f"진입 {position.entry:.0f} → 시각 {force_exit} 도달"
                                )
                                push_state(symbol, status="watching", position_entry=None,
                                           position_entry_time=None, position_stop=None,
                                           last_event="장마감 강제청산")
                                position = None
                            done_for_today = True
                            break

                        try:
                            raw = await asyncio.wait_for(ws.recv(), timeout=20)
                        except asyncio.TimeoutError:
                            continue  # 틱이 없어도 20초마다 깨어나서 강제청산 시각/정지 플래그 재확인

                        try:
                            msg = json.loads(raw)
                        except json.JSONDecodeError:
                            continue

                        if msg.get("type") == "error":
                            code = msg.get("error", {}).get("code")
                            log(f"에러 프레임: {msg}")
                            if code == "server-shutdown":
                                break  # 바깥 while 에서 재연결
                            continue

                        if msg.get("type") != "message":
                            continue
                        if msg.get("topic") != f"trade:kr:{symbol}":
                            continue

                        price = float(msg["data"]["price"])

                        if position is None:
                            if price > box_high:
                                stop = max(box_low, price * (1 - stop_pct))
                                position = PaperPosition(entry=price, entry_time=now.strftime("%H:%M:%S"), stop=stop)
                                notify(
                                    f"🚀 [{symbol}] 박스 상단({box_high:.0f}) 돌파 진입 (페이퍼) — "
                                    f"체결가 {price:.0f} / 손절가 {stop:.0f}"
                                )
                                push_state(symbol, status="in_position", position_entry=position.entry,
                                           position_entry_time=position.entry_time, position_stop=position.stop,
                                           last_price=price, last_event="진입")
                        else:
                            if price <= position.stop:
                                ret = (price / position.entry - 1) * 100
                                notify(
                                    f"🛑 [{symbol}] 손절 (페이퍼) — 진입 {position.entry:.0f}({position.entry_time}) → "
                                    f"청산 {price:.0f} ({ret:+.2f}%)"
                                )
                                push_state(symbol, status="watching", position_entry=None,
                                           position_entry_time=None, position_stop=None,
                                           last_price=price, last_event=f"손절 청산 ({ret:+.2f}%)")
                                position = None

                        # 상태(현재가 등) 주기적 갱신 — 매 틱마다 쏘지 않고 5초 스로틀
                        if time.time() - last_state_push > 5:
                            push_state(symbol, status=("in_position" if position else "watching"),
                                       last_price=price)
                            last_state_push = time.time()
                finally:
                    ping_task.cancel()

        except StopRequested:
            raise
        except Exception as e:
            log(f"웹소켓 연결 오류: {e} → 재연결 대기")
            await asyncio.sleep(3)


async def main_loop(symbol: str, or_minutes: int, stop_pct: float, force_exit: str) -> None:
    notify(f"🟢 토스 ORB 워커 시작 — 종목 {symbol}, 박스 {or_minutes}분, 손절 {stop_pct*100:.1f}%, 강제청산 {force_exit} (페이퍼 트레이딩, 실주문 없음)")
    # 로컬 프로세스를 새로 시작하는 시점 = 사용자가 다시 켠 것이므로 정지 플래그를 되살린다.
    # (웹 대시보드는 정지만 시킬 수 있고, 재시작은 사용자가 맥에서 직접 이 스크립트를 다시 실행해야 함)
    push_state(symbol, should_run=True, status="waiting", last_event="워커 시작")
    while True:
        now = datetime.now(KST)
        market_open = now.replace(hour=9, minute=0, second=0, microsecond=0)
        box_ready = now.replace(hour=9, minute=or_minutes, second=5, microsecond=0)
        market_close = now.replace(hour=15, minute=30, second=0, microsecond=0)

        if now.weekday() >= 5 or now >= market_close:
            target = next_session_start(now)
            log(f"장 시간 아님. 다음 세션까지 대기: {target}")
            push_state(symbol, status="waiting", last_event=f"다음 세션 대기 ({target.strftime('%Y-%m-%d %H:%M')})")
            await sleep_until(target, symbol)
            continue

        if now < box_ready:
            log(f"박스 형성 대기 중 ({box_ready} 까지)")
            push_state(symbol, status="waiting", last_event="박스 형성 대기 중")
            await sleep_until(box_ready, symbol)
            continue

        try:
            await run_session(symbol, or_minutes, stop_pct, force_exit)
            # run_session은 강제청산 시각 도달(오늘 세션 완료) 시에만 정상 리턴한다.
            # 그대로 while 맨 위로 돌아가면 market_close(15:30) 전까지는 box_ready 조건도
            # market_close 조건도 안 걸려서 run_session이 즉시 재호출되는 버그가 있었음
            # (강제청산~장마감 사이 매번 토큰재발급+박스재계산+알림이 무한 반복).
            # → 여기서 바로 다음 거래일까지 대기시켜서 오늘 재진입을 막는다.
            target = next_session_start(datetime.now(KST))
            log(f"오늘 세션 종료. 다음 세션까지 대기: {target}")
            push_state(symbol, status="waiting", last_event=f"오늘 세션 종료, 다음 세션 대기 ({target.strftime('%Y-%m-%d %H:%M')})")
            await sleep_until(target, symbol)
        except StopRequested:
            raise
        except Exception as e:
            notify(f"⚠️ [{symbol}] 워커 오류: {e} — 5분 후 재시도")
            push_state(symbol, status="error", last_event=str(e))
            await asyncio.sleep(300)


def main() -> None:
    load_env()
    ap = argparse.ArgumentParser(description="토스 ORB 실시간 감시 워커 (페이퍼 트레이딩, 텔레그램 알림)")
    ap.add_argument("--symbol", default="122630", help="종목코드 (기본: 122630 KODEX 레버리지)")
    ap.add_argument("--or-minutes", type=int, default=30, help="박스 형성 시간(분)")
    ap.add_argument("--stop-pct", type=float, default=0.005, help="손절폭 (0.005 = 0.5%%)")
    ap.add_argument("--force-exit", default="15:20", help="강제청산 시각 (HH:MM)")
    args = ap.parse_args()
    acquire_lock(args.symbol)

    try:
        asyncio.run(main_loop(args.symbol, args.or_minutes, args.stop_pct, args.force_exit))
    except KeyboardInterrupt:
        log("워커 종료 (Ctrl+C)")
        push_state(args.symbol, status="stopped", last_event="Ctrl+C로 종료")
    except StopRequested:
        notify(f"🔴 [{args.symbol}] 웹 대시보드 정지 요청으로 워커 종료")
        push_state(args.symbol, status="stopped", should_run=False, last_event="웹에서 정지됨")


if __name__ == "__main__":
    main()
