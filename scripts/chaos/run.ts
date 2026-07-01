// scripts/chaos/run.ts — Day-9 stub. See README.md in this folder for the
// full procedure this script automates. Phases: --phase inject | verify
//
// TODO(D9):
//   inject: 50 bookings through the real server-action code path (not raw
//           SQL — the point is exercising triage fallback, outbox emission,
//           and the money path), randomized 0-5s apart, chaos_marker in
//           request_text for later querying.
//   verify: the four assertions from the README, exit non-zero on any miss,
//           write the summary to scripts/chaos/runs/<ISO date>.log.

const phase = process.argv.includes("--phase")
  ? process.argv[process.argv.indexOf("--phase") + 1]
  : "inject";

console.log(`chaos: phase '${phase}' not implemented yet (Day 9). See scripts/chaos/README.md.`);
process.exit(1);
