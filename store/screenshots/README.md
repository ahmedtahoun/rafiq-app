# Store screenshots

`npm run screenshots` renders every image the two stores need, in English
and Arabic, identically on every run.

> **Status: in progress.** This README is filled in as the script lands.

## Why it is not part of `npm test`

These are deliverables, not assertions. They are slow, they write files
into the repo, and a failure here means "an image did not render", not
"the app is broken". CI runs the suite; a person runs this when the
screens change, checks the Arabic ones by eye, and commits the output.
