"""Original procedural movement cue. No samples or third-party recordings.
Reproducible mono PCM; short filtered noise, conservative peak headroom.
"""
import math, random, struct, wave
from pathlib import Path
random.seed(22025)
rate=22050
samples=[]
low=0.0
for i in range(int(rate*.12)):
 t=i/rate; u=t/.12
 noise=random.uniform(-1,1)
 low+=.22*(noise-low)
 envelope=math.sin(math.pi*u)**2
 samples.append((noise-low)*envelope)
peak=max(abs(s) for s in samples)
path=Path('artifacts/ko-game/public/sfx/combat-movement.wav')
with wave.open(str(path),'wb') as output:
 output.setnchannels(1);output.setsampwidth(2);output.setframerate(rate)
 output.writeframes(b''.join(struct.pack('<h',round(s/peak*.35*32767)) for s in samples))
print(path, path.stat().st_size, 'bytes; peak -9.1dBFS; duration 120ms')
