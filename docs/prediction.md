# SmartFlow Deterministic Prediction Engine

The SmartFlow Prediction Engine powers proactive, low-overhead prefetching of content before user explicit navigation.

---

## 1. Design Philosophy: Deterministic Before ML

Rather than introducing brittle, heavy machine learning libraries (such as TensorFlow or PyTorch) into the critical path, SmartFlow uses an empirical Markov transition model combined with sequential playlist lookahead.

### Signals Considered:
1. **Empirical Sequential Transitions ($A \to B$):**
   When users access resource $B$ immediately after resource $A$, a weighted transition edge is recorded in `ResourceTransition`. If transition frequency $\ge 2$, confidence score:
   $$\text{Score} = \min(0.95, 0.50 + (\text{Count} \times 0.10))$$
2. **Playlist Chronology & Lookahead:**
   In feeds and media lists, sequential items $i+1$ and $i+2$ receive prioritized confidence scores (0.75 and 0.55).
3. **Network Sensitivity Adjustment:**
   The prefetch window size shrinks dynamically under `slow` or `offline` conditions:
   - `FAST` network: Prefetch top 3 candidates (threshold $\ge 0.40$).
   - `MEDIUM` network: Prefetch top 2 candidates (threshold $\ge 0.60$).
   - `SLOW` network: Prefetch only the highest-confidence candidate (threshold $\ge 0.80$).
   - `OFFLINE`: Network prefetching halts completely; queries fall back to L1/L2/L3 cache.

---

## 2. Explainable Predictions

Every prediction decision stored in `PredictionEvent` records:
- `current_resource_id`
- `predicted_resource_id`
- `prediction_score` (0.0 to 1.0)
- `reason` (e.g., *"Frequently accessed after current resource (4 prior sequential visits)"*)
- `latency_saved_ms`

This satisfies the explainability requirement for both the user interface and admin dashboards.
