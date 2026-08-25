#!/bin/bash
# 토스 ORB 워커를 caffeinate로 감싸서 실행 — 실행 중엔 노트북이 시스템 절전에 안 들어감
# (화면은 꺼져도 되지만 덮개는 닫으면 안 됨 — 맥 하드웨어 특성상 덮개를 닫으면 강제 슬립됨)
#
# 사용법:
#   ./scripts/run-toss-orb-watch.sh                  # 기본 종목(122630)
#   ./scripts/run-toss-orb-watch.sh --symbol 233740   # toss_orb_watch.py 인자 그대로 전달

set -e

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

exec caffeinate -i python3 "$ROOT_DIR/python/toss_orb_watch.py" "$@"
