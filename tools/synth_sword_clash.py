# Synthesised sword clashes: a short filtered-noise impact, a metallic ring of inharmonic partials with fast decay,
# and a low body thump. Three variants differ in pitch, partial mix and decay so repeated hits do not sound identical.
import numpy as np, wave, sys
SR = 44100
def clash(seed, base, dur=0.42):
    rng = np.random.default_rng(seed); n = int(SR * dur); t = np.arange(n) / SR
    # impact: 12 ms of noise, high-passed by differencing, sharp decay
    noise = rng.standard_normal(n); hp = np.concatenate([[0], np.diff(noise)])
    impact = hp * np.exp(-t / 0.006) * 0.9
    # metallic ring: inharmonic partials (bar/plate-like ratios), each with its own decay and a little detune beating
    ratios = [1.0, 2.76, 5.40, 8.93, 13.34]
    ring = np.zeros(n)
    for k, r in enumerate(ratios):
        f = base * r * (1 + rng.uniform(-0.01, 0.01)); amp = [0.55, 0.45, 0.32, 0.2, 0.12][k]; tau = [0.16, 0.11, 0.07, 0.045, 0.03][k]
        ring += amp * np.sin(2 * np.pi * f * t + rng.uniform(0, 6.28)) * np.exp(-t / tau) * (1 + 0.25 * np.sin(2 * np.pi * rng.uniform(5, 11) * t))
        ring += amp * 0.5 * np.sin(2 * np.pi * f * 1.004 * t) * np.exp(-t / tau)
    ring *= np.minimum(1, t / 0.0015)                     # 1.5 ms attack, no click
    body = np.sin(2 * np.pi * 150 * t) * np.exp(-t / 0.03) * 0.35
    y = impact + ring * 0.8 + body
    y *= np.minimum(1, (dur - t) / 0.03)                  # fade the tail
    y /= np.max(np.abs(y)); y *= 0.89                     # about -1 dBFS
    return (y * 32767).astype(np.int16)
for i, (seed, base) in enumerate([(11, 1180), (23, 1320), (37, 1050)], 1):
    with wave.open(f'clash_{i}.wav', 'wb') as w: w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes(clash(seed, base).tobytes())
print('ok')
