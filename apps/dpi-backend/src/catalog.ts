import type { DatabaseSync } from 'node:sqlite';

/** One schema for normal Store ownership and closed-copy adoption; never opens native storage. */
export function initializeCatalog(catalog: DatabaseSync) {
  catalog.exec(`PRAGMA journal_mode=WAL;
    CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY,name TEXT NOT NULL,cwd TEXT NOT NULL,dbPath TEXT NOT NULL UNIQUE,createdAt INTEGER NOT NULL,model TEXT NOT NULL,provider TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS conversation_names(sessionId TEXT NOT NULL,conversationId INTEGER NOT NULL,name TEXT NOT NULL,PRIMARY KEY(sessionId,conversationId));
    CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS requests(key TEXT PRIMARY KEY,route TEXT NOT NULL,status INTEGER NOT NULL,body TEXT NOT NULL,createdAt INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS session_spawns(key TEXT PRIMARY KEY,sessionId TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS session_compaction(sessionId TEXT PRIMARY KEY,settings TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS session_create_intents(actor TEXT NOT NULL,key TEXT NOT NULL,fingerprint TEXT NOT NULL,resourceId TEXT NOT NULL UNIQUE,state TEXT NOT NULL,PRIMARY KEY(actor,key));
    CREATE TABLE IF NOT EXISTS session_profiles(sessionId TEXT PRIMARY KEY,profileId TEXT NOT NULL);`);
}
