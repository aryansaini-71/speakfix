# SpeakFix — Hardware / Edge Device

Runs on a Raspberry Pi 4 Model B.

## Files

- **station.py** — the main application. Handles keypad input, security-code-style
  unit entry, recording, on-device speech-to-text (Vosk), playback review, and
  upload to Azure. This is what actually runs when the station is in use.
- **launcher.py** — starts automatically on boot instead of station.py directly.
  Shows a simple "SpeakFix ready" screen and waits for a developer trigger code
  (1984 + #) before handing off to station.py. This keeps the full application
  (and the ~40MB Vosk model load) from starting unless a developer deliberately
  activates it — useful during setup/demo staging.
- **voicestation.service** — systemd unit file. Installing this makes launcher.py
  start automatically every time the Pi boots, with no manual commands needed.

## Hardware used

- Raspberry Pi 4 Model B (2GB)
- 4x3 membrane keypad (Adafruit 419) — GPIO rows: 17, 27, 22, 5; columns: 6, 13, 19
- 16x2 I2C LCD (address 0x27) — SDA: GPIO2, SCL: GPIO3
- RGB LED (common cathode) with current-limiting resistors — Red: GPIO23,
  Green: GPIO24, Blue: GPIO25, cathode: GND
- USB microphone
- USB speaker

## Setup

1. Wire all components per the GPIO pins listed above.
2. Flash Raspberry Pi OS, enable I2C via `raspi-config`.
3. Create a virtual environment and install dependencies:
   ```
   python3 -m venv voicestation-env
   source voicestation-env/bin/activate
   pip install RPi.GPIO gpiozero RPLCD vosk requests smbus2
   ```
4. Download the Vosk small English model into the same folder as station.py:
   ```
   wget https://alphacephei.com/vosk/models/vosk-model-small-en-us-0.15.zip
   unzip vosk-model-small-en-us-0.15.zip
   ```
5. In station.py, fill in the real `DEVICE_KEY` value (the shared secret issued
   by the backend team) and confirm `API_URL` points to the live endpoint.
6. Test manually first: `python3 station.py`
7. Once confirmed working, install the auto-start service:
   ```
   sudo cp voicestation.service /etc/systemd/system/
   sudo systemctl daemon-reload
   sudo systemctl enable voicestation.service
   sudo systemctl start voicestation.service
   ```

## Running it

On boot, the device shows "SpeakFix ready / Enter dev code" automatically.
Enter **1984** then **#** to start the real application. From there:

1. Enter your unit/room number, then **#**
2. Press **\*** to start recording, **#** to stop (or wait; auto-stops after 30s)
3. Listen to the playback (**0** to skip), then **#** to keep and submit, or **\***
   to discard and re-record
4. The device confirms the ticket was sent, then returns to unit entry for the
   next person

## Notes on design decisions

- The unit code is **not a security PIN** — it is an identifier (like an
  apartment number) attached to the report, not a gate that blocks access.
- Recording auto-stops after 30 seconds to prevent an open mic being left
  running indefinitely.
- If the upload fails due to a network issue, the recording and transcript are
  cached locally and retried automatically once connectivity returns. If the
  upload is rejected due to rate limiting (3 tickets per unit per hour), it is
  **not** cached for retry, since retrying immediately would just hit the same
  limit again.
- Audio input/output devices are detected by name at every startup rather than
  a fixed card number, since USB device numbering can shift between reboots.
