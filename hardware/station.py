import RPi.GPIO as GPIO
from RPLCD.i2c import CharLCD
import subprocess
import signal
import wave
import json
import time
import os
import sys
import uuid
from datetime import datetime, timezone
from vosk import Model, KaldiRecognizer
import requests

# ---------- Config ----------
AUDIO_FILE = "recording.wav"
MODEL_PATH = "vosk-model-small-en-us-0.15"
DEVICE_ID = "station-01"
MAX_UNIT_LEN = 6
MAX_RECORDING_SECONDS = 30

API_URL = "https://func-vmis-dev-aqhbf4ghbxa2geca.centralus-01.azurewebsites.net/api/intake"
DEVICE_KEY = "PASTE_YOUR_REAL_SECRET_HERE"  # from Anshpreet's DeviceSharedSecret (Key Vault)

SPEAKER_NAME = "UACDemo"
MIC_NAME = "USB Audio"

PENDING_DIR = "pending_uploads"
os.makedirs(PENDING_DIR, exist_ok=True)


def find_card(name_fragment, mode):
    """mode = 'p' for playback devices, 'c' for capture devices"""
    cmd = ["aplay", "-l"] if mode == "p" else ["arecord", "-l"]
    result = subprocess.run(cmd, capture_output=True, text=True)
    for line in result.stdout.splitlines():
        if "card" in line and name_fragment.lower() in line.lower():
            card_num = line.split("card")[1].split(":")[0].strip()
            return int(card_num)
    return None


print("Detecting audio devices...")
speaker_card = find_card(SPEAKER_NAME, "p")
mic_card = find_card(MIC_NAME, "c")

if speaker_card is None or mic_card is None:
    print(f"ERROR: could not find devices. Speaker={speaker_card}, Mic={mic_card}")
    print("Check that both are plugged in, then check 'aplay -l' and 'arecord -l' manually.")
    sys.exit(1)

AUDIO_DEVICE_IN = f"plughw:{mic_card},0"
AUDIO_DEVICE_OUT = f"plughw:{speaker_card},0"
subprocess.run(["amixer", "-c", str(speaker_card), "sset", "PCM", "100%"])
print("Speaker volume set to 100%")
print(f"Using mic at card {mic_card}, speaker at card {speaker_card}")

# ---------- LCD + custom characters ----------
GPIO.setmode(GPIO.BCM)
lcd = CharLCD('PCF8574', 0x27)  # run i2cdetect -y 1 first to confirm this address

SMILEY = 0
HEART = 1
lcd.create_char(SMILEY, (
    0b00000, 0b01010, 0b01010, 0b00000,
    0b10001, 0b01110, 0b00000, 0b00000,
))
lcd.create_char(HEART, (
    0b00000, 0b01010, 0b11111, 0b11111,
    0b01110, 0b00100, 0b00000, 0b00000,
))

# ---------- RGB LED ----------
RED, GREEN, BLUE = 23, 24, 25
for pin in (RED, GREEN, BLUE):
    GPIO.setup(pin, GPIO.OUT)


def led(r, g, b):
    GPIO.output(RED, r)
    GPIO.output(GREEN, g)
    GPIO.output(BLUE, b)


# ---------- Keypad (4x3, Adafruit 419) ----------
ROWS = [17, 27, 22, 5]
COLS = [6, 13, 19]
KEYS = [
    ['1', '2', '3'],
    ['4', '5', '6'],
    ['7', '8', '9'],
    ['*', '0', '#'],
]
for row in ROWS:
    GPIO.setup(row, GPIO.OUT)
    GPIO.output(row, GPIO.LOW)
for col in COLS:
    GPIO.setup(col, GPIO.IN, pull_up_down=GPIO.PUD_DOWN)


def get_key():
    for i, row in enumerate(ROWS):
        GPIO.output(row, GPIO.HIGH)
        for j, col in enumerate(COLS):
            if GPIO.input(col) == GPIO.HIGH:
                GPIO.output(row, GPIO.LOW)
                return KEYS[i][j]
        GPIO.output(row, GPIO.LOW)
    return None


# ---------- Vosk (edge speech-to-text) ----------
print("Loading speech model...")
model = Model(MODEL_PATH)


def transcribe(path):
    wf = wave.open(path, "rb")
    rec = KaldiRecognizer(model, wf.getframerate())
    rec.SetWords(True)
    results = []
    while True:
        data = wf.readframes(4000)
        if len(data) == 0:
            break
        if rec.AcceptWaveform(data):
            results.append(json.loads(rec.Result()))
    results.append(json.loads(rec.FinalResult()))
    text = " ".join(r.get("text", "") for r in results if r.get("text"))
    return text.strip()


# ---------- Cloud upload ----------
UPLOAD_OK = "ok"
UPLOAD_RATE_LIMITED = "rate_limited"
UPLOAD_FAILED = "failed"


def upload(audio_path, transcript, unit_code):
    timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    try:
        with open(audio_path, "rb") as f:
            files = {"audio": (os.path.basename(audio_path), f, "audio/wav")}
            data = {
                "device_id": DEVICE_ID,
                "timestamp": timestamp,
                "transcript": transcript,
                "unit_code": unit_code,
            }
            headers = {"X-Device-Key": DEVICE_KEY}
            response = requests.post(API_URL, files=files, data=data, headers=headers, timeout=15)

        if response.status_code == 201:
            resp_json = response.json()
            print("Upload success:", resp_json)
            return UPLOAD_OK, resp_json.get("ticket_id")
        elif response.status_code == 429:
            print("Rate limited:", response.text)
            return UPLOAD_RATE_LIMITED, None
        else:
            print("Upload failed, status:", response.status_code, response.text)
            return UPLOAD_FAILED, None
    except Exception as e:
        print("Upload error:", e)
        return UPLOAD_FAILED, None


def cache_locally(audio_path, transcript, unit_code):
    local_id = str(uuid.uuid4())
    cached_audio = os.path.join(PENDING_DIR, local_id + ".wav")
    cached_meta = os.path.join(PENDING_DIR, local_id + ".json")
    os.replace(audio_path, cached_audio)
    with open(cached_meta, "w") as f:
        json.dump({
            "device_id": DEVICE_ID,
            "timestamp": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "transcript": transcript,
            "unit_code": unit_code,
            "audio_file": cached_audio,
        }, f)
    print("Saved locally for retry:", local_id)


# ---------- Screens ----------
def show_unit_entry_screen():
    lcd.clear()
    lcd.write_string("Enter unit #:")
    lcd.cursor_pos = (0, 15)
    lcd.write_string(chr(SMILEY))


def show_ready_screen():
    lcd.clear()
    lcd.write_string("* = Record")
    lcd.cursor_pos = (1, 0)
    lcd.write_string("# = Chg unit")


# ---------- Main state machine ----------
STATE_ENTER_CODE = "enter_code"
STATE_READY = "ready"
STATE_RECORDING = "recording"
STATE_REVIEW = "review"

state = STATE_ENTER_CODE
entered = ""
unit_code = ""
recording_process = None
recording_start_time = None

show_unit_entry_screen()
led(0, 0, 1)

try:
    print("System ready. Enter your unit/room number.")
    while True:
        key = get_key()

        # Auto-stop recording if the time limit is reached
        if state == STATE_RECORDING and recording_start_time is not None:
            if time.time() - recording_start_time >= MAX_RECORDING_SECONDS:
                print(f"Recording auto-stopped after {MAX_RECORDING_SECONDS}s limit.")
                key = '#'  # treat this exactly like the user pressing stop

        if key:
            if state == STATE_ENTER_CODE:
                if key == '#':
                    if entered:
                        unit_code = entered
                        entered = ""
                        state = STATE_READY
                        print("Unit code set to:", unit_code)
                        lcd.clear()
                        lcd.write_string("Unit: " + unit_code)
                        led(0, 1, 0)
                        time.sleep(1)
                        show_ready_screen()
                        led(0, 0, 0)
                elif key == '*':
                    entered = ""
                    show_unit_entry_screen()
                else:
                    if len(entered) < MAX_UNIT_LEN:
                        entered += key
                        lcd.cursor_pos = (1, 0)
                        lcd.write_string(entered + " " * (MAX_UNIT_LEN - len(entered)))
                    else:
                        led(1, 0, 0)
                        time.sleep(0.15)
                        led(0, 0, 1)

            elif state == STATE_READY:
                if key == '*':
                    state = STATE_RECORDING
                    recording_start_time = time.time()
                    lcd.clear()
                    lcd.write_string("Recording...")
                    lcd.cursor_pos = (1, 0)
                    lcd.write_string("# to stop")
                    led(1, 0, 0)
                    recording_process = subprocess.Popen([
                        "arecord", "-D", AUDIO_DEVICE_IN,
                        "-f", "S16_LE", "-r", "16000", "-c", "1",
                        AUDIO_FILE
                    ])
                    print("Recording started...")
                elif key == '#':
                    print("Changing unit code...")
                    unit_code = ""
                    entered = ""
                    state = STATE_ENTER_CODE
                    show_unit_entry_screen()
                    led(0, 0, 1)

            elif state == STATE_RECORDING:
                if key == '#':
                    print("Stopping recording...")
                    recording_process.send_signal(signal.SIGINT)
                    recording_process.wait()
                    recording_start_time = None

                    state = STATE_REVIEW
                    lcd.clear()
                    lcd.write_string("Playing back...")
                    lcd.cursor_pos = (1, 0)
                    lcd.write_string("0 to skip")
                    led(0, 0, 1)

                    playback_process = subprocess.Popen(["aplay", "-D", AUDIO_DEVICE_OUT, AUDIO_FILE])
                    while playback_process.poll() is None:
                        skip_key = get_key()
                        if skip_key == '0':
                            print("Playback skipped.")
                            playback_process.terminate()
                            playback_process.wait()
                            break
                        time.sleep(0.05)

                    lcd.clear()
                    lcd.write_string("Keep? #yes *no")
                    led(1, 1, 0)

            elif state == STATE_REVIEW:
                if key == '#':
                    lcd.clear()
                    lcd.write_string("Processing...")
                    led(0, 0, 1)

                    text = transcribe(AUDIO_FILE)
                    print("Unit:", unit_code)
                    print("Transcript:", text)

                    lcd.clear()
                    if text:
                        lcd.write_string(text[:16])
                        if len(text) > 16:
                            lcd.cursor_pos = (1, 0)
                            lcd.write_string(text[16:32])
                    else:
                        lcd.write_string("No speech heard")
                    time.sleep(2)

                    lcd.clear()
                    lcd.write_string("Sending...")
                    result, ticket_id = upload(AUDIO_FILE, text, unit_code)

                    if result == UPLOAD_OK:
                        print("Ticket ID:", ticket_id)
                        lcd.clear()
                        lcd.write_string("Thank you! ")
                        lcd.write_string(chr(HEART))
                        lcd.cursor_pos = (1, 0)
                        lcd.write_string("We will contact")
                        led(0, 1, 0)
                    elif result == UPLOAD_RATE_LIMITED:
                        # Do NOT cache for retry -- retrying now would just
                        # hit the same limit again. Just inform the user.
                        print("Not cached -- rate limited, user should wait.")
                        lcd.clear()
                        lcd.write_string("Too many reports")
                        lcd.cursor_pos = (1, 0)
                        lcd.write_string("Try again later")
                        led(1, 0, 0)
                    else:
                        cache_locally(AUDIO_FILE, text, unit_code)
                        lcd.clear()
                        lcd.write_string("Saved, will")
                        lcd.cursor_pos = (1, 0)
                        lcd.write_string("send later")
                        led(1, 0, 0)
                    time.sleep(3)

                    # Back to unit entry -- next person starts fresh
                    unit_code = ""
                    state = STATE_ENTER_CODE
                    show_unit_entry_screen()
                    led(0, 0, 1)

                elif key == '*':
                    lcd.clear()
                    lcd.write_string("Discarded")
                    led(1, 0, 0)
                    time.sleep(1)
                    unit_code = ""
                    state = STATE_ENTER_CODE
                    show_unit_entry_screen()
                    led(0, 0, 1)

            time.sleep(0.25)
        time.sleep(0.05)

except KeyboardInterrupt:
    pass
finally:
    if recording_process:
        recording_process.terminate()
    lcd.clear()
    GPIO.cleanup()
