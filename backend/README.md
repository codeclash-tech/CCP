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

## Production configuration

Set `NODE_ENV=production`, use an HTTPS `CLIENT_URL`, provide `RESEND_API_KEY` and a verified `EMAIL_FROM` sender address, and use different randomly generated JWT secrets of at least 32 characters. Do not commit `.env` or production credentials. The production dependency tree is checked with `npm audit --omit=dev`.

Configure `VITE_API_URL` in the frontend to point to this API's `/api` base URL, or proxy `/api` to this service on the frontend origin.

## Super Admin account

Set `SUPER_ADMIN_EMAIL=hellocodeclash@gmail.com` and a private `SUPER_ADMIN_PASSWORD` in the ignored backend `.env` or deployment secret store. The password must be 8-72 UTF-8 bytes. On startup, the backend creates the account if absent; otherwise it ensures the configured account is verified and active, grants the server-side `ADMIN` role, and synchronizes its password to the configured secret. This account can sign in directly without registration. Registration and creator verification cannot grant this role based on an email address.

Changing `SUPER_ADMIN_PASSWORD` and restarting the backend rotates the configured account password. The optional `npm run super-admin:reset-password` command can also apply the secret immediately; it requires its explicit confirmation flag and never prints the password. Do not put the secret in renderer or Electron configuration.
