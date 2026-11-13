import { BookOpen, ClipboardCheck, CalendarCheck, GraduationCap, GitBranch } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export type LearningTab = 'tree'|'lessons'|'assignments'|'quizzes'|'attendance';
export type LearningArea = {
  id: LearningTab;
  label: string;
  description: string;
  icon: LucideIcon;
};

// Reused by student, tutor and administrator views. The page decides whether
// to load actual protected records; displaying a tab never grants database access.
export const learningAreas: readonly LearningArea[] = [
  {id:'tree',label:'Skill Tree',description:'Your visual lesson path, review history and next topic.',icon:GitBranch},
  {id:'lessons',label:'Lessons & resources',description:'Course notes and materials for your assigned classes.',icon:BookOpen},
  {id:'assignments',label:'Assignments',description:'Class tasks, submissions and tutor feedback.',icon:ClipboardCheck},
  {id:'quizzes',label:'Quizzes & results',description:'Assessment attempts, marks and saved results.',icon:GraduationCap},
  {id:'attendance',label:'Attendance',description:'Class attendance and participation records.',icon:CalendarCheck},
];

export function learningAreaUrl(id:LearningTab):string{
  return '/study?tab='+id;
}
