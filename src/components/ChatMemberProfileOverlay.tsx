import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { GraduationCap, LockKeyhole, ShieldCheck, UserRound, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import ChatMemberAvatar from './ChatMemberAvatar';
import './ChatMemberProfileOverlay.css';

type MemberPreview = {
  user_id: string;
  full_name: string;
  member_role: string;
  subjects?: string[];
  registered_email?: string | null;
  date_of_birth?: string | null;
  school_name?: string | null;
  school_class?: string | null;
  academic_interest?: string | null;
  qualification?: string | null;
  specializations?: string[] | null;
  experience_years?: number | null;
  institution?: string | null;
  professional_title?: string | null;
  department?: string | null;
  role_responsibilities?: string | null;
  country?: string | null;
  state_name?: string | null;
  city?: string | null;
};

const roleName:Record<string,string> = {
  owner:'Founder',admin:'Admin',assistant_admin:'Assistant Admin',
  tutor:'Tutor',student:'Student',academic_coordinator:'Academic Coordinator',
};
const fieldNames:[keyof MemberPreview,string][]=[
  ['school_name','School'],['school_class','Class'],
  ['academic_interest','Academic interests'],['qualification','Qualification'],
  ['experience_years','Years of experience'],['institution','Institution'],
  ['professional_title','Professional title'],['department','Department'],
  ['role_responsibilities','Responsibilities'],
  ['country','Country'],['state_name','State'],['city','City'],
  ['registered_email','Registered email'],['date_of_birth','Date of birth'],
];

export default function ChatMemberProfileOverlay({
  userId, fallbackName, onClose,
}: {userId:string;fallbackName:string;onClose:()=>void}) {
  const [profile,setProfile]=useState<MemberPreview|null>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const closeRef=useRef<HTMLButtonElement>(null);

  useEffect(()=>{
    let active=true;
    setLoading(true);setError('');setProfile(null);
    async function load(){
      if(!supabase){
        if(active){setError('Profile service is unavailable.');setLoading(false);}return;
      }
      try{
        const result=await supabase.rpc('dli_chat_profile_preview',{p_target:userId});
        if(!active)return;
        if(result.error||!result.data||typeof result.data!=='object'||Array.isArray(result.data)){
          setError('This profile is not available to your account.');return;
        }
        const received=result.data as MemberPreview;
        if(received.user_id!==userId||typeof received.full_name!=='string'||
          typeof received.member_role!=='string'){
          setError('DLI could not verify this profile.');return;
        }
        setProfile(received);
      }catch{
        if(active)setError('This profile could not be retrieved securely.');
      }finally{if(active)setLoading(false);}
    }
    void load();
    return()=>{active=false;};
  },[userId]);

  useEffect(()=>{
    const previouslyFocused=document.activeElement instanceof HTMLElement
      ?document.activeElement:null;
    const before=document.body.style.overflow;
    document.body.style.overflow='hidden';
    closeRef.current?.focus();
    const onKey=(event:KeyboardEvent)=>{
      if(event.key==='Escape'){event.preventDefault();onClose();return;}
      if(event.key!=='Tab')return;
      const panel=document.getElementById('dli-chat-member-dialog');
      const focusable=Array.from(panel?.querySelectorAll<HTMLElement>(
        'button:not([disabled]),a[href],[tabindex]:not([tabindex="-1"])',
      )??[]).filter(node=>node.getClientRects().length>0);
      if(!focusable.length)return;
      const first=focusable[0],last=focusable[focusable.length-1];
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
    };
    document.addEventListener('keydown',onKey);
    return()=>{
      document.removeEventListener('keydown',onKey);
      document.body.style.overflow=before;
      previouslyFocused?.focus({preventScroll:true});
    };
  },[onClose]);

  const subjects=Array.isArray(profile?.subjects)
    ?profile.subjects.filter((subject):subject is string=>typeof subject==='string'&&!!subject.trim())
    :[];
  const fields=profile?fieldNames.flatMap(([field,label])=>{
    const value=profile[field];
    if(typeof value==='number')return [{field,label,value:String(value)}];
    if(typeof value==='string'&&value.trim())return [{field,label,value}];
    return [];
  }):[];
  const specialties=Array.isArray(profile?.specializations)
    ?profile.specializations.filter((v):v is string=>typeof v==='string'&&!!v.trim())
    :[];

  return createPortal(
    <div className="dli-chat-profile-backdrop" onMouseDown={event=>{
      if(event.target===event.currentTarget)onClose();
    }}>
      <section id="dli-chat-member-dialog" className="dli-chat-profile-dialog"
        role="dialog" aria-modal="true" aria-labelledby="dli-chat-profile-title"
        aria-describedby="dli-chat-profile-description">
        <header className="dli-chat-profile-titlebar">
          <span><ShieldCheck size={17} aria-hidden="true"/> DLI member profile</span>
          <button type="button" ref={closeRef} onClick={onClose}
            aria-label="Close member profile"><X size={20} aria-hidden="true"/></button>
        </header>
        {loading?<div className="dli-chat-profile-state" role="status">
          <UserRound size={24}/><p>Checking your profile-view permission…</p>
        </div>:error?<div className="dli-chat-profile-state" role="alert">
          <LockKeyhole size={28}/>
          <h2 id="dli-chat-profile-title">Profile restricted</h2>
          <p id="dli-chat-profile-description">{error}</p>
          <p>Chat permission does not automatically grant access to another person's profile.</p>
        </div>:profile&&<>
          <div className="dli-chat-profile-person">
            <ChatMemberAvatar userId={profile.user_id} name={profile.full_name}/>
            <div>
              <h2 id="dli-chat-profile-title">{profile.full_name}</h2>
              <p id="dli-chat-profile-description">
                {roleName[profile.member_role]??profile.member_role.replaceAll('_',' ')}
              </p>
            </div>
          </div>
          {subjects.length>0&&<div className="dli-chat-profile-subjects">
            <h3><GraduationCap size={17} aria-hidden="true"/>
              {profile.member_role==='tutor'?'Subjects taught to you':'Shared teaching subjects'}
            </h3>
            <div>{subjects.map(s=><span key={s}>{s}</span>)}</div>
          </div>}
          {specialties.length>0&&<div className="dli-chat-profile-subjects">
            <h3>Recorded specializations</h3>
            <div>{specialties.map(s=><span key={s}>{s}</span>)}</div>
          </div>}
          {fields.length>0&&<dl className="dli-chat-profile-details">
            {fields.map(({field,label,value})=><div key={field}>
              <dt>{label}</dt><dd>{value}</dd>
            </div>)}
          </dl>}
          <p className="dli-chat-profile-footnote">
            Information is supplied by the verified DLI profile service.
            Your access follows your assigned institutional role and active classes.
          </p>
        </>}
        <footer className="dli-chat-profile-actions">
          <button type="button" onClick={onClose}>Close profile</button>
        </footer>
      </section>
    </div>,
    document.body,
  );
}
