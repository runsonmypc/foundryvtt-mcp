#!/usr/bin/env node

/**
 * Ingestion script for Warhammer Fantasy Lexicanum dataset
 *
 * Downloads and indexes the s1arsky/Warhammer_Fantasy_Lexicanum-RAG dataset
 * from HuggingFace into ChromaDB for use with the RAG tools.
 *
 * Run with: npx tsx scripts/ingest-lexicanum.ts
 */

import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { LoreDatabase, LoreDocument } from '../src/rag/database.js';

// Configuration
const CHROMADB_URL = process.env.CHROMADB_URL || 'http://localhost:8000';
const DATA_DIR = './data/lexicanum';
const DATASET_FILE = path.join(DATA_DIR, 'data.jsonl');
const BATCH_SIZE = 50;

interface LexicanumEntry {
  id?: string;
  title?: string;
  content?: {
    summary?: string;
    description?: string;
    text?: string;
  };
  type?: string;
  aliases?: string[];
  tags?: string[];
  url?: string;
}

async function downloadDataset(): Promise<void> {
  console.log('📥 Checking for dataset...');

  if (fs.existsSync(DATASET_FILE)) {
    console.log('✅ Dataset already exists at', DATASET_FILE);
    return;
  }

  console.log('⚠️  Dataset not found. Please download it manually:');
  console.log('');
  console.log('Option 1 - Using Python (recommended):');
  console.log('  pip install datasets');
  console.log('  python -c "from datasets import load_dataset; \\');
  console.log("    ds = load_dataset('s1arsky/Warhammer_Fantasy_Lexicanum-RAG'); \\");
  console.log("    ds['train'].to_json('data/lexicanum/data.jsonl')\"");
  console.log('');
  console.log('Option 2 - Using HuggingFace CLI:');
  console.log('  huggingface-cli download s1arsky/Warhammer_Fantasy_Lexicanum-RAG \\');
  console.log('    --local-dir data/lexicanum');
  console.log('');
  console.log('After downloading, run this script again.');

  // Create data directory if it doesn't exist
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    console.log(`\n📁 Created directory: ${DATA_DIR}`);
  }

  process.exit(1);
}

async function parseEntry(line: string): Promise<LoreDocument | null> {
  try {
    const entry: LexicanumEntry = JSON.parse(line);

    // Extract text from content
    let text = '';
    if (entry.content) {
      const parts = [
        entry.content.summary,
        entry.content.description,
        entry.content.text,
      ].filter(Boolean);
      text = parts.join('\n\n');
    }

    // Fall back to title if no content
    if (!text && entry.title) {
      text = entry.title;
    }

    // Skip very short entries
    if (text.length < 50) {
      return null;
    }

    // Truncate very long entries
    const truncatedText = text.slice(0, 3000);

    // Determine type
    let type = entry.type?.toLowerCase() || 'general';
    // Normalize common types
    if (type.includes('person') || type.includes('character')) type = 'character';
    if (type.includes('place') || type.includes('city') || type.includes('region')) type = 'location';
    if (type.includes('creature') || type.includes('monster') || type.includes('race')) type = 'creature';
    if (type.includes('weapon') || type.includes('artifact') || type.includes('magic item')) type = 'item';
    if (type.includes('battle') || type.includes('war') || type.includes('event')) type = 'event';
    if (type.includes('guild') || type.includes('order') || type.includes('faction')) type = 'organization';
    if (type.includes('god') || type.includes('deity')) type = 'deity';
    if (type.includes('spell') || type.includes('magic')) type = 'spell';

    return {
      id: entry.id || `entry_${Math.random().toString(36).slice(2)}`,
      text: truncatedText,
      metadata: {
        title: entry.title || 'Unknown',
        type,
        aliases: entry.aliases,
        tags: entry.tags,
        url: entry.url,
      },
    };
  } catch {
    return null;
  }
}

async function ingestDataset(): Promise<void> {
  console.log('\n🔄 Initializing ChromaDB...');
  console.log(`   URL: ${CHROMADB_URL}`);

  const db = new LoreDatabase(CHROMADB_URL);

  try {
    await db.initialize();
  } catch (error) {
    console.error('❌ Failed to connect to ChromaDB');
    console.error('   Make sure ChromaDB is running:');
    console.error('   docker run -p 8000:8000 chromadb/chroma');
    console.error('');
    console.error('   Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }

  // Check existing count
  const existingCount = await db.count();
  if (existingCount > 0) {
    console.log(`\n⚠️  Database already has ${existingCount} documents.`);
    console.log('   Delete the collection and re-run to re-ingest.');
    console.log('   Or continue to add more documents.\n');

    // Ask user to confirm
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    const answer = await new Promise<string>((resolve) => {
      rl.question('Continue adding documents? (y/N): ', resolve);
    });
    rl.close();

    if (answer.toLowerCase() !== 'y') {
      console.log('Aborted.');
      process.exit(0);
    }
  }

  console.log('\n📖 Processing Lexicanum dataset...');

  // Read entire file and split by $$$ separator
  const fileContent = fs.readFileSync(DATASET_FILE, 'utf-8');
  const entries = fileContent.split('$$$').filter(e => e.trim());

  console.log(`   Found ${entries.length} entries`);

  let batch: LoreDocument[] = [];
  let totalProcessed = 0;
  let totalIndexed = 0;
  let errors = 0;

  for (const entry of entries) {
    totalProcessed++;

    const doc = await parseEntry(entry.trim());
    if (doc) {
      batch.push(doc);
    }

    // Process batch
    if (batch.length >= BATCH_SIZE) {
      try {
        await db.addDocuments(batch);
        totalIndexed += batch.length;
        process.stdout.write(`\r   Indexed: ${totalIndexed} / Processed: ${totalProcessed}`);
      } catch (error) {
        errors++;
        console.error(`\n   Error indexing batch: ${error instanceof Error ? error.message : error}`);
      }
      batch = [];
    }
  }

  // Process remaining batch
  if (batch.length > 0) {
    try {
      await db.addDocuments(batch);
      totalIndexed += batch.length;
    } catch (error) {
      errors++;
      console.error(`\n   Error indexing final batch: ${error instanceof Error ? error.message : error}`);
    }
  }

  console.log('\n');
  console.log('✅ Ingestion complete!');
  console.log(`   Total lines processed: ${totalProcessed}`);
  console.log(`   Documents indexed: ${totalIndexed}`);
  console.log(`   Errors: ${errors}`);

  const finalCount = await db.count();
  console.log(`\n📊 Database now has ${finalCount} documents.`);
}

async function main(): Promise<void> {
  console.log('🧙 Warhammer Fantasy Lexicanum Ingestion Tool\n');
  console.log('This script indexes the Lexicanum wiki content into ChromaDB');
  console.log('for use with the warhammer_lore_* MCP tools.\n');

  await downloadDataset();
  await ingestDataset();

  console.log('\n🎉 Done! The RAG system is ready.');
  console.log('   Set CHROMADB_URL in .env and restart the MCP server.');
}

main().catch((error) => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
