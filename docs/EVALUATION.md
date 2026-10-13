# Classifier Evaluation Methodology

## What the Regression Suite Measures

The file `packages/classifier/tests/evaluation.test.ts` contains 19 labelled fixtures that document expected behavior for known traffic patterns. Each fixture has:

- A unique ID (eval_01 through eval_19).
- A textual description and provenance note.
- Expected actorType and verificationStatus.

Passing all 19 fixtures confirms there are no regressions against documented behavior. It does not measure accuracy against unseen traffic.

## Why This Is Not an Accuracy Benchmark

1. **Fixture design contamination**: The 19 fixtures were written after the classifier was designed, using the same User-Agent strings and IP addresses that the classifier was tuned to recognize. A true accuracy benchmark requires a held-out set that was not used during development.

2. **Small sample size**: 19 samples are insufficient to estimate precision or recall at any statistically meaningful confidence interval. A 95% confidence interval on a proportion estimated from 19 samples spans roughly +/- 22 percentage points.

3. **No distribution weighting**: Real web traffic has a distribution of actor types that differs from a balanced 6-class dataset. A classifier with 100% regression pass rate on balanced fixtures may have high false positive rates on actual traffic where 90%+ of requests are human browsers.

4. **No adversarial distribution shift**: The evaluation set contains adversarial examples that match the classifier's known detection patterns. Novel evasion techniques (e.g., rotating residential IPs, realistic browser fingerprints on crawlers) are not represented.

## Documented Confidence Score Limitations

Confidence values in TrafficPulse are heuristic scores, not calibrated probabilities:

| Evidence Tier | Max Confidence | Justification |
|:---|:---|:---|
| CIDR-verified identity | 0.95 | Network origin confirmed against published ranges |
| Signature match, no CIDR | 0.75 | Declared identity only; User-Agent can be forged |
| Signature match, IP outside CIDRs | 0.55 | Claimed identity conflicts with network origin |
| Behavioral inference only | 0.85-0.90 | Client-side signals can be fabricated |
| Header anomaly heuristic | 0.75 | Correlative, not definitive |
| Empty or unrecognized | 0.30-0.40 | Minimal evidence |

Confidence never exceeds what the evidence tier allows. High confidence does not mean statistical calibration.

## How to Conduct a Real Evaluation

1. Deploy TrafficPulse in shadow mode alongside a known-good baseline for at least 30 days.
2. Collect a random sample of >= 1000 events.
3. Have human labelers annotate ground truth (at minimum: human vs. bot, with subtype if detectable).
4. Compute precision, recall, and F1 per class on the human-labelled set.
5. Report results with confidence intervals and the labeling process.
6. Publish the anonymized dataset so the community can validate.
