# Notion Export Feature - Testing Checklist

## Prerequisites
- [ ] Extension built successfully (`npm run build`)
- [ ] Extension loaded in Chrome from `dist/` directory
- [ ] LLM API configured and working
- [ ] Notion account with workspace access

## Setup Testing

### Notion Integration Setup
- [ ] Navigate to https://www.notion.so/my-integrations
- [ ] Create new integration named "Chatdown Test"
- [ ] Copy Integration Token (starts with `secret_`)
- [ ] Create a new database in Notion workspace
- [ ] Share database with the integration
- [ ] Copy Database ID from URL

### Extension Configuration
- [ ] Open Chatdown settings page
- [ ] Scroll to "Notion Integration (Optional)" section
- [ ] Paste Integration Token
- [ ] Paste Database ID
- [ ] Click "Test Notion Connection"
- [ ] Verify success message appears
- [ ] Click "Save Settings"
- [ ] Verify settings saved message appears

## Functional Testing

### Basic Export
- [ ] Open ChatGPT/Gemini/DeepSeek
- [ ] Start a conversation with multiple messages
- [ ] Click Chatdown button
- [ ] Wait for article generation to complete
- [ ] Verify export button (📤) appears in toolbar
- [ ] Click export button
- [ ] Verify success alert with Notion URL
- [ ] Open Notion and verify page was created
- [ ] Verify page title matches article title
- [ ] Verify content is properly formatted

### Content Formatting
- [ ] Generate article with various Markdown elements:
  - [ ] H1, H2, H3 headings
  - [ ] Paragraphs
  - [ ] Bullet lists
  - [ ] Numbered lists
  - [ ] Code blocks
  - [ ] Dividers (---)
- [ ] Export to Notion
- [ ] Verify all elements render correctly in Notion

### Error Handling

#### No Configuration
- [ ] Clear Notion settings (delete token and database ID)
- [ ] Try to export article
- [ ] Verify error message: "Notion not configured"

#### Invalid Token
- [ ] Enter invalid Integration Token
- [ ] Click "Test Notion Connection"
- [ ] Verify error message appears

#### Invalid Database ID
- [ ] Enter valid token but invalid database ID
- [ ] Click "Test Notion Connection"
- [ ] Verify error message appears

#### No Database Access
- [ ] Use valid token and database ID
- [ ] Remove integration access from database in Notion
- [ ] Try to export article
- [ ] Verify appropriate error message

### Edge Cases
- [ ] Export very short article (1-2 lines)
- [ ] Export article with no title (should use date-based title)
- [ ] Export article with special characters in title
- [ ] Export same article multiple times (should create multiple pages)
- [ ] Export while editing article (button should be disabled)

## UI/UX Testing
- [ ] Export button appears in correct position
- [ ] Export button shows loading state (⏳) during export
- [ ] Export button is disabled during export
- [ ] Success message is clear and includes Notion URL
- [ ] Error messages are helpful and actionable
- [ ] Settings page layout is clean and organized
- [ ] Test Notion Connection button works correctly
- [ ] All input fields accept and display values correctly

## Performance Testing
- [ ] Export completes in reasonable time (<5 seconds)
- [ ] No console errors during export
- [ ] No memory leaks after multiple exports
- [ ] Extension remains responsive during export

## Compatibility Testing
- [ ] Test on ChatGPT (chat.openai.com)
- [ ] Test on ChatGPT (chatgpt.com)
- [ ] Test on Google Gemini
- [ ] Test on DeepSeek

## Documentation
- [ ] README.md mentions Notion integration
- [ ] NOTION_SETUP.md provides clear setup instructions
- [ ] All features are documented
- [ ] Screenshots/GIFs show the feature in action (optional)

## Known Limitations
- [ ] Notion API limits to 100 blocks per request
- [ ] Very long articles may be truncated
- [ ] Some advanced Markdown features may not convert perfectly
- [ ] These limitations are documented

## Final Verification
- [ ] All tests passed
- [ ] No console errors
- [ ] No TypeScript compilation errors
- [ ] Build succeeds without warnings
- [ ] Extension works as expected in production build
