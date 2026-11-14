import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { GraduationCap, ShieldCheck, Save, RefreshCw } from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';
import { supabase } from '../lib/supabase';
import GeoLocationFields from './GeoLocationFields';
import { emptyRoleProfile, profileMissing, profileRoleLabel, type RoleProfile } from '../lib/roleProfiles';
import './RoleProfileFields.css';

export default function RoleProfileFields(){
 const {account}=useAuth();
 const [profile,setProfile]=useState<RoleProfile|null>(null);
 const [draft,setDraft]=useState<RoleProfile|null>(null);
 const [saving,setSaving]=useState(false),[loading,setLoading]=useState(true);
 const [subjectsText,setSubjectsText]=useState('');
 const [error,setError]=useState(''),[notice,setNotice]=useState('');
 const load=useCallback(async()=>{
  if(!supabase||!account)return;
  setLoading(true);setError('');
  try{
   const auth=await supabase.auth.getUser();
   if(auth.error||!auth.data.user)throw new Error('Sign in again to verify your profile.');
   const id=auth.data.user.id;
   const result=await supabase.from('dli_role_profiles').select('*').eq('user_id',id).maybeSingle();
   if(result.error)throw new Error('Your extended profile could not be loaded securely.');
   const row=(result.data as RoleProfile|null)??emptyRoleProfile(id);
   setProfile(result.data?row:null);setDraft(row);
   setSubjectsText(row.specializations.join(', '));
  }catch(e){setError(e instanceof Error?e.message:'Profile service is unavailable.');}
  finally{setLoading(false);}
 },[account?.id]);
 useEffect(()=>{void load();},[load]);
 if(!account)return null;
 const set=(field:keyof RoleProfile,value:string|number|null)=>setDraft(current=>current?{...current,[field]:value}:current);
 const subjectsSelected=[...new Set(subjectsText.split(',').map(s=>s.trim()).filter(Boolean))].slice(0,12);
 const missing=draft?profileMissing({...draft,specializations:subjectsSelected},account.role):[];
 async function save(e:FormEvent<HTMLFormElement>){
  e.preventDefault();if(!supabase||!draft||saving||loading)return;
  if(missing.length){setError('Complete these profile fields first: '+missing.join(', ')+'.');return;}
  setSaving(true);setError('');setNotice('');
  try{
   const payload={
    school_name:draft.school_name.trim(),school_class:draft.school_class.trim(),
    academic_interest:draft.academic_interest.trim(),country:draft.country.trim(),
    state_name:draft.state_name.trim(),city:draft.city.trim(),
    qualification:draft.qualification.trim(),specializations:subjectsSelected,
    experience_years:draft.experience_years,
    institution:draft.institution.trim(),professional_title:draft.professional_title.trim(),
    department:draft.department.trim(),role_responsibilities:draft.role_responsibilities.trim(),
   };
   const result=profile
     ?await supabase.from('dli_role_profiles').update(payload).eq('user_id',draft.user_id).select('user_id').maybeSingle()
     :await supabase.from('dli_role_profiles').insert({user_id:draft.user_id,...payload}).select('user_id').maybeSingle();
   if(result.error||!result.data)throw new Error('Cloud save was not confirmed. Please retry.');
   const verified=await supabase.from('dli_role_profiles').select('user_id,city,state_name,country')
     .eq('user_id',draft.user_id).maybeSingle();
   if(verified.error||!verified.data||verified.data.city!==payload.city)
     throw new Error('Profile was saved, but confirmation failed. Refresh before trying again.');
   setProfile({...draft,...payload});setNotice('Your '+profileRoleLabel(account?.role??'').toLowerCase()+' has been saved and verified.');
  }catch(cause){setError(cause instanceof Error?cause.message:'Could not save your profile.');}
  finally{setSaving(false);}
 }
 return <section className="panel dli-role-profile">
  <div className="panel-heading"><div>
   <p className="section-kicker">PROFILE DETAILS</p>
   <h2><GraduationCap size={20}/> {profileRoleLabel(account.role)}</h2>
   <p className="user-caption">Complete your role-specific information. Only you can edit it; approved administrators can view it for DLI operations.</p>
  </div>
   <button type="button" className="user-outline-button" onClick={()=>void load()} disabled={saving||loading}><RefreshCw size={15}/> Refresh</button>
  </div>
  {error&&<p role="alert" className="auth-feedback error">{error}</p>}
  {notice&&<p role="status" className="auth-feedback success">{notice}</p>}
  {loading?<p role="status">Loading role profile…</p>:draft&&<form className="dli-role-profile-form" onSubmit={e=>void save(e)}>
   {account.role==='student'&&<>
    <h3>School and class</h3>
    <label htmlFor="dli-school-name">School attended *</label>
    <input id="dli-school-name" maxLength={180} required value={draft.school_name} onChange={e=>set('school_name',e.target.value)} placeholder="Name of your school"/>
    <label htmlFor="dli-school-class">Current class in school *</label>
    <input id="dli-school-class" maxLength={80} required value={draft.school_class} onChange={e=>set('school_class',e.target.value)} placeholder="e.g., SS 2, JSS 3, Year 11"/>
    <label htmlFor="dli-academic-interest">Academic track / goal (optional)</label>
    <input id="dli-academic-interest" maxLength={220} value={draft.academic_interest} onChange={e=>set('academic_interest',e.target.value)} placeholder="e.g., JAMB Science, Engineering"/>
   </>}
   {account.role==='tutor'&&<>
    <h3>Teaching credentials</h3>
    <label htmlFor="dli-tutor-qualification">Highest qualification / certification *</label>
    <input id="dli-tutor-qualification" maxLength={180} required value={draft.qualification} onChange={e=>set('qualification',e.target.value)} placeholder="e.g., B.Sc. Mathematics"/>
    <label htmlFor="dli-tutor-specializations">Subjects taught (separate with commas) *</label>
    <input id="dli-tutor-specializations" required maxLength={500} value={subjectsText}
     onChange={e=>setSubjectsText(e.target.value)}
     placeholder="Mathematics, Physics"/>
    <label htmlFor="dli-tutor-experience">Years of teaching experience *</label>
    <input id="dli-tutor-experience" type="number" required min={0} max={65}
     value={draft.experience_years??''} onChange={e=>set('experience_years',e.target.value===''?null:Number(e.target.value))}/>
    <label htmlFor="dli-tutor-institution">Institution / current professional affiliation (optional)</label>
    <input id="dli-tutor-institution" maxLength={180} value={draft.institution} onChange={e=>set('institution',e.target.value)}/>
   </>}
   {account.role!=='student'&&account.role!=='tutor'&&<>
    <h3>Institutional assignment</h3>
    <label htmlFor="dli-staff-title">Official position *</label>
    <input id="dli-staff-title" maxLength={160} required value={draft.professional_title}
     onChange={e=>set('professional_title',e.target.value)} placeholder="e.g., Academic Administrator"/>
    <label htmlFor="dli-staff-department">Department / function *</label>
    <input id="dli-staff-department" maxLength={180} required value={draft.department}
     onChange={e=>set('department',e.target.value)} placeholder="e.g., Academics and Operations"/>
    <label htmlFor="dli-staff-institution">Affiliated institution (optional)</label>
    <input id="dli-staff-institution" maxLength={180} value={draft.institution} onChange={e=>set('institution',e.target.value)}/>
    <label htmlFor="dli-staff-responsibilities">Responsibilities (optional)</label>
    <textarea id="dli-staff-responsibilities" maxLength={600} rows={3}
     value={draft.role_responsibilities} onChange={e=>set('role_responsibilities',e.target.value)}/>
   </>}
   <h3>Location (city level only)</h3>
   <p className="dli-location-advice"><ShieldCheck size={16}/> Please select your city, not your residence or school address. DLI will not save precise map coordinates.</p>
   <GeoLocationFields disabled={saving} value={{country:draft.country,state_name:draft.state_name,city:draft.city}}
    onChange={next=>setDraft(p=>p?{...p,...next}:p)}/>
   {!!missing.length&&<p className="dli-profile-incomplete" role="status">Still required: {missing.join(', ')}.</p>}
   <button type="submit" className="academic-submit" disabled={saving||!!missing.length}>
    <Save size={16}/>{saving?'Saving and verifying…':'Save role profile'}
   </button>
  </form>}
 </section>;
}
