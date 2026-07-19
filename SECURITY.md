# Security notes for maintainers and users

## Never commit secrets or session data

| Path | Why |
|------|-----|
| `.clickup-profile/` | Browser cookies / Google session |
| `config.json` | Your ClickUp `teamId` and workspace name |
| `debug/` | Screenshots may include emails and internal UI |
| `.env` | If you add tokens later |

The public template only ships `config.example.json` with placeholders.

## Before making a repository public

1. Confirm `.gitignore` includes the paths above.
2. Search the tree for personal emails, team ids, and workspace names (should only appear in ignored `config.json` / local profile).
3. Do not force-push an earlier history that contained real session files.

## Responsible use

Automating a third-party product’s UI may conflict with that product’s terms. Prefer official APIs when available. Use this tool only on Workspaces you administer.
