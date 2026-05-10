/**
 * Probe for expose-controller-hibernation-status change.
 * Task 1.1: Determine the unit of Controller.status.accumulatedWaterSavings (gallons or liters).
 * Task 1.2: Inspect Controller.status.icon to determine its format (URL, SVG path, token string).
 * Task 1.3: Verify whether Controller.settings returns null or { hibernateStatus: null } on dev account.
 *
 * Run: HYDRAWISE_USERNAME=... HYDRAWISE_PASSWORD=... npx tsx scripts/probe-hibernation-status.ts
 * Or with .env: npx tsx scripts/probe-hibernation-status.ts
 */

import { existsSync } from 'node:fs';
import { config as loadDotenv } from 'dotenv';
import { GraphQLClient } from 'graphql-request';
import { Auth } from '../src/hydrawise/auth.js';
import { loadConfig } from '../src/config.js';

const GRAPHQL_URL = 'https://app.hydrawise.com/api/v2/graph';

async function main(): Promise<void> {
  if (existsSync('.env')) loadDotenv();
  const cfg = loadConfig();
  const auth = new Auth(cfg.username, cfg.password);
  const header = await auth.getAuthHeader();
  const client = new GraphQLClient(GRAPHQL_URL, { headers: { Authorization: header } });

  // Get controllers with all the fields we care about
  const data = await client.request<{
    me: {
      controllers: {
        id: number;
        name: string;
        settings: {
          hibernateStatus: boolean | null;
          timeZone: { name: string } | null;
        } | null;
        status: {
          online: boolean;
          summary: string;
          icon: string;
          accumulatedWaterSavings: number;
        } | null;
      }[];
    };
  }>(/* GraphQL */ `
    query ProbeHibernationStatus {
      me {
        controllers {
          id
          name
          settings {
            hibernateStatus
            timeZone {
              name
            }
          }
          status {
            online
            summary
            icon
            accumulatedWaterSavings
          }
        }
      }
    }
  `);

  const controllers = data.me.controllers;
  console.log(`Found ${controllers.length} controller(s)\n`);

  for (const c of controllers) {
    console.log(`=== Controller: ${c.name} (id=${c.id}) ===`);

    // Task 1.1 + 1.2: status fields
    if (c.status === null) {
      console.log('  status: null (entire status block is null)');
    } else {
      console.log(`  status.online: ${c.status.online}`);
      console.log(`  status.summary: ${JSON.stringify(c.status.summary)}`);
      console.log(`  status.icon: ${JSON.stringify(c.status.icon)}`);
      console.log(`  status.accumulatedWaterSavings: ${c.status.accumulatedWaterSavings}`);
      // Heuristic: values > 1000 are likely ml (→ liters) or fluid-oz (→ gallons)
      // The GUI in the Hydrawise app typically shows gallons in US accounts
      console.log(`  (raw numeric value for unit verification - cross-reference with Hydrawise GUI)`);
    }

    // Task 1.3: settings.hibernateStatus
    if (c.settings === null) {
      console.log('  settings: null (entire settings block is null)');
      console.log('  -> null-safety path: settings parent is null');
    } else {
      console.log(`  settings.hibernateStatus: ${c.settings.hibernateStatus}`);
      if (c.settings.hibernateStatus === null) {
        console.log('  -> null-safety path: settings object present but hibernateStatus field is null');
      } else {
        console.log(`  -> null-safety path: hibernateStatus is a concrete boolean (${c.settings.hibernateStatus})`);
      }
    }

    console.log('');
  }

  // Summary for tasks
  console.log('=== TASK SUMMARY ===');
  const firstController = controllers[0];
  if (firstController?.status) {
    const savings = firstController.status.accumulatedWaterSavings;
    console.log(`Task 1.1: accumulatedWaterSavings = ${savings}`);
    console.log('  -> Check Hydrawise GUI (Settings > Account) to see what unit is shown.');
    console.log('     If the GUI shows gallons and the value matches, use _gallons suffix.');
    console.log('     If the GUI shows liters and the value matches, use _liters suffix.');

    const icon = firstController.status.icon;
    console.log(`Task 1.2: status.icon = ${JSON.stringify(icon)}`);
    if (icon.startsWith('http')) {
      console.log('  -> Format: URL');
    } else if (icon.startsWith('<')) {
      console.log('  -> Format: SVG markup');
    } else if (icon.startsWith('/')) {
      console.log('  -> Format: SVG path data or URL path');
    } else {
      console.log('  -> Format: token string (e.g., an icon name like "moon", "sun", etc.)');
    }
  }

  if (firstController?.settings === null) {
    console.log('Task 1.3: settings is null for this account (older firmware or no settings).');
    console.log('  -> Serializer must handle null settings parent (optional chaining: settings?.hibernateStatus).');
  } else if (firstController?.settings !== undefined) {
    console.log(`Task 1.3: settings is non-null. hibernateStatus = ${firstController.settings?.hibernateStatus}`);
    console.log('  -> Only the non-null settings path observed on this account.');
    console.log('  -> Document that null-settings path is theoretically possible (older firmware) but untested here.');
  }
}

main().catch((err) => {
  console.error('Probe failed:', err);
  process.exit(1);
});
