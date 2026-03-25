import type { NotionConfig, NotionBlock } from '../types';
import type { TranslateFn } from '../i18n/core';

const NOTION_API_VERSION = '2022-06-28';

// Test Notion connection and verify required properties
export async function testNotionConnection(
  config: NotionConfig,
  t: TranslateFn
): Promise<{ success: boolean; error?: string; missingProperties?: string[] }> {
  try {
    const response = await fetch(`https://api.notion.com/v1/databases/${config.databaseId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${config.integrationToken}`,
        'Notion-Version': NOTION_API_VERSION,
      },
    });

    if (!response.ok) {
      const errorData = await response.json();
      return {
        success: false,
        error: errorData.message || t('notionDatabaseConnectionFailed'),
      };
    }

    // Check if required properties exist (tag is optional)
    const data = await response.json();
    const properties = data.properties || {};

    const requiredProperties = ['source', 'platform', 'timestamp'];
    const missingProperties = requiredProperties.filter(prop => !properties[prop]);

    if (missingProperties.length > 0) {
      return {
        success: false,
        missingProperties
      };
    }

    return { success: true };
  } catch (error) {
    console.error('Notion connection test failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : t('commonUnknownError'),
    };
  }
}

// Parse inline markdown formatting (bold, italic, code, links)
function parseInlineFormatting(text: string): any[] {
  const richText: any[] = [];
  let i = 0;

  // Quick check if text has any formatting
  const hasFormatting = text.includes('**') || text.includes('`') || text.includes('[') || (text.includes('*') && !text.includes('**'));

  if (!hasFormatting) {
    return [{ type: 'text', text: { content: text } }];
  }

  while (i < text.length) {
    // Check for bold **text**
    if (text.substring(i, i + 2) === '**') {
      const endIndex = text.indexOf('**', i + 2);
      if (endIndex !== -1) {
        const content = text.substring(i + 2, endIndex);
        richText.push({
          type: 'text',
          text: { content },
          annotations: { bold: true }
        });
        i = endIndex + 2;
        continue;
      }
    }

    // Check for code `text`
    if (text[i] === '`') {
      const endIndex = text.indexOf('`', i + 1);
      if (endIndex !== -1) {
        const content = text.substring(i + 1, endIndex);
        richText.push({
          type: 'text',
          text: { content },
          annotations: { code: true }
        });
        i = endIndex + 1;
        continue;
      }
    }

    // Check for links [text](url)
    if (text[i] === '[') {
      const closeBracket = text.indexOf(']', i + 1);
      if (closeBracket !== -1 && text[closeBracket + 1] === '(') {
        const closeParen = text.indexOf(')', closeBracket + 2);
        if (closeParen !== -1) {
          const linkText = text.substring(i + 1, closeBracket);
          const url = text.substring(closeBracket + 2, closeParen);
          richText.push({
            type: 'text',
            text: { content: linkText, link: { url } }
          });
          i = closeParen + 1;
          continue;
        }
      }
    }

    // Check for italic *text* (but not **)
    if (text[i] === '*' && text[i + 1] !== '*') {
      const endIndex = text.indexOf('*', i + 1);
      if (endIndex !== -1 && text[endIndex + 1] !== '*') {
        const content = text.substring(i + 1, endIndex);
        richText.push({
          type: 'text',
          text: { content },
          annotations: { italic: true }
        });
        i = endIndex + 1;
        continue;
      }
    }

    // Regular text - find next special character
    let nextSpecial = text.length;
    const specialChars = ['*', '`', '['];
    for (const char of specialChars) {
      const pos = text.indexOf(char, i);
      if (pos !== -1 && pos < nextSpecial) {
        nextSpecial = pos;
      }
    }

    if (nextSpecial > i) {
      const content = text.substring(i, nextSpecial);
      richText.push({
        type: 'text',
        text: { content }
      });
      i = nextSpecial;
    } else {
      // No more special characters, add rest of text
      const content = text.substring(i);
      if (content) {
        richText.push({
          type: 'text',
          text: { content }
        });
      }
      break;
    }
  }

  return richText.length > 0 ? richText : [{ type: 'text', text: { content: text } }];
}

// Convert Markdown to Notion blocks
function markdownToNotionBlocks(markdown: string): NotionBlock[] {
  const lines = markdown.split('\n');
  const blocks: NotionBlock[] = [];
  let inCodeBlock = false;
  let codeLanguage = '';
  let codeContent: string[] = [];
  let inTable = false;
  let tableRows: string[][] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Handle code blocks
    if (line.startsWith('```')) {
      if (!inCodeBlock) {
        // Start code block
        inCodeBlock = true;
        codeLanguage = line.slice(3).trim() || 'plain text';
        codeContent = [];
      } else {
        // End code block
        inCodeBlock = false;
        blocks.push({
          object: 'block',
          type: 'code',
          code: {
            rich_text: [{ type: 'text', text: { content: codeContent.join('\n') } }],
            language: codeLanguage
          }
        });
        codeContent = [];
      }
      continue;
    }

    if (inCodeBlock) {
      codeContent.push(line);
      continue;
    }

    // Handle tables
    if (line.includes('|') && line.trim().startsWith('|')) {
      const cells = line.split('|').map(c => c.trim()).filter(c => c);

      // Check if this is a separator line (e.g., |---|---|)
      if (cells.length > 0 && cells.every(c => /^-+$/.test(c))) {
        console.log('Skipping table separator line');
        continue; // Skip separator lines
      }

      if (!inTable) {
        inTable = true;
        tableRows = [];
        console.log('Starting table');
      }

      console.log('Table row:', cells);
      tableRows.push(cells);

      // Check if next line is not a table line or is empty
      const nextLine = i < lines.length - 1 ? lines[i + 1] : '';
      const isLastLine = i === lines.length - 1;
      const nextIsNotTable = !nextLine.includes('|') || !nextLine.trim().startsWith('|');

      if (isLastLine || nextIsNotTable) {
        // End of table, create table blocks
        console.log('Ending table, rows:', tableRows.length);
        if (tableRows.length > 0) {
          // Use the first row as header
          const header = tableRows[0];
          const headerText = header.join(' | ');
          console.log('Table header:', headerText);

          blocks.push({
            object: 'block',
            type: 'paragraph',
            paragraph: {
              rich_text: parseInlineFormatting('**' + headerText + '**')
            }
          });

          // Add data rows
          for (let j = 1; j < tableRows.length; j++) {
            const rowText = tableRows[j].join(' | ');
            console.log('Table row', j, ':', rowText);
            blocks.push({
              object: 'block',
              type: 'paragraph',
              paragraph: {
                rich_text: parseInlineFormatting(rowText)
              }
            });
          }

          // Add a divider after table
          blocks.push({
            object: 'block',
            type: 'divider',
            divider: {}
          });
        }
        inTable = false;
        tableRows = [];
      }
      continue;
    }

    // Reset table state if we're in a table but hit a non-table line
    if (inTable && !line.includes('|')) {
      console.log('Unexpected end of table');
      inTable = false;
      tableRows = [];
    }

    if (!line.trim()) continue;

    // Headings
    if (line.startsWith('# ')) {
      blocks.push({
        object: 'block',
        type: 'heading_1',
        heading_1: {
          rich_text: parseInlineFormatting(line.slice(2))
        }
      });
    } else if (line.startsWith('## ')) {
      blocks.push({
        object: 'block',
        type: 'heading_2',
        heading_2: {
          rich_text: parseInlineFormatting(line.slice(3))
        }
      });
    } else if (line.startsWith('### ')) {
      blocks.push({
        object: 'block',
        type: 'heading_3',
        heading_3: {
          rich_text: parseInlineFormatting(line.slice(4))
        }
      });
    }
    // Bullet list
    else if (line.startsWith('- ') || line.startsWith('* ')) {
      blocks.push({
        object: 'block',
        type: 'bulleted_list_item',
        bulleted_list_item: {
          rich_text: parseInlineFormatting(line.slice(2))
        }
      });
    }
    // Numbered list
    else if (/^\d+\.\s/.test(line)) {
      const content = line.replace(/^\d+\.\s/, '');
      blocks.push({
        object: 'block',
        type: 'numbered_list_item',
        numbered_list_item: {
          rich_text: parseInlineFormatting(content)
        }
      });
    }
    // Divider
    else if (line.trim() === '---') {
      blocks.push({
        object: 'block',
        type: 'divider',
        divider: {}
      });
    }
    // Paragraph
    else {
      blocks.push({
        object: 'block',
        type: 'paragraph',
        paragraph: {
          rich_text: parseInlineFormatting(line)
        }
      });
    }
  }

  return blocks;
}

// Export article to Notion
export async function exportToNotion(
  config: NotionConfig,
  title: string,
  content: string,
  sourceUrl?: string,
  platform?: string,
  t?: TranslateFn
): Promise<{ success: boolean; pageUrl?: string; error?: string }> {
  try {
    console.log('Starting Notion export...');
    console.log('Content length:', content.length);

    const blocks = markdownToNotionBlocks(content);
    console.log('Generated blocks:', blocks.length);
    console.log('First 3 blocks:', JSON.stringify(blocks.slice(0, 3), null, 2));

    // First, get database schema to check which properties exist
    const dbResponse = await fetch(`https://api.notion.com/v1/databases/${config.databaseId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${config.integrationToken}`,
        'Notion-Version': NOTION_API_VERSION,
      },
    });

    let hasTagProperty = false;
    if (dbResponse.ok) {
      const dbData = await dbResponse.json();
      hasTagProperty = !!dbData.properties?.tag;
    }

    // Build properties object
    const properties: any = {
      title: {
        title: [{ type: 'text', text: { content: title } }]
      }
    };

    // Add source URL if provided
    if (sourceUrl) {
      properties.source = {
        url: sourceUrl
      };
    }

    // Add platform if provided
    if (platform && platform !== 'unknown') {
      properties.platform = {
        multi_select: [{ name: platform }]
      };
    }

    // Add tag property only if it exists in the database (empty for manual categorization)
    if (hasTagProperty) {
      properties.tag = {
        multi_select: []
      };
    }

    // Add timestamp
    properties.timestamp = {
      date: {
        start: new Date().toISOString()
      }
    };

    // Create page
    const response = await fetch('https://api.notion.com/v1/pages', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.integrationToken}`,
        'Notion-Version': NOTION_API_VERSION,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        parent: { database_id: config.databaseId },
        properties,
        children: blocks.slice(0, 100) // Notion limits to 100 blocks per request
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('Notion API error:', error);
      return {
        success: false,
        error: t ? t('notionApiError', { error }) : `Notion API error: ${error}`,
      };
    }

    const data = await response.json();
    console.log('Notion page created:', data.url);
    return { success: true, pageUrl: data.url };
  } catch (error) {
    console.error('Export to Notion failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : (t ? t('commonUnknownError') : 'Unknown error'),
    };
  }
}
