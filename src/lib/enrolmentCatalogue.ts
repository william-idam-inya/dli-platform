// Public enrolment choices are a narrow, curated projection of the DLI Academic Setup.
// Paid course content and unpublished teaching details remain private.
export type EnrolmentCatalogueRow = {
  programme_id: string;
  programme_name: string;
  programme_code: string;
  academic_level_id: string | null;
  academic_level_name: string | null;
  level_sort_order: number | null;
  subject_id: string | null;
  subject_name: string | null;
};

export type ProgrammeChoice = { id: string; name: string; code: string };
export type LevelChoice = { id: string; name: string; order: number };
export type SubjectChoice = { id: string; name: string };

export function programmeChoices(rows: readonly EnrolmentCatalogueRow[]): ProgrammeChoice[] {
  const choices = new Map<string, ProgrammeChoice>();
  for (const row of rows) {
    if (row.programme_id && !choices.has(row.programme_id)) {
      choices.set(row.programme_id, {
        id: row.programme_id, name: row.programme_name, code: row.programme_code,
      });
    }
  }
  return [...choices.values()].sort((a,b)=>a.name.localeCompare(b.name));
}

export function levelChoices(rows: readonly EnrolmentCatalogueRow[], programmeId: string): LevelChoice[] {
  const choices = new Map<string, LevelChoice>();
  for (const row of rows) {
    if (row.programme_id!==programmeId || !row.academic_level_id || !row.academic_level_name) continue;
    if (!choices.has(row.academic_level_id)) {
      choices.set(row.academic_level_id, {
        id: row.academic_level_id,
        name: row.academic_level_name,
        order: row.level_sort_order??100,
      });
    }
  }
  return [...choices.values()].sort((a,b)=>a.order-b.order || a.name.localeCompare(b.name));
}

export function subjectChoices(
  rows: readonly EnrolmentCatalogueRow[], programmeId: string, academicLevelId: string,
): SubjectChoice[] {
  // Multiple courses may reference one subject. Show one checkbox per subject
  // and suppress duplicate labels within the same programme and level.
  const seenIds = new Set<string>(), seenNames = new Set<string>();
  const choices: SubjectChoice[] = [];
  for (const row of [...rows].sort((a,b)=>
    (a.subject_name??'').trim().localeCompare((b.subject_name??'').trim(),'en',{sensitivity:'base'})
    || (a.subject_name??'').length-(b.subject_name??'').length
    || (a.subject_id??'').localeCompare(b.subject_id??''))) {
    if (row.programme_id!==programmeId || row.academic_level_id!==academicLevelId ||
      !row.subject_id || !row.subject_name) continue;
    const label=row.subject_name.trim().replace(/\s+/g,' ').toLocaleLowerCase('en');
    if (seenIds.has(row.subject_id)||seenNames.has(label)) continue;
    seenIds.add(row.subject_id);seenNames.add(label);
    choices.push({id:row.subject_id,name:row.subject_name.trim()});
  }
  return choices;
}

export function validSubjectSelection(
  rows: readonly EnrolmentCatalogueRow[], programmeId: string,
  academicLevelId: string, selectedIds: readonly string[],
): boolean {
  if(selectedIds.length<1||selectedIds.length>6||new Set(selectedIds).size!==selectedIds.length)return false;
  const allowed=new Set(subjectChoices(rows,programmeId,academicLevelId).map(x=>x.id));
  return selectedIds.every(x=>allowed.has(x));
}
