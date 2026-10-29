# Build a New CodeClash Windows Installer

Use these steps to package the latest application changes into a new Windows
installer (`.exe`). Run the commands from the repository root in PowerShell.

## Prerequisites

- Windows 10 or later, 64-bit
- Node.js and npm
- Maven
- A Java 21 JDK, with `JAVA_HOME` set to its installation directory
- Network access for the initial dependency installation

For example, if Java 21 is installed in `C:\Program Files\Java\jdk-21`, set
`JAVA_HOME` in PowerShell for the current terminal:

```powershell
$env:JAVA_HOME = "C:\Program Files\Java\jdk-21"
```

Check the tools are available:

```powershell
node --version
npm --version
mvn --version
& "$env:JAVA_HOME\bin\java.exe" -version
```

## Install dependencies

Run these commands after a fresh checkout or when the lockfiles have changed:

```powershell
Set-Location frontend
npm ci

Set-Location ..\desktop
npm ci

Set-Location ..
```

## Build the installer with the latest code

Make sure the intended changes are present in the working tree, then run:

```powershell
Set-Location desktop
npm run package:win
```

This command performs the complete packaging workflow:

1. Builds the React/Vite frontend for the desktop app.
2. Packages the Java execution engine.
3. Creates a trimmed Java 21 runtime bundled with the app.
4. Packages the Electron app as a 64-bit Windows NSIS installer.

When it completes successfully, the installer is:

```text
desktop\release\CodeClash Setup.exe
```

Install and launch this newly generated installer to use the updated desktop
app. Rebuilding the installer does not update copies already installed on
other computers; distribute the new `.exe` and install it there as needed.

## Select the backend API

Packaged desktop builds use the hosted CodeClash API by default. To embed a
different API URL in the installer, set `CODECLASH_API_URL` before packaging:

```powershell
Set-Location desktop
$env:CODECLASH_API_URL = "https://your-backend.example.com/api"
npm run package:win
Remove-Item Env:CODECLASH_API_URL
```

For a backend running on the same computer as the installer:

```powershell
$env:CODECLASH_API_URL = "http://localhost:5000/api"
npm run package:win
Remove-Item Env:CODECLASH_API_URL
```

The API URL is embedded in the build. To change it later, build and install a
new version of the desktop app. Ensure the selected backend is running and
allows requests from the packaged desktop app.

## Desktop integrity and assessment trust

The Windows packaging script creates an integrity manifest for the bundled
Secure Code Engine JAR, Java launchers, Java runtime modules, and runtime
release metadata. The packaged app verifies those hashes during startup and
again before an official Desktop-local submission.
Development runs do not require the packaged manifest. The manifest is an
additional tamper-detection check, not a signed attestation: a determined
participant who controls the machine and application can modify the app and
its manifest.

Desktop-local results use a short-lived, user/challenge/source-bound grant,
single-use nonce, and structured transcript. The backend checks the grant,
transcript digest, source binding, versions, timing, test-count consistency,
and duplicate state before persisting the result. These checks prevent ordinary
replay and inconsistent payloads, but do not prove that an untrusted local
engine produced the reported outcomes. Desktop-local assessment results are
marked as not independently re-executed by the server. Hidden test cases and
expected hidden outputs are not sent to participants; local Desktop scoring is
limited to the visible test cases.

Fullscreen, focus, copy/paste, and related events are client-reported evidence
for risk review. A single event does not automatically disqualify a candidate,
and these signals are not proof of misconduct. Administrators can review the
recorded event sequence and execution metadata in existing participant views.
The platform does not continuously collect unrelated process lists or claim to
detect assistance from a second physical device. Similarity reporting currently
flags exact source-hash matches only; it does not claim to detect renamed
variables, structural similarity, or AI assistance.

### Windows code signing

No development certificate is included and a build without signing credentials
is not represented as signed. Electron Builder can sign release artifacts when
valid credentials are securely supplied to the packaging environment (for
example, with `WIN_CSC_LINK` and `WIN_CSC_KEY_PASSWORD`). Keep certificate
material and passwords in the release system's secret store; do not commit
them to the repository. Validate the signed installer and update artifacts
using the release certificate before distribution.

## Troubleshooting

- **`JAVA_HOME` must point to a Java 21 JDK:** Set `JAVA_HOME` to the JDK
  folder, not its `bin` subfolder, then rerun `npm run package:win`.
- **`mvn` is not recognized:** Install Maven and make sure its `bin` folder is
  on `PATH`; open a new PowerShell window after changing `PATH`.
- **Frontend or desktop dependencies are missing:** Run `npm ci` in the
  `frontend` and `desktop` folders as shown above.
- **The installer still connects to the previous backend:** Set
  `CODECLASH_API_URL` before building; the URL is baked into the installer.
- **Electron-builder reports a TLS socket disconnect:** `package:win` reuses
  the local Electron archive and Windows resource editor when they are cached.
  If the required cache files are unavailable, allow the build machine to reach
  the Electron and electron-builder download hosts, then rerun the command.
- **Build fails:** Read the first reported command error in the terminal,
  resolve that prerequisite or build error, and rerun the packaging command.

//.exe build
$env:JAVA_HOME = "C:\Program Files\Eclipse Adoptium\jdk-21.0.11.10-hotspot"
Test-Path "$env:JAVA_HOME\bin\java.exe"
Test-Path "$env:JAVA_HOME\bin\javac.exe"
Test-Path "$env:JAVA_HOME\bin\jlink.exe"
mvn -version
npm run package:win
