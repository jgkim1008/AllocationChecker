/**
 * ENCRYPTION_KEY 로테이션 스크립트
 *
 * 사용법:
 * 1. .env.local에 OLD_ENCRYPTION_KEY, NEW_ENCRYPTION_KEY 추가
 * 2. npx ts-node scripts/rotate-encryption-key.ts
 * 3. 성공 확인 후 ENCRYPTION_KEY를 NEW_ENCRYPTION_KEY 값으로 변경
 * 4. OLD_ENCRYPTION_KEY, NEW_ENCRYPTION_KEY 환경변수 제거
 */

import * as crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { fileURLToPath } from 'url';

// ES 모듈에서 __dirname 대체
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// .env.local 로드
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const OLD_KEY = process.env.OLD_ENCRYPTION_KEY!;
const NEW_KEY = process.env.NEW_ENCRYPTION_KEY!;

function validateKey(key: string, name: string): Buffer {
  if (!key) {
    throw new Error(`${name} 환경 변수가 설정되지 않았습니다.`);
  }
  if (!/^[a-fA-F0-9]{64}$/.test(key)) {
    throw new Error(`${name}는 64자리 hex 문자열이어야 합니다.`);
  }
  return Buffer.from(key, 'hex');
}

function decrypt(ciphertext: string, iv: string, tag: string, key: Buffer): string {
  const ivBuffer = Buffer.from(iv, 'base64');
  const tagBuffer = Buffer.from(tag, 'base64');
  const decipher = crypto.createDecipheriv(ALGORITHM, key, ivBuffer);
  decipher.setAuthTag(tagBuffer);
  let plaintext = decipher.update(ciphertext, 'base64', 'utf8');
  plaintext += decipher.final('utf8');
  return plaintext;
}

function encrypt(plaintext: string, key: Buffer): { ciphertext: string; iv: string; tag: string } {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let ciphertext = cipher.update(plaintext, 'utf8', 'base64');
  ciphertext += cipher.final('base64');
  const tag = cipher.getAuthTag();
  return {
    ciphertext,
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
  };
}

async function main() {
  console.log('🔐 ENCRYPTION_KEY 로테이션 시작\n');

  // 1. 키 검증
  console.log('1️⃣ 키 검증...');
  const oldKeyBuffer = validateKey(OLD_KEY, 'OLD_ENCRYPTION_KEY');
  const newKeyBuffer = validateKey(NEW_KEY, 'NEW_ENCRYPTION_KEY');
  console.log('   ✅ 키 형식 유효\n');

  // 2. Supabase 연결
  console.log('2️⃣ Supabase 연결...');
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    throw new Error('SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY가 설정되지 않았습니다.');
  }
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  console.log('   ✅ 연결됨\n');

  // 3. broker_credentials 로테이션
  console.log('3️⃣ broker_credentials 로테이션...');
  const { data: credentials, error: credError } = await supabase
    .from('broker_credentials')
    .select('id, encrypted_credentials, encryption_iv, encryption_tag');

  if (credError) {
    throw new Error(`broker_credentials 조회 실패: ${credError.message}`);
  }

  console.log(`   📦 ${credentials?.length || 0}개 레코드 발견`);

  let credSuccess = 0;
  let credFail = 0;

  for (const cred of credentials || []) {
    try {
      // 복호화 (기존 키)
      const plaintext = decrypt(
        cred.encrypted_credentials,
        cred.encryption_iv,
        cred.encryption_tag,
        oldKeyBuffer
      );

      // 재암호화 (새 키)
      const encrypted = encrypt(plaintext, newKeyBuffer);

      // 업데이트
      const { error: updateError } = await supabase
        .from('broker_credentials')
        .update({
          encrypted_credentials: encrypted.ciphertext,
          encryption_iv: encrypted.iv,
          encryption_tag: encrypted.tag,
          updated_at: new Date().toISOString(),
        })
        .eq('id', cred.id);

      if (updateError) {
        console.error(`   ❌ ID ${cred.id} 업데이트 실패:`, updateError.message);
        credFail++;
      } else {
        credSuccess++;
      }
    } catch (err) {
      console.error(`   ❌ ID ${cred.id} 처리 실패:`, err);
      credFail++;
    }
  }

  console.log(`   ✅ 성공: ${credSuccess}, ❌ 실패: ${credFail}\n`);

  // 4. user_totp_secrets 로테이션
  console.log('4️⃣ user_totp_secrets 로테이션...');
  const { data: totpSecrets, error: totpError } = await supabase
    .from('user_totp_secrets')
    .select('id, encrypted_secret, encryption_iv, encryption_tag');

  if (totpError) {
    throw new Error(`user_totp_secrets 조회 실패: ${totpError.message}`);
  }

  console.log(`   📦 ${totpSecrets?.length || 0}개 레코드 발견`);

  let totpSuccess = 0;
  let totpFail = 0;

  for (const totp of totpSecrets || []) {
    try {
      // 복호화 (기존 키)
      const plaintext = decrypt(
        totp.encrypted_secret,
        totp.encryption_iv,
        totp.encryption_tag,
        oldKeyBuffer
      );

      // 재암호화 (새 키)
      const encrypted = encrypt(plaintext, newKeyBuffer);

      // 업데이트
      const { error: updateError } = await supabase
        .from('user_totp_secrets')
        .update({
          encrypted_secret: encrypted.ciphertext,
          encryption_iv: encrypted.iv,
          encryption_tag: encrypted.tag,
          updated_at: new Date().toISOString(),
        })
        .eq('id', totp.id);

      if (updateError) {
        console.error(`   ❌ ID ${totp.id} 업데이트 실패:`, updateError.message);
        totpFail++;
      } else {
        totpSuccess++;
      }
    } catch (err) {
      console.error(`   ❌ ID ${totp.id} 처리 실패:`, err);
      totpFail++;
    }
  }

  console.log(`   ✅ 성공: ${totpSuccess}, ❌ 실패: ${totpFail}\n`);

  // 5. 결과 요약
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 로테이션 결과');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`broker_credentials: ${credSuccess}/${credentials?.length || 0} 성공`);
  console.log(`user_totp_secrets:  ${totpSuccess}/${totpSecrets?.length || 0} 성공`);

  const totalFail = credFail + totpFail;
  if (totalFail > 0) {
    console.log(`\n⚠️  ${totalFail}건 실패 - 수동 확인 필요`);
    process.exit(1);
  }

  console.log('\n✅ 모든 레코드 로테이션 완료!');
  console.log('\n📝 다음 단계:');
  console.log('   1. Vercel에서 ENCRYPTION_KEY를 NEW_ENCRYPTION_KEY 값으로 변경');
  console.log('   2. .env.local에서 ENCRYPTION_KEY를 NEW_ENCRYPTION_KEY 값으로 변경');
  console.log('   3. OLD_ENCRYPTION_KEY, NEW_ENCRYPTION_KEY 환경변수 제거');
  console.log('   4. 재배포 후 정상 작동 확인');
}

main().catch((err) => {
  console.error('\n❌ 로테이션 실패:', err.message);
  process.exit(1);
});
