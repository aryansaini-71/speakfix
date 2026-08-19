import RPi.GPIO as GPIO
from RPLCD.i2c import CharLCD
import time
import os
import sys

TRIGGER_CODE = "1984"
STATION_SCRIPT = "/home/aryanraspberrypi/station.py"
VENV_PYTHON = "/home/aryanraspberrypi/voicestation-env/bin/python3"

GPIO.setmode(GPIO.BCM)
lcd = CharLCD('PCF8574', 0x27)

RED, GREEN, BLUE = 23, 24, 25
for pin in (RED, GREEN, BLUE):
    GPIO.setup(pin, GPIO.OUT)


def led(r, g, b):
    GPIO.output(RED, r)
    GPIO.output(GREEN, g)
    GPIO.output(BLUE, b)


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


def show_ready():
    lcd.clear()
    lcd.write_string("SpeakFix ready")
    lcd.cursor_pos = (1, 0)
    lcd.write_string("Enter dev code")


show_ready()
led(0, 0, 1)

entered = ""

try:
    print("Launcher running. Waiting for dev trigger code...")
    while True:
        key = get_key()
        if key:
            if key == '#':
                if entered == TRIGGER_CODE:
                    print("Trigger code matched. Starting station.py...")
                    lcd.clear()
                    lcd.write_string("Starting...")
                    led(0, 1, 0)
                    time.sleep(0.5)
                    lcd.clear()
                    GPIO.cleanup()
                    os.execvp(VENV_PYTHON, [VENV_PYTHON, STATION_SCRIPT])
                else:
                    entered = ""
                    lcd.clear()
                    lcd.write_string("Wrong code")
                    led(1, 0, 0)
                    time.sleep(1)
                    show_ready()
                    led(0, 0, 1)
            elif key == '*':
                entered = ""
                lcd.cursor_pos = (1, 0)
                lcd.write_string(" " * 12)
                lcd.cursor_pos = (1, 0)
            else:
                entered += key
                lcd.cursor_pos = (1, 0)
                lcd.write_string(entered.ljust(12))
            time.sleep(0.25)
        time.sleep(0.05)
except KeyboardInterrupt:
    GPIO.cleanup()
    sys.exit(0)
