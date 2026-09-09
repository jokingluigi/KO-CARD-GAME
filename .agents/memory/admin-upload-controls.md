---
name: Admin upload controls
description: Browser behavior constraints for file uploads embedded in KO admin forms.
---

File inputs and upload-trigger buttons inside an admin edit form must explicitly prevent default browser behavior and stop event propagation. Keep the upload request asynchronous and separate from the form's save submission.

**Why:** The audio upload flow reached the server successfully, but the browser then reinitialized the admin page instead of retaining the pending form state.

**How to apply:** For future image/audio/document controls inside admin forms, use `type="button"`, prevent default on the trigger and file change events, and keep upload completion separate from the form submit handler.