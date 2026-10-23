# CodeClash Desktop

The desktop shell reuses the existing React/Vite renderer and Java execution
engine. Electron starts the engine on loopback, keeps its random API key in the
main process, and exposes only health and bounded Java execution operations
through the isolated preload bridge.

## Development

Install the existing frontend dependencies and the desktop tooling:

```powershell
Set-Location frontend
npm ci
Set-Location ..\desktop
npm ci
```

For local execution, install a Java 21 JDK and set `JAVA_HOME` to its directory.
Then run `npm run dev` from `desktop`. The command starts Vite and Electron and
builds the engine JAR if it is missing. The backend remains a separate service.
The development app uses the frontend `.env` API URL; packaged builds default
to CodeClash's hosted API and do not include the frontend `.env` URL.

## Windows installer

With Node.js, Maven, and a Java 21 JDK available, run:

```powershell
Set-Location desktop
npm run package:win
```

The build creates a trimmed Java runtime that includes `javac`, packages the
engine JAR and renderer as application resources, and produces
`desktop\release\CodeClash Setup.exe`. Candidates do not need to install Java,
Node.js, Maven, or start a server manually.

Packaged builds use the hosted API by default. To build an installer that
connects to a local backend, set `CODECLASH_API_URL` before packaging:

```powershell
$env:CODECLASH_API_URL = "http://localhost:5000/api"
npm run package:win
Remove-Item Env:CODECLASH_API_URL
```

The API URL is embedded in the installer, so an existing installation must be
rebuilt and reinstalled to use a different backend. The development app uses
the frontend's Vite API URL configuration instead.

## Current integration boundary

The Battle Room **Run (Test)** action uses the local engine for visible test
cases in Electron and retains the existing backend route in the web app.
Desktop reference-solution generation composes the same Java wrapper and runs
visible and hidden authoring cases together through the local engine; Web
authoring continues to use the backend generation endpoint.
Electron **Submit** obtains an authenticated, one-use authorization containing
only visible test cases, runs those cases in the bundled local Java engine, and
sends the source code and authorization to the backend. The backend consumes
the authorization and independently executes the source against all
server-held visible and hidden cases before calculating and persisting the
authoritative result. Candidate-reported local statuses and outputs are never
used for scoring. Ordinary web submissions keep their existing server-side
execution path. Hidden test inputs and expected outputs are not sent to the
desktop or renderer; participant responses expose only hidden-case
pass/fail/timing summaries.

The weekly assessment's **Run** action also uses the bundled local engine.
Final Battle Room and weekly submissions remain server-authoritative.

Local execution remains useful for immediate candidate feedback, but it is not
the score authority. The authenticated candidate can still inspect or modify
their own machine, so the desktop runtime is defense in depth rather than a
trusted execution environment.

The local engine binds only to `127.0.0.1`, compiles Java once per execution
batch, enforces the engine limits, and cleans managed execution workspaces on
startup and shutdown. Candidate Java receives no inherited environment
secrets or host `PATH` and runs under a restrictive Java 21 security policy.
This is defense in depth, not an OS-level sandbox: a candidate who controls
their machine can still inspect or modify the desktop process, runtime, engine,
and local execution data.
