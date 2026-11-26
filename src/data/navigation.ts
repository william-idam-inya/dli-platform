import {LayoutDashboard,Users,School,CalendarClock,Wallet,MessageSquareText,ChartNoAxesCombined,type LucideIcon} from 'lucide-react';

export interface NavigationItem {label:string;shortLabel?:string;breadcrumbTitle?:string;path:string;icon:LucideIcon;description:string;group:string}
export interface NavigationSection {label:string;items:NavigationItem[]}

// One canonical sidebar registry. Child destinations live as underline tabs
// within their parent workspace instead of duplicating the app navigation.
export const navigationSections:NavigationSection[]=[{label:'Workspace',items:[
 {label:'Overview',path:'/',icon:LayoutDashboard,description:'A concise view of your DLI workspace.',group:'Workspace'},
 {label:'People',path:'/people',icon:Users,description:'Students, tutors, staff and account access.',group:'Workspace'},
 {label:'Academics',path:'/academics',icon:School,description:'Classes, subjects, results and academic setup.',group:'Workspace'},
 {label:'Timetable',path:'/timetable',icon:CalendarClock,description:'Weekly schedule and Google Meet links.',group:'Workspace'},
 {label:'Finance',path:'/finance',icon:Wallet,description:'Tutorial plans, payroll and approvals.',group:'Workspace'},
 {label:'Messages & Support',shortLabel:'Messages',path:'/communications',icon:MessageSquareText,description:'Private messages and support.',group:'Workspace'},
 {label:'Activity Log',path:'/activity',icon:ChartNoAxesCombined,description:'Operational reports and change history.',group:'Workspace'},
]}];
export const navigationItems=navigationSections.flatMap(section=>section.items);
export function permittedNavigation(canOpen:(path:string)=>boolean):NavigationSection[]{
 return navigationSections.map(section=>({...section,items:section.items.filter(item=>canOpen(item.path))})).filter(section=>section.items.length>0);
}
