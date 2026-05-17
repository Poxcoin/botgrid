#!/bin/bash
# Auto-attaches MacroBridgeEA to EURUSD H1 after MT5 starts on :99
export DISPLAY=:99

log() { echo "[$(date '+%H:%M:%S')] attach_ea: $*"; }

log "Starting EA attach sequence"

# Wait for MT5 chart to be visible (poll for window)
for i in $(seq 1 45); do
    if xdotool search --class "" 2>/dev/null | grep -q .; then
        log "Display active (attempt $i)"
        break
    fi
    sleep 2
done

sleep 15  # extra wait for MT5 to finish loading charts

# Click EURUSD H1 chart to make it active
xdotool mousemove 530 160 click 1
sleep 0.3

# Scroll down in the Navigator panel to reveal MacroBridgeEA
# It appears below example folders at ~y=386
xdotool mousemove 180 340 2>/dev/null
for i in 1 2 3 4 5; do
    xdotool click 5  # mouse wheel down
    sleep 0.1
done
sleep 0.5

# Right-click on MacroBridgeEA (at y~386 after scrolling)
xdotool mousemove 100 368 click 3
sleep 0.5

# Click "Attach to Chart" (top item in context menu)
xdotool mousemove 160 383 click 1
sleep 1

# Click OK in the EA settings dialog
xdotool mousemove 625 579 click 1
sleep 1

log "EA attached to chart"

# Save profile: File → Profiles → Save
xdotool mousemove 22 40 click 1
sleep 0.5
xdotool mousemove 52 109 click 1
sleep 0.5
xdotool mousemove 271 155 click 1
sleep 0.5

log "Profile saved. Done."
