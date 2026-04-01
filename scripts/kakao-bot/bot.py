"""
카카오톡 오픈채팅방 봇 (Windows PC용)

필요 패키지:
pip install pyperclip pyautogui requests pywin32

사용법:
1. 카카오톡 PC 실행 & 오픈채팅방 열기
2. 이 스크립트 실행
3. 채팅방에서 명령어 입력 (예: $AAPL, &피보나치)
"""

import time
import re
import requests
import pyperclip
import pyautogui
import win32gui
import win32con
import win32clipboard
from datetime import datetime

# ===== 설정 =====
API_URL = "https://allocation-checker-mu.vercel.app/api/kakao-bot/command"
CHAT_ROOM_NAME = "오픈채팅방 이름"  # 모니터링할 채팅방 이름
CHECK_INTERVAL = 1  # 메시지 체크 간격 (초)
BOT_PREFIX = ["$", "&", "?", "봇", "피보"]  # 봇이 반응할 접두사

# ===== 유틸 함수 =====
def get_clipboard():
    """클립보드 내용 가져오기"""
    try:
        win32clipboard.OpenClipboard()
        data = win32clipboard.GetClipboardData(win32con.CF_UNICODETEXT)
        win32clipboard.CloseClipboard()
        return data
    except:
        return ""

def set_clipboard(text):
    """클립보드에 텍스트 설정"""
    pyperclip.copy(text)

def find_kakao_window(room_name=None):
    """카카오톡 창 찾기"""
    def callback(hwnd, windows):
        if win32gui.IsWindowVisible(hwnd):
            title = win32gui.GetWindowText(hwnd)
            if "카카오톡" in title or (room_name and room_name in title):
                windows.append((hwnd, title))
        return True

    windows = []
    win32gui.EnumWindows(callback, windows)

    if room_name:
        for hwnd, title in windows:
            if room_name in title:
                return hwnd

    return windows[0][0] if windows else None

def send_message(hwnd, message):
    """메시지 전송"""
    # 창 활성화
    win32gui.SetForegroundWindow(hwnd)
    time.sleep(0.1)

    # 클립보드에 메시지 복사 후 붙여넣기
    set_clipboard(message)
    time.sleep(0.05)
    pyautogui.hotkey('ctrl', 'v')
    time.sleep(0.05)
    pyautogui.press('enter')

def get_last_message(hwnd):
    """마지막 메시지 가져오기 (Ctrl+Shift+C)"""
    win32gui.SetForegroundWindow(hwnd)
    time.sleep(0.1)

    # 마지막 메시지 복사
    pyautogui.hotkey('ctrl', 'shift', 'c')
    time.sleep(0.1)

    return get_clipboard()

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
    # [이름] 메시지 형태에서 메시지만 추출
    match = re.search(r'\] (.+)$', message)
    if match:
        return match.group(1).strip()
    return message.strip()

# ===== 메인 봇 =====
class KakaoBot:
    def __init__(self, room_name=None):
        self.room_name = room_name
        self.hwnd = None
        self.last_message = ""
        self.processed_messages = set()

    def connect(self):
        """카카오톡 창 연결"""
        self.hwnd = find_kakao_window(self.room_name)
        if self.hwnd:
            title = win32gui.GetWindowText(self.hwnd)
            print(f"✅ 연결됨: {title}")
            return True
        else:
            print("❌ 카카오톡 창을 찾을 수 없습니다.")
            return False

    def process_message(self, message):
        """메시지 처리"""
        command = extract_command(message)

        if not should_respond(command):
            return

        # 중복 방지
        msg_hash = hash(command + str(datetime.now().minute))
        if msg_hash in self.processed_messages:
            return
        self.processed_messages.add(msg_hash)

        # 오래된 해시 정리
        if len(self.processed_messages) > 100:
            self.processed_messages = set(list(self.processed_messages)[-50:])

        print(f"📩 명령어: {command}")

        # API 호출
        response = call_api(command)
        print(f"📤 응답: {response[:50]}...")

        # 메시지 전송
        send_message(self.hwnd, response)

    def run(self):
        """봇 실행"""
        print("=" * 40)
        print("🤖 카카오톡 봇 시작")
        print(f"📍 채팅방: {self.room_name or '자동 감지'}")
        print(f"⏱️ 체크 간격: {CHECK_INTERVAL}초")
        print("=" * 40)

        if not self.connect():
            return

        print("🔄 메시지 모니터링 중... (Ctrl+C로 종료)")

        try:
            while True:
                try:
                    current = get_last_message(self.hwnd)

                    if current and current != self.last_message:
                        self.last_message = current
                        self.process_message(current)

                    time.sleep(CHECK_INTERVAL)

                except Exception as e:
                    print(f"⚠️ 오류: {e}")
                    time.sleep(5)
                    self.connect()

        except KeyboardInterrupt:
            print("\n👋 봇 종료")

# ===== 실행 =====
if __name__ == "__main__":
    # 채팅방 이름 설정 (None이면 첫 번째 카카오톡 창 사용)
    bot = KakaoBot(room_name=None)  # "투자 오픈채팅방" 등으로 변경
    bot.run()
