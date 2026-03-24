# SAP ABAP Platform Trial 2023 — Self-Hosted Setup Guide

This document describes how to run the SAP ABAP Platform Trial 2023 Docker
container on a Linux server (e.g. Hetzner Cloud), configure it for ADT access,
and connect the integration test suite and GitHub Actions CI to it.

> **Security note:** This guide intentionally omits the server IP/hostname.
> Never commit connection URLs, credentials, or license keys to the repository.

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Server Setup](#server-setup)
3. [SAP ABAP Trial Container](#sap-abap-trial-container)
   - [Pulling the Image](#pulling-the-image)
   - [Starting the Container](#starting-the-container)
   - [Disk Space Warning](#disk-space-warning)
4. [SAP System Configuration](#sap-system-configuration)
   - [License Installation](#license-installation)
   - [Work Process Tuning](#work-process-tuning)
   - [User Access](#user-access)
   - [Unlocking the DEVELOPER User](#unlocking-the-developer-user)
5. [HTTPS / Reverse Proxy Setup](#https--reverse-proxy-setup)
6. [Integration Tests](#integration-tests)
   - [Running Locally](#running-locally)
   - [Test Categories](#test-categories)
   - [Skipped Tests](#skipped-tests)
   - [Known Test Failures](#known-test-failures)
   - [Running a Specific Test](#running-a-specific-test)
7. [GitHub Actions CI](#github-actions-ci)
   - [Workflow Overview](#workflow-overview)
   - [GitHub Secrets Setup](#github-secrets-setup)
   - [CI-Specific Considerations](#ci-specific-considerations)
8. [Troubleshooting](#troubleshooting)

---

## Prerequisites

- A Linux server with at least **16 GB RAM**, **4 CPU cores**, and **150 GB
  disk** (the SAP container image is ~80 GB compressed).
- Docker (or Podman) installed.
- Root or `sudo` access on the server.
- A DNS A record pointing a subdomain at the server IP (for HTTPS).
- A SAP license file for your hardware key (obtain from the SAP trial portal).

---

## Server Setup

### Install Docker

```bash
# Debian / Ubuntu
apt-get update
apt-get install -y docker.io
systemctl enable --now docker
```

### Verify disk space

The SAP image is large. Confirm there is sufficient space before pulling:

```bash
df -h /var/lib/docker
```

---

## SAP ABAP Trial Container

### Pulling the Image

The official SAP ABAP Cloud Developer Trial image is available from Docker Hub
under the `sapse` organisation:

```bash
docker pull sapse/abap-cloud-developer-trial:2023
```

> **Note:** `podman` can be used as a drop-in replacement. If you get a disk-
> full error from podman's `/var/tmp` overlay, ensure the underlying partition
> has enough space or reconfigure the podman storage driver.

### Starting the Container

```bash
docker run -d \
  --name a4h \
  --hostname vhcala4hci \
  -p 50000:50000 \
  -p 50001:50001 \
  -p 8443:8443 \
  -p 30213:30213 \
  --sysctl net.ipv4.ip_local_port_range="40000 60999" \
  --sysctl kernel.shmmax=21474836480 \
  --sysctl kernel.shmmni=32768 \
  --sysctl kernel.shmall=5242880 \
  -v /data/sap/sysvol:/sysvol \
  sapse/abap-cloud-developer-trial:2023
```

Key parameters:

| Parameter | Purpose |
|-----------|---------|
| `--hostname vhcala4hci` | SAP requires a specific hostname |
| `-p 50000:50000` | SAP ICM HTTP port (ADT, browser access) |
| `-p 50001:50001` | SAP ICM HTTPS port |
| `-p 8443:8443` | Alternative HTTPS |
| `-p 30213:30213` | HANA SQL port (multitenant tenant DB) |
| `--sysctl ...` | Required kernel parameters for SAP/HANA |
| `-v /data/sap/sysvol:/sysvol` | Persistent volume for SAP data |

### Disk Space Warning

If you see:
```
Error: copying file write /var/tmp/podman934593548: no space left on device
```
This means the partition hosting `/var/tmp` or the podman overlay is full.
Either free space or move Docker/Podman storage to a larger partition.

### Verifying the Container is Up

The SAP system takes 5-10 minutes to fully start. Check readiness:

```bash
# Watch SAP startup progress
docker exec a4h /usr/sap/hostctrl/exe/sapcontrol -nr 00 -function GetProcessList

# Quick HTTP ping (expects 403 when SAP is up)
curl -s -o /dev/null -w "%{http_code}" http://localhost:50000/sap/bc/ping
```

SAP is ready when `sapcontrol GetProcessList` shows all processes as **Running**.

---

## SAP System Configuration

### License Installation

The trial image ships without a permanent license. Obtain a permanent license
from the SAP trial portal for your hardware key.

**Find your hardware key:**

```bash
docker exec a4h /usr/sap/A4H/SYS/exe/run/saplikey \
  pf=/usr/sap/A4H/SYS/profile/A4H_D00_vhcala4hci \
  -get
```

Note the `Hardware Key` from the output and request a license file from the
SAP trial portal.

**Install the license:**

```bash
# Copy license file into container
docker cp /path/to/A4H_license.txt a4h:/tmp/A4H_license.txt

# Install all keys from the file
docker exec a4h /usr/sap/A4H/SYS/exe/run/saplikey \
  pf=/usr/sap/A4H/SYS/profile/A4H_D00_vhcala4hci \
  -install /tmp/A4H_license.txt

# Verify installation
docker exec a4h /usr/sap/A4H/SYS/exe/run/saplikey \
  pf=/usr/sap/A4H/SYS/profile/A4H_D00_vhcala4hci \
  -get
```

The correct profile path inside the container is:
```
/usr/sap/A4H/SYS/profile/A4H_D00_vhcala4hci
```

> **Common mistake:** The profile is `A4H_D00_vhcala4hci`, not
> `A4H_DVEBMGS00_vhcala4hci`. List `ls /usr/sap/A4H/SYS/profile/` to confirm
> the correct filename if `saplikey` reports a missing profile error.

### Work Process Tuning

The default SAP profile only allocates **7 dialog work processes**. Running the
full integration test suite (34 tests) exhausts these quickly and causes 503
errors. Increase them:

**Edit the instance profile inside the container:**

```bash
docker exec -it a4h bash
vi /usr/sap/A4H/SYS/profile/A4H_D00_vhcala4hci
```

Change:
```
rdisp/wp_no_dia = 7
```
To:
```
rdisp/wp_no_dia = 25
rdisp/wp_no_btc = 5
rdisp/wp_no_vb  = 1
```

### Session Timeout Tuning

ADT CRUD operations open stateful sessions (locks) that hold a dialog work
process in **PRIV** (private) mode. If the client disconnects without explicitly
ending the session, the WP stays occupied until the timeout expires.

The default timeout is 600 seconds (10 minutes), which means 30+ integration
tests can exhaust all work processes before the first sessions expire.

**Add these parameters to the instance profile:**

```
# Aggressive session cleanup for CI / remote ADT clients
rdisp/plugin_auto_logout = 120
rdisp/max_wprun_time = 300
icm/keep_alive_timeout = 60
http/security_session_timeout = 120
```

| Parameter | Value | Effect |
|-----------|-------|--------|
| `rdisp/plugin_auto_logout` | 120 | Auto-logout idle HTTP plugin sessions after 2 min |
| `rdisp/max_wprun_time` | 300 | Max runtime for a single dialog step (5 min) |
| `icm/keep_alive_timeout` | 60 | Close idle HTTP keep-alive connections after 1 min |
| `http/security_session_timeout` | 120 | HTTP security session timeout (2 min) |

Without these settings, stale PRIV sessions from failed or disconnected tests
accumulate and cause 503 errors for subsequent requests.

**Restart the ABAP application server (not the whole container):**

```bash
# Stop ABAP only
docker exec a4h /usr/sap/hostctrl/exe/sapcontrol -nr 00 -function Stop
# Wait ~60s for full stop
docker exec a4h /usr/sap/hostctrl/exe/sapcontrol -nr 00 -function Start
```

> **Note:** `RestartInstance` did not work reliably; use explicit `Stop` then
> `Start`.

### User Access

The trial system ships with these pre-configured users:

| User | Default Password | Role |
|------|-----------------|------|
| `DEVELOPER` | `ABAPtr2023#00` | ABAP developer (S_DEVELOP auth) |
| `DDIC` | `ABAPtr2023#00` | Data dictionary admin |
| `BWDEVELOPER` | `ABAPtr2023#00` | BW developer |

**Use `DEVELOPER` for ADT and integration tests.** `DDIC` does not have the
`S_DEVELOP` authorization object required to create/edit ABAP objects via ADT.

### Unlocking the DEVELOPER User

After many failed login attempts, the `DEVELOPER` user gets locked
(`UFLAG = 128` in `USR02`). This manifests as HTTP 401 from ADT endpoints even
though `/sap/bc/ping` returns 403 (ping uses a lighter auth check).

**Unlock via HANA SQL (no HANA SYSTEM password required):**

The `a4hadm` OS user has a pre-configured HANA userstore key that connects as
the ABAP schema owner (`SAPA4H`):

```bash
docker exec -it a4h bash
su - a4hadm

# Connect to the HANA tenant DB as SAPA4H
hdbsql -U DEFAULT -d HDB

# Unlock DEVELOPER
UPDATE SAPA4H.USR02 SET UFLAG = 0 WHERE BNAME = 'DEVELOPER';

# Verify
SELECT BNAME, UFLAG, PWDSTATE FROM SAPA4H.USR02
  WHERE BNAME IN ('DEVELOPER', 'DDIC');
\q
```

`UFLAG = 0` means unlocked. `UFLAG = 128` means locked by too many failed
logon attempts. `PWDSTATE = 1` means the user must change password on next
login (leave as-is; ADT handles this transparently).

> **Alternative:** If you have access to SAP GUI or ABAP Developer Tools,
> use transaction `SU01` to unlock users without direct HANA access.

---

## HTTPS / Reverse Proxy Setup

Expose the SAP system over HTTPS via Nginx and Let's Encrypt.

### Install Nginx and Certbot

```bash
apt-get install -y nginx certbot python3-certbot-nginx
```

### Configure Nginx Reverse Proxy

Create `/etc/nginx/sites-available/<your-subdomain>`:

```nginx
server {
    listen 80;
    server_name <your-subdomain>;

    location / {
        proxy_pass         http://localhost:50000;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
        client_max_body_size 50m;
    }
}
```

Enable the site:

```bash
ln -s /etc/nginx/sites-available/<your-subdomain> /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
```

### Obtain Let's Encrypt Certificate

```bash
certbot --nginx -d <your-subdomain>
```

Certbot will automatically update the Nginx config with SSL settings and set
up auto-renewal via a systemd timer.

> **DNS propagation:** Run certbot only after the DNS A record has propagated
> (verify with `dig <your-subdomain>`). Let's Encrypt will fail with a challenge
> error if the record hasn't propagated yet.

---

## Integration Tests

### Running Locally

The integration tests are gated by the `integration` build tag and require four
environment variables:

```bash
export SAP_URL=https://<your-subdomain>   # or http://<ip>:50000
export SAP_USER=DEVELOPER
export SAP_PASSWORD='ABAPtr2023#00'
export SAP_CLIENT=001

go test -tags=integration -v -count=1 -timeout 10m ./pkg/adt/
```

The tests:
- Create temporary ABAP objects in the `$TMP` package
- Exercise the full ADT API surface (read, write, activate, unit tests, etc.)
- Clean up all created objects after each test via deferred cleanup functions
- Use the `DEVELOPER` user (not `DDIC` — see [User Access](#user-access))

### Test Categories

The integration test suite covers these areas:

| Category | Tests | Description |
|----------|-------|-------------|
| **Read operations** | SearchObject, GetProgram, GetClass, GetTable, GetTableContents, RunQuery, GetPackage | Basic ADT read APIs |
| **CDS / RAP** | GetCDSDependencies, GetDDLS, GetBDEF, GetSRVB, GetSource_RAP | CDS views, behavior definitions, service bindings |
| **CRUD** | CRUD_FullWorkflow, LockUnlock, WriteProgram, WriteClass, CreateAndActivateProgram, CreateClassWithTests, EditSource, CreatePackage | Create, lock, modify, activate, delete ABAP objects |
| **Dev tools** | SyntaxCheck, SyntaxCheckWithErrors, RunUnitTests, PrettyPrint, GetPrettyPrinterSettings | Syntax checker, unit test runner, pretty printer |
| **Code intelligence** | CodeCompletion, FindReferences, FindDefinition, GetTypeHierarchy | Code completion, where-used, navigation |
| **RAP E2E** | RAP_E2E_OData | End-to-end: DDLS → SRVD → SRVB → publish |
| **Debugger** | ExternalBreakpoints, DebuggerListener, DebugSessionAPIs | External breakpoints and debug sessions *(skipped in CI)* |
| **Namespaces** | Namespace_GetSource_Class, _Interface, _Program, _Function, _DDLS, _BDEF | Namespaced objects (`/DMO/`, `/UI5/`, `/AIF/`) |

### Skipped Tests

The following tests are automatically skipped in CI and must be run manually:

| Test | Reason | Manual Run Command |
|------|--------|--------------------|
| `TestIntegration_ExternalBreakpoints` | Requires interactive debug session; breakpoint API needs specific user authorization | `go test -tags=integration -v -run TestIntegration_ExternalBreakpoints ./pkg/adt/` |
| `TestIntegration_DebuggerListener` | Requires a debuggee (running ABAP program hitting a breakpoint) to catch | `go test -tags=integration -v -run TestIntegration_DebuggerListener ./pkg/adt/` |
| `TestIntegration_DebugSessionAPIs` | Tests debug attach/step/stack APIs that need an active debug session | `go test -tags=integration -v -run TestIntegration_DebugSessionAPIs ./pkg/adt/` |

These tests are skipped with `t.Skip()` because debugger operations require
interactive sessions that cannot be reliably automated. They still exist in the
test file and can be run manually for local development.

### Known Test Failures

| Test | Status | Reason |
|------|--------|--------|
| `TestIntegration_RAP_E2E_OData` | May FAIL on fresh systems | The test creates a DDLS, SRVD, and SRVB (`ZTEST_MCP_SB_FLIGHT`), then publishes the service binding. The `GetSRVB` verification step may return HTTP 500 immediately after publish due to SAP internal timing. The test retries once after a 3-second delay, but this may still fail on slow systems. On subsequent runs the SRVB already exists, so the test handles the "already exists" error gracefully. |

All other tests should pass on a correctly configured trial system with the
work process and session timeout tuning described above.

### Running a Specific Test

```bash
go test -tags=integration -v -run TestIntegration_CRUD_FullWorkflow ./pkg/adt/
```

### Running Tests Without Debugger Tests

To explicitly exclude debugger tests (they are already skipped, but for clarity):

```bash
go test -tags=integration -v -run "TestIntegration_[^D]|TestIntegration_D[^e]" ./pkg/adt/
```

---

## GitHub Actions CI

### Workflow Overview

The workflow is defined in `.github/workflows/test.yml`:

```
push / pull_request / workflow_dispatch
      │
      ├── unit (ubuntu-latest)
      │     ├── go test ./... -count=1 -race    ← all unit tests
      │     └── go build ./cmd/vsp              ← verify binary builds
      │
      └── integration (ubuntu-latest) [needs: unit]
            ├── condition: PR, push to main, or manual dispatch
            ├── environment: sap-trial          ← uses GitHub environment secrets
            └── go test -tags=integration -v -timeout 10m ./pkg/adt/
```

The integration job only runs when:
- A pull request is opened/updated
- A push lands on `main`
- The workflow is manually dispatched with `run_integration: true`

### GitHub Secrets Setup

Integration tests read credentials from GitHub environment secrets in the
`sap-trial` environment.

**Create the environment:**

```bash
gh api --method PUT repos/<owner>/<repo>/environments/sap-trial
```

**Set the four secrets:**

```bash
gh secret set SAP_URL      --env sap-trial --repo <owner>/<repo> --body "https://<your-subdomain>"
gh secret set SAP_USER     --env sap-trial --repo <owner>/<repo> --body "DEVELOPER"
gh secret set SAP_PASSWORD --env sap-trial --repo <owner>/<repo> --body "ABAPtr2023#00"
gh secret set SAP_CLIENT   --env sap-trial --repo <owner>/<repo> --body "001"
```

**Verify:**

```bash
gh secret list --env sap-trial --repo <owner>/<repo>
```

**Trigger a manual run with integration tests:**

```bash
gh workflow run test.yml --repo <owner>/<repo> --field run_integration=true
```

### CI-Specific Considerations

**Node.js 24 opt-in:** The workflow sets `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24=true`
at the top level to silence GitHub Actions deprecation warnings about Node.js 20.
The `actions/checkout@v4` and `actions/setup-go@v5` actions run on Node.js 20 by
default; this env var forces Node.js 24 ahead of GitHub's mandatory cutover.

**Go module cache disabled:** The workflow uses `cache: false` for
`actions/setup-go` because the Go toolchain download can cause tar extraction
warnings (`/usr/bin/tar: ... Cannot open: File exists`) when the cache is
restored. These warnings are harmless but noisy.

**Test timeout:** Integration tests use `-timeout 10m` to account for network
latency between GitHub Actions runners and the SAP system. Individual ADT calls
from a remote CI runner take longer than from a local machine.

**Debugger tests auto-skip:** The 3 debugger tests (`ExternalBreakpoints`,
`DebuggerListener`, `DebugSessionAPIs`) call `t.Skip()` unconditionally in CI.
They require interactive debug sessions that cannot be automated.

**Session exhaustion prevention:** The SAP system must have the session timeout
tuning from [Session Timeout Tuning](#session-timeout-tuning) applied. Without
it, the 30+ sequential integration tests accumulate stale PRIV sessions on the
SAP server, eventually exhausting all dialog work processes and causing 503
errors for the remaining tests. This is especially pronounced in CI where
network latency is higher and HTTP connections take longer to complete.

---

## Troubleshooting

### SAP returns 401 on ADT but 403 on `/sap/bc/ping`

The user is locked (`UFLAG=128`). ADT enforces strict auth and rejects locked
users immediately; the lightweight `/sap/bc/ping` service returns 403 (auth
succeeded but no authorisation) for the same locked user.

Fix: [Unlock the DEVELOPER user via HANA SQL](#unlocking-the-developer-user).

### Integration tests fail with 503 mid-run

This is caused by dialog work process exhaustion. Two things must be configured:

1. **Enough work processes:** Set `rdisp/wp_no_dia = 25` (see
   [Work Process Tuning](#work-process-tuning)).
2. **Session timeouts:** Add the session cleanup parameters (see
   [Session Timeout Tuning](#session-timeout-tuning)). Without them, stale
   PRIV sessions from CRUD tests hold work processes for up to 10 minutes.

To diagnose, check the work process table:

```bash
docker exec a4h /usr/sap/hostctrl/exe/sapcontrol -nr 00 -function ABAPGetWPTable
```

Look for DIA work processes in `Stop, PRIV` status — these are held by stale
sessions. If most DIA WPs are PRIV, that explains the 503 errors.

### `saplikey: profile not found`

List the actual profile files:

```bash
ls /usr/sap/A4H/SYS/profile/
```

Use the `A4H_D00_vhcala4hci` file, not `A4H_DVEBMGS00_vhcala4hci`.

### HANA SYSTEM password unknown

Use the `a4hadm` userstore key instead. It connects as `SAPA4H` (the ABAP
schema owner) without needing the SYSTEM password:

```bash
su - a4hadm
hdbsql -U DEFAULT -d HDB
```

### Build fails: undefined debugger types in integration tests

If you see errors like:
```
pkg/adt/integration_test.go:1642:28: client.GetExternalBreakpoints undefined
```

The `pkg/adt/debugger.go` file is missing from your working tree. Ensure it is
committed and present — it defines the external breakpoint API
(`GetExternalBreakpoints`, `SetExternalBreakpoint`, `BreakpointRequest`, etc.).

### DDIC user returns 403 on CRUD operations

```
ExceptionResourceNoAuthorization: DDIC is currently editing ZMCP_XXXXX
```

The `DDIC` user does not have the `S_DEVELOP` authorization object. Use the
`DEVELOPER` user for all ADT and integration test operations. See
[User Access](#user-access).

### RAP E2E test fails with "does already exist"

```
Resource Service Binding ZTEST_MCP_SB_FLIGHT does already exist
```

The SRVB was created by a previous test run and not cleaned up. The test now
handles this gracefully by catching the "already exists" error and continuing.
If it still fails, manually delete the object via ADT or SAP GUI (transaction
`SE80`).

### RAP E2E test fails with 500 on GetSRVB after publish

```
status 500 at /sap/bc/adt/businessservices/bindings/ZTEST_MCP_SB_FLIGHT
```

SAP may return HTTP 500 immediately after publishing a service binding. The test
includes a retry with a 3-second delay, but this can still fail on slow systems.
This is a known SAP timing issue and does not indicate a real problem — the SRVB
was created and published successfully.

### Container starts but SAP is not ready after 10 minutes

Check the container logs:

```bash
docker logs a4h --tail 100
```

Look for HANA startup errors. Common causes:
- Insufficient shared memory (`kernel.shmmax` sysctl not set)
- Disk full during HANA startup

### HTTPS certificate errors in integration tests

If using a self-signed cert or testing against HTTP, set:

```bash
export SAP_INSECURE=true
```

or use the plain HTTP URL (`http://server-ip:50000`). Let's Encrypt certificates
do not require `SAP_INSECURE`.
