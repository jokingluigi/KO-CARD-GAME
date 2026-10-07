import express, { type Express } from 'express';
// A legal 2,000-action AI transcript can exceed Express's default 100 KiB.
// Keep the higher cap specific to this endpoint; other requests retain their cap.
export function configureJsonBodyParsing(app: Express): void {
  app.use('/api/daily-quests/ai-match-progress', express.json({ limit: '1mb' }));
  app.use(express.json());
}
