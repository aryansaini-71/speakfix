# SpeakFix — Voice Maintenance Intake Station

### INTP302 — Emerging Trends in Software Development, Final Project, Group 7

**Team:** Aryan Saini, Anshpreet Singh, Zaara Ahmad, Diego Galvis Tapasco
**Instructor:** Mehdi Shokrani

**Companion website:** https://aryansaini-71.github.io/speakfix/

---

## What this is

SpeakFix is a voice-activated maintenance reporting kiosk built on a Raspberry
Pi 4. A resident enters their unit number, speaks their issue aloud, and the
system takes it from there — transcription, AI extraction, human review, and
resident notification — with no manual data entry required.

### How it works, end to end

1. Resident enters their unit number on a physical keypad and speaks their
   issue into a microphone.
2. The Pi transcribes the recording locally (Vosk, on-device speech-to-text —
   this is the edge computing layer, it works even with a poor connection).
3. The audio and transcript are uploaded to Azure.
4. The cloud independently re-transcribes the audio (Azure AI Speech) as a
   second opinion, stored alongside the on-device transcript.
5. The transcript is sent to a Microsoft Foundry AI agent, which extracts the
   equipment, location, and a clean issue summary, and returns a confidence
   score.
6. A workflow automatically approves high-confidence, complete reports, or
   routes anything uncertain — including anything safety-critical — to a
   human manager for review.
7. The manager views the ticket on a live dashboard: both transcripts, the
   agent's structured output, the audio recording, and the resident's contact
   info (looked up from their registered unit). They approve, edit, reject,
   or mark it resolved.
8. The resident receives an email confirmation. Repeated submissions from the
   same unit are rate-limited to prevent misuse.

## Repository structure

```
speakfix/
├── hardware/       Raspberry Pi application (Python) -- keypad, recording,
│                   on-device transcription, upload, auto-start config
├── Frontend/       Manager dashboard (React + TypeScript + Vite)
├── backend/        Azure Functions backend (Python) -- API, database,
│                   workflow, AI agent invocation, cloud transcription,
│                   rate limiting, email confirmation
├── agent/          Microsoft Foundry AI agent instructions, grounding
│                   data, and evaluation test results
├── documents/           Proposal, shared contracts, architecture diagram,
│                   hardware photos, application screenshots
├── images/         Companion website assets
├── models/         Companion website 3D viewer assets
├── index.html      Companion website
├── script.js
└── style.css
```

Each of `hardware/` and `Frontend/` has more detail in its own README.

## Running each part

### Hardware (Raspberry Pi 4)
See `hardware/README.md` for the full wiring diagram, dependencies, and setup
steps. In short: install the Python dependencies, download the Vosk model,
fill in the real API URL and device key, then run `launcher.py` (or install
`voicestation.service` for automatic startup on boot).

### Backend (Azure Functions)
Deployed on Azure Functions (Flex Consumption plan). Requires: Cosmos DB
(`tickets`, `units`, `leases` containers), Blob Storage, Key Vault, a
Microsoft Foundry project, Azure AI Speech, and Azure Communication Services
for email. See `backend/requirements.txt` for Python dependencies.

### Dashboard (React)
```
cd Frontend
npm install
npm run dev
```
Connects to the deployed backend's API endpoints.

### AI Agent (Microsoft Foundry)
The agent itself is configured inside Microsoft Foundry, not run as local
code. See `agent/` for the exact system instructions, grounding data, and
test results used to build and validate it.

## Cloud architecture

Raspberry Pi (edge) -> Azure Function (`/intake`) -> Blob Storage (audio) +
Cosmos DB (ticket record) -> Microsoft Foundry Agent -> Workflow (auto-approve
or route to human review) -> Dashboard (React) -> Manager action -> Resident
email confirmation.

Full labeled diagram in `docs/`.

## Team contributions

| Member | Responsibility |
|---|---|
| Aryan Saini | Hardware, edge computing, device firmware, enclosure, project integration |
| Anshpreet Singh | Cloud backend, data, workflow, AI integration, infrastructure |
| Zaara Ahmad | AI agent design and testing, presentation |
| Diego Galvis Tapasco | Manager dashboard |

## Post-presentation enhancements

Built after the in-class presentation, based on real-world feedback:

- **Rate limiting** -- maximum 3 tickets per unit per hour, sliding window,
  to reduce the risk of prank or misleading reports.
- **Email confirmation** -- residents receive an email with their ticket
  reference number on submission.
- **Tenant self-registration** -- a public form for new residents to register
  their contact information against their unit, pending manager approval
  (frontend complete; backend endpoints in progress).

## Course requirements checklist

- Live cloud-native application deployed on Azure
- Persistent cloud data storage (Cosmos DB, Blob Storage)
- Defined AI agent with role, instructions, structured output, and human
  review boundaries
- Multi-step agent-driven workflow with routing and human approval
- Usable web dashboard
- Secrets protected (Key Vault), synthetic demo data, human oversight
  maintained throughout
- IoT: Raspberry Pi 4 as an edge device, sending events to the cloud rather
  than acting as the whole application
