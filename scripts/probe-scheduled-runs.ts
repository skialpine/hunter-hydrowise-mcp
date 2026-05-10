/**
 * Probe safety of scheduledRuns paths for issue #3 (expose-scheduled-runs).
 * Task 1.1: Zone.scheduledRuns { nextRun } on zone with no upcoming runs → null or 500?
 * Task 1.2: Controller.zones { scheduledRuns { runs { id } } } on bulk → [] or 500?
 *
 * Run: HYDRAWISE_USERNAME=... HYDRAWISE_PASSWORD=... npx tsx scripts/probe-scheduled-runs.ts
 * Or with .env: npx tsx scripts/probe-scheduled-runs.ts
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

  // First get a controller and its zones
  const controllersData = await client.request<{ me: { controllers: { id: number; name: string; zones: { id: number; name: string; number: number }[] }[] } }>(/* GraphQL */`
    query {
      me {
        controllers {
          id
          name
          zones {
            id
            name
            number { value }
          }
        }
      }
    }
  `);

  const controller = controllersData.me.controllers[0];
  if (!controller) {
    console.error('No controllers found');
    process.exit(1);
  }
  console.log(`Controller: ${controller.name} (id=${controller.id}), zones: ${controller.zones.length}`);

  const zone = controller.zones[0];
  if (!zone) {
    console.error('No zones found');
    process.exit(1);
  }
  console.log(`Probing with zone: ${zone.name} (id=${zone.id})`);

  // --- Task 1.1: Zone.scheduledRuns { nextRun } ---
  console.log('\n--- Task 1.1: Zone.scheduledRuns { nextRun { ... } } ---');
  try {
    const result1 = await client.request<{ zone: { scheduledRuns: { nextRun: { startTime: { value: string }; endTime: { value: string }; duration: number } | null; status: string | null; summary: string } | null } | null }>(/* GraphQL */`
      query($zoneId: Int!) {
        zone(zoneId: $zoneId) {
          scheduledRuns {
            status
            summary
            nextRun {
              startTime { value }
              endTime { value }
              normalDuration
              duration
              remainingTime
              status { value label }
            }
          }
        }
      }
    `, { zoneId: zone.id });
    console.log('RESULT (no 500):', JSON.stringify(result1, null, 2));
    const nextRun = result1.zone?.scheduledRuns?.nextRun;
    if (nextRun === null || nextRun === undefined) {
      console.log('-> nextRun is null/undefined — safe to use this path (returns null, not 500)');
    } else {
      console.log('-> nextRun has a value — zone has an upcoming run');
    }
  } catch (e) {
    console.error('ERROR on task 1.1:', e);
    console.log('-> This path may be UNSAFE (500 or other error). Use runsBetween fallback.');
  }

  // --- Task 1.2: Controller.zones { scheduledRuns { runs { id } } } bulk ---
  console.log('\n--- Task 1.2: Controller.zones { scheduledRuns { runs { id } } } bulk ---');
  try {
    const result2 = await client.request<{ controller: { zones: { id: number; name: string; scheduledRuns: { runs: { id: string }[] } }[] } | null }>(/* GraphQL */`
      query($controllerId: Int!) {
        controller(controllerId: $controllerId) {
          zones {
            id
            name
            scheduledRuns {
              runs {
                id
              }
            }
          }
        }
      }
    `, { controllerId: controller.id });
    console.log('RESULT (no 500):', JSON.stringify(result2, null, 2));
    console.log('-> Bulk scheduledRuns path is SAFE');
  } catch (e) {
    console.error('ERROR on task 1.2:', e);
    console.log('-> Bulk scheduledRuns path is UNSAFE. Keep per-zone fan-out for get_controller_schedule.');
  }

  // --- Also probe runsBetween for reference ---
  console.log('\n--- Bonus: Zone.runsBetween(now, now+7d) ---');
  const now = Math.floor(Date.now() / 1000);
  const until = now + 7 * 86400;
  try {
    const result3 = await client.request<{ zone: { runsBetween: { id: string; startTime: { value: string }; duration: number }[] } | null }>(/* GraphQL */`
      query($zoneId: Int!, $from: Int!, $until: Int!) {
        zone(zoneId: $zoneId) {
          runsBetween(from: $from, until: $until) {
            id
            startTime { value }
            endTime { value }
            normalDuration
            duration
            remainingTime
            status { value label }
          }
        }
      }
    `, { zoneId: zone.id, from: now, until });
    console.log('runsBetween result:', JSON.stringify(result3, null, 2));
  } catch (e) {
    console.error('ERROR on runsBetween:', e);
  }
}

main().catch(console.error);
