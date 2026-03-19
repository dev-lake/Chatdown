# Notion Integration Setup Guide

## Overview

Chatdown now supports exporting articles directly to Notion using Internal Integration Tokens. This is a free, simple authentication method that doesn't require OAuth or developer account registration.

## Setup Steps

### 1. Create a Notion Integration

1. Go to [https://www.notion.so/my-integrations](https://www.notion.so/my-integrations)
2. Click "New integration"
3. Give it a name (e.g., "Chatdown")
4. Select the workspace where you want to export articles
5. Click "Submit"
6. Copy the "Internal Integration Token" (starts with `secret_`)

### 2. Create a Notion Database

1. In your Notion workspace, create a new page
2. Add a database (Table, Board, List, etc.)
3. Make sure the database has a "title" property (this is default)
4. Click "Share" on the database page
5. Invite your integration (search for "Chatdown" or the name you gave it)
6. Copy the database ID from the URL:
   - URL format: `https://www.notion.so/workspace-name/DATABASE_ID?v=...`
   - The DATABASE_ID is the 32-character string after the workspace name

### 3. Configure Chatdown

1. Open the Chatdown extension
2. Click on the extension icon and go to "Settings"
3. Scroll down to "Notion Integration (Optional)"
4. Paste your Integration Token
5. Paste your Database ID
6. Click "Test Notion Connection" to verify
7. Click "Save Settings"

## Usage

1. Generate an article from any supported AI chat platform
2. In the side panel, click the export button (📤)
3. The article will be created as a new page in your Notion database
4. A success message will show the Notion page URL

## Features

- Converts Markdown to Notion blocks
- Supports:
  - Headings (H1, H2, H3)
  - Paragraphs
  - Bullet lists
  - Numbered lists
  - Code blocks
  - Dividers
- Automatically extracts article title from first heading
- Falls back to date-based title if no heading found

## Limitations

- Notion API limits to 100 blocks per request
- Very long articles may be truncated (will be improved in future versions)
- Some advanced Markdown features may not convert perfectly

## Troubleshooting

### "Notion not configured" error
- Make sure you've saved your Notion settings in the Settings page

### "Notion connection failed" error
- Verify your Integration Token is correct
- Verify your Database ID is correct
- Make sure you've shared the database with your integration

### "Notion API error" messages
- Check that the integration has access to the database
- Verify the database has a "title" property
- Try creating a new integration and database

## Privacy

- All Notion credentials are stored locally in Chrome storage
- No data is sent to any third-party servers except Notion's API
- Your Integration Token is never transmitted except to Notion
