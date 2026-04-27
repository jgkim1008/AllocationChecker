# Claude Code Routines 설정 가이드

DCA 및 자동매매 스케줄을 Claude Routines로 설정하는 가이드입니다.

## 사전 요구사항

- Claude Pro/Max/Team/Enterprise 플랜
- [claude.ai/code](https://claude.ai/code) 활성화
- GitHub 저장소 연결 완료

---

## 환경 설정

Routines 생성 전에 환경 변수를 설정해야 합니다.

### 1. 환경 생성

1. [claude.ai/code](https://claude.ai/code) 접속
2. 설정 → 환경 → "새 환경" 클릭
3. 환경 이름: `auto-trade-prod`

### 2. 환경 변수 추가

| 변수명 | 값 | 설명 |
|--------|-----|------|
| `APP_URL` | `https://your-app.vercel.app` | Vercel 앱 URL |
| `CRON_SECRET` | `your-secret-key` | API 인증 시크릿 |

### 3. 네트워크 액세스

- **활성화** (외부 API 호출 필요)

---

## Routines 목록

총 8개의 Routine을 생성합니다.

| # | 이름 | 시간 (KST) | 요일 |
|---|------|------------|------|
| 1 | 아침 알림 | 08:30 | 월~금 |
| 2 | DCA 국내 아침 | 09:05 | 월~금 |
| 3 | DCA 국내 장마감 | 15:31 | 월~금 |
| 4 | DCA 해외 아침 (여름) | 22:30 | 월~금 |
| 5 | DCA 해외 아침 (겨울) | 23:30 | 월~금 |
| 6 | DCA 해외 장마감 (여름) | 04:30 | 화~토 |
| 7 | DCA 해외 장마감 (겨울) | 05:30 | 화~토 |
| 8 | 무한매수법 | 22:35 | 월~금 |

---

## Routine 생성 방법

### 웹에서 생성

1. [claude.ai/code/routines](https://claude.ai/code/routines) 접속
2. **"새 루틴"** 클릭
3. 아래 설정 입력
4. **"생성"** 클릭

### CLI에서 생성

```bash
claude
/schedule
```

대화식으로 설정을 진행합니다.

---

## 각 Routine 상세 설정

### 1. 아침 알림

```yaml
이름: 아침 알림
일정: 평일 08:30
환경: auto-trade-prod
저장소: (선택 안함 또는 AllocationChecker)
```

**프롬프트:**
```
오늘의 매매 알림을 발송합니다.

다음 API를 호출해주세요:
curl -X GET "${APP_URL}/api/auto-trade/morning-alert" \
  -H "Authorization: Bearer ${CRON_SECRET}"

응답을 확인하고 결과를 요약해주세요.
성공 시 "알림 발송 완료"를, 실패 시 에러 내용을 알려주세요.
```

---

### 2. DCA 국내 아침

```yaml
이름: DCA 국내 아침 주문
일정: 평일 09:05
환경: auto-trade-prod
```

**프롬프트:**
```
DCA 국내 아침 주문을 실행합니다.

다음 API를 호출해주세요:
curl -X GET "${APP_URL}/api/auto-trade/dca/cron/morning?market=domestic" \
  -H "Authorization: Bearer ${CRON_SECRET}"

응답을 확인하고:
- 주문 성공 건수
- 실패한 경우 에러 메시지
를 요약해주세요.
```

---

### 3. DCA 국내 장마감 (LOC 폴백)

```yaml
이름: DCA 국내 장마감 LOC
일정: 평일 15:31
환경: auto-trade-prod
```

**프롬프트:**
```
DCA 국내 장마감 LOC 주문을 실행합니다.
아침 주문이 미체결된 경우 LOC 주문으로 재시도합니다.

다음 API를 호출해주세요:
curl -X GET "${APP_URL}/api/auto-trade/dca/cron/preclose?market=domestic" \
  -H "Authorization: Bearer ${CRON_SECRET}"

응답을 확인하고 결과를 요약해주세요.
```

---

### 4. DCA 해외 아침 (여름 - EDT)

```yaml
이름: DCA 해외 아침 (여름)
일정: 평일 22:30
환경: auto-trade-prod
```

**프롬프트:**
```
DCA 해외 아침 주문을 실행합니다. (미국 서머타임 기준)

다음 API를 호출해주세요:
curl -X GET "${APP_URL}/api/auto-trade/dca/cron/morning?market=overseas" \
  -H "Authorization: Bearer ${CRON_SECRET}"

응답을 확인하고:
- 주문 성공 건수
- 종목별 주문 내역
- 실패한 경우 에러 메시지
를 요약해주세요.
```

---

### 5. DCA 해외 아침 (겨울 - EST)

```yaml
이름: DCA 해외 아침 (겨울)
일정: 평일 23:30
환경: auto-trade-prod
```

**프롬프트:**
```
DCA 해외 아침 주문을 실행합니다. (미국 표준시 기준)

다음 API를 호출해주세요:
curl -X GET "${APP_URL}/api/auto-trade/dca/cron/morning?market=overseas" \
  -H "Authorization: Bearer ${CRON_SECRET}"

응답을 확인하고 결과를 요약해주세요.
```

> **참고:** 여름/겨울 시간 전환 시 해당 시즌의 Routine만 활성화하세요.

---

### 6. DCA 해외 장마감 (여름 - EDT)

```yaml
이름: DCA 해외 장마감 (여름)
일정: 평일 04:30
환경: auto-trade-prod
```

**프롬프트:**
```
DCA 해외 장마감 LOC 주문을 실행합니다. (미국 서머타임 기준)
아침 주문이 미체결된 경우 LOC 주문으로 재시도합니다.

다음 API를 호출해주세요:
curl -X GET "${APP_URL}/api/auto-trade/dca/cron/preclose?market=overseas" \
  -H "Authorization: Bearer ${CRON_SECRET}"

응답을 확인하고 결과를 요약해주세요.
```

---

### 7. DCA 해외 장마감 (겨울 - EST)

```yaml
이름: DCA 해외 장마감 (겨울)
일정: 평일 05:30
환경: auto-trade-prod
```

**프롬프트:**
```
DCA 해외 장마감 LOC 주문을 실행합니다. (미국 표준시 기준)

다음 API를 호출해주세요:
curl -X GET "${APP_URL}/api/auto-trade/dca/cron/preclose?market=overseas" \
  -H "Authorization: Bearer ${CRON_SECRET}"

응답을 확인하고 결과를 요약해주세요.
```

---

### 8. 무한매수법 자동매매

```yaml
이름: 무한매수법 자동매매
일정: 평일 22:35
환경: auto-trade-prod
```

**프롬프트:**
```
무한매수법 자동매매를 실행합니다.

다음 API를 호출해주세요:
curl -X GET "${APP_URL}/api/auto-trade/cron" \
  -H "Authorization: Bearer ${CRON_SECRET}"

응답을 확인하고:
- 처리된 종목 수
- 각 종목별 매수/매도 주문 건수
- 실패한 경우 에러 메시지
를 요약해주세요.
```

---

## 서머타임 전환 관리

미국 서머타임 전환 시 해외 Routine을 조정해야 합니다.

| 시즌 | 기간 | 활성화할 Routine |
|------|------|------------------|
| 여름 (EDT) | 3월 둘째 일요일 ~ 11월 첫째 일요일 | 해외 아침 22:30, 장마감 04:30 |
| 겨울 (EST) | 11월 첫째 일요일 ~ 3월 둘째 일요일 | 해외 아침 23:30, 장마감 05:30 |

### 전환 방법

1. [claude.ai/code/routines](https://claude.ai/code/routines) 접속
2. 해당 시즌의 Routine → 토글로 활성화/비활성화

---

## 실행 확인

### 실행 기록 확인

1. [claude.ai/code/routines](https://claude.ai/code/routines) 접속
2. Routine 클릭 → 실행 기록 확인

### 수동 실행

1. Routine 상세 페이지에서 **"지금 실행"** 클릭
2. 또는 CLI에서:
   ```bash
   /schedule run
   ```

---

## 문제 해결

### 1. API 호출 실패

- 환경 변수 `APP_URL`, `CRON_SECRET` 확인
- 네트워크 액세스 활성화 확인

### 2. 인증 오류 (401)

- `CRON_SECRET` 값이 Vercel 환경변수와 일치하는지 확인

### 3. 스케줄 미실행

- Routine이 활성화(토글 ON) 상태인지 확인
- 일일 실행 허용량 초과 여부 확인

---

## GitHub Actions 비활성화 (선택)

Claude Routines로 전환 후 GitHub Actions 중복 실행을 방지하려면:

```bash
# 워크플로우 비활성화
gh workflow disable morning-alert.yml
gh workflow disable dca-morning-domestic.yml
gh workflow disable dca-morning-overseas.yml
gh workflow disable dca-preclose-domestic.yml
gh workflow disable dca-preclose-overseas.yml
gh workflow disable auto-trade-cron.yml
```

재활성화:
```bash
gh workflow enable <workflow-name>
```

---

## 참고 링크

- [Claude Code Routines 공식 문서](https://code.claude.com/docs/ko/routines)
- [환경 설정 가이드](https://code.claude.com/docs/ko/claude-code-on-the-web#the-cloud-environment)
