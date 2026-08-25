#!/usr/bin/env python3
"""
토스 ORB 워커 원격 제어 — Supabase 상태 플래그를 통해서만 동작 (워커 프로세스와 직접 통신 안 함)

웹 대시보드(app/(dashboard)/auto-trade/toss-orb)의 "정지" 버튼과 완전히 동일한 방식.
텔레그램 채팅으로 "토스 워커 꺼줘" 같은 요청이 오면, Claude 세션이 이 스크립트(또는 동일 로직)를
호출해서 정지시킨다 — 워커가 텔레그램을 직접 폴링하지 않으므로 기존 Claude Telegram 채널의
getUpdates 폴링과 충돌하지 않는다.

⚠️ 원격 "시작"은 불가능하다 — 로컬 프로세스가 실제로 맥에서 떠있어야 하며, 재시작은
   사용자가 맥에서 직접 `python3 toss_orb_watch.py` 를 다시 실행해야 한다.
   이 스크립트는 이미 떠있는 워커를 멈추거나 상태를 조회하는 용도로만 쓴다.

사용법:
  python3 toss_orb_control.py --status                # 현재 상태 조회
  python3 toss_orb_control.py --stop                   # 정지 신호 (기본 종목 122630)
  python3 toss_orb_control.py --symbol 233740 --stop    # 다른 종목 지정
"""

import os
import sys
import json
import argparse
import urllib.parse
import urllib.request
from typing import Optional

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from toss_orb_watch import load_env  # noqa: E402


def _creds() -> tuple[str, str]:
    url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        sys.exit("❌ NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 가 없습니다.")
    return url, key


def get_state(symbol: str) -> Optional[dict]:
    url, key = _creds()
    params = urllib.parse.urlencode({"symbol": f"eq.{symbol}", "select": "*"})
    req = urllib.request.Request(
        f"{url}/rest/v1/toss_orb_worker_state?{params}",
        headers={"apikey": key, "Authorization": f"Bearer {key}"},
    )
    with urllib.request.urlopen(req, timeout=10) as resp:
        rows = json.loads(resp.read().decode())
    return rows[0] if rows else None


def set_should_run(symbol: str, value: bool) -> None:
    url, key = _creds()
    params = urllib.parse.urlencode({"symbol": f"eq.{symbol}"})
    req = urllib.request.Request(
        f"{url}/rest/v1/toss_orb_worker_state?{params}",
        method="PATCH",
        headers={
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
        },
        data=json.dumps({"should_run": value}).encode(),
    )
    urllib.request.urlopen(req, timeout=10).read()


def main() -> None:
    load_env()
    ap = argparse.ArgumentParser(description="토스 ORB 워커 원격 제어 (정지/상태조회)")
    ap.add_argument("--symbol", default="122630")
    group = ap.add_mutually_exclusive_group(required=True)
    group.add_argument("--stop", action="store_true", help="정지 신호 전송 (웹 정지 버튼과 동일)")
    group.add_argument("--status", action="store_true", help="현재 상태 조회")
    args = ap.parse_args()

    if args.stop:
        state = get_state(args.symbol)
        if not state or state.get("status") == "stopped":
            print(f"ℹ️  [{args.symbol}] 이미 정지 상태이거나 실행 기록이 없습니다.")
            return
        set_should_run(args.symbol, False)
        print(f"✅ [{args.symbol}] 정지 신호를 보냈습니다. 실행 중이면 최대 ~2분 내 스스로 종료됩니다.")

    if args.status:
        state = get_state(args.symbol)
        if not state:
            print(f"ℹ️  [{args.symbol}] 워커가 상태를 보고한 적이 없습니다.")
            return
        print(json.dumps(state, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
