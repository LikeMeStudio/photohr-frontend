# Password changes in My Profile

Every signed-in account has a Password and login section in `my.html`, even when
its staff card is missing or fails to load. The header profile action opens that
page instead of referencing the absent old profile modal.

The browser requests an email for the authenticated account without sending a user
ID, a recipient or a new password. The employee opens the one-hour confirmation
link, enters the new password twice and explicitly confirms. Opening/scanning the
email link alone does not change a credential. The reset form takes precedence
over automatic login; fragment links and old query links both work. After success,
saved local tokens and password inputs are cleared and the employee signs in again.

Mail errors remain visible, controls recover, and a failed confirmation preserves
the current login. No password or token is persisted in a new storage location.
Modern browsers coordinate refresh with Web Locks across tabs and the management
iframe, reusing the fresh token pair rather than refreshing a spent token. Older
browsers serialize within each page. Regular application writes are not retried.

`node --test tests/*.test.cjs` checks these behaviors, both regional origins,
management-compatible static scripts and Google callback state. The reset-form and
saved-login tests failed on the previous published index and pass after the change.
Real delivery and an employee's password change must be checked separately by the
owner; automated tests use synthetic recipients and mocked mail only.

Backend requires the email-confirmation routes described in its PASSWORD_CHANGE
contract. Keep backend readers for already issued one-hour links during any UI
rollback. Database, files and passwords confirmed after release are never rolled
back to an older backup.
