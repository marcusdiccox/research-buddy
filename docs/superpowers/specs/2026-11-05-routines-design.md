# Repeats, quiet focus and natural dates

The user explicitly requested all three previously researched additions. Keep the existing small bubble/notebook, local processing and fixed five reminder warnings.

Repeats: None/Daily/Weekdays/Weekly/Monthly, exposed consistently in all reminder editors. Completing a repeating item advances the same reminder ID to the first future local occurrence and resets its alert ledger. Preserve wall-clock time, skip missed occurrences, clamp monthly dates while retaining the original anchor day, and validate rules. Existing Google sync updates the same linked event for the next occurrence; it does not create a Google recurring series. Opt-out, Trash and existing citations are unchanged.

Focus: session-local 15/25/45 minute timer with start/stop and countdown. Quiet pauses casual speech and wandering while retaining urgent reminder speech, visibility shortcut and click access. Restoring or reopening windows does not reset a session. Deadline uses actual time, so sleep does not extend the timer. Quit ends a session. Completion shows a short Pip message when visible.

Natural dates: a local deterministic English parser in the shared date dialog, supporting today/tomorrow, weekday/next weekday, relative minutes/hours/days/weeks, and explicit date/time. Show a preview and require Use date; normal Done commits the picker. Unsupported/ambiguous text produces useful feedback rather than silently guessing. Calendar remains available; no network or AI service is used.

Verify real persistence/scheduling/reset and recurrence boundaries, parser ambiguity/DST, quiet behavior/countdown/stop, all three UI integrations and existing workflows. Use fictional test data. Package and run the resulting app, preserve existing user data, and push verified source to the authorized public repository.
