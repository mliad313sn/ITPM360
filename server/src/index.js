import 'dotenv/config';
import { createApp } from './app.js';
import { startDeadlineScanner } from './lib/scanner.js';

const port = Number(process.env.PORT ?? 4000);

createApp().listen(port, () => {
  console.log(`ITPM360 API listening on http://localhost:${port}`);
  startDeadlineScanner(); // hourly deadline & GRC-due notifications
});
