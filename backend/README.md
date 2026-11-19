# CodeClash Backend

Express API for CodeClash. Requires Node.js 20.19 or newer and MongoDB.

## Local setup

1. Start MongoDB and the separate Secure Code Engine on port `8080`.
2. Configure `MONGODB_URI`, distinct JWT secrets, `SECURE_CODE_ENGINE_URL`, and `SECURE_CODE_ENGINE_API_KEY` in `.env`.
3. Configure `RESEND_API_KEY` and `EMAIL_FROM` if registration and verification emails should be delivered.
4. Install locked dependencies with `npm ci`.
5. Run backend tests with `npm test`.
6. Start the API with `npm run dev`.

The health endpoint is `GET /api/health`. It returns HTTP 200 only when MongoDB is connected; otherwise it returns HTTP 503.
The execution endpoint defaults to `http://localhost:8080/api/v1/execute` in development. The Secure Code Engine is a separate service and must be started independently.
Packaged desktop Super Admin question creation validates reference solutions with the bundled local engine and sends the generated outputs to the API; web question creation retains backend-side reference execution. Participant submissions remain subject to server-side judging.

## Production configuration

Set `NODE_ENV=production`, use an HTTPS `CLIENT_URL`, provide `RESEND_API_KEY` and a verified `EMAIL_FROM` sender address, and use different randomly generated JWT secrets of at least 32 characters. Do not commit `.env` or production credentials. The production dependency tree is checked with `npm audit --omit=dev`.

Configure `VITE_API_URL` in the frontend to point to this API's `/api` base URL, or proxy `/api` to this service on the frontend origin.
The packaged Electron client uses the `codeclash://app` origin, which is
explicitly allowed for credentialed API requests.

## Desktop AI Learning

The learning API is available only to authenticated desktop learning roles and
Super Admin authoring routes. Courses have no price; each module is independently
published and priced. Course and module archival keeps existing purchases,
progress, assessments, and certificate references. Published module edits create
immutable content versions, and student progress and tutor sessions stay pinned
to the version first opened.

Configure the tutor and payment service on the backend, never in the desktop
renderer:

```env
AI_PROVIDER=ollama
AI_MODEL=llama3.1:8b
AI_BASE_URL=http://localhost:11434
AI_API_KEY=
AI_TIMEOUT_MS=45000
RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=
RAZORPAY_WEBHOOK_SECRET=
```

The initial tutor uses the local Ollama model `llama3.1:8b`; install Ollama and
pull that model on the backend host with `ollama pull llama3.1:8b`. Local Ollama
does not require an API key. Keep Ollama reachable from the backend at
`AI_BASE_URL`. Module and topic teaching instructions are subordinate to
platform safety rules. Tutor prompts include only the selected admin-authored
topic and bounded session history. Topic checks are graded by backend-authored
answer criteria; the AI never records completion. Voice output uses native
device voices, with Boy/Girl choices shown only when a matching voice exists
for the selected language.

Razorpay order creation and payment confirmation run on the backend. The client
receives only the public key ID and server-created order data. Checkout
confirmation is checked against Razorpay's payment API and HMAC signature;
webhooks use `POST /api/learning/payments/webhook` and must be configured with
the same webhook secret. Only a verified captured payment activates module
access. Module prices are converted using the selected ISO currency's minor
unit precision and checked against the order and captured-payment responses.
Free modules can be granted without a payment. Payment processing uses the
built-in Node fetch and crypto APIs and does not add an SDK dependency.

The Super Admin creates and publishes a course with only its name and
description, then adds modules one at a time. A course appears in the student
catalog only after it has a published module. Each module may have a finite
access duration in days, measured from verified payment, or lifetime access.
Expired access prevents further lesson access but retains progress and earned
certificates. Student APIs hide draft, unpublished, and archived courses or
modules while retaining historical purchases and learning records.

## Super Admin account

Set `SUPER_ADMIN_EMAIL=hellocodeclash@gmail.com` and a private `SUPER_ADMIN_PASSWORD` in the ignored backend `.env` or deployment secret store. The password must be 8-72 UTF-8 bytes. On startup, the backend creates the account if absent; otherwise it ensures the configured account is verified and active, grants the server-side `ADMIN` role, and synchronizes its password to the configured secret. This account can sign in directly without registration. Registration and creator verification cannot grant this role based on an email address.

Changing `SUPER_ADMIN_PASSWORD` and restarting the backend rotates the configured account password. The optional `npm run super-admin:reset-password` command can also apply the secret immediately; it requires its explicit confirmation flag and never prints the password. Do not put the secret in renderer or Electron configuration.
