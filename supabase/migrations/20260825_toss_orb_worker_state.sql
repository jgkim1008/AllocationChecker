-- 토스 ORB 페이퍼 트레이딩 워커 상태 테이블
-- 사용자 맥에서 상시 실행되는 python/toss_orb_watch.py 가 주기적으로 upsert 하고,
-- 웹 대시보드(app/(dashboard)/auto-trade/toss-orb)가 조회 + should_run 플래그로 정지 신호를 보낸다.
-- should_run=false 로 바뀌면 워커가 다음 폴링(최대 20초 내)에 감지하고 스스로 종료한다.
-- 워커는 로컬 프로세스라 웹에서 원격으로 "시작"은 못 시키고, 정지만 가능하다.

CREATE TABLE IF NOT EXISTS toss_orb_worker_state (
  symbol             TEXT        PRIMARY KEY,
  status             TEXT        NOT NULL DEFAULT 'stopped', -- stopped | waiting | box_forming | watching | in_position | error
  should_run         BOOLEAN     NOT NULL DEFAULT true,
  box_high           NUMERIC,
  box_low            NUMERIC,
  position_entry     NUMERIC,
  position_entry_time TEXT,
  position_stop      NUMERIC,
  last_price         NUMERIC,
  last_event         TEXT,
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE toss_orb_worker_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all" ON toss_orb_worker_state
  FOR ALL
  USING (true)
  WITH CHECK (true);
