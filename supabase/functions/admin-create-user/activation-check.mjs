// Pure guard shared by the Edge Function and the offline CI regression test.
// A successful HTTP response alone does not mean PostgreSQL matched a row.
export function confirmedInvitationActivation(row, expectedId) {
  return typeof expectedId === 'string' && expectedId.length > 0 &&
    row !== null && typeof row === 'object' && row.id === expectedId;
}
