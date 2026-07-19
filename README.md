# clickup-invite-cli

Invite people to a ClickUp Workspace as **Members** using browser automation (Playwright).

ClickUp’s invite API is gated (Enterprise / SCIM). This project drives the **Manage people** UI instead, so any Workspace admin can automate invites without that API.

## Features

- Invite by email as **Member** via Manage people → **Send free invite**
- Persistent browser profile (log in once; cookies reused)
- Google / SSO friendly: if the session expires, a headed run waits for you to sign in again, then continues
- Config via CLI flags, environment variables, or `config.json` (template provided)

## Requirements

- Node.js 18+
- A ClickUp account with permission to invite people
- Chrome or Chromium (Playwright installs Chromium on `npm install`)

## Quick start

```bash
git clone https://github.com/YOUR_USER/clickup-invite-cli.git
cd clickup-invite-cli
npm install
cp config.example.json config.json
```

Edit `config.json`:

```json
{
  "teamId": "123456789",
  "workspaceName": "My Workspace"
}
```

### Find your `teamId`

1. Open ClickUp in the browser and go to **Manage people**  
   (Workspace avatar → **People**, or Admin → People).
2. Copy the URL. It looks like:

   `https://app.clickup.com/<TEAM_ID>/settings/team/<TEAM_ID>/users`

3. Use that number as `teamId`.

### Log in once

```bash
npm run login
```

Sign in (email, Google, SSO, 2FA — whatever you use). When the ClickUp app loads, close the window. The session is stored in `.clickup-profile/` (gitignored — never commit it).

### Invite someone

```bash
npm run invite -- --email person@example.com
```

Or pass everything on the CLI (no config file):

```bash
npm run invite -- --email person@example.com --team-id 123456789 --workspace "My Workspace"
```

## Configuration

Values resolve in this order: **CLI → environment → `config.json`**.

| Setting | CLI | Environment | `config.json` |
|---------|-----|-------------|-----------------|
| Team / workspace id | `--team-id` | `CLICKUP_TEAM_ID` | `teamId` |
| Workspace display name (optional check) | `--workspace` or `--space` | `CLICKUP_WORKSPACE_NAME` | `workspaceName` |
| Invitee email | `--email` | — | — |

### CLI flags

| Flag | Required | Description |
|------|----------|-------------|
| `--email` | Yes | Email to invite |
| `--team-id` | Yes* | ClickUp team id (*or set via env / config) |
| `--workspace` / `--space` | No | Name shown top-left; soft-check only |
| `--debug` | No | Save screenshots under `debug/` |
| `--keep-open` | No | Leave the browser open after the run |
| `--headless` | No | No browser UI; also disables login wait |
| `--no-wait-login` | No | Fail immediately if the session expired |

## How it works

```text
npm run invite
    → open Manage people URL for your teamId
    → if logged out: wait for Google/SSO (headed) or fail (--no-wait-login)
    → click "+ Invite people"
    → enter email, role Member, "Send free invite"
    → confirm toast / people list
```

## Session expiry (Google / SSO)

Browser cookies expire. Google will not allow silent re-login in automation.

- **Headed invite (default):** if the session is gone, the window stays open; you complete sign-in; the invite resumes (up to ~10 minutes).
- **Preflight:** `npm run check-session` → exit `0` if OK, `1` if expired.
- **Unattended CI:** use `--no-wait-login` or `--headless` and refresh the profile ahead of time with `npm run login`.

Fully API-based unattended invites need ClickUp’s gated invite API or SCIM.

## Safety & privacy

Do **not** commit:

- `.clickup-profile/` — live session cookies
- `config.json` — your team id / workspace name
- `debug/` — screenshots may show emails and UI

Only `config.example.json` with placeholders belongs in git.

## Troubleshooting

| Issue | What to try |
|-------|-------------|
| Not on Manage people | Confirm `teamId` from the users URL |
| Modal does not open | Re-run with `--debug`; ClickUp UI may have changed |
| Session expired often | Run headed invites, or `npm run login` periodically |
| Weird login state | Delete `.clickup-profile` and run `npm run login` again |

## Disclaimer

This automates ClickUp’s web UI. Selectors can break when ClickUp ships UI changes. Use at your own risk and respect ClickUp’s terms of service. Prefer official APIs when your plan includes them.

## License

MIT — see [LICENSE](LICENSE).
