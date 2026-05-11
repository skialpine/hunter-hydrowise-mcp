#!/usr/bin/env tsx
// Quick probe to introspect what each WateringProgramAdjustment ID actually
// configures on the live account. Surfaces the labels for IDs like [16, 17, 18]
// that appear in schedule_adjustment_ids on programs.
//
// Run: HYDRAWISE_USERNAME=... HYDRAWISE_PASSWORD=... npx tsx scripts/probe-adjustments.ts
import 'dotenv/config';
import { loadConfig } from '../src/config.js';
import { Auth } from '../src/hydrawise/auth.js';
import { GraphQLClient } from 'graphql-request';

const CONTROLLER_ID = 317416; // Heller Tufts

async function main() {
  const config = loadConfig();
  const auth = new Auth(config.username, config.password);
  const authHeader = await auth.getAuthHeader();

  const client = new GraphQLClient('https://app.hydrawise.com/api/v2/graph', {
    headers: { Authorization: authHeader },
  });

  // Field is on individual program types (not on Controller). Query the
  // Lawn program (StandardProgram, id 6390589) and ask for its
  // conditionalWateringAdjustments — which returns ALL available adjustments
  // applicable to that program's scheduling method (not just the ones currently
  // attached). The user's currently-applied IDs [16, 17, 18] should appear
  // in this catalog, labeled with what they actually do.
  const query = `
    query ProbeAdjustments($controllerId: Int!) {
      me {
        controllers {
          id
          name
          programs(includeZoneSpecific: false) {
            __typename
            id
            name
            ... on StandardProgram {
              conditionalWateringAdjustments(controllerId: $controllerId, isContractor: false) {
                id
                label
                applicableSchedulingMethod {
                  value
                  label
                }
              }
            }
          }
        }
      }
    }
  `;

  const result = await client.request<{
    me: {
      controllers: {
        id: number;
        name: string;
        programs: {
          __typename: string;
          id: number;
          name: string;
          scheduleAdjustmentIds?: number[];
          conditionalWateringAdjustments?: {
            id: number;
            label: string;
            applicableSchedulingMethod: { value: number | null; label: string | null };
          }[];
        }[];
      }[];
    };
  }>(query, { controllerId: CONTROLLER_ID });

  for (const controller of result.me.controllers) {
    if (controller.id !== CONTROLLER_ID) continue;
    console.log(`\nController: ${controller.name} (id ${controller.id})\n`);

    // Collect catalog from first StandardProgram that returns adjustments
    let catalog:
      | {
          id: number;
          label: string;
          applicableSchedulingMethod: { value: number | null; label: string | null };
        }[]
      | undefined;
    for (const p of controller.programs) {
      if (p.__typename === 'StandardProgram' && p.conditionalWateringAdjustments) {
        catalog = p.conditionalWateringAdjustments;
        break;
      }
    }

    if (catalog) {
      console.log('Full WateringProgramAdjustment catalog for this controller:\n');
      for (const adj of catalog) {
        console.log(
          `  id=${adj.id}  label="${adj.label}"  scheduling_method=${adj.applicableSchedulingMethod.value} (${adj.applicableSchedulingMethod.label})`,
        );
      }
    } else {
      console.log('No conditionalWateringAdjustments returned by any StandardProgram.');
    }

    console.log('\nCurrent schedule_adjustment_ids (from earlier MCP reads): [16, 17, 18] on Drip, Lawn, Lawn Early');
    console.log('Match against the catalog above to interpret what each ID configures.');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
