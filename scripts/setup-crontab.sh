#!/bin/bash

# AllocationChecker 로컬 Cron 설정 스크립트
# Mac에서 실행: ./scripts/setup-crontab.sh

# ==============================
# 설정값 (여기만 수정하세요)
# ==============================
APP_URL="https://allocation-checker-mu.vercel.app"
CRON_SECRET="여기에_CRON_SECRET_입력"

# ==============================
# Crontab 생성
# ==============================

# 현재 crontab 백업
crontab -l > /tmp/crontab_backup_$(date +%Y%m%d_%H%M%S).txt 2>/dev/null

# 새 crontab 내용 생성
cat << EOF | crontab -
# ========================================
# AllocationChecker 자동매매 Cron (KST 기준)
# 설정일: $(date '+%Y-%m-%d %H:%M:%S')
# ========================================

# 아침 알림 - 08:30 월~금
30 8 * * 1-5 curl -s -X GET "${APP_URL}/api/auto-trade/morning-alert" -H "Authorization: Bearer ${CRON_SECRET}" > /dev/null 2>&1

# DCA 국내 아침 - 09:05 월~금
5 9 * * 1-5 curl -s -X GET "${APP_URL}/api/auto-trade/dca/cron/morning?market=domestic" -H "Authorization: Bearer ${CRON_SECRET}" > /dev/null 2>&1

# DCA 국내 장마감 - 15:30 월~금
30 15 * * 1-5 curl -s -X GET "${APP_URL}/api/auto-trade/dca/cron/preclose?market=domestic" -H "Authorization: Bearer ${CRON_SECRET}" > /dev/null 2>&1

# DCA 해외 아침 (서머타임 EDT) - 22:30 월~금
30 22 * * 1-5 curl -s -X GET "${APP_URL}/api/auto-trade/dca/cron/morning?market=overseas" -H "Authorization: Bearer ${CRON_SECRET}" > /dev/null 2>&1

# DCA 해외 아침 (표준시 EST) - 23:30 월~금
# 서머타임 끝나면 위 22:30을 주석처리하고 아래 주석 해제
# 30 23 * * 1-5 curl -s -X GET "${APP_URL}/api/auto-trade/dca/cron/morning?market=overseas" -H "Authorization: Bearer ${CRON_SECRET}" > /dev/null 2>&1

# DCA 해외 장마감 (서머타임 EDT) - 04:30 화~토
30 4 * * 2-6 curl -s -X GET "${APP_URL}/api/auto-trade/dca/cron/preclose?market=overseas" -H "Authorization: Bearer ${CRON_SECRET}" > /dev/null 2>&1

# DCA 해외 장마감 (표준시 EST) - 05:30 화~토
# 서머타임 끝나면 위 04:30을 주석처리하고 아래 주석 해제
# 30 5 * * 2-6 curl -s -X GET "${APP_URL}/api/auto-trade/dca/cron/preclose?market=overseas" -H "Authorization: Bearer ${CRON_SECRET}" > /dev/null 2>&1

# 무한매수법 (서머타임 EDT) - 22:35 월~금
35 22 * * 1-5 curl -s -X GET "${APP_URL}/api/auto-trade/cron" -H "Authorization: Bearer ${CRON_SECRET}" > /dev/null 2>&1

# 무한매수법 (표준시 EST) - 23:35 월~금
# 서머타임 끝나면 위 22:35를 주석처리하고 아래 주석 해제
# 35 23 * * 1-5 curl -s -X GET "${APP_URL}/api/auto-trade/cron" -H "Authorization: Bearer ${CRON_SECRET}" > /dev/null 2>&1

EOF

echo "✅ Crontab 설정 완료!"
echo ""
echo "현재 설정된 cron 목록:"
crontab -l
echo ""
echo "📌 서머타임 전환 시 스크립트 내 주석을 수정하고 다시 실행하세요."
