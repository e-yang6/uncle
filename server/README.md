# server/: the app server

Owner: Person 2. Spec: PLAN.md Architecture, DEPLOY.md.

Lives here: the server started by `npm start` on port 3000 that serves the WebXR app and connects the pipelines (session state, the confirm screen API, streaming audio to the headset), plus the summary page. It must start even when an API key is missing and say which feature is off.
