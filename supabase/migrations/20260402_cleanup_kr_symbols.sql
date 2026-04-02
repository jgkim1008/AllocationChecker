-- 한국 주식 심볼 정리: .KS/.KQ 접미사 제거
-- 중복 레코드 병합 및 심볼 통일

-- 1. 먼저 현재 상태 확인 (실행 전 검토용)
-- SELECT symbol, id, name FROM stocks WHERE symbol ~ '\.(KS|KQ)$';

-- 2. 중복이 있는 경우 (예: 161510.KS와 161510 둘 다 존재)
-- portfolio_holdings를 깨끗한 심볼 버전으로 이동

DO $$
DECLARE
    r RECORD;
    clean_symbol TEXT;
    clean_stock_id UUID;
    suffixed_stock_id UUID;
BEGIN
    -- .KS 또는 .KQ 접미사가 있는 모든 주식 조회
    FOR r IN
        SELECT id, symbol, name
        FROM stocks
        WHERE symbol ~ '\.(KS|KQ)$'
    LOOP
        -- 접미사 제거한 심볼
        clean_symbol := regexp_replace(r.symbol, '\.(KS|KQ)$', '', 'i');
        suffixed_stock_id := r.id;

        -- 깨끗한 심볼 버전이 이미 존재하는지 확인
        SELECT id INTO clean_stock_id
        FROM stocks
        WHERE symbol = clean_symbol;

        IF clean_stock_id IS NOT NULL THEN
            -- 중복 존재: holdings를 깨끗한 버전으로 이동
            RAISE NOTICE 'Merging % into % (clean)', r.symbol, clean_symbol;

            -- portfolio_holdings 이동
            UPDATE portfolio_holdings
            SET stock_id = clean_stock_id
            WHERE stock_id = suffixed_stock_id;

            -- dividends 이동 (중복 제외)
            UPDATE dividends
            SET stock_id = clean_stock_id
            WHERE stock_id = suffixed_stock_id
            AND NOT EXISTS (
                SELECT 1 FROM dividends d2
                WHERE d2.stock_id = clean_stock_id
                AND d2.ex_dividend_date = dividends.ex_dividend_date
            );

            -- 남은 중복 dividends 삭제
            DELETE FROM dividends WHERE stock_id = suffixed_stock_id;

            -- 접미사 버전 주식 삭제
            DELETE FROM stocks WHERE id = suffixed_stock_id;

            RAISE NOTICE 'Deleted duplicate stock: %', r.symbol;
        ELSE
            -- 중복 없음: 심볼만 정리
            RAISE NOTICE 'Cleaning symbol: % -> %', r.symbol, clean_symbol;

            UPDATE stocks
            SET symbol = clean_symbol
            WHERE id = suffixed_stock_id;
        END IF;
    END LOOP;
END $$;

-- 3. 결과 확인
-- SELECT symbol, id, name FROM stocks WHERE market = 'KR' ORDER BY symbol;
