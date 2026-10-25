# Product and launch roadmap

LessonCraft by Empowered Nexus helps a learner use trusted learning materials to check what they understand, see what remains unclear, and practice one useful next step. Pathways is the current learning experience. Empowered Nexus owns the product. GenAI Works operates the hackathon and HackOS. The hackathon does not manage LessonCraft learners or accounts.

## Release sequence

### 1. Hackathon

The hackathon package is a local web demo, a video the builder records, the slide deck at `docs/lessoncraft-pathways.pptx`, and the GitHub repository. No video file is in the repository yet.

The prototype covers one workplace status-update skill. A learner chooses that goal, uses approved evidence, sees what is demonstrated or still unclear, and takes one next practice step. The decision trace stays visible. An optional NVIDIA draft appears only after consent and stays under the local next step.

`http://127.0.0.1:8787/pathways/` is reachable only on the computer running the server. It is not a public launch. No account is required for the demo. This pass does not add public hosting, an Android app, Google search, signup, subscriptions, billing, or public uploads.

### 2. After the event

The next release is a secure hosted responsive web pilot. It requires:

1. **Hosted app and data service.** Run the application and its data store on infrastructure that other people can reach. The loopback address stays a development address.
2. **Real authentication.** Replace the unavailable-account page with a real sign-in provider. Zetaris credentials are not a learner login.
3. **Private account-owned materials.** Store a learner’s files with that account, and keep another account from reading them.
4. **Account-isolated memory.** Keep Meterless records separated by account, still limited to the consented fields.
5. **Deletion and consent handling.** Let a learner delete materials and memory, and record consent before any external call or retained memory.
6. **Server-side model-key management.** Keep NVIDIA and any later model keys on the server. Do not place them in the browser or in a public repository.
7. **Rate limits.** Limit pathway runs and model calls per account so one session cannot exhaust the service.
8. **Production model hosting.** Decide which model serves the optional draft in production, record the served model id, and keep the local pathway check as the decision.

Uploaded materials remain private lesson inputs. They are not training data for Nemotron.

### 3. Android

Consider an Android app only after the web pilot shows that learners need it. That app would use the same backend. It is not part of this hackathon package, and no Android project has been started.

## Later: Google web research

Web research is a future feature. It is not in this hackathon build.

When it is built, it will be a user-started action that uses an officially supported Google Search grounding API, such as grounding with Google Search in the current Gemini or Vertex API. The Google Custom Search JSON API is closed to new customers, and Google’s documentation says existing customers have until 1 January 2027 to move off it. LessonCraft will not adopt that API.

The future feature will:

- Send a minimal topic query, not the learner’s files or notes, unless the learner has given explicit consent to send that text.
- Show citations with the result.
- Require that consent before any learner-provided text leaves the app.
- Never publish search results automatically.
- Never add a search result to a shared library until a rights review allows it.

Search results are not training data, and retrieving them is not model training.
