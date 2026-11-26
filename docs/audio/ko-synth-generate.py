"""In-house procedural SFX for KO CARD GAME (no third-party samples).
Writes 44.1kHz 16-bit WAVs into public/vendor/ko-synth/."""
import numpy as np, sys, os
from scipy.signal import butter, sosfilt
from scipy.io import wavfile

SR = 44100
OUT = sys.argv[1]
os.makedirs(OUT, exist_ok=True)
rng = np.random.default_rng(7)

def t(sec): return np.arange(int(SR * sec)) / SR
def bp(x, lo, hi, order=4): return sosfilt(butter(order, [lo, hi], 'bandpass', fs=SR, output='sos'), x)
def lp(x, f, order=4): return sosfilt(butter(order, f, 'lowpass', fs=SR, output='sos'), x)
def hp(x, f, order=4): return sosfilt(butter(order, f, 'highpass', fs=SR, output='sos'), x)
def env(n, a, d, sus=None):
    a_n = max(1, int(a * SR)); e = np.ones(n)
    e[:a_n] = np.linspace(0, 1, a_n)
    rest = n - a_n
    e[a_n:] = np.exp(-np.arange(rest) / (d * SR))
    return e
def norm(x, peak=.89): return x / (np.max(np.abs(x)) + 1e-9) * peak
def save(name, x, stereo=False):
    x = np.clip(x, -1, 1)
    if not stereo: x = np.stack([x, x], 1)
    wavfile.write(os.path.join(OUT, name), SR, (x * 32767).astype(np.int16))

def crowd(sec, swell=.5, brightness=1.):
    n = int(SR * sec); out = np.zeros((n, 2))
    # many voices = band-limited noise with independent slow "vowel" formants
    for ch in range(2):
        voices = np.zeros(n)
        for v in range(24):
            f = rng.uniform(380, 1100) * brightness
            band = bp(rng.standard_normal(n), f * .75, f * 1.3, 2)
            mod = lp(rng.standard_normal(n), 3.5, 2); mod = .55 + .45 * norm(mod, 1)
            voices += band * mod
        rumble = lp(rng.standard_normal(n), 260, 4) * .8
        hiss = hp(rng.standard_normal(n), 2500, 2) * .12
        out[:, ch] = voices + rumble + hiss
    shape = np.minimum(1, t(sec) / swell) * np.exp(-np.maximum(0, t(sec) - sec * .45) / (sec * .28))
    return norm(out * shape[:, None], .8)

# 9. crowd roar (short) & big cheer
save('crowd-roar.wav', crowd(2.2, .18), stereo=True)
big = crowd(3.4, .12, 1.15)
claps = np.zeros(big.shape[0])
for k in range(160):
    p = int(rng.uniform(.1, 2.6) * SR)
    c = hp(rng.standard_normal(1600), 900, 2) * np.exp(-np.arange(1600) / 260)
    claps[p:p + 1600] += c[:len(claps[p:p + 1600])] * rng.uniform(.2, .6)
big[:, 0] += claps * .35; big[:, 1] += np.roll(claps, 900) * .35
save('crowd-cheer.wav', norm(big, .85), stereo=True)

# 22. armor ting: inharmonic metal partials
d = t(1.1); x = np.zeros_like(d)
for f, a, dec in [(1860, 1, .35), (2710, .7, .22), (4120, .45, .14), (5390, .3, .09), (930, .35, .5)]:
    x += a * np.sin(2 * np.pi * f * d + rng.uniform(0, 6)) * np.exp(-d / dec)
click = hp(rng.standard_normal(len(d)), 3000) * np.exp(-d / .004)
save('armor-ting.wav', norm(x + click * .6, .8))

# 23. dodge whoosh
d = t(.42); n = rng.standard_normal(len(d))
sweep = np.zeros_like(d)
centers = 600 + 3400 * np.sin(np.pi * d / .42) ** 2
for i in range(0, len(d), 512):
    seg = n[i:i + 512]; c = centers[i]
    sweep[i:i + 512] = bp(seg, c * .7, min(c * 1.4, 18000), 2)
shape = np.sin(np.pi * np.clip(d / .42, 0, 1)) ** 1.6
save('dodge-whoosh.wav', norm(sweep * shape, .7))

# 41. end-turn button clunk: low thud + latch click
d = t(.32)
thud = np.sin(2 * np.pi * (110 * np.exp(-d * 9) + 55) * d) * np.exp(-d / .07)
latch = bp(rng.standard_normal(len(d)), 1800, 5200) * np.exp(-np.maximum(0, d - .012) / .008) * (d > .012)
latch2 = bp(rng.standard_normal(len(d)), 2400, 6000) * np.exp(-np.maximum(0, d - .055) / .006) * (d > .055)
save('button-clunk.wav', norm(thud * 1.1 + latch * .55 + latch2 * .35, .85))

# 18. reversal sting: rising brass-ish chord + hit
d = t(1.6); x = np.zeros_like(d)
for f in [146.8, 220, 293.7, 369.9, 440]:
    fm = f * (1 + .02 * np.minimum(1, d / .25))
    saw = sum(np.sin(2 * np.pi * fm * k * d) / k for k in range(1, 9))
    x += saw
x = lp(x, 2600) * np.minimum(1, d / .06) * np.exp(-d / .7)
boom = np.sin(2 * np.pi * (70 * np.exp(-d * 6) + 40) * d) * np.exp(-d / .25)
save('reversal-sting.wav', norm(x * .6 + boom, .85))

# 2. combo tick (punchy blip that the client pitches up per combo step)
d = t(.25)
x = np.sin(2 * np.pi * (880 * np.exp(-d * 18) + 330) * d) * np.exp(-d / .06)
x += bp(rng.standard_normal(len(d)), 2000, 7000) * np.exp(-d / .01) * .5
save('combo-hit.wav', norm(x, .8))

# 20. tension drum loop: 4 beats @ 100bpm, seamless
beat = 60 / 100; L = beat * 4; d = t(L); x = np.zeros_like(d)
def hit(at, f0, dec, amp, noise=0.):
    s = int(at * SR); seg = d[: len(d) - s]
    k = np.sin(2 * np.pi * (f0 * 2.2 * np.exp(-seg * 22) + f0) * seg) * np.exp(-seg / dec)
    if noise: k += bp(rng.standard_normal(len(seg)), 150, 900) * np.exp(-seg / (dec * .4)) * noise
    x[s:] += k * amp
for b, (f0, amp) in enumerate([(52, 1), (52, .55), (58, .9), (52, .55)]):
    hit(b * beat, f0, .32, amp, .25)
    hit(b * beat + beat * .75, 49, .18, .35)
for b in range(8):
    hit(b * beat / 2 + beat / 4, 180, .05, .12, .6)
x = lp(x, 3000)
save('tension-drums.wav', norm(x, .75))

# 15. cost coin tick
d = t(.3)
x = sum(np.sin(2 * np.pi * f * d) * np.exp(-d / dc) for f, dc in [(2400, .09), (3650, .06), (5200, .03)])
save('coin-tick.wav', norm(x, .6))

# 46. boss siren
d = t(2.4)
f = 520 + 260 * np.sin(2 * np.pi * .9 * d - np.pi / 2)
ph = 2 * np.pi * np.cumsum(f) / SR
x = np.sign(np.sin(ph)) * .4 + np.sin(ph)
x = lp(x, 2200) * np.minimum(1, d / .2) * np.minimum(1, (2.4 - d) / .5)
rumble = lp(rng.standard_normal(len(d)), 120) * 2.2
save('boss-siren.wav', norm(x * .55 + rumble, .8))

# 39. silence ink smear
d = t(.7)
x = lp(rng.standard_normal(len(d)), 900) * np.exp(-d / .25)
x += np.sin(2 * np.pi * (420 * np.exp(-d * 4) + 90) * d) * np.exp(-d / .2) * .5
save('silence-smear.wav', norm(x, .6))

# 38. stat up / down
for name, a, b in [('stat-up.wav', 520, 1040), ('stat-down.wav', 700, 330)]:
    d = t(.35); f = a + (b - a) * np.minimum(1, d / .2)
    ph = 2 * np.pi * np.cumsum(f) / SR
    x = (np.sin(ph) + .3 * np.sin(2 * ph)) * np.minimum(1, d / .01) * np.exp(-d / .14)
    save(name, norm(x, .6))
# 타격감 2차: 아머 깨짐 (유리 파편 + 둔탁한 금속)
d = t(.9)
glass = sum(np.sin(2 * np.pi * f * d + rng.uniform(0, 6)) * np.exp(-d / dc) * rng.uniform(.4, 1)
            for f, dc in [(rng.uniform(2200, 7800), rng.uniform(.04, .22)) for _ in range(26)])
crack = hp(rng.standard_normal(len(d)), 1800) * np.exp(-d / .05)
clank = np.sin(2 * np.pi * (180 * np.exp(-d * 9) + 140) * d) * np.exp(-d / .16)
save('armor-shatter.wav', norm(glass * .55 + crack * .9 + clank * .8, .85))

# 타격감 2차: K.O. 확인 (링 종 한 번 + 둔탁한 쿵)
d = t(1.3)
bell = sum(np.sin(2 * np.pi * f * d) * np.exp(-d / dc) * a for f, dc, a in [(1180, .55, 1), (2960, .3, .45), (4630, .16, .25), (590, .7, .35)])
thump = np.sin(2 * np.pi * (95 * np.exp(-d * 14) + 48) * d) * np.exp(-d / .14)
save('ko-bell.wav', norm(bell * .55 + thump * .9, .85))

# 타격감 2차: 경기장 울림 꼬리 (넓은 공간 잔향, 단독 재생용)
d = t(1.6)
tail = lp(rng.standard_normal(len(d)), 700, 2) * np.minimum(1, d / .04) * np.exp(-d / .42)
tail += lp(rng.standard_normal(len(d)), 160, 2) * 1.6 * np.minimum(1, d / .06) * np.exp(-d / .55)
L = tail + bp(rng.standard_normal(len(d)), 300, 1600, 2) * .25 * np.exp(-d / .3)
R = np.roll(tail, int(SR * .013)) + bp(rng.standard_normal(len(d)), 300, 1600, 2) * .25 * np.exp(-d / .3)
save('arena-tail.wav', norm(np.stack([L, R], 1), .7), stereo=True)

# 타격감 2차: 조준 긴장음 (끊김 없이 반복되는 낮은 웅웅거림, 2초)
L2 = 2.0; d = t(L2)
hum = np.sin(2 * np.pi * 55 * d) + .5 * np.sin(2 * np.pi * 110 * d + .3) + .22 * np.sin(2 * np.pi * 165.5 * d)
hum *= .75 + .25 * np.sin(2 * np.pi * 2 * d)  # 2Hz 맥박 (2초에 정확히 4번 → 이음매 없음)
air = lp(rng.standard_normal(len(d)), 300, 2) * .25
x = hum + air
fade = int(SR * .01); x[:fade] *= np.linspace(0, 1, fade); x[-fade:] *= np.linspace(1, 0, fade)
save('aim-tension.wav', norm(x, .5))
# 관중 1: 경기 내내 깔리는 웅성거림 (6초, 이음매 없이 반복)
L6 = 6.0; n6 = int(SR * L6)
m = np.zeros((n6, 2))
for ch in range(2):
    voices = np.zeros(n6)
    for v in range(30):
        f = rng.uniform(300, 900)
        band = bp(rng.standard_normal(n6), f * .8, f * 1.25, 2)
        mod = lp(rng.standard_normal(n6), 1.6, 2); mod = .5 + .5 * norm(mod, 1)
        voices += band * mod
    m[:, ch] = voices + lp(rng.standard_normal(n6), 200, 4) * .9
xf = int(SR * .5)  # 앞뒤를 겹쳐 이음매 없애기
loop = m[:n6 - xf].copy(); fade = np.linspace(0, 1, xf)[:, None]
loop[:xf] = m[:xf] * fade + m[n6 - xf:] * (1 - fade)
save('crowd-murmur.wav', norm(loop, .6), stereo=True)

# 관중 2: 응원 박자 "쿵 쿵 짝!" 한 마디 (1.2초)
d = t(1.25); x = np.zeros((len(d), 2))
def stomp(at, k):
    i = int(at * SR); seg = d[:int(SR * .35)]
    body = lp(rng.standard_normal(len(seg)), 180, 4) * np.exp(-seg / .07) * 2.2
    thud = np.sin(2 * np.pi * (70 * np.exp(-seg * 10) + 45) * seg) * np.exp(-seg / .09)
    y = (body + thud) * k
    x[i:i + len(y), 0] += y[:len(x) - i]; x[i:i + len(y), 1] += np.roll(y, 40)[:len(x) - i]
def clap(at):
    i = int(at * SR); y = np.zeros(int(SR * .4))
    for c in range(60):
        o = int(rng.uniform(0, .02) * SR); seg = np.arange(len(y) - o)
        y[o:] += hp(rng.standard_normal(len(seg)), 1100, 2) * np.exp(-seg / (SR * .03)) * rng.uniform(.3, 1)
    x[i:i + len(y), 0] += y[:len(x) - i] * .5; x[i:i + len(y), 1] += np.roll(y, 120)[:len(x) - i] * .5
stomp(0, 1); stomp(.3, 1); clap(.6)
save('crowd-stomp-clap.wav', norm(x, .85), stereo=True)

# 관중 3: 야유 "우우~" (2초)
d = t(2.0); boo = np.zeros((len(d), 2))
for ch in range(2):
    v = np.zeros(len(d))
    for k in range(26):
        f0 = rng.uniform(110, 190) * (1 - .12 * d / 2.0)
        ph = 2 * np.pi * np.cumsum(f0 * (1 + .01 * np.sin(2 * np.pi * rng.uniform(4, 7) * d))) / SR
        saw = sum(np.sin(ph * h) / h for h in range(1, 9))
        v += saw * rng.uniform(.4, 1)
    v = bp(v, 180, 900, 2) + bp(rng.standard_normal(len(d)), 250, 700, 2) * .4
    boo[:, ch] = v
shape = np.minimum(1, d / .25) * np.minimum(1, np.maximum(0, 2.0 - d) / .5)
save('crowd-boo.wav', norm(boo * shape[:, None], .75), stereo=True)

# 관중 4: 카메라 셔터 여러 대
d = t(.9); sh = np.zeros(len(d))
for k in range(7):
    at = int(rng.uniform(0, .6) * SR); seg = np.arange(int(SR * .05))
    c = hp(rng.standard_normal(len(seg)), 2500, 2) * np.exp(-seg / (SR * .006))
    c2 = hp(rng.standard_normal(len(seg)), 1800, 2) * np.exp(-seg / (SR * .01)) * .6
    sh[at:at + len(seg)] += c * rng.uniform(.4, 1)
    j = at + int(SR * .035); sh[j:j + len(seg)] += c2[:len(sh) - j]
save('camera-shutters.wav', norm(sh, .7))
print('ok')
