# PhotoHR regional entry

On `hr.likeme.studio`, all application API calls and Railway upload URLs returned
in JSON use the same public origin. Existing GitHub Pages and localhost retain
their API configuration. No database URL values are rewritten in storage.

The shared network helper covers both response headers and body. Login waits at
most 20 seconds; other requests 65 seconds. Requests are never automatically
retried by this helper. Failed writes warn the user to inspect the result before
repeating. Existing retry after a confirmed authentication rejection is retained.

QR libraries are the same versions previously loaded from external CDNs, now
bundled with their licenses in `assets/`. Source: html5-qrcode 2.3.8 from unpkg,
qrcodejs 1.0.0 from cdnjs. Google OAuth still requires the new origin's callback
to be registered in the existing OAuth client before its field acceptance.

Validation: `node --test tests/network.test.cjs` uses synthetic responses and
parses every inline script. Actual user login and device checks remain separate.

Deploy by bundling an exact frontend Git commit in the dedicated PhotoHR relay
image. Rollback selects an earlier immutable release; it never restores a database.
