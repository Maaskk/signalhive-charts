# Security

The release is a local charting/paper-trading app, not a credential vault or broker executor. It should not ask for trading passwords, Telegram tokens or private keys.

Please report a vulnerability privately through GitHub's repository security reporting feature if available. Do not publish secrets in issues. If private reporting is unavailable, open a minimal issue asking a maintainer for a private channel without including the exploit or sensitive data.

Imported CSV/workspace files are size/type/shape checked. Their data is rendered as text, never evaluated as JavaScript. The study editor is a validated declarative preset editor, not an arbitrary code runner.

Native preview packages are initially unsigned/development-signed. Verify release provenance and checksums. Do not disable operating-system security protections to install an unverified package.
