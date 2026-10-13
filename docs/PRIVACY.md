# TrafficPulse Privacy Documentation

This document describes exactly what the TrafficPulse tracker collects, what is stored,
how data is protected, retention policies, and legal considerations.

## What the Tracker Collects

### Always Collected (no opt-in required)

These signals are necessary for the core classification function:

| Signal | Description | Storage |
|--------|-------------|--------|
| User-Agent | HTTP request header | Stored per event |
| Request path | URL path (not query string by default) | Stored per event |
| HTTP method | GET, POST, etc. | Stored per event |
| Timestamp | UTC ISO-8601 | Stored per event |
| IP address (masked) | See IP masking section below | Last octet zeroed |
| Webdriver flag | navigator.webdriver boolean | Stored in clientHints |
| hasChromeObject | Presence of window.chrome | Stored in clientHints |
| hasPlugins | Presence of navigator.plugins | Stored in clientHints |
| screenConsistency | screen.width > 0 check | Stored in clientHints |
| Viewport dimensions | window.innerWidth / innerHeight | Stored in clientHints |
| Interaction count | Count of keydown, mousemove, scroll events (not content) | Stored in clientHints |
| Dwell time | Time from page load to event dispatch (ms) | Stored in clientHints |

### Opt-In Only (requires `data-enable-behavior="true"`)

These signals are not collected unless explicitly enabled. They are considered
fingerprint-like under GDPR/ePrivacy Directive and require a legal basis (typically consent):

| Signal | Description | Why Opt-In |
|--------|-------------|------------|
| Mouse entropy | Shannon entropy of mouse movement directions (0 to 3.0) | Behavioral fingerprint; requires consent under ePrivacy |
| Scroll entropy | Whether any scrolling occurred (0 or 1) | Behavioral indicator |
| WebGL renderer | GPU renderer string from WEBGL_debug_renderer_info | Device fingerprint; uniquely identifies hardware |

### Never Collected

The following are explicitly prohibited by code and validated server-side:

- Raw keystrokes, key characters, or key combinations.
- Form field values or input contents.
- Cookie values.
- localStorage or sessionStorage contents (except the opt-out flag).
- Full URL including query strings and hash fragments.
- Precise mouse coordinates (only directional vectors are computed; raw coords are discarded).

## IP Address Masking

IP addresses are masked before storage to minimize PII retention:

| IP Type | Mask Applied | Example |
|---------|-------------|--------|
| IPv4 | Last octet zeroed | 192.168.1.123 -> 192.168.1.0 |
| IPv6 | Truncated to /64 boundary | 2001:db8:1:2::abcd -> 2001:db8:1:2:: |

The masked IP is stored. The original IP is used only for server-side CIDR verification
during the request lifecycle and is not persisted.

## Data Retention

Default retention: 90 days. Events older than 90 days are automatically deleted.
This is configurable via the `RETENTION_DAYS` environment variable.

To delete all data for a specific site:
```bash
# Via the admin API (requires ADMIN_API_KEY)
curl -X DELETE https://your-instance.com/api/v1/admin/sites/{siteId}/events \
  -H "Authorization: Bearer $ADMIN_API_KEY"
```

## Opt-Out Mechanisms

TrafficPulse supports multiple opt-out signals:

1. **Do Not Track (DNT)**: If `navigator.doNotTrack === '1'`, no events are sent.
   Enabled by default; disable with `data-respect-dnt="false"`.

2. **Global Privacy Control (GPC)**: If `navigator.globalPrivacyControl === true`,
   no events are sent. GPC is legally significant under the California Consumer Privacy Act (CCPA)
   and similar laws.

3. **Explicit opt-out**: `window.TrafficPulse.optOut()` sets a localStorage flag
   (`trafficpulse_opt_out=1`) and terminates tracking permanently until `optIn()` is called.

4. **Server-side only mode**: Per-site setting to disable the client tracker entirely
   and rely only on server-side classification from middleware.

When opted out, no network requests are made to the TrafficPulse ingestion endpoint.

## Legal Considerations

> [!WARNING]
> TrafficPulse is infrastructure software. Legal compliance is the responsibility of the
> operator deploying it. The following is informational, not legal advice.

### GDPR (European Union)

- **Core traffic analytics** (User-Agent, IP-masked, path): Likely covered under
  **legitimate interest** (GDPR Art. 6(1)(f)) for security and fraud prevention,
  provided you document the legitimate interest assessment (LIA).

- **Behavioral signals** (mouse entropy, scroll, WebGL): These are fingerprint-like
  signals that are likely to require **explicit consent** (GDPR Art. 6(1)(a)) under
  the ePrivacy Directive. They are opt-in by default in TrafficPulse for this reason.

- **Data retention**: Configure `RETENTION_DAYS` to match your data retention policy.
  Document the retention basis in your privacy notice.

- **Data subject rights**: Implement the admin deletion API to support right-to-erasure
  requests. Because IPs are masked and no user identifiers are stored, individual
  identification may not be possible for most events.

### CCPA (California, USA)

- Honor Global Privacy Control (GPC) signals. TrafficPulse does this by default.
- TrafficPulse does not sell personal information as defined by CCPA.

### ePrivacy Directive

- The behavioral signals (opt-in) likely require prior consent under the ePrivacy
  Directive where the Directive applies (EU/EEA).
- The DNT and GPC mechanisms provide technical enforcement of opt-out.

## What TrafficPulse Does NOT Do

- Does not set cookies.
- Does not use cross-site tracking mechanisms.
- Does not share data with third parties.
- Does not perform user identification or profiling.
- Does not collect raw input data.
- Does not claim to prove downstream AI training use of content.
