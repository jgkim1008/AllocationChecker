"""
카카오톡 오픈채팅방 봇 (Mac용)

필요 패키지:
pip3 install pyperclip pyautogui requests

사용법:
1. 카카오톡 Mac 실행 & 오픈채팅방 열기 (창 활성화 상태 유지)
2. 터미널에서 이 스크립트 실행
3. 채팅방에서 명령어 입력 (예: $AAPL, &피보나치)

주의:
- 카카오톡 창이 활성화 상태여야 함
- 손대지 않고 그대로 두기
"""

import time
import re
import subprocess
import requests
import pyautogui
from datetime import datetime

# ===== 설정 =====
API_URL = "https://allocation-checker-mu.vercel.app/api/kakao-bot/command"
CHECK_INTERVAL = 2  # 메시지 체크 간격 (초)
BOT_PREFIX = ["$", "&", "?", "봇", "피보"]  # 봇이 반응할 접두사

# ===== 유틸 함수 =====
def get_clipboard():
    """클립보드 내용 가져오기 (Mac)"""
    try:
        result = subprocess.run(['pbpaste'], capture_output=True, text=True)
        return result.stdout
    except:
        return ""

def set_clipboard(text):
    """클립보드에 텍스트 설정 (Mac)"""
    try:
        process = subprocess.Popen(['pbcopy'], stdin=subprocess.PIPE)
        process.communicate(text.encode('utf-8'))
    except Exception as e:
        print(f"클립보드 설정 오류: {e}")

def send_message(message):
    """메시지 전송 (카카오톡 창이 활성화 상태라고 가정)"""
    # 클립보드에 메시지 복사
    set_clipboard(message)
    time.sleep(0.1)

    # Cmd+V로 붙여넣기
    pyautogui.hotkey('command', 'v')
    time.sleep(0.1)

    # Enter로 전송
    pyautogui.press('enter')
    time.sleep(0.2)

def get_last_message():
    """
    마지막 메시지 가져오기
    카카오톡 Mac에서 Cmd+Shift+C로 마지막 메시지 복사
    """
    # 이전 클립보드 저장
    old_clipboard = get_clipboard()

    # Cmd+Shift+C (카카오톡 마지막 메시지 복사)
    pyautogui.hotkey('command', 'shift', 'c')
    time.sleep(0.2)

    # 새 클립보드 내용
    new_clipboard = get_clipboard()

    # 변경되었으면 새 메시지
    if new_clipboard != old_clipboard:
        return new_clipboard

    return ""

def call_api(query):
    """API 호출"""
    try:
        response = requests.get(API_URL, params={"q": query}, timeout=30)
        data = response.json()
        return data.get("response", "❌ 응답을 받지 못했습니다.")
    except Exception as e:
        return f"❌ API 오류: {str(e)}"

def should_respond(message):
    """봇이 반응해야 하는 메시지인지 확인"""
    message = message.strip()
    for prefix in BOT_PREFIX:
        if message.startswith(prefix):
            return True
    return False

def extract_command(message):
    """메시지에서 명령어 추출"""
    lines = message.strip().split('\n')
    if lines:
        # 마지막 줄이 명령어일 가능성 높음
        last_line = lines[-1].strip()
        # [이름] 메시지 형태 처리
        match = re.search(r'\] (.+)$', last_line)
        if match:
            return match.group(1).strip()
        return last_line
    return message.strip()

# ===== 메인 봇 =====
class KakaoBot:
    def __init__(self):
        self.last_message = ""
        self.processed_commands = set()

    def process_message(self, message):
        """메시지 처리"""
        command = extract_command(message)

        if not should_respond(command):
            return False

        # 중복 방지 (같은 분에 같은 명령어는 무시)
        cmd_hash = hash(command + str(datetime.now().strftime("%Y%m%d%H%M")))
        if cmd_hash in self.processed_commands:
            return False
        self.processed_commands.add(cmd_hash)

        # 오래된 해시 정리
        if len(self.processed_commands) > 100:
            self.processed_commands = set(list(self.processed_commands)[-50:])

        print(f"📩 명령어: {command}")

        # API 호출
        response = call_api(command)
        print(f"📤 응답 전송 ({len(response)}자)")

        # 메시지 전송
        time.sleep(0.3)
        send_message(response)

        return True

    def run(self):
        """봇 실행"""
        print("=" * 40)
        print("🤖 카카오톡 봇 시작 (Mac)")
        print("=" * 40)
        print("")
        print("⚠️  중요: 카카오톡 채팅방 창을 활성화 상태로 유지하세요!")
        print("")
        print("🔄 메시지 모니터링 중... (Ctrl+C로 종료)")
        print("")

        try:
            while True:
                try:
                    current = get_last_message()

                    if current and current != self.last_message:
                        self.last_message = current
                        if self.process_message(current):
                            time.sleep(1)  # 응답 후 잠시 대기

                    time.sleep(CHECK_INTERVAL)

                except Exception as e:
                    print(f"⚠️ 오류: {e}")
                    time.sleep(5)

        except KeyboardInterrupt:
            print("\n👋 봇 종료")

# ===== 실행 =====
if __name__ == "__main__":
    print("")
    print("📌 사용 전 확인사항:")
    print("   1. 카카오톡 Mac 앱 실행")
    print("   2. 오픈채팅방 창 열기")
    print("   3. 창 활성화 상태 유지")
    print("   4. 터미널을 다른 공간(데스크톱)에 두기")
    print("")
    input("준비되면 Enter를 누르세요...")
    print("")

    bot = KakaoBot()
    bot.run()
