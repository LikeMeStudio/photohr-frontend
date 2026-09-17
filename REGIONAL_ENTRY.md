# PhotoHR regional entry

On `hr.likeme.studio`, all application API calls and Railway upload URLs returned
in JSON use the same public origin. The retained GitHub Pages entry also calls the regional API; localhost keeps
its local API configuration. No database URL values are rewritten in storage.

The shared network helper covers both response headers and body. Login waits at
most 20 seconds; other requests 65 seconds. Requests are never automatically
retried by this helper. Failed writes warn the user to inspect the result before
repeating. Existing retry after a confirmed authentication rejection is retained.

QR libraries are the same versions previously loaded from external CDNs, now
bundled with their licenses in `assets/`. Source: html5-qrcode 2.3.8 from unpkg,
qrcodejs 1.0.0 from cdnjs. The regional origin uses a dedicated Google OAuth client in the owner's current
Cloud project. GitHub Pages retains its existing OAuth client for compatibility.
Each callback must match a fresh cryptographic state and nonce; server signature
verification is independent. Real-user OAuth acceptance remains a field check.

Validation: `node --test tests/network.test.cjs` uses synthetic responses and
parses every inline script. Actual user login and device checks remain separate.

Deploy by bundling an exact frontend Git commit in the dedicated PhotoHR relay
image. Rollback selects an earlier immutable release; it never restores a database.

Publish the GitHub Pages update only after public regional TLS/API/CORS checks pass.
Both addresses share the same live backend and data.
