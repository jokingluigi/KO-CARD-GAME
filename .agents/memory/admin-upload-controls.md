---
name: Admin upload controls
description: Browser behavior constraints for file uploads embedded in KO admin forms.
---

File inputs and upload-trigger buttons inside an admin edit form must explicitly prevent default browser behavior and stop event propagation. Keep the upload request asynchronous and separate from the form's save submission.

**Why:** The audio upload flow reached the server successfully, but the browser then reinitialized the admin page instead of retaining the pending form state.

**How to apply:** For future image/audio/document controls inside admin forms, use `type="button"`, prevent default on the trigger and file change events, and keep upload completion separate from the form submit handler.

When a file picker still causes a native-submit or remount regression, render the hidden input through a portal outside the edit form while keeping the upload trigger inside the form as an explicit button.

**Why:** Browser file-control behavior can still reinitialize a complex edit form even when the React handler prevents the immediate event.

**How to apply:** Keep the input ref and async upload callback in the field component, portal only the hidden input to `document.body`, and update parent form state only after the upload response succeeds.