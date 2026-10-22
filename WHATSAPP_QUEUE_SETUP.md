# WhatsApp Alert Queue & Automated Publisher Guide

This document covers the end-to-end architecture and operational commands for the automated WhatsApp alert system.

---

## 1. System Architecture

```
[Portal Scanner Extension]
           │
           ▼
[POST /api/events] ─── (Confirmed Positive Opening)
           │
           ├────────────────────────► [Telegram Bot] (Delayed by ALERT_DELAY_MINUTES)
           │
           ▼
[MongoDB WhatsAppJob Queue] (Scheduled at: Date.now() + ALERT_DELAY_MINUTES)
           ▲
           │ (GET /api/whatsapp-queue/next every 5s)
           │
[WhatsApp Publisher Worker (node whatsappPublisher.js)]
           │
           ▼ (client.sendMessage)
[WhatsApp Community / Announcement Groups]
  • F1/F2  -> 120363433828045224@g.us (F1/F2 updates)
  • B1/B2  -> 120363409650684618@g.us (B1 B2 UPDATES)
  • H1B/H4 -> 120363410431386086@g.us (H1 H4 Live Updates)
```

---

## 2. Configuration (`backend/.env`)

The following variables configure the WhatsApp integration:

```env
# Publisher token for authenticating between worker and backend API
WHATSAPP_PUBLISHER_TOKEN=a16cea6d20f44ae1230a2b28cb20a54ceaa8bc4c0cf885cc7266f2e026940d82

# Backend URL (use http://localhost:5000 locally or your production Render URL)
BACKEND_URL=http://localhost:5000

# Verified WhatsApp Community / Group IDs
WHATSAPP_GROUP_B1B2=120363409650684618@g.us
WHATSAPP_GROUP_F1F2=120363433828045224@g.us
WHATSAPP_GROUP_H1BH4=120363410431386086@g.us

# Optional: set to true to run headless browser in background
WHATSAPP_HEADLESS=false

# Feed delay (default: 10 minutes)
ALERT_DELAY_MINUTES=10
```

---

## 3. How to Run the Publisher

Open a terminal in the `backend` folder:

### A. Run 24/7 Automated Queue Worker
```bash
node whatsappPublisher.js
# or:
npm run whatsapp
```
- Connects to WhatsApp using the authenticated session (`.whatsapp-session`).
- Polls `/api/whatsapp-queue/next` every 5 seconds.
- Automatically sends alerts to the matching group when jobs mature (respecting the 10-minute delay).
- Acknowledges successful delivery or retries if failed.

### B. Live Test Send to All 3 Groups
```bash
node whatsappPublisher.js --test
# or:
npm run whatsapp:test
```
Dispatches a clearly marked system test notification to **B1/B2**, **F1/F2**, and **H1B/H4** to verify channel delivery.

### C. Live Test Send to Specific Group
```bash
node whatsappPublisher.js --test F1/F2
node whatsappPublisher.js --test B1/B2
node whatsappPublisher.js --test H1B/H4
```

### D. Scan All Joined WhatsApp Groups
```bash
node whatsappPublisher.js --scan
# or:
npm run whatsapp:scan
```
Scans all group chats and outputs an updated `whatsapp-destination-scan.json` with names and IDs.

---

## 4. API Endpoints (`/api/whatsapp-queue`)

All queue endpoints require:
`Authorization: Bearer <WHATSAPP_PUBLISHER_TOKEN>`

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/whatsapp-queue/next` | Claims the next due job (HTTP 204 if none ready; leases for 2 mins) |
| `POST` | `/api/whatsapp-queue/:id/ack` | Acknowledges successful WhatsApp delivery (`status: "sent"`) |
| `POST` | `/api/whatsapp-queue/:id/fail` | Reports delivery failure (`{ error: string }`; retries up to 5 times) |
| `GET` | `/api/whatsapp-queue/status` | Returns counts of pending, sending, sent, failed jobs |
| `POST` | `/api/whatsapp-queue/test-job` | Queues an immediate test job without waiting for portal slots |

## 3. How to Run the Publisher

Open a terminal in the `backend` folder:

### A. Run 24/7 Automated Queue Worker
```bash
node whatsappPublisher.js
# or:
npm run whatsapp
```
- Connects to WhatsApp using the authenticated session (`.whatsapp-session`).
- Polls `/api/whatsapp-queue/next` every 5 seconds.
- Automatically sends alerts to the matching group when jobs mature (respecting the 10-minute delay).
- Acknowledges successful delivery or retries if failed.

### B. Live Test Send to All 3 Groups
```bash
node whatsappPublisher.js --test
# or:
npm run whatsapp:test
```
Dispatches a clearly marked system test notification to **B1/B2**, **F1/F2**, and **H1B/H4** to verify channel delivery.

### C. Live Test Send to Specific Group
```bash
node whatsappPublisher.js --test F1/F2
node whatsappPublisher.js --test B1/B2
node whatsappPublisher.js --test H1B/H4
```

### D. Scan All Joined WhatsApp Groups
```bash
node whatsappPublisher.js --scan
# or:
npm run whatsapp:scan
```
Scans all group chats and outputs an updated `whatsapp-destination-scan.json` with names and IDs.

---

## 4. API Endpoints (`/api/whatsapp-queue`)

All queue endpoints require:
`Authorization: Bearer <WHATSAPP_PUBLISHER_TOKEN>`

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/whatsapp-queue/next` | Claims the next due job (HTTP 204 if none ready; leases for 2 mins) |
| `POST` | `/api/whatsapp-queue/:id/ack` | Acknowledges successful WhatsApp delivery (`status: "sent"`) |
| `POST` | `/api/whatsapp-queue/:id/fail` | Reports delivery failure (`{ error: string }`; retries up to 5 times) |
| `GET` | `/api/whatsapp-queue/status` | Returns counts of pending, sending, sent, failed jobs |
| `POST` | `/api/whatsapp-queue/test-job` | Queues an immediate test job without waiting for portal slots |

