import { existsSync } from 'node:fs';
import { config } from 'dotenv';

if (existsSync('.env.test')) {
  config({ path: '.env.test' });
}
