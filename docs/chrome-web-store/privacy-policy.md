# Privacy Policy for Chatdown

Last updated: 2026-04-15

This privacy policy applies to the Chatdown Chrome extension.

Chatdown converts supported AI chat conversations into Markdown articles. It reads conversation content from supported pages only when the user actively invokes the extension, uses the user's configured model provider to generate article output, and optionally exports finished content to Notion or the user's local Obsidian app.

## Who operates Chatdown

- Product name: Chatdown
- Support page: https://github.com/dev-lake/Chatdown/issues
- Contact email: replace-with-your-support-email@example.com

Before publishing, replace the contact email above with a real address you monitor.

## Data Chatdown Processes

Chatdown may process the following data:

- Conversation content from supported AI chat pages, including user prompts and model responses
- The current conversation URL, which can be attached to the generated article as a source link
- User-provided configuration data, including API base URL, API key, model name, interface language preference, optional Notion integration token and database ID, and optional Obsidian vault and folder names
- Generated article content, partial generation state, conversation hashes, selection state, and cached article results stored locally in the extension

## When Chatdown Processes Data

Chatdown processes data only for user-facing actions such as:

- Clicking the Chatdown button to generate an article
- Choosing specific conversation rounds for partial generation
- Saving extension settings
- Testing the configured model connection
- Testing the optional Notion connection
- Exporting a generated article to Notion
- Exporting a generated article to the user's local Obsidian app

Chatdown is not designed to collect browsing activity in the background across unrelated sites.

## How Chatdown Uses Data

Chatdown uses data to:

- Read the visible conversation on supported AI chat pages
- Generate a Markdown article through the user's configured OpenAI-compatible API endpoint
- Stream generation progress back into the extension UI
- Cache previously generated results locally so identical conversations do not need to be regenerated
- Remember local settings and language preferences
- Export user-approved content to a Notion database when the user requests that action
- Open the user's local Obsidian app and create a note when the user requests Obsidian export

## Where Data Is Sent

Chatdown does not send user data to developer-operated servers.

Depending on the features the user chooses, Chatdown may send data to:

- The user-configured OpenAI-compatible API endpoint
  - Sent data can include conversation content and instructions needed to generate the article or summarize conversation rounds
- The Notion API, if the user enables Notion integration
  - Sent data can include the Notion integration token, database ID, article title, article content, source URL, source platform, and timestamp

For Obsidian export, Chatdown uses the local `obsidian://` protocol. The article content is copied to the user's clipboard when possible, and the local Obsidian app reads it from there. If clipboard access fails, Chatdown falls back to including the article content in the local Obsidian URI. This action is initiated only when the user chooses Obsidian export.

These third-party services and local apps operate under their own terms and privacy policies.

## Local Storage

Chatdown stores data in Chrome extension local storage on the user's device. This can include:

- API base URL
- API key
- Model name
- Notion integration token and database ID
- Obsidian vault name and folder path
- Interface language preference
- Generated articles and cached results
- Temporary article state needed to resume the current workspace

This local storage is used so the extension can work across browser sessions and avoid unnecessary repeat generation.

## Data Sharing and Sale

Chatdown does not sell user data.

Chatdown does not use user data for advertising.

Chatdown does not transfer user data to third parties except as necessary to provide the user-facing features described in this policy, specifically:

- The user-configured AI model provider used to generate article output
- Notion, when the user explicitly enables and uses Notion export
- The user's local Obsidian app, when the user explicitly enables and uses Obsidian export

## Data Retention and User Control

Data stored locally remains on the user's device until the user changes settings, removes extension data, or uninstalls the extension.

Users can control their data by:

- Updating or removing saved settings in the extension
- Avoiding optional features such as Notion export
- Avoiding optional features such as Obsidian export
- Removing the extension and its local data from Chrome

## Security

Chatdown uses HTTPS requests for supported remote services in its current implementation.

Chatdown does not execute remotely hosted code as part of its core functionality.

## Children's Privacy

Chatdown is not directed to children.

## Changes to This Policy

This privacy policy may be updated to reflect product or legal changes. The latest version should always be published at the privacy policy URL used in the Chrome Web Store listing.

## Contact

If you have privacy questions about Chatdown, contact:

- replace-with-your-support-email@example.com
- https://github.com/dev-lake/Chatdown/issues
