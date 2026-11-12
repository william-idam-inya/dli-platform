// Native file pickers can briefly blur and refocus the browser window.
// Revalidating at that instant unmounts protected routes, losing an
// unsaved File selection from the profile, lesson, or receipt editor.
// This narrowly suppresses the focus/visibility recheck *only* when
// the currently focused element is a file picker. Auth events still
// revalidate, and Supabase RLS still controls actual reads/writes.
export function isFilePickerFocused(target: { tagName?: string; type?: string } | null): boolean {
  return target?.tagName?.toUpperCase() === 'INPUT' && target?.type?.toLowerCase() === 'file';
}
