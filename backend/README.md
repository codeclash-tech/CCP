# CodeClash Backend

Express API for CodeClash. Requires Node.js 20.19 or newer and MongoDB.

## Local setup

1. Copy `.env.example` to `.env` and configure MongoDB, JWT secrets, and `RESEND_API_KEY`.
2. Install locked dependencies with `npm ci`.
3. Run backend tests with `npm test`.
4. Start the API with `npm start`.

The health endpoint is `GET /api/health`. It returns HTTP 200 only when MongoDB is connected; otherwise it returns HTTP 503.

## Production configuration

Set `NODE_ENV=production`, use an HTTPS `CLIENT_URL`, provide a Resend API key in `RESEND_API_KEY`, and use different randomly generated JWT secrets of at least 32 characters. Do not commit `.env` or production credentials. The production dependency tree is checked with `npm audit --omit=dev`.

Configure `VITE_API_URL` in the frontend to point to this API's `/api` base URL, or proxy `/api` to this service on the frontend origin.
