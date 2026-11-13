// Q17 user-owned extended profile data. Never store an exact home/map coordinate.
export type RoleProfile = {
  user_id: string;
  school_name: string; school_class: string; academic_interest: string;
  country: string; state_name: string; city: string;
  qualification: string; specializations: string[]; experience_years: number | null;
  institution: string; professional_title: string; department: string; role_responsibilities: string;
};
export type GeoSelection = Pick<RoleProfile,'country'|'state_name'|'city'>;
export const emptyRoleProfile = (user_id:string):RoleProfile=>({
  user_id,school_name:'',school_class:'',academic_interest:'',
  country:'',state_name:'',city:'',qualification:'',specializations:[],experience_years:null,
  institution:'',professional_title:'',department:'',role_responsibilities:'',
});
export function profileRoleLabel(role:string):string {
  const labels:Record<string,string>={
    student:'Student academic profile',tutor:'Tutor teaching profile',
    owner:'Founder / owner profile',admin:'Administrator profile',
    assistant_admin:'Assistant administrator profile',
    academic_coordinator:'Academic coordinator profile',finance_officer:'Finance officer profile',
  };
  return labels[role]??'Institutional profile';
}
export function profileMissing(profile:RoleProfile,role:string):string[]{
  const missing:string[]=[];
  if(!profile.country.trim())missing.push('country');
  if(!profile.state_name.trim())missing.push('state');
  if(!profile.city.trim())missing.push('city');
  if(role==='student'){
    if(!profile.school_name.trim())missing.push('school');
    if(!profile.school_class.trim())missing.push('class');
  } else if(role==='tutor') {
    if(!profile.qualification.trim())missing.push('qualification');
    if(!profile.specializations.length)missing.push('teaching subject');
    if(profile.experience_years===null)missing.push('years of experience');
  } else {
    if(!profile.professional_title.trim())missing.push('position');
    if(!profile.department.trim())missing.push('department');
  }
  return missing;
}
