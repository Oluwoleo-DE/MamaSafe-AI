# MamaSafe AI Security Specification

## Data Invariants
1. A user can only access their own profile.
2. Triage logs, drug scans, and reminders belong to a specific user and cannot be accessed or modified by others.
3. Pregnancy start date is required and must be a valid date string.
4. Triage logs must have a valid category (Routine, Urgent, Emergency).
5. Drug scans must have a valid safety status (SAFE, CAUTION, UNSAFE).

## The Dirty Dozen Payloads (Rejection Tests)
1. **Identity Spoofing**: Attempt to update another user's profile.
2. **Path Poisoning**: Document IDs with junk characters or 1.5KB strings.
3. **Ghost Fields**: Adding `isAdmin: true` to a user profile.
4. **State Shortcutting**: Manually setting a triage log category to 'Routine' when it should be 'Emergency' (Logic check).
5. **Type Poisoning**: Sending `pregnancyWeekAtScan` as a string instead of a number.
6. **Immutable Field Attack**: Attempting to change `uid` on a profile update.
7. **Size Bomb**: Sending a 1MB string in `symptoms`.
8. **PII Leak**: Authenticated non-owner trying to list other users' profiles.
9. **Query Scrape**: Attempting to query `triageLogs` across all users.
10. **Terminal State Lockdown**: Trying to update a triage log after it's been created (logs are immutable).
11. **Future Timestamp**: Sending `timestamp` as a date in 2030.
12. **Self-Assignment**: User trying to mark their own scan as "Nafdac Verified" if that were a privileged field.

## Verification
These payloads must return `PERMISSION_DENIED`.
