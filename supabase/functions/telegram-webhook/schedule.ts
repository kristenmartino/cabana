// Require explicit UTC/offset timestamps: a staff command must not infer a zone.
export function parseScheduleCommand(args: string[]) {
  if (args.length !== 3 || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(args[0])) return null;
  const iso = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/;
  if (!iso.test(args[1]) || !iso.test(args[2])) return null;
  if (args.slice(1).some(value => new Date(`${value.slice(0,10)}T00:00:00Z`).toISOString().slice(0,10) !== value.slice(0,10))) return null;
  const start = new Date(args[1]), end = new Date(args[2]);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) return null;
  return { id: args[0], start: start.toISOString(), end: end.toISOString() };
}
