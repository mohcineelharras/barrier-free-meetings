import { runSetup, type SetupStatus } from '../server/setup.js';

let latestStatus: SetupStatus | null = null;

function printStatus(status: SetupStatus): void {
  latestStatus = status;
  const error = status.error ? ` error="${status.error}"` : '';
  console.log(`[setup] ${status.mode} ${status.step} ${status.progress}%${error}`);
}

await runSetup(printStatus);

const finalStatus = latestStatus;
if (!finalStatus || finalStatus.step !== 'ready') {
  const message = finalStatus?.error ?? 'Setup did not reach ready state.';
  console.error(`[setup] failed: ${message}`);
  process.exit(1);
}

if (finalStatus.mode === 'disabled') {
  console.log('[setup] verification skipped because setup mode is disabled');
  process.exit(0);
}

const failedRequired = finalStatus.requirements.filter(
  (requirement) => requirement.required && requirement.state !== 'ready',
);

if (failedRequired.length > 0) {
  for (const requirement of failedRequired) {
    console.error(`[setup] missing ${requirement.label}: ${requirement.message ?? requirement.state}`);
  }
  process.exit(1);
}

console.log('[setup] verification complete');
process.exit(0);
