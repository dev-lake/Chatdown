# Chrome Web Store Reviewer Notes

This file contains reviewer-facing instructions and privacy tab copy for Chatdown.

## What the Extension Does

Chatdown converts supported AI chat conversations into editable Markdown articles that users can review, refine, and export.

Supported sites:

- https://chat.openai.com/*
- https://chatgpt.com/*
- https://gemini.google.com/*
- https://chat.deepseek.com/*

Optional integration:

- https://api.notion.com/*

## Core Review Flow

1. Load the extension.
2. Open the extension settings page.
3. Enter a valid OpenAI-compatible API base URL, API key, and model name.
4. Open a supported chat page with at least one user message and one assistant response.
5. Click the Chatdown button injected into the page.
6. Verify that the article workspace opens and streams generated Markdown content.
7. Verify that the article can be edited, copied, and downloaded as a Markdown file.

Optional Notion test:

1. Add a valid Notion integration token and database ID in settings.
2. Verify the database contains the required properties: `source`, `platform`, and `timestamp`.
3. Use the export action from the article workspace.

## Important Review Note

The extension does not use a Chatdown account or a developer-operated backend.

To test article generation, the reviewer needs valid credentials for any OpenAI-compatible API endpoint. If you want to reduce review friction, provide temporary review credentials in the Chrome Web Store test instructions before submission.

The Notion integration is optional and is not required to validate the main user-facing purpose.

## Recommended Privacy Practices Answers

### Single purpose description

- Convert supported AI chat conversations into editable Markdown articles that users can review, refine, and export.

### Permissions justification

`activeTab`

- Needed to access the currently active supported AI chat tab after the user invokes Chatdown, so the extension can read the visible conversation and open the article workflow for that page.

`storage`

- Needed to store the user's local settings, language preference, generated article state, and cached results on the user's device.

Host permissions for supported chat sites

- Needed to inject the Chatdown UI and read conversation content from supported AI chat pages when the user activates the extension.

Host permission for `https://api.notion.com/*`

- Needed only for the optional Notion connection test and article export feature.

### Remote code declaration

- No. Chatdown does not execute remotely hosted JavaScript or other remote code.
- Chatdown does send HTTPS requests to a user-configured OpenAI-compatible API endpoint and, optionally, to the Notion API, but those responses are treated as data and content, not executable code.

### Recommended data disclosures

Recommended data types to disclose:

- Authentication information
- Website content

Rationale:

- Authentication information: the user can enter an API key and an optional Notion integration token in settings
- Website content: the extension reads conversation content from supported AI chat pages and stores or exports generated article content based on that source material

Recommended certifications:

- Data is used only for the extension's user-facing functionality
- Data is not sold
- Data is not used or transferred for unrelated purposes
- Data is not used to determine creditworthiness or for lending purposes

## Public URLs

- Support URL: https://github.com/dev-lake/Chatdown/issues
- Privacy policy URL: publish [privacy-policy.md](/Users/lake/Projects/chat_down/docs/chrome-web-store/privacy-policy.md) at a public URL and use that link in the dashboard
