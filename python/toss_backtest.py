#!/usr/bin/env python3
"""
토스증권 오픈 API 분봉 백테스트 (읽기 전용)

- OAuth2 client_credentials 로 access_token 발급
- GET /api/v1/candles 분봉 조회 (요청당 최대 200봉, before 커서로 페이지네이션)
- ORB(Opening Range Breakout) 단타 전략 백테스트

⚠️ 이 스크립트는 시세 조회만 한다. 주문/잔고 API는 절대 호출하지 않는다 (읽기 전용).
   stdlib 만 사용 (requests/pandas 불필요).

환경변수 (.env.local 또는 셸):
  TOSS_CLIENT_ID, TOSS_CLIENT_SECRET

사용법:
  # 1) 데이터 검증 — 종목코드 포맷 + 1분봉 히스토리 깊이 확인 (키 넣고 제일 먼저 실행)
  python3 toss_backtest.py --spike --symbol 005930

  # 2) 백테스트 (ORB)
  python3 toss_backtest.py --symbol 005930 --max-bars 4000
"""

import os
import sys
import json
import time
import argparse
import functools
import urllib.parse
import urllib.request
import urllib.error
from datetime import datetime, timedelta, timezone
from dataclasses import dataclass, field
from typing import Optional, Callable

BASE = "https://openapi.tossinvest.com"
KST = timezone(timedelta(hours=9))

# ─────────────────────────────────────────────────────────────────────────────
# env 로딩 (.env.local 간단 파서)
# ─────────────────────────────────────────────────────────────────────────────

def load_env() -> None:
    """프로젝트 루트의 .env.local 을 읽어 os.environ 에 주입 (이미 있으면 유지)."""
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


# ─────────────────────────────────────────────────────────────────────────────
# HTTP 유틸
# ─────────────────────────────────────────────────────────────────────────────

def _http(method: str, url: str, *, headers: dict, data: Optional[bytes] = None) -> dict:
    req = urllib.request.Request(url, method=method, headers=headers, data=data)
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            body = resp.read().decode("utf-8")
            return json.loads(body) if body else {}
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", "replace")
        raise RuntimeError(f"HTTP {e.code} {method} {url}\n{detail}") from None


def get_token() -> str:
    cid = os.environ.get("TOSS_CLIENT_ID")
    csec = os.environ.get("TOSS_CLIENT_SECRET")
    if not cid or not csec:
        sys.exit(
            "❌ TOSS_CLIENT_ID / TOSS_CLIENT_SECRET 가 없습니다.\n"
            "   .env.local 에 아래를 추가하세요:\n"
            "     TOSS_CLIENT_ID=발급받은_클라이언트_ID\n"
            "     TOSS_CLIENT_SECRET=발급받은_시크릿"
        )
    body = urllib.parse.urlencode({
        "grant_type": "client_credentials",
        "client_id": cid,
        "client_secret": csec,
    }).encode()
    out = _http("POST", f"{BASE}/oauth2/token",
                headers={"Content-Type": "application/x-www-form-urlencoded"},
                data=body)
    tok = out.get("access_token")
    if not tok:
        sys.exit(f"❌ 토큰 발급 실패: {out}")
    return tok


def fetch_candles(token: str, symbol: str, interval: str = "1m",
                  count: int = 200, before: Optional[str] = None) -> dict:
    """응답은 {"result": {"candles": [...], "nextBefore": ...}} 형태로 한 겹 감싸져 있음."""
    params = {"symbol": symbol, "interval": interval, "count": count, "adjusted": "true"}
    if before:
        params["before"] = before
    url = f"{BASE}/api/v1/candles?" + urllib.parse.urlencode(params)
    out = _http("GET", url, headers={"Authorization": f"Bearer {token}"})
    return out.get("result", out)


def fetch_candles_range(token: str, symbol: str, interval: str,
                        max_bars: int, verbose: bool = True) -> list[dict]:
    """before 커서로 과거 방향 페이지네이션. 오름차순(오래된→최신) 반환."""
    collected: list[dict] = []
    before: Optional[str] = None
    while len(collected) < max_bars:
        out = fetch_candles(token, symbol, interval, count=200, before=before)
        candles = out.get("candles", [])
        if not candles:
            break
        collected.extend(candles)
        before = out.get("nextBefore")
        if verbose:
            print(f"  · {len(collected)}봉 수집 (earliest={candles[-1].get('timestamp')})",
                  file=sys.stderr)
        if not before:
            break
        time.sleep(0.15)  # rate limit 보호
    # timestamp 오름차순 정렬 + 중복 제거
    seen, uniq = set(), []
    for c in sorted(collected, key=lambda x: x["timestamp"]):
        if c["timestamp"] in seen:
            continue
        seen.add(c["timestamp"])
        uniq.append(c)
    return uniq


# ─────────────────────────────────────────────────────────────────────────────
# 스파이크: 종목코드 포맷 + 히스토리 깊이 검증
# ─────────────────────────────────────────────────────────────────────────────

def spike(token: str, symbol: str) -> None:
    print(f"\n=== SPIKE: 종목코드 포맷 확인 (기준 심볼: {symbol}) ===")
    candidates = [symbol, f"A{symbol}", f"KR7{symbol}003"]
    working = None
    for cand in candidates:
        try:
            out = fetch_candles(token, cand, "1m", count=5)
            n = len(out.get("candles", []))
            print(f"  {cand:16s} → candles={n}  {'✅' if n else '⚠️ 빈 응답'}")
            if n and working is None:
                working = cand
        except RuntimeError as e:
            print(f"  {cand:16s} → ❌ {str(e).splitlines()[0]}")
    if not working:
        print("\n❌ 어떤 포맷으로도 분봉이 안 나옵니다. 심볼/권한을 확인하세요.")
        return

    print(f"\n=== SPIKE: 1분봉 히스토리 깊이 확인 (포맷: {working}) ===")
    bars = fetch_candles_range(token, working, "1m", max_bars=20000)
    if not bars:
        print("  ❌ 데이터 없음")
        return
    first, last = bars[0]["timestamp"], bars[-1]["timestamp"]
    days = _trading_days(bars)
    print(f"  총 {len(bars)}봉 / 거래일 {len(days)}일")
    print(f"  최古: {first}")
    print(f"  최新: {last}")
    print(f"  → 1분봉 백테스트 가능 범위: 약 {len(days)} 거래일")
    print(f"\n  ✅ 사용할 심볼 포맷: '{working}'  (백테스트 시 --symbol 에 이 값 사용)")


# ─────────────────────────────────────────────────────────────────────────────
# 백테스트 엔진 (일중, 전략 함수 교체 가능)
# ─────────────────────────────────────────────────────────────────────────────

@dataclass
class Trade:
    date: str
    entry_time: str
    entry: float
    exit_time: str
    exit: float
    reason: str
    @property
    def ret(self) -> float:
        return self.exit / self.entry - 1.0


def _ts_kst(candle: dict) -> datetime:
    return datetime.fromisoformat(candle["timestamp"].replace("Z", "+00:00")).astimezone(KST)


def filter_regular_session(bars: list[dict]) -> list[dict]:
    """KRX 정규장(09:00~15:30)만 남김. 넥스트레이드(NXT) 연장거래(08:00~20:00) 노이즈 배제."""
    out = []
    for c in bars:
        t = _ts_kst(c)
        mins = t.hour * 60 + t.minute
        if 9 * 60 <= mins < 15 * 60 + 30:
            out.append(c)
    return out


def _trading_days(bars: list[dict]) -> dict[str, list[dict]]:
    days: dict[str, list[dict]] = {}
    for c in bars:
        d = _ts_kst(c).strftime("%Y-%m-%d")
        days.setdefault(d, []).append(c)
    return days


# ── 전략: ORB (Opening Range Breakout) ──────────────────────────────────────
# 09:00~09:30 고저 박스 → 상단 돌파 시 매수 → 박스하단/손절/장마감 청산.
# 다른 전략(VWAP·거래량돌파)은 동일 시그니처 함수로 교체 가능.

def strategy_orb(day: list[dict], *, or_minutes=30, stop_pct=0.005,
                 force_exit="15:20", take_profit_mult: Optional[float] = None) -> Optional[Trade]:
    """take_profit_mult: 손절폭(entry-stop) 대비 익절 배수. None이면 기존처럼 손절/강제청산만 사용."""
    day = sorted(day, key=lambda c: c["timestamp"])
    if len(day) < or_minutes + 5:
        return None
    open_ts = _ts_kst(day[0])
    or_end = open_ts + timedelta(minutes=or_minutes)
    or_bars = [c for c in day if _ts_kst(c) < or_end]
    if not or_bars:
        return None
    box_high = max(float(c["highPrice"]) for c in or_bars)
    box_low = min(float(c["lowPrice"]) for c in or_bars)

    fh, fm = map(int, force_exit.split(":"))
    in_pos = False
    entry = entry_ts = None
    stop = take_profit = None
    for c in day:
        t = _ts_kst(c)
        if t < or_end:
            continue
        close = float(c["closePrice"])
        high = float(c["highPrice"])
        low = float(c["lowPrice"])
        # 장마감 강제청산
        if t.hour > fh or (t.hour == fh and t.minute >= fm):
            if in_pos:
                return Trade(t.strftime("%Y-%m-%d"), entry_ts, entry,
                             t.strftime("%H:%M"), close, "force_close")
            return None
        if not in_pos:
            if close > box_high:  # 박스 상단 돌파 진입
                in_pos, entry, entry_ts = True, close, t.strftime("%H:%M")
                stop = max(box_low, entry * (1 - stop_pct))  # 손절: 박스하단 or -stop_pct
                if take_profit_mult is not None:
                    take_profit = entry + take_profit_mult * (entry - stop)
        else:
            # 손절을 먼저 체크(보수적 가정) — 한 봉 안에 손절/익절이 동시에 걸리면 손절 우선
            if low <= stop:
                return Trade(t.strftime("%Y-%m-%d"), entry_ts, entry,
                             t.strftime("%H:%M"), stop, "stop")
            if take_profit is not None and high >= take_profit:
                return Trade(t.strftime("%Y-%m-%d"), entry_ts, entry,
                             t.strftime("%H:%M"), take_profit, "take_profit")
    return None


StrategyFn = Callable[[list[dict]], Optional[Trade]]


def backtest(bars: list[dict], strategy: StrategyFn, fee=0.00015) -> None:
    days = _trading_days(bars)
    trades: list[Trade] = []
    for d in sorted(days):
        t = strategy(days[d])
        if t:
            trades.append(t)
    if not trades:
        print("\n거래 없음 (데이터가 짧거나 시그널 미발생).")
        return

    rets = [t.ret - 2 * fee for t in trades]  # 왕복 수수료 근사
    wins = [r for r in rets if r > 0]
    total = 1.0
    peak, mdd = 1.0, 0.0
    for r in rets:
        total *= (1 + r)
        peak = max(peak, total)
        mdd = min(mdd, total / peak - 1)
    gross_win = sum(wins)
    gross_loss = -sum(r for r in rets if r <= 0)
    pf = gross_win / gross_loss if gross_loss > 0 else float("inf")

    print(f"\n=== ORB 백테스트 결과 ({len(days)} 거래일) ===")
    print(f"  거래 횟수 : {len(trades)}")
    print(f"  승률      : {len(wins)/len(trades)*100:.1f}%")
    print(f"  누적수익률: {(total-1)*100:+.2f}%")
    print(f"  평균수익  : {sum(rets)/len(rets)*100:+.3f}% / 거래")
    print(f"  MDD       : {mdd*100:.2f}%")
    print(f"  손익비(PF): {pf:.2f}")
    print(f"\n  최근 거래 10건:")
    for t in trades[-10:]:
        print(f"   {t.date} {t.entry_time}→{t.exit_time}  "
              f"{t.entry:.0f}→{t.exit:.0f}  {t.ret*100:+.2f}%  ({t.reason})")


# ─────────────────────────────────────────────────────────────────────────────

def main() -> None:
    load_env()
    ap = argparse.ArgumentParser(description="토스 오픈 API 분봉 백테스트 (읽기 전용)")
    ap.add_argument("--symbol", default="005930", help="종목코드 (예: 005930 삼성전자)")
    ap.add_argument("--interval", default="1m", help="봉 간격 (1m, 1d)")
    ap.add_argument("--max-bars", type=int, default=4000, help="수집할 최대 봉 수")
    ap.add_argument("--spike", action="store_true", help="데이터 검증 모드 (포맷/깊이)")
    ap.add_argument("--or-minutes", type=int, default=30, help="박스 형성 시간(분)")
    ap.add_argument("--stop-pct", type=float, default=0.005, help="손절폭 (0.005 = 0.5%%)")
    ap.add_argument("--take-profit-mult", type=float, default=None,
                     help="손절폭 대비 익절 배수 (예: 1.5, 2.0). 생략하면 손절/강제청산만 사용(기존 방식)")
    args = ap.parse_args()

    token = get_token()
    print("✅ 토큰 발급 성공", file=sys.stderr)

    if args.spike:
        spike(token, args.symbol)
        return

    print(f"분봉 수집 중… (symbol={args.symbol}, interval={args.interval})", file=sys.stderr)
    bars = fetch_candles_range(token, args.symbol, args.interval, args.max_bars)
    print(f"수집 완료: {len(bars)}봉", file=sys.stderr)
    bars = filter_regular_session(bars)
    print(f"정규장(09:00~15:30) 필터 후: {len(bars)}봉", file=sys.stderr)
    print(f"박스 {args.or_minutes}분 / 손절 {args.stop_pct*100:.1f}% / "
          f"익절배수 {args.take_profit_mult if args.take_profit_mult is not None else '없음(강제청산까지 보유)'}",
          file=sys.stderr)
    strategy = functools.partial(strategy_orb, or_minutes=args.or_minutes, stop_pct=args.stop_pct,
                                  take_profit_mult=args.take_profit_mult)
    backtest(bars, strategy)


if __name__ == "__main__":
    main()
