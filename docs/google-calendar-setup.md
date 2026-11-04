# Connect Pip to Google Calendar

This setup is needed once for your own Google account. Pip's Calendar tab contains the import and sign-in controls. Notes stay local; only reminders with **Sync this reminder to Google Calendar** selected are sent to Google.

1. Open [Google Cloud Console](https://console.cloud.google.com/) and choose or create a project for Research Buddy.
2. Enable **Google Calendar API** for that project.
3. Open **Google Auth Platform**. Set the app name to Research Buddy and your support/contact email. For personal testing, choose External/Testing and add your own Google account as a test user. Request only `https://www.googleapis.com/auth/calendar.events.owned`.
4. Create an OAuth client with application type **Desktop app** and download its JSON file. Do not use a Web application client or a service account key.
5. Click Pip, choose **Calendar → Connect in notebook**, then **Import Google credentials**, and select the downloaded JSON. The imported client registration and tokens are encrypted using Windows secure storage in the app's local user-data folder. Do not add the JSON to GitHub.
6. Choose **Connect Google Calendar**. Complete Google's sign-in and permission screen yourself. Return to Pip when it says Connected.
7. Create a fictional test reminder, choose its date/time, select calendar sync and save. After it shows synced, verify the event in your primary Google calendar. Edit the reminder and verify the same event changes. Pip retries pending changes while running.

This is one-way sync from Pip to its own events in your primary Google Calendar. It does not import edits made directly in Google, invite attendees, modify unrelated events, or delete existing Google events when you disconnect. Disconnect removes local tokens and attempts Google revocation.

For a broadly distributed public app, Google's registration and verification requirements must be completed. Testing-mode consent may require reconnecting as Google expires test authorizations. If Google presents an unverified-app or security barrier, stop and resolve the project configuration or verification; this task does not bypass that screen.

Official references: [Desktop OAuth with PKCE and loopback callback](https://developers.google.com/identity/protocols/oauth2/native-app), [Calendar permissions](https://developers.google.com/workspace/calendar/api/auth), [create events](https://developers.google.com/workspace/calendar/api/v3/reference/events/insert), [update events](https://developers.google.com/workspace/calendar/api/v3/reference/events/patch).

Implementation and mocked-boundary tests do not prove that your account is connected. A live connection is complete only after the sign-in succeeds and an actual test event is verified with your approval.
