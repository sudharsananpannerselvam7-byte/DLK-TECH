# SmartFlow Predictive Prefetching Engine

## 1. Algorithmic Principles

SmartFlow avoids the pitfall of downloading entire 100GB datasets into browser memory. Instead, it utilizes **Bounded Predictive Lookahead**:

```
[ Current Item ]  →  VIDEO 10 (Playing / Viewing)
        ↓
[ High Priority Prefetch ]  →  VIDEO 11, VIDEO 12 (Next in Queue)
        ↓
[ Predictive Candidate ]    →  VIDEO 13 (Warmed on Server Edge)
        ↓
[ Bounded Ceiling ]         →  VIDEO 14+ (HALTED until user advances)
```

---

## 2. Dynamic Prefetch Window Calculation

The lookahead window dynamically resizes based on telemetry:

| Network Quality | RTT (Round Trip Time) | Prefetch Window | Media Pre-Buffer |
|---|---|---|---|
| **Fast** (WiFi / 5G) | &lt; 50 ms | 3 items ahead | First 2 MB segments of next media |
| **Medium** (4G LTE) | 50 – 150 ms | 2 items ahead | Metadata + thumbnails only |
| **Slow** (3G / congested) | &gt; 150 ms | 1 item ahead | Metadata on scroll pause only |
| **Offline** | Disconnected | 0 (All requests paused) | Serve local L2 cache |

---

## 3. Direction Change & Request Cancellation

When a user skips past items or navigates in a different direction:
- Active in-flight prefetch requests for skipped items are immediately aborted via `AbortController`.
- The prefetch queue is cleared of superseded content IDs.
- Unnecessary background bandwidth consumption is eliminated.

---

## 4. Playback-Triggered Lookahead

In the dedicated video player:
- When playback reaches **60%** of the current video duration, the engine triggers predictive prefetch for the next item in the user's playlist or feed.
- By the time the user reaches the end of the video, the subsequent item is already warm in Redis and browser memory cache, achieving near-zero perceived transition latency.
