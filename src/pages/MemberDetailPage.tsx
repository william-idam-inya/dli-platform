import { useEffect, useState } from 'react';
import { ArrowLeft, ShieldCheck, UserRound } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { roleLabels, type DliRole } from '../auth/permissions';
import { supabase } from '../lib/supabase';
import { profileRoleLabel, type RoleProfile } from '../lib/roleProfiles';
import '../components/RoleProfileFields.css';
type Basic={id:string;auth_user_id:string;full_name:string;email:string;role:DliRole;status:string};
type Private={personal_name:string;date_of_birth:string;avatar_path:string;updated_at:string};
export default function MemberDetailPage(){
 const {userId}=useParams<{userId:string}>();
 const {account}=useAuth();
 const [member,setMember]=useState<Basic|null>(null);
 const [personal,setPersonal]=useState<Private|null>(null);
 const [detail,setDetail]=useState<RoleProfile|null>(null);
 const [photo,setPhoto]=useState<string|null>(null);
 const [error,setError]=useState('');
 const [loading,setLoading]=useState(true);
 const mayView=account?.role==='admin'||account?.role==='owner';
 useEffect(()=>{
  if(!supabase||!mayView||!userId||!/^[0-9a-f-]{36}$/i.test(userId)){setLoading(false);return;}
  const client=supabase;let active=true;let url:string|null=null;
  async function load(){
   setLoading(true);setError('');
   try{
    // Audit server-side before any sensitive profile fetch. Deny on audit failure.
    const log=await client.rpc('dli_log_profile_view',{p_user_id:userId});
    if(log.error||log.data!==true)throw new Error('You are not authorised to view this member profile.');
    const [a,p,d]=await Promise.all([
     client.from('authorised_users').select('id,auth_user_id,full_name,email,role,status').eq('auth_user_id',userId).maybeSingle(),
     client.from('dli_member_profiles').select('personal_name,date_of_birth,avatar_path,updated_at').eq('user_id',userId).maybeSingle(),
     client.from('dli_role_profiles').select('*').eq('user_id',userId).maybeSingle(),
    ]);
    if(a.error||!a.data)throw new Error('This registered member could not be viewed.');
    if(p.error||d.error)throw new Error('The private profile could not be loaded securely.');
    if(!active)return;
    setMember(a.data as Basic);setPersonal(p.data as Private|null);setDetail(d.data as RoleProfile|null);
    if(p.data?.avatar_path){
      const img=await client.storage.from('dli-member-avatars').download(p.data.avatar_path);
      if(!active)return;
      if(!img.error&&img.data){url=URL.createObjectURL(img.data);setPhoto(url);}
    }
   }catch(e){if(active)setError(e instanceof Error?e.message:'Unable to open profile.');}
   finally{if(active)setLoading(false);}
  }
  void load();
  return()=>{active=false;if(url)URL.revokeObjectURL(url);};
 },[userId,mayView]);
 const field=(label:string,value:string|number|null|undefined)=>value===null||value===undefined||value===''?null:
  <div className="dli-detail-field" key={label}><dt>{label}</dt><dd>{value}</dd></div>;
 if(!mayView)return <div className="module-page"><h1>Profile restricted</h1><p>Only the DLI Owner and Admin can open members' full private profiles.</p></div>;
 return <div className="module-page dli-member-detail">
  <Link className="back-link" to="/users"><ArrowLeft size={16}/> Users and access</Link>
  <div className="module-page-hero"><span className="module-page-icon"><UserRound size={25}/></span>
    <div className="module-page-copy"><p className="section-kicker">AUTHORIZED PROFILE VIEW</p>
      <h1>Member profile</h1>
    </div></div>
  {loading&&<p role="status">Checking role permissions and loading profile…</p>}
  {error&&<p className="auth-feedback error" role="alert">{error}</p>}
  {!loading&&member&&<section className="panel">
    <div className="dli-member-detail-header">
      <div className="dli-member-detail-avatar">{photo?<img src={photo} alt="Member profile photograph"/>:<UserRound size={35}/>}</div>
      <div><h2>{personal?.personal_name||member.full_name}</h2>
       <p>{roleLabels[member.role]||member.role} · {member.status}</p>
       <small>{member.email}</small></div>
    </div>
    <h3>Institutional and personal details</h3>
    <dl className="dli-detail-grid">
      {field('Registered name',member.full_name)}
      {field('Personal name',personal?.personal_name)}
      {field('Date of birth',personal?.date_of_birth)}
      {field('Role',roleLabels[member.role])}
      {field('Account status',member.status)}
      {field('Last profile update',personal?.updated_at?.slice(0,10))}
    </dl>
    <h3>{profileRoleLabel(member.role)}</h3>
    {detail?<dl className="dli-detail-grid">
      {field('School',detail.school_name)}
      {field('School class',detail.school_class)}
      {field('Academic track / goal',detail.academic_interest)}
      {field('Qualifications',detail.qualification)}
      {field('Teaching subjects',detail.specializations?.join(', '))}
      {field('Teaching experience',detail.experience_years===null?null:detail.experience_years+' years')}
      {field('Professional institution',detail.institution)}
      {field('Position',detail.professional_title)}
      {field('Department',detail.department)}
      {field('Responsibilities',detail.role_responsibilities)}
      {field('City',detail.city)}
      {field('State / province',detail.state_name)}
      {field('Country',detail.country)}
    </dl>:<p className="academic-empty">This member has not completed their extended role profile yet.</p>}
    <p className="dli-detail-privacy"><ShieldCheck size={16}/> City-level location only. Exact map pins and home coordinates are not stored.</p>
  </section>}
 </div>;
}
